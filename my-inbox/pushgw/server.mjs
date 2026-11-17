// Tiny Matrix push gateway -> Web Push (works with iPhone home-screen web apps, iOS 16.4+)
// Synapse calls  POST /_matrix/push/v1/notify  (internal Docker network only)
// The app calls  GET /push/vapid  and  POST /push/subscribe  (through Caddy)
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http2 from 'node:http2';
import { spawn } from 'node:child_process';
import os from 'node:os';
import * as wpMod from 'web-push';

const webpush = wpMod.default ?? wpMod;
const DATA = process.env.DATA_DIR || '/data';
const SYNAPSE = process.env.SYNAPSE_URL || 'http://synapse:8008';
const DOMAIN = process.env.DOMAIN || 'localhost';
const PORT = Number(process.env.PORT || 8080);

fs.mkdirSync(DATA, { recursive: true });
const vapidFile = `${DATA}/vapid.json`;
const subsFile = `${DATA}/subscriptions.json`;

if (!fs.existsSync(vapidFile)) fs.writeFileSync(vapidFile, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
const vapid = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
webpush.setVapidDetails(`mailto:admin@${DOMAIN}`, vapid.publicKey, vapid.privateKey);

let subs = fs.existsSync(subsFile) ? JSON.parse(fs.readFileSync(subsFile, 'utf8')) : {}; // pushkey -> {userId, subscription}
function save() {
  fs.writeFileSync(subsFile + '.tmp', JSON.stringify(subs), { mode: 0o600 });
  fs.renameSync(subsFile + '.tmp', subsFile);
}

// ---- Family members created from the app (so they can find each other) ----
const famFile = `${DATA}/family.json`;
let fam = fs.existsSync(famFile) ? JSON.parse(fs.readFileSync(famFile, 'utf8')) : { owner: null, people: [] };
function saveFam() { fs.writeFileSync(famFile, JSON.stringify(fam), { mode: 0o600 }); }

// ---- Apple push (native iPhone app) ----
const IOS_APP = 'com.vijaykannan.myinbox';
const apnsFile = `${DATA}/apns.json`;
let apns = fs.existsSync(apnsFile) ? JSON.parse(fs.readFileSync(apnsFile, 'utf8')) : null; // {keyId, teamId, key}
let apnsJwt = null, apnsJwtAt = 0;
const apnsSessions = {};
function apnsToken() {
  if (apnsJwt && Date.now() - apnsJwtAt < 40 * 60e3) return apnsJwt;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: apns.keyId }), body = b64({ iss: apns.teamId, iat: Math.floor(Date.now() / 1000) });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: apns.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  apnsJwt = `${head}.${body}.${sig}`; apnsJwtAt = Date.now();
  return apnsJwt;
}
function apnsSession(sandbox) {
  const host = sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  let s = apnsSessions[host];
  if (!s || s.closed || s.destroyed) { s = http2.connect(host); s.on('error', () => {}); s.on('goaway', () => s.close()); apnsSessions[host] = s; }
  return s;
}
function apnsSend(token, payload, { voip = false, sandbox = false, collapse } = {}) {
  return new Promise(resolve => {
    if (!apns) return resolve({ status: 0, reason: 'not configured' });
    let req;
    try {
      req = apnsSession(sandbox).request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${apnsToken()}`,
        'apns-topic': voip ? IOS_APP + '.voip' : IOS_APP,
        'apns-push-type': voip ? 'voip' : 'alert',
        'apns-priority': '10', 'apns-expiration': voip ? '0' : String(Math.floor(Date.now() / 1000) + 86400),
        ...(collapse ? { 'apns-collapse-id': collapse.slice(0, 64) } : {}),
        'content-type': 'application/json',
      });
    } catch (e) { return resolve({ status: 0, reason: e.message }); }
    let status = 0, data = '';
    req.on('response', h => { status = h[':status']; });
    req.on('data', c => { data += c; });
    req.on('end', () => { let reason = ''; try { reason = JSON.parse(data).reason; } catch {} resolve({ status, reason }); });
    req.on('error', e => resolve({ status: 0, reason: e.message }));
    req.setTimeout(15000, () => { req.close(); resolve({ status: 0, reason: 'timeout' }); });
    req.end(JSON.stringify(payload));
  });
}

// Same UUID the app computes for a call (FNV-1a ×4) — CallKit matches the push to the call with it.
function uuidFor(callId) {
  let out = '';
  for (let k = 0; k < 4; k++) {
    let h = (0x811c9dc5 ^ (k * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < callId.length; i++) { h ^= callId.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    out += h.toString(16).padStart(8, '0');
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`.toUpperCase();
}

const NETS = [['@whatsapp', 'WhatsApp'], ['@instagram', 'Instagram'], ['@messenger', 'Messenger']];
const netOf = sender => (NETS.find(([p]) => (sender || '').startsWith(p)) || [])[1];

function preview(n) {
  const c = n.content || {};
  if (n.type === 'm.sticker') return 'Sticker';
  switch (c.msgtype) {
    case 'm.image': return '📷 Photo';
    case 'm.video': return '🎥 Video';
    case 'm.audio': return '🎤 Voice message';
    case 'm.file': return '📎 ' + (c.body || 'File');
    case 'm.location': return '📍 Location';
  }
  let b = String(c.body || 'New message');
  const lines = b.split('\n'); let i = 0;
  while (i < lines.length && lines[i].startsWith('> ')) i++;
  if (i) b = lines.slice(i).join('\n').trim() || b;
  return b.length > 180 ? b.slice(0, 177) + '…' : b;
}

async function readJson(req, max = 64 * 1024) {
  let size = 0; const chunks = [];
  for await (const ch of req) { size += ch.length; if (size > max) throw new Error('too big'); chunks.push(ch); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function whoami(auth) {
  const r = await fetch(`${SYNAPSE}/_matrix/client/v3/account/whoami`, { headers: { Authorization: auth || '' } });
  if (!r.ok) return null;
  return (await r.json()).user_id || null;
}


// ---------- Google Drive backup (weekly, encrypted; the host's backup.sh does the actual work) ----------
// Uses rclone's public Google "desktop app" client and the loopback trick: after consent Google redirects to
// http://127.0.0.1:53682/?code=... which fails to load on the phone; the user pastes that address back here.
const G_ID = '202264815644.apps.googleusercontent.com';
const G_SECRET = 'X4Z3ca8xfWDb1Voo-F9a7ZxJ';
const G_REDIRECT = 'http://127.0.0.1:53682/';
const tokenFile = `${DATA}/gdrive-token.json`;
const statusFile = `${DATA}/backup-status.json`;
const keyFile = `${DATA}/backup-key`;
const requestFile = `${DATA}/backup-request`;
const readJsonFile = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
function backupKey() {
  if (!fs.existsSync(keyFile)) {
    const a = crypto.randomBytes(15).toString('base64url').replace(/[-_]/g, 'x');
    fs.writeFileSync(keyFile, a.match(/.{1,5}/g).join('-'), { mode: 0o600 });
  }
  return fs.readFileSync(keyFile, 'utf8').trim();
}
async function isAdmin(auth) {
  const userId = await whoami(auth);
  if (!userId) return null;
  const r = await fetch(`${SYNAPSE}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, { headers: { Authorization: auth } });
  return r.ok ? userId : false;
}

async function notify(body) {
  const n = body.notification || {};
  const rejected = [];
  // Badge-only updates (no event): iOS requires every push to show a notification, so skip them.
  if (!n.event_id) return rejected;
  const net = netOf(n.sender);
  const name = n.sender_display_name || (n.sender || '').split(':')[0].slice(1);
  const isGroup = n.room_name && n.room_name !== n.sender_display_name;
  const payload = JSON.stringify({
    title: (isGroup ? n.room_name : name) + (net ? ` · ${net}` : ''),
    body: (isGroup ? name + ': ' : '') + preview(n),
    room_id: n.room_id,
    unread: (n.counts && n.counts.unread) || 0,
  });
  const isCall = n.type === 'm.call.invite';
  const callEnd = n.type === 'm.call.hangup' || n.type === 'm.call.answer' || n.type === 'm.call.reject';
  await Promise.all((n.devices || []).map(async d => {
    if ((d.app_id || '').startsWith(IOS_APP)) {
      const voip = d.app_id === IOS_APP + '.voip';
      const sandbox = !!(d.data && d.data.sandbox);
      let p;
      if (voip) {
        if (!isCall) return; // VoIP pushes are only for ringing
        const c = n.content || {};
        p = { uuid: uuidFor(String(c.call_id || n.event_id)), room_id: n.room_id, call_id: c.call_id, caller: isGroup ? n.room_name : name, sender: n.sender, video: /m=video/.test((c.offer && c.offer.sdp) || ''), lifetime: c.lifetime || 60000 };
      } else {
        if (callEnd) return;
        const alert = isCall ? { title: name, body: '📞 Incoming call — tap to answer' } : { title: (isGroup ? n.room_name : name) + (net ? ` · ${net}` : ''), body: (isGroup ? name + ': ' : '') + preview(n) };
        p = { aps: { alert, sound: 'default', badge: (n.counts && n.counts.unread) || 0, 'thread-id': n.room_id, 'mutable-content': 1, 'interruption-level': isCall ? 'time-sensitive' : 'active' }, room_id: n.room_id, event_id: n.event_id, body: { room_id: n.room_id, event_id: n.event_id } };
      }
      const r = await apnsSend(d.pushkey, p, { voip, sandbox, collapse: voip ? undefined : n.event_id });
      if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered' || r.reason === 'DeviceTokenNotForTopic') rejected.push(d.pushkey);
      else if (r.status !== 200) console.error('apns failed', r.status, r.reason);
      return;
    }
    const s = subs[d.pushkey];
    if (!s) { rejected.push(d.pushkey); return; }
    if (callEnd) return;
    try {
      await webpush.sendNotification(s.subscription, payload, { TTL: 86400, urgency: 'high' });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { delete subs[d.pushkey]; save(); rejected.push(d.pushkey); }
      else console.error('push failed', e.statusCode || '', e.body || e.message);
    }
  }));
  return rejected;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/push/vapid') return send(res, 200, { publicKey: vapid.publicKey });

    if (req.method === 'POST' && url.pathname === '/push/subscribe') {
      const userId = await whoami(req.headers.authorization);
      if (!userId) return send(res, 401, { error: 'not logged in' });
      const { subscription } = await readJson(req);
      if (!subscription || !/^https:\/\//.test(subscription.endpoint || '') || !subscription.keys) return send(res, 400, { error: 'bad subscription' });
      let pushkey = Object.keys(subs).find(k => subs[k].subscription.endpoint === subscription.endpoint);
      if (!pushkey) pushkey = crypto.randomBytes(24).toString('base64url');
      subs[pushkey] = { userId, subscription, at: Date.now() };
      save();
      return send(res, 200, { pushkey });
    }


    // Voice notes: iPhone records M4A, WhatsApp only takes Ogg Opus voice notes — convert, then store in the media repo
    if (req.method === 'POST' && url.pathname === '/push/voice') {
      const userId = await whoami(req.headers.authorization);
      if (!userId) return send(res, 401, { error: 'not logged in' });
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 25 * 1024 * 1024) return send(res, 413, { error: 'too long' }); chunks.push(c); }
      const dir = fs.mkdtempSync(`${os.tmpdir()}/v-`), inF = `${dir}/in.m4a`, outF = `${dir}/out.ogg`;
      try {
        fs.writeFileSync(inF, Buffer.concat(chunks));
        const ok = await new Promise(resolve => {
          const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', inF, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', outF]);
          const t = setTimeout(() => p.kill('SIGKILL'), 60000);
          p.on('close', code => { clearTimeout(t); resolve(code === 0); });
          p.on('error', () => { clearTimeout(t); resolve(false); });
        });
        if (!ok) return send(res, 500, { error: 'Could not convert the voice note' });
        const ogg = fs.readFileSync(outF);
        const up = await fetch(`${SYNAPSE}/_matrix/media/v3/upload?filename=voice.ogg`, { method: 'POST', headers: { Authorization: req.headers.authorization, 'Content-Type': 'audio/ogg' }, body: ogg });
        const j = await up.json().catch(() => ({}));
        if (!up.ok || !j.content_uri) return send(res, 502, { error: 'Upload failed' });
        return send(res, 200, { content_uri: j.content_uri, size: ogg.length, mimetype: 'audio/ogg' });
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    if (req.method === 'GET' && url.pathname === '/push/health') {
      let h = {}; try { h = JSON.parse(fs.readFileSync(`${DATA}/health.json`, 'utf8')); } catch {}
      return send(res, 200, { ...h, apns: !!apns });
    }
    if (req.method === 'GET' && url.pathname === '/push/apns/status') {
      if (!(await whoami(req.headers.authorization))) return send(res, 401, { error: 'not logged in' });
      return send(res, 200, { configured: !!apns, keyId: apns ? apns.keyId : null });
    }
    if (req.method === 'POST' && url.pathname === '/push/apns/config') {
      if (!(await isAdmin(req.headers.authorization))) return send(res, 403, { error: 'Only the server owner can set this up' });
      const { keyId, teamId, key } = await readJson(req);
      const body = String(key || '').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
      const pem = '-----BEGIN PRIVATE KEY-----\n' + (body.match(/.{1,64}/g) || []).join('\n') + '\n-----END PRIVATE KEY-----\n';
      if (!/^[A-Z0-9]{10}$/.test(String(keyId || '').trim()) || !/^[A-Z0-9]{10}$/.test(String(teamId || '').trim())) return send(res, 400, { error: 'Key ID and Team ID are 10 letters/numbers' });
      try { crypto.createPrivateKey(pem); } catch { return send(res, 400, { error: 'That doesn’t look like the .p8 key text' }); }
      apns = { keyId: keyId.trim(), teamId: teamId.trim(), key: pem }; apnsJwt = null;
      fs.writeFileSync(apnsFile, JSON.stringify(apns), { mode: 0o600 });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/push/apns/test') {
      const userId = await whoami(req.headers.authorization);
      if (!userId) return send(res, 401, { error: 'not logged in' });
      const { token, sandbox } = await readJson(req);
      if (!/^[0-9a-f]{64,200}$/i.test(token || '')) return send(res, 400, { error: 'bad token' });
      const r = await apnsSend(token, { aps: { alert: { title: 'Inbox', body: 'Notifications are working ✓' }, sound: 'default' } }, { sandbox: !!sandbox });
      return send(res, r.status === 200 ? 200 : 502, { status: r.status, reason: r.reason });
    }

    // ---- Family: the owner creates logins for family members (Synapse admin API stays private) ----
    if (url.pathname === '/push/family/list' && req.method === 'GET') {
      const userId = await whoami(req.headers.authorization);
      if (!userId) return send(res, 401, { error: 'not logged in' });
      const r = await fetch(`${SYNAPSE}/_synapse/admin/v2/users?from=0&limit=500&guests=false&deactivated=false`, { headers: { Authorization: req.headers.authorization } });
      const admin = r.ok;
      let users = [];
      if (admin) users = (await r.json()).users || [];
      else users = fam.people.map(u => ({ name: u.userId, displayname: u.displayname }));
      if (admin) { fam.owner = { userId, displayname: (users.find(u => u.name === userId) || {}).displayname || userId.split(':')[0].slice(1) }; saveFam(); }
      const people = (admin ? users : users.concat(fam.owner ? [{ name: fam.owner.userId, displayname: fam.owner.displayname }] : [])).filter(u => {
        const local = (u.name || '').split(':')[0].slice(1).toLowerCase();
        return u.name !== userId && !u.user_type && !u.appservice_id && !/^(_|whatsapp|instagram|messenger|meta|facebook)/.test(local) && !/bot$/.test(local);
      }).map(u => ({ userId: u.name, displayname: u.displayname || u.name.split(':')[0].slice(1) }));
      return send(res, 200, { admin, people });
    }
    if (url.pathname === '/push/family/create' && req.method === 'POST') {
      if (!(await isAdmin(req.headers.authorization))) return send(res, 403, { error: 'Only the server owner can add family members' });
      const me = await whoami(req.headers.authorization);
      const { username, displayname, password } = await readJson(req);
      const local = String(username || '').trim().toLowerCase();
      if (!/^[a-z0-9._=-]{2,32}$/.test(local)) return send(res, 400, { error: 'Username: 2–32 letters or numbers, no spaces' });
      if (/^(whatsapp|instagram|messenger|meta|facebook|_)/.test(local)) return send(res, 400, { error: 'Pick a different username' });
      if (String(password || '').length < 8) return send(res, 400, { error: 'Password needs 8+ characters' });
      const id = `@${local}:${me.split(':').slice(1).join(':')}`;
      const path = `${SYNAPSE}/_synapse/admin/v2/users/${encodeURIComponent(id)}`;
      const ex = await fetch(path, { headers: { Authorization: req.headers.authorization } });
      if (ex.ok) return send(res, 409, { error: 'That username is already taken' });
      const r = await fetch(path, { method: 'PUT', headers: { Authorization: req.headers.authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, displayname: String(displayname || local).slice(0, 60), admin: false }) });
      if (!r.ok) return send(res, 502, { error: 'Could not create the login' });
      fam.people = fam.people.filter(p => p.userId !== id).concat({ userId: id, displayname: String(displayname || local).slice(0, 60) }); saveFam();
      return send(res, 200, { userId: id });
    }

    if (url.pathname.startsWith('/push/backup/')) {
      const who = await isAdmin(req.headers.authorization);
      if (who === null) return send(res, 401, { error: 'not logged in' });
      if (who === false) return send(res, 403, { error: 'only the server owner can manage backups' });
      const op = url.pathname.slice('/push/backup/'.length);
      if (req.method === 'GET' && op === 'status') {
        return send(res, 200, { connected: fs.existsSync(tokenFile), running: fs.existsSync(requestFile), last: readJsonFile(statusFile), key: backupKey() });
      }
      if (req.method === 'GET' && op === 'authurl') {
        const q = new URLSearchParams({ client_id: G_ID, redirect_uri: G_REDIRECT, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/drive.file' });
        return send(res, 200, { url: 'https://accounts.google.com/o/oauth2/auth?' + q });
      }
      if (req.method === 'POST' && op === 'connect') {
        const { pasted } = await readJson(req);
        // Accept the full address with or without http:// (Safari copies it without), or just the code
        const raw = String(pasted || '').trim();
        const errM = /[?&]error=([^&\s#]+)/.exec(raw);
        if (errM) return send(res, 400, { error: 'Google said: ' + decodeURIComponent(errM[1]) });
        const m = /[?&]code=([^&\s#]+)/.exec(raw);
        let code = m ? m[1] : raw;
        try { code = decodeURIComponent(code.replace(/\+/g, ' ')); } catch {}
        if (!code || code.length < 10) return send(res, 400, { error: 'That doesn’t look like the address from the failed page' });
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SECRET, redirect_uri: G_REDIRECT, grant_type: 'authorization_code' }) });
        const t = await r.json().catch(() => ({}));
        if (!r.ok || !t.refresh_token) return send(res, 400, { error: 'Google didn’t accept it (' + (t.error_description || t.error || r.status) + '). Start again from step 1 — each address works only once.' });
        const tok = { access_token: t.access_token, token_type: t.token_type || 'Bearer', refresh_token: t.refresh_token, expiry: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString() };
        fs.writeFileSync(tokenFile, JSON.stringify(tok), { mode: 0o600 });
        backupKey();
        fs.writeFileSync(requestFile, String(Date.now()));          // first backup right away
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && op === 'run') {
        if (!fs.existsSync(tokenFile)) return send(res, 400, { error: 'Connect Google Drive first' });
        fs.writeFileSync(requestFile, String(Date.now()));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && op === 'disconnect') {
        try { fs.unlinkSync(tokenFile); } catch {}
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    }

    if (req.method === 'POST' && url.pathname === '/_matrix/push/v1/notify') {
      const rejected = await notify(await readJson(req));
      return send(res, 200, { rejected });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => console.log('push gateway on', PORT));
