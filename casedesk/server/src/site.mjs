// Company website (tharamaya.com): plain pages from casedesk/site, served when the request's Host is a
// site domain. Each app lives under its own path, so new apps add a folder-like prefix:
//   /                              -> home.html
//   /immigration-wallet/           -> get.html (install / invite page)
//   /immigration-wallet/privacy    -> privacy.html
//   /immigration-wallet/support    -> support.html, plus the community rules and moderation contact
// www.<domain> redirects to the bare domain. Other hosts (the API domain) are untouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, moderationEmail } from './forum.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIRS = [process.env.SITE_DIR, path.join(here, '../site'), path.join(here, '../../site')].filter(Boolean);
const siteDir = () => DIRS.find((d) => fs.existsSync(path.join(d, 'home.html')));

export const SITE_HOSTS = (process.env.SITE_HOSTS || 'tharamaya.com,www.tharamaya.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const APP = '/immigration-wallet';
const PAGES = { '': 'get.html', privacy: 'privacy.html', support: 'support.html', get: 'get.html' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function hostOf(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}
export const isSiteHost = (host) => SITE_HOSTS.includes(host);

/** Which file a path maps to, or null. Exported for tests. */
export function resolve(pathname) {
  if (pathname === '/' || pathname === '/index.html') return 'home.html';
  let p = pathname;
  if (p.startsWith(APP + '/')) p = p.slice(APP.length + 1);
  else if (p.startsWith('/')) p = p.slice(1);
  else return null;
  if (p.includes('/') || p.includes('..')) return null;
  const bare = p.replace(/\.html$/, '');
  if (pathname.startsWith(APP + '/') && bare in PAGES) return PAGES[bare];
  if (/^[a-z0-9-]+\.(css|js|png|jpg|webp|svg|txt)$/.test(p)) return p;
  return null;
}

function communitySection(email) {
  const contact = email ? `Email <a href="mailto:${esc(email)}">${esc(email)}</a>.` : 'In the app: Community → ••• → Contact moderators.';
  return `<h2>Community</h2>
  <div class="card">
    <div class="row"><b>Rules</b><span>${RULES.map((r, i) => `${i + 1}. ${esc(r)}`).join('<br>')}</span></div>
    <div class="row"><b>Reporting and blocking</b><span>Every question and answer has a ••• menu with Report and Block. Blocking hides that person’s posts right away. Reported content is hidden until a moderator reviews it; content that breaks the rules is removed and the account is banned. We act on reports within 24 hours. ${contact}</span></div>
    <div class="row"><b>Your account</b><span>Community uses Sign in with Apple and shows only a made-up display name — never your email. Delete it any time in Community → Account → Delete account; your posts are deleted with it.</span></div>
  </div>

  <h2>Privacy</h2>`;
}

/** Handles the request if it is for the website. Returns true when it answered. */
export function handleSite(req, res) {
  const host = hostOf(req);
  if (!isSiteHost(host)) return false;
  const url = new URL(req.url, 'http://x');
  if (host.startsWith('www.')) {
    res.writeHead(301, { Location: `https://${host.slice(4)}${url.pathname}${url.search}` });
    res.end();
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return true; }
  if (url.pathname === APP) { res.writeHead(301, { Location: APP + '/' }); res.end(); return true; }
  const file = resolve(url.pathname);
  const dir = siteDir();
  const full = file && dir ? path.join(dir, file) : null;
  if (!full || !fs.existsSync(full)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><meta name="viewport" content="width=device-width"><title>Not found</title><p style="font:17px -apple-system,sans-serif;padding:24px">Page not found. <a href="/">Tharamaya home</a></p>');
    return true;
  }
  let body = fs.readFileSync(full);
  if (file.endsWith('.html')) {
    let html = body.toString('utf8');
    const email = moderationEmail();
    if (file === 'support.html') html = html.replace('<h2>Privacy</h2>', communitySection(email));
    if (email) html = html.replaceAll('hello@tharamaya.com', email);
    body = Buffer.from(html);
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
