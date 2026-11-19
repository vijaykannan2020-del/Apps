// Public web pages (casedesk/site): the invite page /get, privacy policy and their CSS / links.
// Only the files listed here are served (no paths from the request touch the disk).
// In Docker the folder is mounted at /app/site (docker-compose.yml; auto-update.sh copies casedesk/site).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = {
  '/get': ['get.html', 'text/html; charset=utf-8'],
  '/get.html': ['get.html', 'text/html; charset=utf-8'],
  '/privacy.html': ['privacy.html', 'text/html; charset=utf-8'],
  '/privacy': ['privacy.html', 'text/html; charset=utf-8'],
  '/support.html': ['support.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/links.js': ['links.js', 'text/javascript; charset=utf-8'],
};

export function siteDir(env = process.env) {
  const c = [env.SITE_DIR, path.join(here, '../site'), path.join(here, '../../site')].filter(Boolean);
  return c.find((d) => { try { return fs.statSync(path.join(d, 'get.html')).isFile(); } catch { return false; } }) ?? null;
}

/** { status, headers, body } for a site path, or null when it isn't one of ours. */
export function sitePage(pathname, dir = siteDir()) {
  const hit = Object.hasOwn(FILES, pathname) ? FILES[pathname] : null;
  if (!hit) return null;
  if (!dir) return { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Not found' };
  let body;
  try { body = fs.readFileSync(path.join(dir, hit[0])); } catch { return { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Not found' }; }
  return {
    status: 200,
    body,
    headers: {
      'Content-Type': hit[1],
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    },
  };
}
