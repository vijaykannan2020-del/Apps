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
function agentOf(a) {
  return { ua: cleanUA(a && a.ua) || MAG_UA, model: cleanModel(a && a.model) };
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
    Referer: origin + '/c/',
  };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

export function createPortalClient(fetchImpl = fetch) {
  async function get(ep, params, origin, mac, token, agent) {
    const url = new URL(ep);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('JsHttpRequest', '1-xml');
    const res = await fetchImpl(url, { headers: portalHeaders(origin, mac, token, agent), redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('Portal returned HTTP ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error('Portal did not answer like a MAG portal.'); }
  }
  async function login(origin, mac, agent) {
    let last;
    for (const p of ['/portal.php', '/stalker_portal/server/load.php', '/server/load.php', '/c/portal.php']) {
      const ep = origin + p;
      try {
        const r = await get(ep, { type: 'stb', action: 'handshake' }, origin, mac, null, agent);
        const token = r?.js?.token;
        if (!token) continue;
        try { await get(ep, { type: 'stb', action: 'get_profile' }, origin, mac, token, agent); } catch {}
        return { ep, token };
      } catch (e) { last = e; }
    }
    throw new Error('Could not log in to the portal. Check the portal URL, MAC address and STB model.' + (last ? ' (' + last.message + ')' : ''));
  }
  async function channels(origin, mac, agent) {
    const { ep, token } = await login(origin, mac, agent);
    const names = {};
    try {
      const g = await get(ep, { type: 'itv', action: 'get_genres' }, origin, mac, token, agent);
      for (const x of Array.isArray(g?.js) ? g.js : []) names[String(x.id)] = String(x.title || '');
    } catch {}
    const r = await get(ep, { type: 'itv', action: 'get_all_channels' }, origin, mac, token, agent);
    const list = (Array.isArray(r?.js?.data) ? r.js.data : []).slice(0, 20000).map(c => ({
      id: String(c.id), name: String(c.name || 'Channel'), number: c.number ?? null,
      cmd: String(c.cmd || ''), category: names[String(c.tv_genre_id)] || 'Other',
      logo: /^https?:\/\//i.test(c.logo || '') ? c.logo : '',
    })).filter(c => c.cmd);
    const categories = [...new Set(list.map(c => c.category))];
    return { categories, channels: list };
  }
  async function link(origin, mac, cmd, agent) {
    const { ep, token } = await login(origin, mac, agent);
    const r = await get(ep, { type: 'itv', action: 'create_link', cmd, forced_storage: '0', disable_ad: '0' }, origin, mac, token, agent);
    const raw = String(r?.js?.cmd || '').replace(/^ffmpeg\s+/i, '').trim();
    const m = raw.match(/https?:\/\/\S+/);
    if (!m) throw new Error('The portal did not give a playable link for this channel.');
    if (isBlockedHost(m[0])) throw new Error('The portal gave a link this server will not open.');
    return m[0];
  }
  return { channels, link };
}

// ffmpeg reads the channel with MAG headers and writes a rolling live HLS playlist.
export function ffmpegArgs({ target, mac, origin, dir, convert, agent }) {
  const a = agentOf(agent);
  const hdr = `X-User-MAC: ${mac}\r\nX-User-Agent: Model: ${a.model}; Link: WiFi\r\nCookie: mac=${mac}; stb_lang=en\r\nReferer: ${origin}/c/\r\n`;
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

  async function start({ origin, mac, cmd, name, convert, agent }) {
    const target = await portal.link(origin, mac, cmd, agent);
    while (lives.size >= maxLive) await stop([...lives.values()].sort((a, b) => a.started - b.started)[0]);
    const id = crypto.randomUUID(), dir = path.join(root, id);
    await fs.mkdir(dir, { recursive: true });
    const live = { id, dir, origin, mac, cmd, name, agent, convert: !!convert, started: Date.now(), seen: Date.now(), state: 'starting', error: null };
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
        json(res, 200, await portal.channels(normalizePortal(d.portal), normalizeMac(d.mac), { ua: d.ua, model: d.model }));
      } catch (e) { json(res, 502, { error: e.message }); }
      return true;
    }
    if (pathname === '/api/iptv/play' && req.method === 'POST') {
      try {
        const d = await body(req);
        if (typeof d.cmd !== 'string' || !d.cmd || d.cmd.length > 2000) throw new Error('Choose a channel.');
        json(res, 200, await start({ origin: normalizePortal(d.portal), mac: normalizeMac(d.mac), cmd: d.cmd, name: String(d.name || '').slice(0, 200), convert: d.convert === true, agent: { ua: d.ua, model: d.model } }));
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
        const target = await portal.link(live.origin, live.mac, live.cmd, live.agent);
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
