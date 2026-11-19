// Plain support page (use its URL as the App Store "Support URL"): how to reach us, the community
// rules and how moderation works. The email comes from MODERATION_EMAIL in .env.
import { RULES } from './forum.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function supportPage(email = process.env.MODERATION_EMAIL || '') {
  const contact = email
    ? `<p>Email <a href="mailto:${esc(email)}">${esc(email)}</a> — we answer within 2 business days and act on reports of objectionable content within 24 hours.</p>`
    : '<p>In the app: Community → ••• → Contact moderators. We act on reports of objectionable content within 24 hours.</p>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Immigration Wallet — Support</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#111}h1{font-size:28px}h2{font-size:20px;margin-top:28px}@media(prefers-color-scheme:dark){body{background:#000;color:#eee}a{color:#0A84FF}}</style></head><body>
<h1>Immigration Wallet support</h1>
<h2>Contact</h2>${contact}
<h2>Community rules</h2><ol>${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
<h2>Reporting and blocking</h2><p>Every question and answer has a ••• menu with <b>Report</b> and <b>Block</b>. Blocking hides that person’s posts from you right away. Content reported by several people is hidden until a moderator reviews it; content that breaks the rules is removed and the account is banned.</p>
<h2>Your account</h2><p>Community uses Sign in with Apple and shows only a made-up display name — never your email. Delete your account any time in Community → Account → Delete account; your questions and answers are deleted with it.</p>
<h2>Not legal advice</h2><p>Community answers are from other users, not lawyers — not legal advice. Immigration Wallet is not affiliated with USCIS or any government agency.</p>
</body></html>`;
}
