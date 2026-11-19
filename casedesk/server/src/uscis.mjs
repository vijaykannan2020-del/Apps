// USCIS Torch Case Status API — OAuth2 client credentials + per-receipt cache.
const RECEIPT_RE = /^(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|NSC|TSC|VSC|CSC)\d{10}$/;
let token = null; // { value, expires }
const cache = new Map(); // receipt -> { at, data }

async function getToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const { USCIS_CLIENT_ID: id, USCIS_CLIENT_SECRET: secret, USCIS_TOKEN_URL: url } = process.env;
  if (!id || !secret) throw httpError(503, 'Case status is not configured yet (USCIS API keys missing).');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!r.ok) throw httpError(502, `USCIS sign-in failed (${r.status}).`);
  const j = await r.json();
  token = { value: j.access_token, expires: Date.now() + (Number(j.expires_in) || 1700) * 1000 };
  return token.value;
}

/** 'production' | 'sandbox' | null — the app shows Live check only for 'production'. Sandbox base URLs contain api-int. */
export function uscisMode(env = process.env) {
  if (!env.USCIS_CLIENT_ID || !env.USCIS_CLIENT_SECRET || !env.USCIS_API_BASE) return null;
  return /api-int/i.test(env.USCIS_API_BASE) ? 'sandbox' : 'production';
}
/** Error logs keep the route, never the receipt: /api/case/IOE… → /api/case/[receipt]. */
export const redactPath = (p) => String(p).replace(/\/api\/case\/[^/]+/i, '/api/case/[receipt]').replace(/\b[A-Z]{3}\d{10}\b/gi, '[receipt]');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const isoDate = (s) => {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d) ? String(s).slice(0, 10) : d.toISOString().slice(0, 10);
};

export function normalize(receipt, j) {
  const c = j.case_status ?? j;
  const hist = Array.isArray(c.hist_case_status) ? c.hist_case_status : [];
  const history = hist
    .map((h) => ({ date: isoDate(h.date ?? h.completed_date), status: h.completed_text_en ?? h.status ?? '' }))
    .filter((h) => h.status)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const status = c.current_case_status_text_en ?? c.status ?? 'Status unavailable';
  const updated = isoDate(c.modifiedDate ?? c.modified_date) ?? history[0]?.date;
  if (!history.length || history[0].status !== status) history.unshift({ date: updated, status });
  return {
    receipt,
    form: c.formType ?? c.form_type,
    status,
    detail: c.current_case_status_desc_en ?? '',
    submitted: isoDate(c.submittedDate),
    updated,
    history,
  };
}

export async function caseStatus(receiptRaw) {
  const receipt = String(receiptRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!RECEIPT_RE.test(receipt)) throw httpError(400, 'That is not a valid USCIS receipt number.');
  const ttl = (Number(process.env.CASE_CACHE_MINUTES) || 180) * 60_000;
  const hit = cache.get(receipt);
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const call = async () => fetch(`${process.env.USCIS_API_BASE}/${receipt}`, { headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' } });
  let r = await call();
  if (r.status === 401) { token = null; r = await call(); }
  if (r.status === 404) throw httpError(404, 'USCIS has no case with that receipt number.');
  if (r.status === 429) throw httpError(429, 'USCIS rate limit reached — try again later.');
  if (!r.ok) throw httpError(502, `USCIS returned an error (${r.status}).`);
  const data = normalize(receipt, await r.json());
  cache.set(receipt, { at: Date.now(), data });
  return data;
}
