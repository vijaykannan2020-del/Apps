import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { normalizeMac, normalizePortal, isBlockedHost, createPortalClient, cleanUA, cleanModel, createIptv, MAG_UA } from '../src/iptv.mjs';

test('MAC, portal, host and agent helpers', () => {
  assert.equal(normalizeMac('1a-17-e3-ab-7b-df'), '1A:17:E3:AB:7B:DF');
  assert.throws(() => normalizeMac('xyz'));
  assert.equal(normalizePortal('desi4k.cc'), 'http://desi4k.cc');
  assert.throws(() => normalizePortal('http://127.0.0.1/c/'));
  assert.equal(isBlockedHost('http://10.0.0.1'), true);
  assert.equal(isBlockedHost('http://desi4k.cc'), false);
  assert.equal(cleanUA('a\r\nb'), 'ab'.length >= 8 ? null : null); // too short → null
  assert.equal(cleanModel('AuraHD9'), 'AuraHD9');
});

test('portal login carries the chosen box user-agent + MAC', async () => {
  let seen;
  const fake = async (url, opts) => {
    seen = opts.headers; const a = new URL(url).searchParams.get('action');
    if (new URL(url).pathname !== '/portal.php') return new Response('x', { status: 404 });
    const js = { handshake: { token: 'T' }, get_profile: {}, get_genres: [{ id: '1', title: 'Sports' }],
      get_all_channels: { data: [{ id: 9, name: 'Willow', cmd: 'ffmpeg http://localhost/ch/9', tv_genre_id: '1' }] } }[a];
    return new Response(JSON.stringify({ js }), { status: 200 });
  };
  const p = createPortalClient(fake);
  const r = await p.channels('http://desi4k.cc/', '1A:17:E3:AB:7B:DF', { ua: 'AURA-UA test string', model: 'AuraHD9' });
  assert.equal(r.channels[0].name, 'Willow');
  assert.equal(seen['User-Agent'], 'AURA-UA test string');
  assert.equal(seen['X-User-MAC'], '1A:17:E3:AB:7B:DF');
  assert.match(seen.Cookie, /mac=1A:17:E3:AB:7B:DF/);
});

test('end to end: MAC-checked stream → iPhone HLS (AAC), signed + expiring', { timeout: 90000 }, async () => {
  const tsFile = path.join(os.tmpdir(), 'sl-test-' + process.pid + '.ts');
  await new Promise((ok, bad) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '15', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-c:a', 'mp2', '-f', 'mpegts', tsFile]).on('exit', c => c === 0 ? ok() : bad(new Error('ffmpeg ' + c))));
  let gotMac = null, gotUA = null;
  const media = http.createServer(async (req, res) => {
    gotMac = req.headers['x-user-mac']; gotUA = req.headers['user-agent'];
    if (!/AuraHD/.test(gotUA || '') || gotMac !== '1A:17:E3:AB:7B:DF') { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'video/mp2t' });
    const data = await fs.readFile(tsFile); let i = 0;
    // Loop forever so the feed behaves like a live channel (never EOF) until the client disconnects.
    const t = setInterval(() => { if (res.destroyed) { clearInterval(t); return; } if (i >= data.length) i = 0; res.write(data.subarray(i, i += 188 * 400)); }, 40);
    res.on('close', () => clearInterval(t));
  });
  await new Promise(r => media.listen(0, '127.0.0.1', r));
  const target = `http://127.0.0.1:${media.address().port}/live/9.ts`;
  const portal = { channels: async () => ({ categories: ['Sports'], channels: [] }), link: async () => target };

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sl-'));
  const secret = 's'.repeat(40);
  const config = { dataDir, publicURL: '', ticketMs: 3600000, ffmpeg: 'ffmpeg', maxIptv: 1 };
  const signature = (id, i, e) => crypto.createHmac('sha256', secret).update(`${id}:${i}:${e}`).digest('base64url');
  const equal = (a, b) => a === b;
  const json = (res, s, v) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
  const body = async req => { let d = ''; for await (const c of req) d += c; return JSON.parse(d || '{}'); };
  const iptv = createIptv({ config, signature, equal, json, body, portal });

  const srv = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (await iptv.handleApi(req, res, u.pathname)) return; if (await iptv.handleMedia(req, res, u, u.pathname)) return; json(res, 404, {}); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`; config.publicURL = base;
  try {
    const play = await (await fetch(base + '/api/iptv/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'http://desi4k.cc', mac: '1A:17:E3:AB:7B:DF', cmd: 'ffmpeg http://localhost/ch/9', name: 'Willow', ua: 'x AuraHD/1.7 y', model: 'AuraHD9' }) })).json();
    assert.ok(play.hls, JSON.stringify(play));
    assert.equal(gotMac, '1A:17:E3:AB:7B:DF');
    const pl = await fetch(play.hls); assert.equal(pl.status, 200);
    const text = await pl.text(); assert.match(text, /#EXTINF/);
    const seg = text.split('\n').find(l => l.startsWith('seg-'));
    const s = await fetch(new URL(seg, play.hls)); assert.equal(s.status, 200);
    const buf = Buffer.from(await s.arrayBuffer()); assert.equal(buf[0], 0x47);
    const probe = await new Promise(ok => { let o = ''; const pr = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', '-']); pr.stdout.on('data', d => o += d); pr.on('exit', () => ok(o)); pr.stdin.end(buf); });
    assert.match(probe, /h264/); assert.match(probe, /aac/);
    assert.equal((await fetch(play.hls.replace(/t=[^&]+/, 't=bad'))).status, 401);
    assert.equal((await fetch(base + '/api/iptv/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal(iptv.lives.size, 0);
  } finally {
    await iptv.close(); await new Promise(r => srv.close(r)); await new Promise(r => media.close(r)); media.closeAllConnections?.();
    await fs.rm(dataDir, { recursive: true, force: true }); await fs.rm(tsFile, { force: true });
  }
});

test('discovers a non-standard login path via redirect + portal page, and reports what it tried', async () => {
  const { createPortalClient } = await import('../src/iptv.mjs');
  // desi4k.cc/c/ redirects to the real portal page, whose script points at /mag/api/server/load.php
  const fake = async (url, opts) => {
    const u = new URL(url);
    if (u.host === 'desi4k.cc' && (u.pathname === '/c/' || u.pathname === '/'))
      { const r = new Response('<html>redirected</html>', { status: 200 }); Object.defineProperty(r, 'url', { value: 'http://line.real-tv.net:8080/mag/c/index.html' }); return r; }
    if (u.host === 'line.real-tv.net:8080' && u.pathname === '/mag/c/index.html')
      return new Response('<script>var loader="/mag/server/load.php";</script>', { status: 200 });
    if (u.host === 'line.real-tv.net:8080' && u.pathname === '/mag/server/load.php') {
      const a = u.searchParams.get('action');
      const js = { handshake: { token: 'TT' }, get_profile: {}, get_genres: [], get_all_channels: { data: [{ id: 1, name: 'Sun TV', cmd: 'ffmpeg http://localhost/ch/1' }] } }[a];
      return new Response(JSON.stringify({ js }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const p = createPortalClient(fake);
  const r = await p.channels('http://desi4k.cc/', '1A:17:E3:AB:7B:DF', { model: 'AuraHD9' });
  assert.equal(r.channels[0].name, 'Sun TV');
  // and a portal with nothing at all gives a readable diagnostic
  const dead = createPortalClient(async () => new Response('nope', { status: 404 }));
  await assert.rejects(dead.channels('http://desi4k.cc/', '1A:17:E3:AB:7B:DF', {}), e => /Tried: page desi4k\.cc\/: 404/.test(e.message) && /portal\.php: HTTP 404/.test(e.message));
});
