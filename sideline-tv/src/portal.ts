// Stalker / Ministra portal client that runs on the phone, the way a set-top box app does:
// it connects straight from your own internet with your portal URL, MAC and box details.
import * as Crypto from 'expo-crypto';

export const MAG_UA =
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Safari/533.3';

export type Settings = {
  portal: string;   // e.g. http://example.com/c/
  mac: string;      // 00:1A:79:XX:XX:XX
  model: string;    // MAG254, MAG250, AuraHD9 …
  serial: string;   // optional box serial number
  deviceId: string; // optional; leave blank when the box has "Send Device ID" off
};

export type Channel = { id: string; name: string; number: string; cmd: string; category: string; logo: string };
export type Movie = { id: string; name: string; cmd: string; logo: string; year: string; series: boolean; category: string };
export type Season = { id: string; name: string; cmd: string; episodes: { n: number; name: string; cmd: string; series: number }[] };
export type Category = { id: string; title: string };

export function normalizeMac(input: string): string {
  const hex = String(input || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 12) throw new Error('Enter the MAC address as 12 letters/numbers, e.g. 00:1A:79:AB:CD:EF.');
  return hex.match(/.{2}/g)!.join(':');
}

export function normalizePortal(input: string): string {
  let u = String(input || '').trim();
  if (!u) throw new Error('Enter your portal URL in Settings.');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  const url = new URL(u);
  return url.origin + url.pathname;
}

const hash = async (alg: Crypto.CryptoDigestAlgorithm, v: string) =>
  (await Crypto.digestStringAsync(alg, v)).toUpperCase();

function withTimeout(ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// Login (API) addresses for a portal URL, the way STB players work them out.
function endpointsFor(u: URL): string[] {
  const out: string[] = [];
  const p = u.pathname, i = p.toLowerCase().lastIndexOf('/c/');
  if (i >= 0) {
    const pre = p.slice(0, i + 1);
    out.push(u.origin + pre + 'server/load.php', u.origin + pre + 'portal.php');
  }
  for (const x of ['/portal.php', '/stalker_portal/server/load.php', '/server/load.php']) out.push(u.origin + x);
  return [...new Set(out)];
}

export class Portal {
  private s: Settings;
  private mac: string;
  private entry: string;
  private ep: string | null = null;
  private token: string | null = null;
  private loggingIn: Promise<void> | null = null;
  onStatus: (text: string) => void = () => {};
  lastRoute = ''; // how the last link was obtained (shown on the player for troubleshooting)
  knownEndpoint: string | null = null; // remembered from last time, tried first
  onEndpoint: (ep: string) => void = () => {};

  constructor(s: Settings) {
    this.s = s;
    this.mac = normalizeMac(s.mac);
    this.entry = normalizePortal(s.portal);
  }

  private headers(withToken = true): Record<string, string> {
    const h: Record<string, string> = {
      'User-Agent': MAG_UA,
      Accept: '*/*',
      'X-User-Agent': `Model: ${this.s.model || 'MAG254'}; Link: WiFi`,
      'X-User-MAC': this.mac,
      Cookie: `mac=${this.mac}; stb_lang=en; timezone=America/Chicago`,
      Referer: new URL(this.ep || this.entry).origin + '/c/',
    };
    if (withToken && this.token) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  private async call(ep: string, params: Record<string, string>, timeoutMs = 20000, withToken = true): Promise<any> {
    const url = new URL(ep);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('JsHttpRequest', '1-xml');
    const t = withTimeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: this.headers(withToken), signal: t.signal, credentials: 'omit' });
    } catch (e: any) {
      throw new Error(e?.name === 'AbortError' ? 'The portal took too long to answer.' : 'Could not reach the portal. Check your internet.');
    } finally { t.done(); }
    if (res.status === 429) throw new Error('The portal says too many requests. Wait a few minutes, then try again.');
    if (!res.ok) throw new Error('Portal returned HTTP ' + res.status);
    const text = (await res.text()).replace(/^﻿/, '').trim();
    try { return JSON.parse(text); }
    catch { throw new Error('The portal gave an unexpected answer (' + (params.action || 'request') + ').'); }
  }

  private async profileParams(): Promise<Record<string, string>> {
    const sn = this.s.serial?.trim() || (await hash(Crypto.CryptoDigestAlgorithm.MD5, this.mac)).slice(0, 13);
    const model = this.s.model || 'MAG254';
    const p: Record<string, string> = {
      hd: '1',
      ver: 'ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c',
      num_banks: '2', sn, stb_type: model, client_type: 'STB', image_version: '218', video_out: 'hdmi',
      hw_version: '1.7-BD-00', not_valid_token: '0',
      hw_version_2: await hash(Crypto.CryptoDigestAlgorithm.SHA1, this.mac),
      timestamp: String(Math.floor(Date.now() / 1000)), api_signature: '262', prehash: '',
      metrics: JSON.stringify({ mac: this.mac, sn, model, type: 'STB', uid: '', random: '' }),
    };
    const id = this.s.deviceId?.trim();
    if (id) {
      p.device_id = id;
      p.device_id2 = id;
      p.signature = await hash(Crypto.CryptoDigestAlgorithm.SHA256, sn.toUpperCase() + this.mac);
      p.auth_second_step = '1';
    }
    return p;
  }

  // Finds the login address (following the portal page's redirect once, like a box does).
  private async candidates(): Promise<string[]> {
    const list = endpointsFor(new URL(this.entry));
    try {
      const t = withTimeout(10000);
      const r = await fetch(this.entry, { headers: this.headers(false), signal: t.signal, credentials: 'omit' }).finally(t.done);
      if (r.url && r.url !== this.entry) return [...new Set([...endpointsFor(new URL(r.url)), ...list])];
    } catch {}
    return list;
  }

  private async doLogin(): Promise<void> {
    const errors: string[] = [];
    this.onStatus('Logging in to your portal…');
    const usingKnown = !this.ep && !!this.knownEndpoint;
    const list = this.ep ? [this.ep] : usingKnown ? [this.knownEndpoint!] : await this.candidates();
    for (const ep of list) {
      try {
        this.token = null;
        const r = await this.call(ep, { type: 'stb', action: 'handshake' }, 15000, false);
        const token = r?.js?.token;
        if (!token) { errors.push(new URL(ep).host + ': no token'); continue; }
        this.ep = ep;
        this.token = token;
        const prof = await this.call(ep, { type: 'stb', action: 'get_profile', ...(await this.profileParams()) });
        const js = prof?.js || {};
        if (js.status === 1 || js.block_msg) throw new Error(String(js.msg || js.block_msg || 'The portal did not accept this device.'));
        this.onEndpoint(ep);
        return;
      } catch (e: any) {
        errors.push(new URL(ep).host + ': ' + e.message);
        if (/too many requests|did not accept/i.test(e.message)) break;
      }
    }
    this.ep = null; this.token = null;
    if (usingKnown && !errors.some(e => /too many requests|did not accept/i.test(e))) { this.knownEndpoint = null; return this.doLogin(); }
    throw new Error('Could not log in. Check the portal URL, MAC and box model in Settings.\n' + errors.slice(0, 4).join('\n'));
  }

  // One login shared by everything that needs it at the same moment.
  async login(force = false) {
    if (this.token && !force) return;
    if (!this.loggingIn) this.loggingIn = this.doLogin().finally(() => { this.loggingIn = null; });
    return this.loggingIn;
  }

  // Runs a portal call; if the session expired, logs in again once and retries.
  private async authed(params: Record<string, string>, timeoutMs?: number) {
    await this.login();
    try {
      const r = await this.call(this.ep!, params, timeoutMs);
      if (r?.js === false || (typeof r?.text === 'string' && /authoriz/i.test(r.text))) throw new Error('auth');
      return r;
    } catch (e: any) {
      if (/too many requests/i.test(e.message)) throw e;
      await this.login(true);
      return this.call(this.ep!, params, timeoutMs);
    }
  }

  async channels(): Promise<{ categories: string[]; channels: Channel[] }> {
    const names: Record<string, string> = {};
    try {
      const g = await this.authed({ type: 'itv', action: 'get_genres' });
      for (const x of Array.isArray(g?.js) ? g.js : []) names[String(x.id)] = String(x.title || '');
    } catch {}
    this.onStatus('Downloading your channel list… (thousands of channels, can take a minute)');
    let r = await this.authed({ type: 'itv', action: 'get_all_channels' }, 180000);
    if (!Array.isArray(r?.js?.data) || !r.js.data.length) {
      // Some portals only answer the paged list; try page 1 of it before giving up.
      const alt = await this.authed({ type: 'itv', action: 'get_ordered_list', genre: '*', fav: '0', sortby: 'number', p: '1' }, 60000).catch(() => null);
      if (Array.isArray(alt?.js?.data) && alt.js.data.length) r = alt;
      else throw new Error('The portal sent no channels. Its reply: ' + JSON.stringify(r).slice(0, 160) + '\n\nCheck the serial number in Settings.');
    }
    const channels: Channel[] = (Array.isArray(r?.js?.data) ? r.js.data : []).map((c: any) => ({
      id: String(c.id), name: String(c.name || 'Channel'), number: String(c.number ?? ''),
      cmd: String(c.cmd || ''), category: names[String(c.tv_genre_id)] || 'Other',
      logo: /^https?:\/\//i.test(c.logo || '') ? c.logo : '',
    })).filter((c: Channel) => c.cmd);
    return { categories: [...new Set(channels.map(c => c.category))], channels };
  }

  async vodCategories(): Promise<Category[]> {
    const r = await this.authed({ type: 'vod', action: 'get_categories' }, 30000);
    return (Array.isArray(r?.js) ? r.js : [])
      .map((c: any) => ({ id: String(c.id), title: String(c.title || c.name || '') }))
      .filter((c: Category) => c.id && c.id !== '*' && c.title);
  }

  private pic(p: string) {
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    return new URL(this.ep || this.entry).origin + '/stalker_portal/' + String(p).replace(/^\/+/, '');
  }

  async movies(category: string, page: number): Promise<{ items: Movie[]; hasMore: boolean }> {
    const r = await this.authed({ type: 'vod', action: 'get_ordered_list', category, sortby: 'added', p: String(page) }, 40000);
    const js = r?.js || {};
    const rows = Array.isArray(js.data) ? js.data : [];
    const items: Movie[] = rows.map((x: any) => ({
      id: String(x.id), name: String(x.name || x.o_name || 'Untitled'), cmd: String(x.cmd || ''),
      logo: this.pic(x.screenshot_uri || x.poster_path || x.cover || ''), year: String(x.year || ''),
      series: String(x.is_series) === '1' || (Array.isArray(x.series) && x.series.length > 0), category,
    })).filter((x: Movie) => x.cmd || x.series);
    const total = Number(js.total_items || 0), per = rows.length || 14;
    return { items, hasMore: total ? page * per < total : items.length > 0 };
  }

  // Seasons and episodes of a TV series (both portal styles).
  async seasons(movieId: string, category: string): Promise<Season[]> {
    const r = await this.authed({ type: 'vod', action: 'get_ordered_list', movie_id: movieId, season_id: '0', episode_id: '0', category, sortby: 'added', p: '1' }, 40000);
    const rows: any[] = Array.isArray(r?.js?.data) ? r.js.data : [];
    const out: Season[] = [];
    for (const x of rows) {
      const name = String(x.name || x.o_name || 'Season');
      if (Array.isArray(x.series) && x.series.length) {
        // Older style: one row per season, episodes are numbers played with series=N.
        out.push({ id: String(x.id), name, cmd: String(x.cmd || ''), episodes: x.series.map((n: any) => ({ n: Number(n), name: 'Episode ' + n, cmd: String(x.cmd || ''), series: Number(n) })) });
      } else {
        // Newer style: ask for the season's episodes.
        const e = await this.authed({ type: 'vod', action: 'get_ordered_list', movie_id: movieId, season_id: String(x.id), episode_id: '0', category, sortby: 'added', p: '1' }, 40000).catch(() => null);
        const eps: any[] = Array.isArray(e?.js?.data) ? e.js.data : [];
        out.push({ id: String(x.id), name, cmd: String(x.cmd || ''), episodes: eps.map((y: any, i: number) => ({ n: Number(y.series_number || y.episode_number || i + 1), name: String(y.name || 'Episode ' + (i + 1)), cmd: String(y.cmd || ''), series: 0 })).filter(y => y.cmd) });
      }
    }
    return out.filter(x => x.episodes.length);
  }

  // Asks the portal for the playable address of a channel, movie or episode.
  private extract(js: any): string | null {
    const raw = String((js && (js.cmd || js.url)) || (typeof js === 'string' ? js : '')).replace(/^(ffmpeg|auto)\s+/i, '').trim();
    const m = raw.match(/https?:\/\/\S+/);
    if (m) return m[0];
    if (/^\/\S+/.test(raw)) return new URL(raw, new URL(this.ep!).origin).toString();
    return null;
  }

  // Asks the portal for the playable address of a channel, movie or episode.
  // Portals differ in how they want movie requests, so it tries the common forms in turn.
  async link(cmd: string, kind: 'live' | 'movie', episode = 0, movieId = '', category = ''): Promise<string> {
    const base = { action: 'create_link', disable_ad: '0', download: '0', force_ch_link_check: '0' };
    const tries: Record<string, string>[] = kind === 'movie'
      ? [
          { ...base, type: 'vod', cmd, series: episode ? String(episode) : '', forced_storage: '' },
          { ...base, type: 'vod', cmd, series: String(episode || 0), forced_storage: '0' },
        ]
      : [{ ...base, type: 'itv', cmd, series: '', forced_storage: '0' }];
    let last: any = null;
    let note = '';
    this.lastRoute = '';
    for (const params of tries) {
      const r = await this.authed(params);
      const url = this.extract(r?.js);
      if (url) { this.lastRoute = 'portal link (' + params.type + ', series=' + params.series + ', storage=' + params.forced_storage + ')'; return url; }
      last = r?.js;
      if (last?.error === 'limit') throw new Error('Your subscription is already playing on another device. Stop it there and try again.');
      // Newer portals keep a movie's real video file(s) in a separate list; a box asks for that list,
      // then makes the link from the file (cmd like /media/file_123.mpg).
      if (kind === 'movie' && movieId && !episode && last?.error === 'nothing_to_play') {
        const f = await this.authed({ type: 'vod', action: 'get_ordered_list', movie_id: movieId, season_id: '0', episode_id: '0', category, sortby: 'added', p: '1' }, 30000).catch(() => null);
        const rows: any[] = Array.isArray(f?.js?.data) ? f.js.data : [];
        // Each file row has an id (and sometimes cmd / url). A box asks for /media/file_<id>.mpg.
        const files: any[] = rows.filter((x: any) => x && (x.cmd || x.id)).slice(0, 3)
          .map((x: any) => ({ ...x, cmd: x.cmd && x.cmd !== cmd ? x.cmd : '/media/file_' + x.id + '.mpg' }));
        note = ' · file list: ' + rows.length + ' row(s)' + (rows[0] ? ' ' + JSON.stringify(rows[0]).slice(0, 120) : '');
        const variants = files.flatMap((file: any) => [
          { file, series: '', storage: '' }, { file, series: '0', storage: '0' }, { file, series: '1', storage: '' },
        ]);
        for (const { file, series, storage } of variants) {
          const r2 = await this.authed({ ...base, type: 'vod', cmd: String(file.cmd), series, forced_storage: storage }).catch(() => null);
          const url2 = this.extract(r2?.js);
          if (url2) { this.lastRoute = 'portal link for file ' + file.cmd + ' (series=' + series + ')'; return url2; }
          last = r2?.js;
          note += ' · ' + file.cmd + '/' + series + ' → ' + String(r2?.js?.error ?? JSON.stringify(r2?.js)).slice(0, 40);
        }
        // "custom" protocol files: a box sends the file's own address as the request.
        for (const row of rows.slice(0, 2)) {
          const u = String(row?.url || '').trim();
          if (!/^https?:\/\//i.test(u)) continue;
          for (const c of [u, 'ffmpeg ' + u]) {
            const r3 = await this.authed({ ...base, type: 'vod', cmd: c, series: '', forced_storage: '' }).catch(() => null);
            const url3 = this.extract(r3?.js);
            if (url3 && url3 !== u) { this.lastRoute = 'portal link for the file address'; return url3; }
            note += ' · url-cmd → ' + JSON.stringify(r3?.js).slice(0, 70);
          }
        }
        // Still nothing: the file's own address (protocol "custom") is the stream itself.
        const direct = rows.map((x: any) => String(x?.url || '').replace(/^(ffmpeg|auto)\s+/i, '').trim()).find((u: string) => /^https?:\/\//i.test(u));
        if (direct) { this.lastRoute = 'file address (portal refused: ' + (last?.error || '?') + note + ')'; return direct; }
        break;
      }
    }
    const why: Record<string, string> = {
      nothing_to_play: 'The portal says this title has no video file right now.',
      link_fault: 'The portal could not make a link for this title right now.',
      not_found: 'The portal could not find this title.',
    };
    throw new Error((why[last?.error] || 'The portal did not give a playable link for this title.') +
      '\n\nDetails: cmd ' + String(cmd).slice(0, 60) + ' → ' + JSON.stringify(last).slice(0, 160) + note);
  }

  playerOptions(): string[] {
    return ['--http-user-agent=' + MAG_UA, '--network-caching=1500', '--http-reconnect'];
  }
}

// One shared client for the app, rebuilt when settings change.
let current: { key: string; portal: Portal } | null = null;
export function portalFor(s: Settings): Portal {
  const key = JSON.stringify(s);
  if (!current || current.key !== key) current = { key, portal: new Portal(s) };
  return current.portal;
}
