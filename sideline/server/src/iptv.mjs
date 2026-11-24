// IPTV portal support (Stalker / Ministra "MAG box" portals tied to a MAC address).
// The server logs in to the portal as a MAG box (MAG user-agent + MAC), lists channels,
// and turns a channel into a live HLS stream that iPhone Safari can play. Browsers cannot
// send these headers themselves, which is why this runs here and not in the web page.
import path from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { pipeline, Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

export const MAG_UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Safari/533.3';

// The emulated box. The web app sends ua/model (chosen STB Model); these are the fallbacks.
export function cleanUA(ua) {
  if (typeof ua !== 'string') return null;
  const t = ua.replace(/[\r\n]/g, '').trim();
  return t.length >= 8 && t.length <= 300 && /^[\x20-\x7E]+$/.test(t) ? t : null;
}
export function cleanModel(model) {
  const t = String(model || '').replace(/[^\w .\-\/]/g, '').trim().slice(0, 40);
  return t || 'MAG200';
}
function cleanId(v) {
  const t = String(v || '').replace(/[^0-9A-Za-z:._-]/g, '').slice(0, 80);
  return t || null;
}
function agentOf(a) {
  return { ua: cleanUA(a && a.ua) || MAG_UA, model: cleanModel(a && a.model), sn: cleanId(a && a.sn), deviceId: cleanId(a && a.deviceId), deviceId2: cleanId(a && a.deviceId2), signature: cleanId(a && a.signature) };
}

export function normalizeMac(input) {
  const hex = String(input || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 12) throw new Error('Enter the MAC address as 12 letters/numbers, e.g. 00:1A:79:AB:CD:EF.');
  return hex.match(/.{2}/g).join(':');
}

export function isBlockedHost(target) {
  let u;
  try { u = new URL(target); } catch { return true; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return true;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h === '0.0.0.0') return true;
  if (h.includes(':') && (h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80') || h.startsWith('::ffff:'))) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

// Full portal URL as typed (origin + path), validated. The path tells us where the login lives.
export function normalizeEntry(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('Enter your IPTV portal URL.');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  const url = new URL(u);
  if (isBlockedHost(url.origin)) throw new Error('This portal address is not allowed.');
  return url.origin + url.pathname;
}

export function normalizePortal(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('Enter your IPTV portal URL.');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  const origin = new URL(u).origin;
  if (isBlockedHost(origin)) throw new Error('This portal address is not allowed.');
  return origin;
}

function portalHeaders(origin, mac, token, agent) {
  const a = agentOf(agent);
  const h = {
    'User-Agent': a.ua,
    Accept: '*/*',
    'X-User-Agent': `Model: ${a.model}; Link: WiFi`,
    'X-User-MAC': mac,
    Cookie: `mac=${mac}; stb_lang=en; timezone=America/Chicago`,
    Referer: new URL(origin).origin + '/c/',
  };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

// Candidate login (API) URLs for a portal URL, the way STB players derive them.
function deriveEndpoints(u) {
  const out = [], path = u.pathname, i = path.toLowerCase().lastIndexOf('/c/');
  if (i >= 0) { const pre = path.slice(0, i + 1); out.push(u.origin + pre + 'server/load.php', u.origin + pre + 'portal.php'); }
  const dir = path.replace(/[^/]*$/, '');
  if (dir && dir !== '/' && i < 0) out.push(u.origin + dir + 'server/load.php', u.origin + dir + 'portal.php');
  for (const p of ['/portal.php', '/stalker_portal/server/load.php', '/server/load.php', '/c/portal.php', '/stalker_portal/portal.php'])
    out.push(u.origin + p);
  return out;
}
function deviceProfile(mac, agent) {
  const H = (alg, v) => crypto.createHash(alg).update(v).digest('hex').toUpperCase();
  const UP = v => String(v).toUpperCase();
  const a = agent || {};
  const sn = a.sn || H('md5', mac).slice(0, 13);                 // real serial if supplied
  const model = cleanModel(a.model);
  const base = {
    hd: '1', ver: 'ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c',
    num_banks: '2', sn, stb_type: model, client_type: 'STB', image_version: '218', video_out: 'hdmi',
    hw_version: '1.7-BD-00', not_valid_token: '0', hw_version_2: H('sha1', mac), timestamp: String(Math.floor(Date.now() / 1000)),
    api_signature: '262', prehash: '',
    metrics: JSON.stringify({ mac, sn, model, type: 'STB', uid: '', random: '' }),
  };
  // Only send a device id if one was given. A box with "Send Device ID" off (like this user's)
  // sends none, and strict portals reject any device id they didn't store.
  if (a.deviceId) {
    base.device_id = a.deviceId;
    base.device_id2 = a.deviceId2 || a.deviceId;   // MAC-based boxes reuse the same value
    base.signature = a.signature || H('sha256', UP(sn) + UP(mac));
    base.auth_second_step = '1';
  }
  return base;
}
const shortURL = x => { try { const u = new URL(x); return u.host + u.pathname; } catch { return String(x); } };

export function createPortalClient(fetchImpl = fetch) {
  const cooldownUntil = new Map(); // host -> time we may call it again after a 429
  const COOLDOWN_MS = 150000;
  async function get(ep, params, origin, mac, token, agent, timeoutMs) {
    const url = new URL(ep);
    const host = url.host;
    const until = cooldownUntil.get(host) || 0;
    if (Date.now() < until) throw new Error('The portal is rate-limiting us. Please wait ' + Math.ceil((until - Date.now()) / 1000) + 's before trying again (and avoid repeat taps — each one restarts the wait).');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('JsHttpRequest', '1-xml');
    const res = await fetchImpl(url, { headers: portalHeaders(ep, mac, token, agent), redirect: 'follow', signal: AbortSignal.timeout(timeoutMs || 15000) });
    if (res.status === 429) { cooldownUntil.set(host, Date.now() + COOLDOWN_MS); throw new Error('Portal rate-limited us (HTTP 429). Now waiting ~2.5 min — do not tap again until then.'); }
    if (!res.ok) throw new Error('Portal returned HTTP ' + res.status);
    const text = (await res.text()).replace(/^\uFEFF/, '').trim();
    try { return JSON.parse(text); }
    catch { throw new Error('Portal did not answer like a MAG portal (' + (params.action || 'request') + ': "' + text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) + '")'); }
  }
  const found = new Map(); // portal URL -> working login endpoint
  const sessions = new Map(); // portal URL + mac -> recent { ep, token, profile, ts }
  const channelCache = new Map(); // portal URL + mac -> recent { data, ts }
  async function discover(entry, mac, agent, tried) {
    const urls = new Set(deriveEndpoints(new URL(entry)));
    const origin = new URL(entry).origin;
    for (const probe of [...new Set([entry, origin + '/c/', origin + '/'])]) {
      try {
        const r = await fetchImpl(probe, { headers: portalHeaders(probe, mac, null, agent), redirect: 'follow', signal: AbortSignal.timeout(10000) });
        const moved = r.url && r.url !== probe ? ' → ' + shortURL(r.url) : '';
        tried.push('page ' + shortURL(probe) + ': ' + r.status + moved);
        if (moved) { const fu = new URL(r.url); if (!isBlockedHost(fu.origin)) deriveEndpoints(fu).forEach(x => urls.add(x)); }
        const text = (await r.text()).slice(0, 300000);
        for (const m of text.matchAll(/((?:https?:)?\/\/[^"'()\s<>]+\/|\/[^"'()\s<>]*?)(server\/load\.php|portal\.php)/g)) {
          try { const x = new URL(m[1] + m[2], r.url || probe); if (!isBlockedHost(x.origin)) urls.add(x.toString()); } catch {}
        }
      } catch (e) { tried.push('page ' + shortURL(probe) + ': ' + (e.name === 'TimeoutError' ? 'no answer' : 'unreachable')); }
    }
    return [...urls].filter(x => !isBlockedHost(x)).slice(0, 20);
  }
  async function login(entry, mac, agent) {
    const key = entry + '|' + mac;
    const sess = sessions.get(key);
    if (sess && Date.now() - sess.ts < 300000) return sess;   // reuse a recent login (e.g. list → play), like a real box
    const tried = [];
    const cached = found.get(entry);
    const list = cached ? [cached] : await discover(entry, mac, agent, tried);
    for (const ep of list) {
      try {
        const r = await get(ep, { type: 'stb', action: 'handshake' }, entry, mac, null, agent);
        const token = r?.js?.token;
        if (!token) { tried.push(shortURL(ep) + ': no token'); continue; }
        let profile = null;
        try { profile = (await get(ep, { type: 'stb', action: 'get_profile', ...deviceProfile(mac, agent) }, entry, mac, token, agent))?.js || null; }
        catch (e) { profile = { _error: String(e.message).replace(/^Portal did not answer like a MAG portal /, '') }; }
        found.set(entry, ep);
        const out = { ep, token, profile, ts: Date.now() };
        sessions.set(key, out);
        return out;
      } catch (e) { tried.push(shortURL(ep) + ': ' + String(e.message).replace('Portal returned ', '').replace('Portal did not answer like a MAG portal.', 'not a portal')); if (/rate-limit/i.test(e.message)) break; }
    }
    if (cached) { found.delete(entry); return login(entry, mac, agent); }
    throw new Error('Could not log in to the portal. Check the portal URL, MAC address and STB model. Tried: ' + tried.slice(0, 10).join('; '));
  }
  async function channels(origin, mac, agent) {
    const ckey = origin + '|' + mac;
    const cc = channelCache.get(ckey);
    if (cc && Date.now() - cc.ts < 300000) return cc.data;   // reuse the recent list instead of re-asking the portal
    const { ep, token, profile } = await login(origin, mac, agent);
    const names = {};
    try {
      const g = await get(ep, { type: 'itv', action: 'get_genres' }, origin, mac, token, agent);
      for (const x of Array.isArray(g?.js) ? g.js : []) names[String(x.id)] = String(x.title || '');
    } catch {}
    let r;
    try { r = await get(ep, { type: 'itv', action: 'get_all_channels' }, origin, mac, token, agent, 110000); }
    catch (e) {
      const p = profile || {};
      const sent = deviceProfile(mac, agent);
      const dbg = sent.device_id ? 'sent id ' + String(sent.device_id).slice(0, 8) + '/id2 ' + String(sent.device_id2).slice(0, 8) : 'sent no device id, sn ' + String(sent.sn).slice(0, 10);
      const st = p._error ? 'profile step failed ' + p._error
        : [p.msg || p.block_msg, p.status != null ? 'status ' + p.status : '', 'id' in p ? (p.id ? 'account found' : 'account not found') : '', p.stb_type ? 'portal sees ' + p.stb_type : ''].filter(Boolean).join(', ');
      throw new Error(e.message + (st ? ' — login said: ' + String(st).slice(0, 160) : ' — login said nothing') + ' [' + dbg + ']');
    }
    const list = (Array.isArray(r?.js?.data) ? r.js.data : []).slice(0, 20000).map(c => ({
      id: String(c.id), name: String(c.name || 'Channel'), number: c.number ?? null,
      cmd: String(c.cmd || ''), category: names[String(c.tv_genre_id)] || 'Other',
      logo: /^https?:\/\//i.test(c.logo || '') ? c.logo : '',
    })).filter(c => c.cmd);
    const categories = [...new Set(list.map(c => c.category))];
    const data = { categories, channels: list };
    channelCache.set(ckey, { data, ts: Date.now() });
    return data;
  }
  async function link(origin, mac, cmd, agent, contentType) {
    const type = contentType === 'vod' || contentType === 'series' ? 'vod' : 'itv';
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { ep, token } = await login(origin, mac, agent);   // reuses the channel-list login
      try {
        const r = await get(ep, { type, action: 'create_link', cmd, forced_storage: '0', disable_ad: '0', series: '0' }, origin, mac, token, agent);
        const raw = String(r?.js?.cmd || '').replace(/^ffmpeg\s+/i, '').trim();
        const m = raw.match(/https?:\/\/\S+/);
        if (m && !isBlockedHost(m[0])) return m[0];
        lastErr = new Error('The portal did not give a playable link for this title.');
      } catch (e) { lastErr = e; }
      sessions.delete(origin + '|' + mac);   // token may be stale — force one fresh login
    }
    throw lastErr;
  }

  // Movies (VOD): categories, then a paginated list per category.
  function picURL(origin, p) {
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    return new URL(origin).origin + '/stalker_portal/' + String(p).replace(/^\/+/, '');
  }
  async function vodCategories(origin, mac, agent) {
    const { ep, token } = await login(origin, mac, agent);
    const r = await get(ep, { type: 'vod', action: 'get_categories' }, origin, mac, token, agent, 30000);
    const cats = (Array.isArray(r?.js) ? r.js : []).map(c => ({ id: String(c.id), title: String(c.title || c.name || '') }))
      .filter(c => c.id && c.id !== '*' && c.title);
    return { categories: cats };
  }
  async function vodList(origin, mac, agent, category, page) {
    const { ep, token } = await login(origin, mac, agent);
    const p = Math.max(1, Number(page) || 1);
    const r = await get(ep, { type: 'vod', action: 'get_ordered_list', category: String(category), sortby: 'added', p: String(p) }, origin, mac, token, agent, 40000);
    const js = r?.js || {};
    const rows = Array.isArray(js.data) ? js.data : [];
    const items = rows.map(x => ({
      id: String(x.id), name: String(x.name || x.o_name || 'Untitled'), cmd: String(x.cmd || ''),
      logo: picURL(origin, x.screenshot_uri || x.poster_path || x.cover || ''), year: String(x.year || ''),
    })).filter(x => x.cmd);
    const total = Number(js.total_items || 0), per = rows.length || 14;
    return { items, hasMore: total ? p * per < total : items.length > 0 };
  }
  return { channels, link, vodCategories, vodList };
}

// ffmpeg reads the channel with MAG headers and writes a rolling live HLS playlist.
export function ffmpegArgs({ target, mac, origin, dir, convert, agent }) {
  const a = agentOf(agent);
  const hdr = `X-User-MAC: ${mac}\r\nX-User-Agent: Model: ${a.model}; Link: WiFi\r\nCookie: mac=${mac}; stb_lang=en\r\nReferer: ${new URL(origin).origin}/c/\r\n`;
  const video = convert
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-vf', 'scale=w=min(1280\\,iw):h=-2', '-g', '50']
    : ['-c:v', 'copy'];
  return ['-hide_banner', '-loglevel', 'error', '-nostdin',
    '-user_agent', a.ua, '-headers', hdr,
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-rw_timeout', '15000000',
    '-i', target, '-map', '0:v:0?', '-map', '0:a:0?', '-sn', ...video, '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', '8',
    '-hls_flags', 'delete_segments+independent_segments+temp_file+omit_endlist',
    '-hls_segment_filename', path.join(dir, 'seg-%06d.ts'), path.join(dir, 'index.m3u8')];
}

export function createIptv({ config, signature, equal, json, body, portal = createPortalClient() }) {
  const lives = new Map();
  const maxLive = Number(config.maxIptv || 1);
  const root = path.join(config.dataDir, 'iptv');
  const sign = (id, expires) => signature('iptv-' + id, 0, expires);
  const ticket = id => { const e = Date.now() + config.ticketMs; return new URLSearchParams({ e: String(e), t: sign(id, e) }).toString(); };
  const okTicket = (url, id) => {
    const e = Number(url.searchParams.get('e')), t = url.searchParams.get('t');
    return Number.isSafeInteger(e) && e > Date.now() && e < Date.now() + config.ticketMs + 60000 && t && equal(t, sign(id, e));
  };

  async function stop(live) {
    live.state = 'stopped';
    lives.delete(live.id);
    if (live.process && !live.process.killed) live.process.kill('SIGTERM');
    await fs.rm(live.dir, { recursive: true, force: true }).catch(() => {});
  }

  async function waitForPlaylist(live, ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (live.state === 'error') throw new Error(live.error);
      try {
        const text = await fs.readFile(path.join(live.dir, 'index.m3u8'), 'utf8');
        if ((text.match(/#EXTINF:/g) || []).length >= 2) return;
      } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error('The channel did not start in time. It may be offline; try another channel.');
  }

  async function start({ origin, mac, cmd, name, convert, agent, contentType }) {
    const target = await portal.link(origin, mac, cmd, agent, contentType);
    while (lives.size >= maxLive) await stop([...lives.values()].sort((a, b) => a.started - b.started)[0]);
    const id = crypto.randomUUID(), dir = path.join(root, id);
    await fs.mkdir(dir, { recursive: true });
    const live = { id, dir, origin, mac, cmd, name, agent, contentType, convert: !!convert, started: Date.now(), seen: Date.now(), state: 'starting', error: null };
    lives.set(id, live);
    const proc = spawn(config.ffmpeg, ffmpegArgs({ target, mac, origin, dir, convert, agent }), { stdio: ['ignore', 'ignore', 'pipe'] });
    live.process = proc;
    let errText = '';
    proc.stderr.on('data', d => { errText = (errText + d).slice(-2000); });
    proc.on('error', () => { if (live.state === 'stopped') return; live.state = 'error'; live.error = 'FFmpeg could not start on the server.'; });
    proc.on('exit', code => {
      if (live.state === 'stopped') return;
      live.state = 'error';
      live.error = /403|401|Forbidden|Unauthorized/i.test(errText) ? 'The IPTV server refused this stream (it may allow only one device at a time, or the MAC is not active).'
        : /Invalid data|could not find codec|Decoder/i.test(errText) ? 'This channel uses a format the server could not read.'
        : code === 0 ? 'The channel stream ended.' : 'The channel stream stopped. It may be offline.';
    });
    try { await waitForPlaylist(live, 25000); }
    catch (e) { await stop(live); throw e; }
    live.state = 'live';
    const q = ticket(id);
    return {
      id, name,
      hls: config.publicURL + `/iptv/${id}/index.m3u8?` + q,
      direct: config.publicURL + `/iptv/${id}/direct.ts?` + q,
    };
  }

  // Returns true when the request was handled.
  async function handleApi(req, res, pathname) {
    if (pathname === '/api/iptv/channels' && req.method === 'POST') {
      try {
        const d = await body(req);
        json(res, 200, await portal.channels(normalizeEntry(d.portal), normalizeMac(d.mac), { ua: d.ua, model: d.model, sn: d.sn, deviceId: d.deviceId, deviceId2: d.deviceId2, signature: d.signature }));
      } catch (e) { json(res, 502, { error: e.message }); }
      return true;
    }
    if (pathname === '/api/iptv/play' && req.method === 'POST') {
      try {
        const d = await body(req);
        if (typeof d.cmd !== 'string' || !d.cmd || d.cmd.length > 2000) throw new Error('Choose a channel.');
        json(res, 200, await start({ origin: normalizeEntry(d.portal), mac: normalizeMac(d.mac), cmd: d.cmd, name: String(d.name || '').slice(0, 200), convert: d.convert === true, contentType: d.contentType, agent: { ua: d.ua, model: d.model, sn: d.sn, deviceId: d.deviceId, deviceId2: d.deviceId2, signature: d.signature } }));
      } catch (e) { json(res, 502, { error: e.message }); }
      return true;
    }
    if (pathname === '/api/iptv/vod-categories' && req.method === 'POST') {
      try {
        const d = await body(req);
        json(res, 200, await portal.vodCategories(normalizeEntry(d.portal), normalizeMac(d.mac), { ua: d.ua, model: d.model, sn: d.sn, deviceId: d.deviceId, deviceId2: d.deviceId2, signature: d.signature }));
      } catch (e) { json(res, 502, { error: e.message }); }
      return true;
    }
    if (pathname === '/api/iptv/vod-list' && req.method === 'POST') {
      try {
        const d = await body(req);
        json(res, 200, await portal.vodList(normalizeEntry(d.portal), normalizeMac(d.mac), { ua: d.ua, model: d.model, sn: d.sn, deviceId: d.deviceId, deviceId2: d.deviceId2, signature: d.signature }, d.category, d.page));
      } catch (e) { json(res, 502, { error: e.message }); }
      return true;
    }
    if (pathname === '/api/iptv/stop' && req.method === 'POST') {
      await Promise.all([...lives.values()].map(l => { l.state = 'stopped'; return stop(l); }));
      json(res, 200, { ok: true });
      return true;
    }
    return false;
  }

  async function handleMedia(req, res, url, pathname) {
    const m = /^\/iptv\/([a-f0-9-]{36})\/(index\.m3u8|seg-\d{6}\.ts|direct\.ts)$/.exec(pathname);
    if (!m || !['GET', 'HEAD'].includes(req.method)) return false;
    const [, id, name] = m;
    if (!okTicket(url, id)) { json(res, 401, { error: 'Playback link expired. Open the channel again.' }); return true; }
    const live = lives.get(id);
    if (!live) { json(res, 404, { error: 'This channel was stopped. Open it again.' }); return true; }
    live.seen = Date.now();

    if (name === 'direct.ts') {
      // Raw stream for VLC: fresh portal link, MAG headers, piped through.
      try {
        const target = await portal.link(live.origin, live.mac, live.cmd, live.agent, live.contentType);
        const up = await fetch(target, { headers: portalHeaders(live.origin, live.mac, null, live.agent), redirect: 'follow' });
        if (!up.ok || !up.body) { json(res, 502, { error: 'The IPTV server refused the stream.' }); return true; }
        res.writeHead(200, { 'Content-Type': up.headers.get('content-type') || 'video/mp2t', 'Cache-Control': 'no-store' });
        if (req.method === 'HEAD') { res.end(); return true; }
        const src = Readable.fromWeb(up.body);
        const keep = setInterval(() => { live.seen = Date.now(); }, 10000);
        res.on('close', () => { clearInterval(keep); src.destroy(); });
        pipeline(src, res, () => clearInterval(keep));
      } catch (e) { json(res, 502, { error: e.message }); }
      return true;
    }

    const file = path.join(live.dir, name);
    if (name === 'index.m3u8') {
      let text;
      try { text = await fs.readFile(file, 'utf8'); } catch { json(res, 503, { error: live.error || 'Channel is starting.' }); return true; }
      const q = url.searchParams.toString();
      text = text.split('\n').map(l => (l && !l.startsWith('#') ? l + '?' + q : l)).join('\n');
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : text);
      return true;
    }
    let stat;
    try { stat = await fs.stat(file); } catch { json(res, 404, { error: 'Segment expired.' }); return true; }
    res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': stat.size, 'Cache-Control': 'private, no-store' });
    if (req.method === 'HEAD') res.end(); else pipeline(createReadStream(file), res, () => {});
    return true;
  }

  // Stop channels nobody is watching (the player polls the playlist every few seconds).
  const timer = setInterval(() => {
    const now = Date.now();
    for (const l of lives.values()) if (now - l.seen > 45000 && now - l.started > 30000) { l.state = 'stopped'; stop(l); }
  }, 15000);
  timer.unref();

  async function close() { clearInterval(timer); await Promise.all([...lives.values()].map(l => { l.state = 'stopped'; return stop(l); })); }
  async function cleanStart() { await fs.rm(root, { recursive: true, force: true }).catch(() => {}); }

  return { handleApi, handleMedia, close, cleanStart, lives };
}
