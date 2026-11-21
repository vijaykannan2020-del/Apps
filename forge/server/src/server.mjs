// Forge API — runs Claude Code and Codex on your GitHub repos, driven from the Forge phone app.
// Lives next to My Inbox on the Oracle server; reached as https://<inbox domain>/forge/api/*
// Sign-in = your My Inbox (Synapse) admin login. Keys/tokens are typed in the app and kept in data/secrets.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const SERVER_VERSION = 17; // raise on every server change; shown in the app's Settings
const PORT = +(process.env.PORT || 8790);
const SYNAPSE = process.env.SYNAPSE_URL || 'http://synapse:8008';
const DATA = process.env.DATA_DIR || '/app/data';
const PREFIX = '/forge/api';
const SESS_DIR = path.join(DATA, 'sessions');
const WORK_DIR = path.join(DATA, 'work');
const HOME = path.join(DATA, 'home');
const CODEX_HOME = path.join(DATA, 'codex');
const SECRETS = path.join(DATA, 'secrets.json');
for (const d of [SESS_DIR, WORK_DIR, HOME, CODEX_HOME]) fs.mkdirSync(d, { recursive: true });

const MAX_OUT = 6000;          // characters of command output kept per tool event
const MAX_EVENTS = 4000;       // events kept per session

// ---------- small helpers ----------
const now = () => new Date().toISOString();
const rid = () => crypto.randomBytes(6).toString('hex');
const clip = (s, n = MAX_OUT) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more characters)` : s; };
function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
function writeJSON(f, v, mode) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v), mode ? { mode } : undefined); fs.renameSync(t, f); }
const secrets = () => readJSON(SECRETS, {});
function setSecrets(patch) { const s = { ...secrets(), ...patch }; for (const k of Object.keys(s)) if (s[k] === '' || s[k] == null) delete s[k]; writeJSON(SECRETS, s, 0o600); return s; }

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: opts.env || baseEnv(), stdio: [opts.input != null ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    if (opts.input != null) { p.stdin.end(opts.input); }
    const timer = opts.timeout ? setTimeout(() => p.kill('SIGKILL'), opts.timeout) : null;
    p.on('close', code => { if (timer) clearTimeout(timer); resolve({ code, out, err }); });
    p.on('error', e => { if (timer) clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
  });
}
function baseEnv(extra = {}) {
  const pass = {}; for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE']) if (process.env[k]) pass[k] = process.env[k];
  return { PATH: process.env.PATH, HOME, CODEX_HOME, LANG: 'C.UTF-8', TERM: 'dumb', NO_COLOR: '1', CI: '1', GIT_TERMINAL_PROMPT: '0', ...pass, ...extra };
}
// git with the GitHub token passed as a header for this one command (never written to disk)
function gitArgs(args) {
  const tok = secrets().githubToken;
  if (!tok) return args;
  const basic = Buffer.from(`x-access-token:${tok}`).toString('base64');
  return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`, ...args];
}
const git = (cwd, args, timeout = 300000) => run('git', gitArgs(args), { cwd, timeout });

async function gh(pathname, opts = {}) {
  const tok = secrets().githubToken;
  if (!tok) throw httpErr(400, 'Add your GitHub token in Settings first.');
  const r = await fetch('https://api.github.com' + pathname, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'forge', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpErr(r.status === 401 ? 400 : r.status, 'GitHub: ' + (j.message || r.statusText) + (j.errors ? ' — ' + j.errors.map(e => e.message || e.code).join(', ') : ''));
  return j;
}
// app folders inside a repo (for repos that hold several apps): top-level folders plus nested app
// folders with their own app.json / package.json; names come from app.json, manifest.json or package.json
const folderCache = new Map();
async function repoFolders(repo, branch) {
  const info = branch ? null : await gh(`/repos/${repo}`);
  branch = branch || info.default_branch;
  const t = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const key = repo + '@' + t.sha; if (folderCache.has(key)) return folderCache.get(key);
  const files = new Set(), dirs = new Set();
  for (const e of t.tree || []) { if (/(^|\/)(node_modules|\.git|dist|build|Pods)(\/|$)/.test(e.path)) continue; (e.type === 'tree' ? dirs : files).add(e.path); }
  const has = (d, f) => files.has(d + '/' + f);
  const pick = [];
  for (const d of dirs) {
    const depth = d.split('/').length; if (d.split('/').some(x => x.startsWith('.'))) continue;
    if (depth === 1) pick.push(d);
    else if (depth <= 3 && (has(d, 'app.json') || has(d, 'package.json') || has(d, 'manifest.json'))) pick.push(d);
  }
  const raw = async (f) => { try { const j = await gh(`/repos/${repo}/contents/${f.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`); return Buffer.from(j.content || '', 'base64').toString('utf8'); } catch { return ''; } };
  const nameOf = async (d) => {
    for (const f of ['app.json', 'manifest.json', 'package.json']) {
      if (!has(d, f)) continue;
      try { const j = JSON.parse(await raw(d + '/' + f)); const n = j.expo?.name || j.name || j.displayName; if (n && typeof n === 'string') return n; } catch {}
    }
    return '';
  };
  const sorted = pick.sort().slice(0, 60);
  const names = await Promise.all(sorted.map(d => (d.includes('/') || has(d, 'manifest.json') || has(d, 'app.json')) ? nameOf(d) : Promise.resolve('')));
  const out = sorted.map((d, i) => ({ path: d, name: names[i] || '' }));
  folderCache.set(key, out); return out;
}
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

// ---------- auth: My Inbox (Synapse) admin ----------
const tokCache = new Map(); // token -> { user, until }
async function authUser(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  const c = tokCache.get(tok);
  if (c && c.until > Date.now()) return c.user;
  try {
    const w = await fetch(`${SYNAPSE}/_matrix/client/v3/account/whoami`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!w.ok) return null;
    const { user_id } = await w.json();
    const a = await fetch(`${SYNAPSE}/_synapse/admin/v2/users/${encodeURIComponent(user_id)}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!a.ok) return null; // only the server owner (Synapse admin) may use Forge
    tokCache.set(tok, { user: user_id, until: Date.now() + 10 * 60 * 1000 });
    return user_id;
  } catch { return null; }
}

// ---------- sessions ----------
const sessions = new Map();   // id -> session object (events included)
const runs = new Map();       // id -> { proc, agent }
const waiters = new Map();    // id -> Set(fn)
for (const f of fs.readdirSync(SESS_DIR).filter(f => f.endsWith('.json'))) {
  const s = readJSON(path.join(SESS_DIR, f), null);
  if (!s) continue;
  if (s.status === 'running') { s.status = 'idle'; s.events.push({ i: s.events.length, t: now(), kind: 'error', text: 'The server restarted while this was running. Send the message again to continue.' }); }
  sessions.set(s.id, s);
}
const saveTimers = new Map();
function save(s, soon) {
  const write = () => { saveTimers.delete(s.id); writeJSON(path.join(SESS_DIR, s.id + '.json'), s); };
  if (!soon) { clearTimeout(saveTimers.get(s.id)); return write(); }
  if (!saveTimers.has(s.id)) saveTimers.set(s.id, setTimeout(write, 800));
}
function push(s, ev) {
  if (!ev.id) ev.id = rid();
  ev.i = s.events.length ? s.events[s.events.length - 1].i + 1 : 0;
  ev.v = s.seq = (s.seq || 0) + 1;  // change counter: the app asks for everything with v > last seen
  ev.t = now();
  s.events.push(ev);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  s.updated = ev.t;
  save(s, true);
  wake(s.id);
  return ev;
}
function wake(id) { const w = waiters.get(id); if (w) { waiters.delete(id); for (const fn of w) fn(); } }
const summary = s => ({ id: s.id, title: s.title, repo: s.repo, base: s.base, branch: s.branch, agent: s.agent, status: s.status, created: s.created, updated: s.updated, prUrl: s.prUrl || null, folder: s.folder || '', last: lastText(s) });
function lastText(s) { for (let i = s.events.length - 1; i >= 0; i--) { const e = s.events[i]; if (e.kind === 'text' || e.kind === 'user') return (e.kind === 'user' ? 'You: ' : '') + e.text.slice(0, 140); } return ''; }

const slug = t => String(t || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'task';

const cleanFolder = (f) => {
  f = String(f || '').trim().replace(/^\/+|\/+$/g, '');
  if (!f) return '';
  if (!/^[\w.\- ]+(\/[\w.\- ]+)*$/.test(f) || f.split('/').some(x => x === '..' || x === '.')) throw httpErr(400, 'Bad folder name.');
  return f;
};
// the folder an agent works in: the project folder inside the repo, or the repo itself
const workDir = (s) => s.folder ? path.join(WORK_DIR, s.id, s.folder) : path.join(WORK_DIR, s.id);

async function createSession({ repo, base, agent, title, prompt, folder }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw httpErr(400, 'Pick a repository.');
  folder = cleanFolder(folder);
  const info = await gh(`/repos/${repo}`);
  base = base || info.default_branch;
  agent = agent === 'codex' ? 'codex' : 'claude';
  const id = rid();
  const dir = path.join(WORK_DIR, id);
  const branch = `forge/${slug(title || prompt)}-${id.slice(0, 4)}`;
  const cl = await git(WORK_DIR, ['clone', '--depth', '50', '--branch', base, `https://github.com/${repo}.git`, dir]);
  if (cl.code !== 0) throw httpErr(400, 'Could not clone: ' + clip(cl.err.replace(/basic [A-Za-z0-9+/=]+/g, 'basic ***'), 600));
  const me = await gh('/user').catch(() => ({}));
  const name = me.name || me.login || 'Forge';
  const email = me.id ? `${me.id}+${me.login}@users.noreply.github.com` : 'forge@localhost';
  await run('git', ['config', 'user.name', name], { cwd: dir });
  await run('git', ['config', 'user.email', email], { cwd: dir });
  await run('git', ['checkout', '-b', branch], { cwd: dir });
  const baseSha = (await run('git', ['rev-parse', 'HEAD'], { cwd: dir })).out.trim();
  if (folder && !fs.existsSync(path.join(dir, folder))) { fs.rmSync(dir, { recursive: true, force: true }); throw httpErr(400, `The folder ${folder} is not in ${repo} (${base}).`); }
  try { fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), '\n.forge-uploads/\n'); } catch {}
  const s = { id, title: (title || prompt || 'New task').slice(0, 80), repo, base, branch, baseSha, agent, folder, status: 'idle', created: now(), updated: now(), claudeSession: null, codexThread: null, prUrl: null, pushed: false, events: [] };
  sessions.set(id, s);
  push(s, { kind: 'status', text: `Cloned ${repo} (${base}) → working on branch ${branch}${folder ? ` · project folder ${folder}` : ''}` });
  save(s);
  return s;
}

const GUIDE = 'You are working in a cloned GitHub repository on a server, driven from a phone app called Forge. ' +
  'Make the changes directly in the files. Do not run `git push` and do not open pull requests — the app commits, pushes and opens the PR when the user taps the button. ' +
  'You may commit locally if useful. Finish each turn with a short plain-language summary of what you changed and anything the user must do.';

function agentEnv(agent) {
  const sec = secrets();
  if (agent === 'claude') {
    const extra = { IS_SANDBOX: '1', DISABLE_AUTOUPDATER: '1' };
    if (sec.anthropicKey) extra.ANTHROPIC_API_KEY = sec.anthropicKey;
    else if (sec.claudeOauthToken) extra.CLAUDE_CODE_OAUTH_TOKEN = sec.claudeOauthToken;
    else throw httpErr(400, 'Add your Claude key in Settings first.');
    return baseEnv(extra);
  }
  if (!codexReady()) throw httpErr(400, 'Connect Codex in Settings first (ChatGPT sign-in or OpenAI key).');
  return baseEnv();
}
// Shared memory between agents: when you switch agent, the new one gets a handoff of everything
// said and done in this chat since it last spoke (your messages, the other agent's replies, files touched).
function handoff(s, agent) {
  let start = 0;
  for (let i = s.events.length - 1; i >= 0; i--) if (s.events[i].kind === 'user' && (s.events[i].agent || s.agent) === agent) { start = i + 1; break; }
  const slice = s.events.slice(start);
  if (!slice.some(e => e.kind === 'user' && (e.agent || s.agent) !== agent)) return ''; // nothing new from the other agent
  const lines = [];
  for (const e of slice) {
    const who = e.agent === 'codex' ? 'Codex' : 'Claude Code';
    if (e.kind === 'user') lines.push(`USER (to ${who}): ${e.text}`);
    else if (e.kind === 'text') lines.push(`${who.toUpperCase()}: ${e.text}`);
    else if (e.kind === 'tool' && e.label) lines.push(`  [${who} ${e.status === 'failed' ? 'tried' : 'did'}: ${e.label}]`);
    else if (e.kind === 'status' && /Pushed|pull request|Merged/.test(e.text)) lines.push(`  [${e.text}]`);
  }
  if (!lines.some(l => !l.startsWith('  ['))) return '';
  let t = lines.join('\n');
  if (t.length > 16000) t = '…(earlier part cut)…\n' + t.slice(-16000);
  return `HANDOFF — this chat was also worked on by another AI agent. Here is what happened since you last spoke, so you have the full context. The files in the repo already contain their changes.\n<<<\n${t}\n>>>\n\nNow the user's new message:\n`;
}

const codexReady = () => fs.existsSync(path.join(CODEX_HOME, 'auth.json'));

// photos from the phone: saved inside the clone (git-ignored) so both agents can open them
function saveImages(s, images) {
  const list = Array.isArray(images) ? images.slice(0, 8) : [];
  if (!list.length) return [];
  const dir = path.join(WORK_DIR, s.id, '.forge-uploads'); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  list.forEach((im, i) => {
    const m = /^data:image\/(png|jpe?g|gif|webp|heic);base64,(.+)$/i.exec(String(im?.data || ''));
    if (!m) return;
    const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
    const f = path.join(dir, `${Date.now()}-${i + 1}.${ext}`);
    fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
    try { fs.chownSync(f, 1000, 1000); fs.chownSync(dir, 1000, 1000); } catch {}
    out.push(f);
  });
  return out;
}

function startRun(s, text, agent, model, mode, effort, images) {
  mode = mode === 'ask' ? 'ask' : 'agent';
  if (runs.has(s.id)) throw httpErr(409, 'Still working on the last message. Stop it first or wait.');
  if (!fs.existsSync(path.join(WORK_DIR, s.id))) throw httpErr(410, 'This session’s files are gone. Start a new session.');
  agent = agent === 'codex' ? 'codex' : agent === 'claude' ? 'claude' : s.agent;
  const env = agentEnv(agent);
  const cwd = workDir(s);
  const shots = saveImages(s, images);
  const sec = secrets();
  const where = s.folder ? ` PROJECT FOLDER: work only inside ${s.folder}/ (your current folder) unless the user asks about other parts of the repository.` : '';
  const said = text; // what the user typed (shown in the chat)
  if (shots.length) text += `\n\n[The user attached ${shots.length} photo${shots.length > 1 ? 's' : ''} (screenshots from their phone). Open and look at ${shots.length > 1 ? 'each one' : 'it'} before answering:\n${shots.join('\n')}]`;
  model = model || (agent === 'claude' ? sec.claudeModel : sec.codexModel) || '';
  let cmd, args;
  if (agent === 'claude') {
    cmd = 'claude';
    args = ['-p', text, '--output-format', 'stream-json', '--verbose', '--append-system-prompt', (mode === 'ask' ? GUIDE + ' ASK MODE: answer questions and explain; do not change any files.' : GUIDE) + where];
    args.push(...(mode === 'ask' ? ['--permission-mode', 'plan'] : ['--dangerously-skip-permissions']));
    if (model) args.push('--model', model);
    if (['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) args.push('--effort', effort); else effort = '';
    if (s.claudeSession) args.push('--resume', s.claudeSession);
  } else {
    cmd = 'codex';
    // Codex's own read-only sandbox can't start inside this Docker container (every command came back
    // failed in Ask mode), so it runs like Agent mode and Ask is enforced by the instruction below
    const common = ['--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'];
    if (model) common.push('-m', model);
    if (/^[a-z]{2,12}$/.test(effort || '')) common.push('-c', `model_reasoning_effort="${effort}"`); else effort = '';
    const prompt = (s.codexThread ? '' : GUIDE + where + '\n\n') + (mode === 'ask' ? '(ASK MODE: read files and run read-only commands to answer, but do not create, edit or delete any files and do not commit.)\n' : '') + text;
    const imgs = s.codexThread ? [] : shots.flatMap(f => ['-i', f]);
    args = s.codexThread ? ['exec', 'resume', ...common, s.codexThread, prompt] : ['exec', ...common, ...imgs, '-C', cwd, prompt];
  }
  const ctx = handoff(s, agent);
  if (agent === 'claude') args[1] = ctx + args[1]; else args[args.length - 1] = args[args.length - 1].replace(text, ctx + text);
  s.agent = agent; s.status = 'running';
  push(s, { kind: 'user', text: said, agent, model: model || '', mode, effort: effort || '', photos: shots.length || undefined });
  if (ctx) push(s, { kind: 'status', text: `Shared this chat’s history with ${agent === 'codex' ? 'Codex' : 'Claude Code'}` });
  const proc = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const r = { proc, agent, tools: new Map(), stopped: false };
  runs.set(s.id, r);
  let buf = '', errBuf = '';
  proc.stdout.on('data', d => {
    buf += d;
    let n;
    while ((n = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      try { agent === 'claude' ? onClaude(s, r, ev) : onCodex(s, r, ev); } catch (e) { console.error('event', e); }
    }
  });
  proc.stderr.on('data', d => { errBuf = (errBuf + d).slice(-4000); });
  proc.on('error', e => push(s, { kind: 'error', text: `Could not start ${agent}: ${e.message}` }));
  proc.on('close', code => {
    runs.delete(s.id);
    if (agent === 'claude' && /No conversation found/i.test(errBuf)) { s.claudeSession = null; push(s, { kind: 'error', text: 'Claude Code lost the earlier chat on the server. Send your message again — it will start fresh with the same code.' }); r.finished = true; }
    if (r.stopped) push(s, { kind: 'status', text: 'Stopped.' });
    else if (code !== 0 && !r.finished) push(s, { kind: 'error', text: `${agent === 'claude' ? 'Claude Code' : 'Codex'} stopped (code ${code}). ${clip(errBuf.split('\n').filter(l => !/^\s*$/.test(l)).slice(-6).join('\n'), 1200)}` });
    s.status = 'idle';
    const ship = s.autoship && mode === 'agent' && !r.stopped && (code === 0 || r.finished);
    push(s, { kind: 'done' });
    save(s);
    if (ship) autoShip(s).catch(e => push(s, { kind: 'error', text: 'Auto-send failed: ' + e.message }));
  });
}

// Auto-send: commit, put the work on top of the latest main and push it straight to main (like a merged PR)
async function autoShip(s) {
  if (runs.has(s.id)) return;
  const cwd = path.join(WORK_DIR, s.id);
  if ((await run('git', ['status', '--porcelain'], { cwd })).out.trim()) {
    await run('git', ['add', '-A'], { cwd });
    const c = await run('git', ['commit', '-m', (lastUserText(s) || 'Changes from Forge').slice(0, 200)], { cwd });
    if (c.code !== 0) throw new Error(clip(c.err || c.out, 300));
  }
  const f = await git(cwd, ['fetch', '--depth', '50', 'origin', s.base]);
  if (f.code !== 0) throw new Error('could not reach GitHub: ' + clip(f.err.replace(/basic [A-Za-z0-9+/=]+/g, 'basic ***'), 300));
  const ahead = +(await run('git', ['rev-list', '--count', 'FETCH_HEAD..HEAD'], { cwd })).out.trim() || 0;
  if (!ahead) return; // nothing new to send
  push(s, { kind: 'status', text: `Sending to ${s.base}…` });
  const rb = await run('git', ['rebase', 'FETCH_HEAD'], { cwd });
  if (rb.code !== 0) {
    await run('git', ['rebase', '--abort'], { cwd });
    throw new Error(`${s.base} on GitHub changed the same lines. Use Changes → Create pull request instead.`);
  }
  const p = await git(cwd, ['push', 'origin', `HEAD:refs/heads/${s.base}`]);
  if (p.code !== 0) throw new Error(clip(p.err.replace(/basic [A-Za-z0-9+/=]+/g, 'basic ***'), 400));
  const head = (await run('git', ['rev-parse', 'HEAD'], { cwd })).out.trim();
  await run('git', ['update-ref', `refs/remotes/origin/${s.base}`, head], { cwd });
  s.baseSha = head; s.pushed = true;
  push(s, { kind: 'status', text: `Sent to ${s.base} ✓ (${ahead} commit${ahead > 1 ? 's' : ''}). GitHub is updating it now.`, url: `https://github.com/${s.repo}/commits/${s.base}` });
  save(s);
}

function onClaude(s, r, ev) {
  if (/rate_limit/.test(ev.type || '')) { noteClaudeLimit(ev.rate_limit_info || ev.rateLimitInfo || ev); return; }
  if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) { s.claudeSession = ev.session_id; return; }
  if (ev.type === 'assistant' && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text?.trim()) push(s, { kind: 'text', text: c.text, agent: 'claude' });
      else if (c.type === 'tool_use') {
        const e = push(s, { kind: 'tool', agent: 'claude', name: c.name, label: claudeLabel(c.name, c.input || {}), detail: claudeDetail(c.name, c.input || {}), status: 'running' });
        r.tools.set(c.id, e);
      }
    }
    return;
  }
  if (ev.type === 'user' && Array.isArray(ev.message?.content)) {
    for (const c of ev.message.content) {
      if (c.type !== 'tool_result') continue;
      const e = r.tools.get(c.tool_use_id);
      if (!e) continue;
      const out = Array.isArray(c.content) ? c.content.map(x => x.text || '').join('\n') : String(c.content ?? '');
      e.status = c.is_error ? 'failed' : 'ok';
      if (out && !['Edit', 'Write', 'MultiEdit', 'TodoWrite'].includes(e.name)) e.output = clip(out);
      e.u = (e.u || 0) + 1; // client re-renders events whose u changed
      bump(s, e);
    }
    return;
  }
  if (ev.type === 'result') {
    r.finished = true;
    if (ev.session_id) s.claudeSession = ev.session_id;
    if (ev.is_error) push(s, { kind: 'error', text: ev.result || ev.subtype || 'Claude Code reported an error.' });
    push(s, { kind: 'stat', agent: 'claude', cost: ev.total_cost_usd || 0, text: [ev.num_turns ? `${ev.num_turns} steps` : '', ev.duration_ms ? `${Math.round(ev.duration_ms / 1000)} s` : '', ev.total_cost_usd ? `$${ev.total_cost_usd.toFixed(2)}` : ''].filter(Boolean).join(' · ') });
  }
}
function bump(s, e) { // an existing event changed (tool finished): keep its place, mark it as new for the app
  e.v = s.seq = (s.seq || 0) + 1;
  s.updated = now(); save(s, true); wake(s.id);
}
const rel = p => { p = String(p || ''); const w = WORK_DIR + '/'; if (p.startsWith(w)) p = p.slice(w.length).replace(/^[a-f0-9]+\/?/, ''); return p; };
function claudeLabel(name, i) {
  switch (name) {
    case 'Read': return `Read ${rel(i.file_path)}`;
    case 'Write': return `Created ${rel(i.file_path)}`;
    case 'Edit': case 'MultiEdit': return `Edited ${rel(i.file_path)}`;
    case 'Bash': return `Ran ${i.description || String(i.command || '').split('\n')[0].slice(0, 80)}`;
    case 'Glob': return `Searched files ${i.pattern || ''}`;
    case 'Grep': return `Searched for “${String(i.pattern || '').slice(0, 50)}”`;
    case 'WebFetch': return `Opened ${i.url || 'a web page'}`;
    case 'WebSearch': return `Searched the web: ${i.query || ''}`;
    case 'TodoWrite': return 'Updated the plan';
    case 'Task': case 'Agent': return `Helper: ${i.description || 'sub-task'}`;
    default: return name;
  }
}
function claudeDetail(name, i) {
  if (name === 'Bash') return String(i.command || '');
  if (name === 'Edit') return diffish(i.old_string, i.new_string);
  if (name === 'MultiEdit') return (i.edits || []).map(e => diffish(e.old_string, e.new_string)).join('\n…\n');
  if (name === 'Write') return clip(i.content, 3000);
  if (name === 'TodoWrite') return (i.todos || []).map(t => `${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○'} ${t.content}`).join('\n');
  return '';
}
const diffish = (a, b) => clip(String(a || '').split('\n').map(l => '- ' + l).join('\n') + '\n' + String(b || '').split('\n').map(l => '+ ' + l).join('\n'), 3000);

function onCodex(s, r, ev) {
  if (ev.type === 'thread.started' && ev.thread_id) { s.codexThread = ev.thread_id; return; }
  if (ev.type === 'error') { if (!/^Reconnecting/.test(ev.message || '')) push(s, { kind: 'error', text: ev.message }); return; }
  if (ev.type === 'turn.failed') { r.finished = true; push(s, { kind: 'error', text: ev.error?.message || 'Codex turn failed.' }); return; }
  if (ev.type === 'turn.completed') { r.finished = true; const u = ev.usage || {}; push(s, { kind: 'stat', agent: 'codex', tokens: (u.input_tokens || 0) + (u.output_tokens || 0), text: u.input_tokens ? `${Math.round((u.input_tokens + (u.output_tokens || 0)) / 1000)}k tokens` : '' }); return; }
  const it = ev.item; if (!it) return;
  const started = ev.type === 'item.started', done = ev.type === 'item.completed';
  if (it.type === 'agent_message' && done && it.text?.trim()) return void push(s, { kind: 'text', text: it.text, agent: 'codex' });
  if (it.type === 'reasoning') return;
  if (it.type === 'command_execution') {
    let e = r.tools.get(it.id);
    if (!e) { e = push(s, { kind: 'tool', agent: 'codex', name: 'command', label: 'Ran ' + String(it.command || '').replace(/^\/bin\/(ba)?sh -lc /, '').slice(0, 90), detail: String(it.command || ''), status: 'running' }); r.tools.set(it.id, e); }
    if (done || ev.type === 'item.updated') {
      if (it.aggregated_output) e.output = clip(it.aggregated_output);
      // a search that finds nothing exits 1: that is an answer, not a failure
      const search = /(^|[\s'"|;&(])(rg|grep|egrep|fgrep|git grep)\s/.test(String(it.command || ''));
      if (done) e.status = it.exit_code === 0 || it.status === 'completed' || (search && it.exit_code === 1) ? 'ok' : 'failed';
      e.u = (e.u || 0) + 1; bump(s, e);
    }
    return;
  }
  if (it.type === 'file_change' && (done || started)) {
    if (r.tools.has(it.id)) return;
    const ch = it.changes || [];
    const e = push(s, { kind: 'tool', agent: 'codex', name: 'file_change', label: ch.length === 1 ? `${ch[0].kind === 'add' ? 'Created' : ch[0].kind === 'delete' ? 'Deleted' : 'Edited'} ${rel(ch[0].path)}` : `Changed ${ch.length} files`, detail: ch.map(c => `${c.kind} ${rel(c.path)}`).join('\n'), status: 'ok' });
    r.tools.set(it.id, e);
    return;
  }
  if (it.type === 'todo_list' && it.items) {
    const detail = it.items.map(t => `${t.completed ? '✓' : '○'} ${t.text}`).join('\n');
    let e = r.tools.get(it.id);
    if (!e) { e = push(s, { kind: 'tool', agent: 'codex', name: 'plan', label: 'Updated the plan', detail, status: 'ok' }); r.tools.set(it.id, e); }
    else { e.detail = detail; e.u = (e.u || 0) + 1; bump(s, e); }
    return;
  }
  if (it.type === 'web_search' && started) return void push(s, { kind: 'tool', agent: 'codex', name: 'web', label: `Searched the web: ${it.query || ''}`, status: 'ok' });
  if (it.type === 'mcp_tool_call' && started) return void push(s, { kind: 'tool', agent: 'codex', name: 'tool', label: `${it.server || ''} ${it.tool || ''}`.trim(), status: 'ok' });
  if (it.type === 'error' && it.message) push(s, { kind: 'error', text: it.message });
}

// ---------- git views ----------
async function diffOf(s) {
  const cwd = path.join(WORK_DIR, s.id);
  await run('git', ['add', '-A', '-N'], { cwd });
  const ns = await run('git', ['diff', '--numstat', s.baseSha], { cwd });
  const st = await run('git', ['diff', '--name-status', s.baseSha], { cwd });
  const status = {}; for (const l of st.out.split('\n')) { const [k, ...p] = l.split('\t'); if (k) status[p[p.length - 1]] = k[0]; }
  const files = ns.out.split('\n').filter(Boolean).map(l => { const [a, d, ...p] = l.split('\t'); const f = p.join('\t'); return { path: f, add: a === '-' ? 0 : +a, del: d === '-' ? 0 : +d, binary: a === '-', status: status[f] || 'M' }; });
  const patch = await run('git', ['diff', '--no-color', '-U3', s.baseSha], { cwd });
  const ahead = +(await run('git', ['rev-list', '--count', `origin/${s.base}..HEAD`], { cwd })).out.trim() || 0;
  const dirty = !!(await run('git', ['status', '--porcelain'], { cwd })).out.trim();
  return { files, patch: clip(patch.out, 400000), ahead, dirty, pushed: s.pushed, prUrl: s.prUrl };
}
async function commitPush(s, message) {
  if (runs.has(s.id)) throw httpErr(409, 'Wait for the agent to finish first.');
  const cwd = path.join(WORK_DIR, s.id);
  const dirty = (await run('git', ['status', '--porcelain'], { cwd })).out.trim();
  if (dirty) {
    await run('git', ['add', '-A'], { cwd });
    const m = (message || '').trim() || lastUserText(s) || 'Changes from Forge';
    const c = await run('git', ['commit', '-m', m.slice(0, 2000)], { cwd });
    if (c.code !== 0) throw httpErr(400, 'Commit failed: ' + clip(c.err || c.out, 500));
  }
  const ahead = +(await run('git', ['rev-list', '--count', `origin/${s.base}..HEAD`], { cwd })).out.trim() || 0;
  if (!ahead) throw httpErr(400, 'No changes to push yet.');
  const p = await git(cwd, ['push', '-u', 'origin', `HEAD:refs/heads/${s.branch}`, '--force-with-lease']);
  if (p.code !== 0) throw httpErr(400, 'Push failed: ' + clip(p.err.replace(/basic [A-Za-z0-9+/=]+/g, 'basic ***'), 600));
  s.pushed = true;
  push(s, { kind: 'status', text: `Pushed ${ahead} commit${ahead > 1 ? 's' : ''} to ${s.branch}` });
  save(s);
}
function lastUserText(s) { for (let i = s.events.length - 1; i >= 0; i--) if (s.events[i].kind === 'user') return s.events[i].text.split('\n')[0].slice(0, 72); return ''; }

// ---------- Codex sign-in ----------
let codexLogin = null; // { proc, out, url, code, done, ok }
function startCodexDeviceLogin() {
  if (codexLogin && !codexLogin.done) return codexLogin;
  const st = { out: '', url: '', code: '', done: false, ok: false };
  const proc = spawn('codex', ['login', '--device-auth'], { env: baseEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const eat = d => {
    // strip colour codes and terminal hyperlinks (ESC ] 8 ;; url ESC \\) so the link and code come out clean
    st.out = (st.out + String(d).replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')).slice(-4000);
    const u = st.out.match(/https:\/\/auth\.openai\.com\/[^\s)'"\x1b]*/); st.url = u ? u[0].replace(/[).,]+$/, '') : 'https://auth.openai.com/codex/device';
    const c = st.out.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4,5})\b/); if (c) st.code = c[1];
  };
  proc.stdout.on('data', eat); proc.stderr.on('data', eat);
  proc.on('close', code => { st.done = true; st.ok = code === 0 && codexReady(); cxModels = null; });
  setTimeout(() => { if (!st.done) proc.kill(); }, 15 * 60 * 1000);
  st.proc = proc;
  codexLogin = st;
  return st;
}
// ---------- Claude subscription sign-in (Pro/Max): runs `claude setup-token` in a terminal on the server ----------
let clLogin = null;
function startClaudeLogin() {
  if (clLogin && !clLogin.done) { try { clLogin.proc.kill('SIGKILL'); } catch {} }
  const st = { raw: '', url: '', done: false, ok: false, error: '', sent: false };
  // `script` gives the CLI the terminal it needs; a very wide terminal keeps the token on one line
  const proc = spawn('script', ['-qfec', 'stty cols 2000 rows 60 2>/dev/null; exec claude setup-token', '/dev/null'], { env: baseEnv({ COLUMNS: '2000', LINES: '60', TERM: 'xterm-256color', BROWSER: 'true' }), stdio: ['pipe', 'pipe', 'pipe'] });
  const eat = d => {
    st.raw = (st.raw + d).slice(-200000);
    if (!st.url) { const m = st.raw.match(/\x1b\]8;[^;\x07\x1b]*;(https:\/\/claude\.(?:com|ai)\/[^\x07\x1b\s]+)/) || st.raw.match(/(https:\/\/claude\.(?:com|ai)\/cai\/oauth\/authorize\?[^\x07\x1b\s]+)/); if (m) st.url = m[1]; }
    const clean = st.raw.replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(+n || 1)).replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?>]*[A-Za-z~]/g, '').replace(/[\r\n]+/g, '\n');
    const t = clean.match(/sk-ant-oat[0-9A-Za-z_\-]{20,}/);
    if (t && !st.ok) {
      setSecrets({ claudeOauthToken: t[0], anthropicKey: '' });
      st.ok = true; st.done = true; try { proc.kill(); } catch {}
    } else if (st.sent) {
      const after = st.raw.slice(st.sentAt).replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(+n || 1)).replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?>]*[A-Za-z~]/g, '');
      const e = after.match(/[^\n\r]*(OAuth error|invalid|expired|failed)[^\n\r]*/i);
      if (e) { st.error = e[0].replace(/^[\s×✗✘*]+/, '').replace(/\s+/g, ' ').trim().slice(0, 240) || 'Claude did not accept that code.'; st.done = true; try { proc.kill(); } catch {} }
    }
  };
  proc.stdout.on('data', eat); proc.stderr.on('data', eat);
  proc.on('close', () => { st.done = true; if (!st.ok && !st.error) st.error = 'Sign-in did not finish. Tap Sign in with Claude again.'; });
  proc.on('error', e => { st.done = true; st.error = 'Could not start the sign-in: ' + e.message; });
  setTimeout(() => { if (!st.done) proc.kill('SIGKILL'); }, 15 * 60 * 1000);
  st.proc = proc;
  clLogin = st;
  return st;
}
function sendClaudeCode(code) {
  const st = clLogin;
  if (!st || st.done) throw httpErr(400, 'Start the sign-in first.');
  code = String(code || '').trim();
  if (!code) throw httpErr(400, 'Paste the code from the Claude page.');
  st.error = ''; st.sent = true; st.sentAt = st.raw.length;
  st.proc.stdin.write(code);
  setTimeout(() => { try { st.proc.stdin.write('\r'); } catch {} }, 300);
}
const clView = st => st && { url: st.url, done: st.done, ok: st.ok, error: st.error, sent: st.sent };

// ---------- one request to `codex app-server` (JSON-RPC over stdin/stdout) ----------
function codexRpc(method, params = {}) {
  return new Promise(resolve => {
    const p = spawn('codex', ['app-server'], { env: baseEnv(), stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '', done = false;
    const finish = v => { if (done) return; done = true; try { p.kill(); } catch {} resolve(v); };
    p.stdout.on('data', d => {
      buf += d; let n;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n); buf = buf.slice(n + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) { p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n'); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method, params }) + '\n'); }
        if (m.id === 2) finish(m.error ? { error: m.error.message } : { result: m.result });
      }
    });
    p.on('error', e => finish({ error: e.message })); p.on('close', () => finish({ error: 'Codex closed' }));
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'forge', version: String(SERVER_VERSION) } } }) + '\n');
    setTimeout(() => finish({ error: 'Codex took too long' }), 20000);
  });
}

// ---------- usage: plan limits from Claude and Codex, plus what Forge ran this week ----------
const winLabel = mins => !mins ? 'Limit' : mins <= 360 ? `${Math.round(mins / 60)}-hour limit` : mins >= 10000 && mins <= 10200 ? 'Weekly limit' : mins >= 1400 && mins <= 1500 ? 'Daily limit' : `${Math.round(mins / 1440)}-day limit`;
function findWindows(o, out = [], key = '') {
  if (!o || typeof o !== 'object') return out;
  const pct = o.usedPercent ?? o.used_percent;
  if (typeof pct === 'number') out.push({ label: winLabel(o.windowDurationMins ?? o.window_minutes) + (key && !/primary|secondary/i.test(key) ? ` (${key})` : ''), percent: Math.round(pct), resetsAt: o.resetsAt ?? o.resets_at ?? null });
  else for (const [k, v] of Object.entries(o)) findWindows(v, out, /primary|secondary|rateLimits/i.test(k) ? key : k);
  return out;
}
// Claude's usage endpoint is strictly rate-limited: ask at most every 3 minutes, back off 10 minutes after
// a 429, and keep showing the last good reading (saved on disk) with its time instead of an error
const CL_USE_FILE = path.join(DATA, 'claude-usage.json');
let clUse = (() => { try { return JSON.parse(fs.readFileSync(CL_USE_FILE, 'utf8')); } catch { return null; } })();
let clUseNext = 0;
// limits Claude Code reports while it runs (rate_limit_event in stream-json) — a second source when the
// usage endpoint keeps saying "too many requests"
const clRun = {};
function noteClaudeLimit(info) {
  if (!info || typeof info !== 'object') return;
  const type = String(info.rateLimitType || info.rate_limit_type || info.type || '');
  let u = info.utilization ?? info.usedPercent ?? info.used_percent;
  if (typeof u !== 'number' || !type) return;
  if (u <= 1) u *= 100;
  const reset = info.resetsAt ?? info.resets_at ?? null;
  clRun[type] = { percent: Math.round(u), resetsAt: typeof reset === 'number' ? new Date(reset * (reset > 1e12 ? 1 : 1000)).toISOString() : reset, at: Date.now() };
}
const CL_NAMES = { five_hour: '5-hour limit', seven_day: 'Weekly limit (all models)', seven_day_opus: 'Weekly limit (Opus)', seven_day_sonnet: 'Weekly limit (Sonnet)' };
const runWindows = () => Object.entries(clRun).filter(([, v]) => Date.now() - v.at < 6 * 3600e3).map(([k, v]) => ({ label: CL_NAMES[k] || k.replace(/_/g, ' '), percent: v.percent, resetsAt: v.resetsAt }));
async function usage() {
  const sec = secrets();
  const out = { claude: null, codex: null, forge: null };
  if (sec.claudeOauthToken && Date.now() < clUseNext && (clUse?.windows || runWindows().length)) out.claude = clUse?.windows ? { ...clUse, stale: Date.now() - clUse.at > 4 * 60 * 1000 } : { kind: 'plan', windows: runWindows(), at: Math.max(...Object.values(clRun).map(v => v.at)), stale: true, fromRuns: true };
  else if (sec.claudeOauthToken) {
    try {
      const ver = ((await versions()).claude.match(/\d+\.\d+\.\d+/) || ['0.0.0'])[0];
      const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${sec.claudeOauthToken}`, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': `claude-code/${ver}`, Accept: 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const wait = Math.max(+(r.headers.get('retry-after') || 0) * 1000, (r.status === 429 ? 10 : 2) * 60 * 1000);
        clUseNext = Date.now() + wait;
        const rw = runWindows();
        out.claude = clUse?.windows ? { ...clUse, stale: true }
          : rw.length ? { kind: 'plan', windows: rw, at: Math.max(...Object.values(clRun).map(v => v.at)), stale: true, fromRuns: true }
          : { kind: 'plan', link: 'https://claude.ai/settings/usage', error: r.status === 429 ? `Claude isn’t allowing usage checks right now (try again after ${new Date(Date.now() + wait).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: process.env.TZ || 'America/Chicago' })}). Your numbers also fill in after your next Claude chat in Forge.` : (j.error?.message || `Claude said ${r.status}`) };
      } else {
        const windows = Object.entries(j).filter(([, v]) => v && typeof v.utilization === 'number').map(([k, v]) => ({ label: CL_NAMES[k] || k.replace(/_/g, ' '), percent: Math.round(v.utilization), resetsAt: v.resets_at || null }));
        out.claude = clUse = { kind: 'plan', windows, at: Date.now() };
        clUseNext = Date.now() + 3 * 60 * 1000;
        try { fs.writeFileSync(CL_USE_FILE, JSON.stringify(clUse)); } catch {}
      }
    } catch (e) { out.claude = { kind: 'plan', error: e.message }; }
  } else if (sec.anthropicKey) out.claude = { kind: 'key', note: 'API key: billed per use. See console.anthropic.com for your bill.' };
  if (codexReady()) {
    const r = await codexRpc('account/rateLimits/read');
    const seen = new Set();
    const wins = r.error ? [] : findWindows(r.result).filter(w => { const k = w.label.replace(/ \(.*\)$/, '') + '|' + w.percent + '|' + w.resetsAt; if (seen.has(k)) return false; seen.add(k); return true; });
    out.codex = r.error ? { error: r.error } : { windows: wins, plan: r.result?.rateLimits?.planType || r.result?.planType || '' };
  }
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const f = { claudeRuns: 0, codexRuns: 0, claudeCost: 0, codexTokens: 0 };
  for (const s of sessions.values()) for (const e of s.events) if (e.kind === 'stat' && e.t >= weekAgo) {
    if (e.agent === 'codex') { f.codexRuns++; f.codexTokens += e.tokens || 0; } else if (e.agent === 'claude' || e.cost != null) { f.claudeRuns++; f.claudeCost += e.cost || 0; }
  }
  out.forge = f;
  return out;
}

// ---------- Codex model list (asks Codex itself, so it matches your ChatGPT plan) ----------
let cxModels = null;
function codexModels() {
  if (cxModels && cxModels.until > Date.now()) return Promise.resolve(cxModels.list);
  return new Promise(resolve => {
    const p = spawn('codex', ['app-server'], { env: baseEnv(), stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '', done = false;
    const finish = list => { if (done) return; done = true; try { p.kill(); } catch {} if (list?.length) cxModels = { list, until: Date.now() + 10 * 60 * 1000 }; resolve(list || []); };
    p.stdout.on('data', d => {
      buf += d; let n;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n); buf = buf.slice(n + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) { p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n'); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'model/list', params: {} }) + '\n'); }
        if (m.id === 2) finish((m.result?.data || []).filter(x => !x.hidden).map(x => ({ id: x.model || x.id, name: x.displayName || x.id, description: x.description || '', isDefault: !!x.isDefault, defaultEffort: x.defaultReasoningEffort || '', efforts: (x.supportedReasoningEfforts || []).map(e => ({ id: e.reasoningEffort, description: e.description || '' })) })));
      }
    });
    p.on('error', () => finish([])); p.on('close', () => finish([]));
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'forge', version: String(SERVER_VERSION) } } }) + '\n');
    setTimeout(() => finish([]), 20000);
  });
}

// ---------- GitHub sign-in (device flow, GitHub CLI's public OAuth app — same flow as `gh auth login`) ----------
const GH_CLIENT = process.env.GITHUB_CLIENT_ID || '178c6fc778ccc68e1d6a';
let ghLogin = null;
async function startGithubLogin() {
  if (ghLogin && !ghLogin.done && Date.now() < ghLogin.until) return ghLogin;
  const r = await fetch('https://github.com/login/device/code', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: GH_CLIENT, scope: 'repo read:org workflow' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.device_code) throw httpErr(502, 'GitHub sign-in is unavailable right now: ' + (j.error_description || j.error || r.status));
  const st = { code: j.user_code, url: 'https://github.com/login/device', done: false, ok: false, error: '', out: '', until: Date.now() + (j.expires_in || 900) * 1000 };
  ghLogin = st;
  (async () => {
    let wait = (j.interval || 5) * 1000;
    while (!st.done && Date.now() < st.until) {
      await new Promise(r => setTimeout(r, wait));
      const t = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: GH_CLIENT, device_code: j.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) }).then(x => x.json()).catch(() => ({}));
      if (t.access_token) {
        const u = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${t.access_token}`, 'User-Agent': 'forge' } }).then(x => x.json()).catch(() => ({}));
        setSecrets({ githubToken: t.access_token, githubLogin: u.login || '' });
        st.ok = true; st.done = true; break;
      }
      if (t.error === 'slow_down') wait += 5000;
      else if (t.error && t.error !== 'authorization_pending') { st.error = t.error_description || t.error; st.done = true; }
    }
    if (!st.done) { st.done = true; st.error = 'The code expired. Tap Connect GitHub again.'; }
  })();
  return st;
}
const ghView = st => st && { code: st.code, url: st.url, done: st.done, ok: st.ok, error: st.error };

const loginView = st => st && { url: st.url, code: st.code, done: st.done, ok: st.ok, out: st.out.slice(-1500) };

async function status() {
  const sec = secrets();
  let codex = codexReady() ? 'connected' : 'off';
  if (codex === 'connected') { const r = await run('codex', ['login', 'status'], { timeout: 15000 }); codex = (r.out + r.err).trim().split('\n').pop() || 'connected'; }
  return {
    github: sec.githubToken ? { login: sec.githubLogin || '' } : null,
    claude: sec.anthropicKey ? 'API key' : sec.claudeOauthToken ? 'Claude subscription' : null,
    codex: codexReady() ? codex : null,
    claudeModel: sec.claudeModel || '', codexModel: sec.codexModel || '',
    versions: await versions(),
  };
}
let verCache = null;
async function versions() {
  if (verCache) return verCache;
  const [c, x] = await Promise.all([run('claude', ['--version'], { timeout: 15000 }), run('codex', ['--version'], { timeout: 15000 })]);
  return (verCache = { claude: c.out.trim(), codex: x.out.trim() });
}

// ---------- HTTP ----------
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 24e6) { reject(httpErr(413, 'Too big — send fewer or smaller photos')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(httpErr(400, 'Bad JSON')); } });
  });
}
function getSession(id) { const s = sessions.get(id); if (!s) throw httpErr(404, 'Session not found'); return s; }

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (p.startsWith(PREFIX)) p = p.slice(PREFIX.length) || '/';
  const M = req.method;
  try {
    if (p === '/health') return send(res, 200, { ok: true, version: SERVER_VERSION, running: runs.size, claudeSignIn: true });
    if (M === 'POST' && p === '/login') {
      const { username, password } = await body(req);
      const r = await fetch(`${SYNAPSE}/_matrix/client/v3/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: String(username || '').trim() }, password, initial_device_display_name: 'Forge' }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) { const sec = Math.ceil((j.retry_after_ms || 60000) / 1000); return send(res, 429, { error: `Too many sign-in tries. Wait ${sec > 90 ? Math.ceil(sec / 60) + ' minutes' : sec + ' seconds'}, then try once more.` }); }
      if (!r.ok) return send(res, 401, { error: j.errcode === 'M_FORBIDDEN' ? 'Wrong username or password' : (j.error || 'Wrong username or password') });
      const user = await authUser({ headers: { authorization: `Bearer ${j.access_token}` } });
      if (!user) return send(res, 403, { error: 'Only the server owner can use Forge.' });
      return send(res, 200, { token: j.access_token, user });
    }
    const user = await authUser(req);
    if (!user) return send(res, 401, { error: 'Please sign in again.' });

    if (M === 'GET' && p === '/me') return send(res, 200, { user, ...(await status()) });
    if (M === 'POST' && p === '/settings') {
      const b = await body(req);
      const patch = {};
      if ('githubToken' in b) {
        patch.githubToken = String(b.githubToken || '').trim();
        if (patch.githubToken) {
          const r = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${patch.githubToken}`, 'User-Agent': 'forge' } });
          if (!r.ok) return send(res, 400, { error: 'GitHub did not accept that token.' });
          patch.githubLogin = (await r.json()).login;
        } else patch.githubLogin = '';
      }
      if ('anthropicKey' in b) { patch.anthropicKey = String(b.anthropicKey || '').trim(); if (patch.anthropicKey) patch.claudeOauthToken = ''; }
      if ('claudeOauthToken' in b) { patch.claudeOauthToken = String(b.claudeOauthToken || '').trim(); if (patch.claudeOauthToken) patch.anthropicKey = ''; }
      if ('claudeModel' in b) patch.claudeModel = String(b.claudeModel || '').trim();
      if ('codexModel' in b) patch.codexModel = String(b.codexModel || '').trim();
      if ('openaiKey' in b && String(b.openaiKey || '').trim()) {
        const r = await run('codex', ['login', '--with-api-key'], { input: String(b.openaiKey).trim() + '\n', timeout: 30000 });
        cxModels = null;
        if (r.code !== 0 || !codexReady()) return send(res, 400, { error: 'Codex did not accept that key: ' + clip(r.err || r.out, 300) });
      }
      setSecrets(patch);
      return send(res, 200, await status());
    }
    if (M === 'GET' && p === '/usage') return send(res, 200, await usage());
    if (M === 'GET' && p === '/codex/models') return send(res, 200, await codexModels());
    if (M === 'POST' && p === '/claude/login') return send(res, 200, clView(startClaudeLogin()));
    if (M === 'GET' && p === '/claude/login') return send(res, 200, clView(clLogin) || {});
    if (M === 'POST' && p === '/claude/code') { const b = await body(req); sendClaudeCode(b.code); return send(res, 200, clView(clLogin)); }
    if (M === 'POST' && p === '/github/login') return send(res, 200, ghView(await startGithubLogin()));
    if (M === 'GET' && p === '/github/login') return send(res, 200, ghView(ghLogin) || {});
    if (M === 'POST' && p === '/codex/login') return send(res, 200, loginView(startCodexDeviceLogin()));
    if (M === 'GET' && p === '/codex/login') return send(res, 200, loginView(codexLogin) || {});
    if (M === 'POST' && p === '/codex/logout') { cxModels = null; await run('codex', ['logout'], { timeout: 15000 }); try { fs.rmSync(path.join(CODEX_HOME, 'auth.json')); } catch {} return send(res, 200, await status()); }

    if (M === 'GET' && p === '/repos') {
      const list = await gh('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');
      return send(res, 200, list.map(r => ({ full: r.full_name, private: r.private, branch: r.default_branch, pushed: r.pushed_at, desc: r.description || '' })));
    }
    if (M === 'POST' && p === '/repos') {
      const b = await body(req);
      const name = String(b.name || '').trim().replace(/\s+/g, '-');
      if (!/^[\w.-]{1,100}$/.test(name)) throw httpErr(400, 'Use letters, numbers, - or _ for the name.');
      const r = await gh('/user/repos', { method: 'POST', body: { name, description: String(b.description || '').slice(0, 300), private: b.private !== false, auto_init: true } });
      return send(res, 200, { full: r.full_name, private: r.private, branch: r.default_branch || 'main', pushed: r.pushed_at || new Date().toISOString(), desc: r.description || '' });
    }
    let m;
    if (M === 'GET' && (m = p.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/folders$/))) return send(res, 200, await repoFolders(m[1], url.searchParams.get('branch') || ''));
    if (M === 'GET' && (m = p.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/branches$/))) {
      const list = await gh(`/repos/${m[1]}/branches?per_page=100`);
      return send(res, 200, list.map(b => b.name));
    }
    if (M === 'GET' && p === '/sessions') return send(res, 200, [...sessions.values()].sort((a, b) => b.updated.localeCompare(a.updated)).map(summary));
    if (M === 'POST' && p === '/sessions') {
      const b = await body(req);
      const s = await createSession(b);
      s.autoship = !!b.autoship;
      if ((b.prompt && String(b.prompt).trim()) || (Array.isArray(b.images) && b.images.length)) { try { startRun(s, String(b.prompt || '').trim() || 'Look at the attached photo.', b.agent, b.model, b.mode, b.effort, b.images); } catch (e) { push(s, { kind: 'error', text: e.message }); } }
      return send(res, 200, summary(s));
    }
    if ((m = p.match(/^\/sessions\/([a-f0-9]+)(\/[a-z]+)?$/))) {
      const s = getSession(m[1]); const sub = m[2] || '';
      if (M === 'GET' && sub === '') return send(res, 200, { ...summary(s), seq: s.seq || 0, events: s.events.slice(-600) });
      if (M === 'GET' && sub === '/events') { // long-poll for events with i > after
        const after = +(url.searchParams.get('after') ?? -1);
        const pick = () => s.events.filter(e => (e.v ?? e.i) > after);
        let ev = pick();
        if (!ev.length) {
          await new Promise(r => { const set = waiters.get(s.id) || new Set(); const fn = () => { clearTimeout(t); r(); }; const t = setTimeout(() => { set.delete(fn); r(); }, 25000); set.add(fn); waiters.set(s.id, set); res.on('close', fn); });
          ev = pick();
        }
        return send(res, 200, { status: s.status, events: ev, prUrl: s.prUrl || null });
      }
      if (M === 'POST' && sub === '/message') { const b = await body(req); s.autoship = !!b.autoship; const pics = Array.isArray(b.images) && b.images.length; if (!String(b.text || '').trim() && !pics) throw httpErr(400, 'Type a message.'); startRun(s, String(b.text || '').trim() || 'Look at the attached photo.', b.agent, b.model, b.mode, b.effort, b.images); return send(res, 200, { ok: true }); }
      if (M === 'POST' && sub === '/stop') { const r = runs.get(s.id); if (r) { r.stopped = true; r.proc.kill('SIGTERM'); setTimeout(() => { try { r.proc.kill('SIGKILL'); } catch {} }, 4000); } return send(res, 200, { ok: true }); }
      if (M === 'GET' && sub === '/diff') return send(res, 200, await diffOf(s));
      if (M === 'GET' && sub === '/files') { const r = await run('git', ['ls-files', '-co', '--exclude-standard'], { cwd: path.join(WORK_DIR, s.id) }); return send(res, 200, r.out.split('\n').filter(Boolean).slice(0, 20000)); }
      if (M === 'GET' && sub === '/file') {
        const f = url.searchParams.get('path') || ''; const root = path.join(WORK_DIR, s.id); const full = path.resolve(root, f);
        if (!full.startsWith(root + path.sep)) throw httpErr(400, 'Bad path');
        const st = fs.statSync(full); if (st.size > 600000) return send(res, 200, { path: f, text: null, size: st.size });
        const buf = fs.readFileSync(full); const bin = buf.subarray(0, 8000).includes(0);
        return send(res, 200, { path: f, size: st.size, text: bin ? null : buf.toString('utf8') });
      }
      if (M === 'POST' && sub === '/commit') { const b = await body(req); await commitPush(s, b.message); return send(res, 200, await diffOf(s)); }
      if (M === 'POST' && sub === '/pr') {
        const b = await body(req);
        const d = await diffOf(s);
        if (d.dirty || !s.pushed || d.ahead) { try { await commitPush(s, b.message); } catch (e) { if (!s.pushed) throw e; } }
        if (!s.prUrl) {
          const pr = await gh(`/repos/${s.repo}/pulls`, { method: 'POST', body: { title: (b.title || s.title).slice(0, 200), head: s.branch, base: s.base, body: (b.body || '') + '\n\n_Made with Forge (' + (s.agent === 'codex' ? 'Codex' : 'Claude Code') + ')_' } });
          s.prUrl = pr.html_url; s.prNumber = pr.number;
          push(s, { kind: 'status', text: `Opened pull request #${pr.number}`, url: pr.html_url });
          save(s);
        }
        return send(res, 200, { prUrl: s.prUrl });
      }
      if (M === 'POST' && sub === '/merge') {
        if (!s.prNumber) throw httpErr(400, 'Open a pull request first.');
        const r = await gh(`/repos/${s.repo}/pulls/${s.prNumber}/merge`, { method: 'PUT', body: { merge_method: 'squash' } });
        push(s, { kind: 'status', text: r.merged ? `Merged into ${s.base}` : (r.message || 'Not merged') }); save(s);
        return send(res, 200, { merged: !!r.merged });
      }
      if (M === 'POST' && sub === '/rename') { const b = await body(req); s.title = String(b.title || s.title).slice(0, 80); save(s); return send(res, 200, summary(s)); }
      if (M === 'DELETE' && sub === '') {
        const r = runs.get(s.id); if (r) { r.stopped = true; r.proc.kill('SIGKILL'); }
        sessions.delete(s.id);
        fs.rmSync(path.join(WORK_DIR, s.id), { recursive: true, force: true });
        fs.rmSync(path.join(SESS_DIR, s.id + '.json'), { force: true });
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.message || 'Server error' });
  }
});
server.requestTimeout = 0;
server.headersTimeout = 60000;
server.listen(PORT, () => console.log(`Forge API on :${PORT}`));
