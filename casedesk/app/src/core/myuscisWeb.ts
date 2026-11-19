// In-app WebView helpers (pure strings and URL checks — tested in tests/myuscis-web.test.ts).
//
// 1) "Sync with myUSCIS (sign in here)": my.uscis.gov opens in an in-app WebView (incognito: nothing
//    persists after it closes). The person signs in on USCIS's own page. NO script is injected while
//    the URL is a sign-in page; only once the URL is my.uscis.gov/account/* (signed in) does the app,
//    on the person's tap, run ONE fetch of the four JSON links inside that page's own session and post
//    the answers back. One sync per tap, no background use, no stored cookies or credentials.
// 2) "Check public status in the app": egov.uscis.gov/casestatus in a WebView; the receipt is filled
//    in, the PERSON taps Check Status, and the visible result text is posted back to the existing
//    egov text parser (src/core/uscis.ts parseCaseText). One check per tap; no hidden automation.
import { myuscisUrls } from './myuscis';

export const MYUSCIS_SIGNIN_URL = 'https://my.uscis.gov/account';
export const EGOV_STATUS_URL = 'https://egov.uscis.gov/casestatus/landing.do';
export const EGOV_START_URL = 'https://egov.uscis.gov/';

const host = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const path = (u: string) => { try { return new URL(u).pathname.toLowerCase(); } catch { return ''; } };

/** True only on my.uscis.gov/account… pages that are not sign-in / MFA / auth pages. */
export function isSignedInUrl(u: string): boolean {
  if (host(u) !== 'my.uscis.gov') return false;
  const p = path(u);
  if (!/^\/account(\/|$)/.test(p)) return false;
  return !/sign[-_]?in|signin|log[-_]?in|login|auth|mfa|verify|two[-_]?factor|otp|password|register|sign[-_]?up/.test(p + (u.split('?')[1] ?? '').toLowerCase());
}
/** Pages that take a password or code: the app never injects anything there. */
export const isAuthPage = (u: string) => /myaccount\.uscis\.gov|login\.gov|okta|\/sign[-_]?in|\/login|\/mfa|\/auth/i.test(u);
/** Navigation allowed inside the myUSCIS WebView (USCIS sign-in hosts only). Anything else opens outside. */
export const allowedMyuscisHost = (u: string) => /^(about:blank|https:\/\/([a-z0-9-]+\.)*(uscis\.gov|login\.gov)(\/|$|\?))/i.test(u);
export const allowedEgovHost = (u: string) => /^(about:blank|https:\/\/([a-z0-9-]+\.)*(uscis\.gov|cloudflare\.com|challenges\.cloudflare\.com)(\/|$|\?))/i.test(u);

const js = (x: unknown) => JSON.stringify(x);

/** The one-tap fetch of the four JSON links, run only on a signed-in my.uscis.gov/account page. */
export function myuscisFetchScript(receipt: string, nonce: string): string {
  const links = myuscisUrls(receipt).map((l) => ({ id: l.id, path: l.path }));
  return `(function(){try{
  if (location.hostname !== 'my.uscis.gov') return;
  var links = ${js(links)}, nonce = ${js(nonce)}, out = [];
  var post = function(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var one = function(l){ return fetch(l.path, { credentials: 'include', headers: { 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' } })
    .then(function(r){ return r.text().then(function(t){ out.push({ id: l.id, status: r.status, text: String(t).slice(0, 400000) }); }); })
    .catch(function(e){ out.push({ id: l.id, status: 0, text: '', error: String(e && e.message || e) }); }); };
  links.reduce(function(p, l){ return p.then(function(){ return one(l); }); }, Promise.resolve())
    .then(function(){ post({ type: 'myuscis', nonce: nonce, results: out }); });
}catch(e){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'myuscis', nonce: ${js(nonce)}, error: String(e) })); } })(); true;`;
}

/**
 * egov: fill the receipt box (React-controlled input → native value setter + input event) and, after
 * the PERSON taps a button, post the page's visible text once it shows a result. Read-only otherwise.
 */
export function egovScript(receipt: string, nonce: string): string {
  return `(function(){try{
  if (!/(^|\\.)uscis\\.gov$/.test(location.hostname)) return;
  var receipt = ${js(receipt)}, nonce = ${js(nonce)}, tapped = false, sent = '';
  var post = function(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var fill = function(){
    var el = document.querySelector('#receipt_number, input[name="appReceiptNum"], input[name="receipt_number"], input[id*="receipt" i], input[name*="receipt" i]');
    if (!el || el.value === receipt) return !!el;
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, receipt); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    post({ type: 'egov-filled', nonce: nonce }); return true;
  };
  var read = function(){
    if (!tapped) return;
    var t = (document.body && document.body.innerText || '').slice(0, 20000);
    if (t && t !== sent && /(on|as of) [A-Z][a-z]+ \\d{1,2}, \\d{4}|Case (Was|Is) |Request for/i.test(t)) { sent = t; post({ type: 'egov-text', nonce: nonce, text: t }); }
  };
  document.addEventListener('click', function(e){ var b = e.target && e.target.closest && e.target.closest('button, input[type=submit], a'); if (b) { tapped = true; setTimeout(read, 1500); } }, true);
  document.addEventListener('submit', function(){ tapped = true; setTimeout(read, 1500); }, true);
  var tries = 0, iv = setInterval(function(){ if (fill() || ++tries > 20) clearInterval(iv); }, 500);
  new MutationObserver(function(){ clearTimeout(window.__iwT); window.__iwT = setTimeout(read, 600); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}catch(e){} })(); true;`;
}

export type WebMessage =
  | { type: 'myuscis'; nonce: string; results?: { id: string; status: number; text: string; error?: string }[]; error?: string }
  | { type: 'egov-filled'; nonce: string }
  | { type: 'egov-text'; nonce: string; text: string };

/** Parse a postMessage from the WebView; anything without our nonce (another page's script) is ignored. */
export function readWebMessage(data: string, nonce: string): WebMessage | null {
  try {
    const m = JSON.parse(data);
    if (!m || typeof m !== 'object' || m.nonce !== nonce) return null;
    if (m.type === 'myuscis' || m.type === 'egov-filled' || (m.type === 'egov-text' && typeof m.text === 'string')) return m as WebMessage;
    return null;
  } catch { return null; }
}
export const newNonce = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
