// Tiny Matrix push gateway -> Web Push (works with iPhone home-screen web apps, iOS 16.4+)
// Synapse calls  POST /_matrix/push/v1/notify  (internal Docker network only)
// The app calls  GET /push/vapid  and  POST /push/subscribe  (through Caddy)
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
  await Promise.all((n.devices || []).map(async d => {
    const s = subs[d.pushkey];
    if (!s) { rejected.push(d.pushkey); return; }
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
