// Community Q&A — talks to the CaseDesk server (/api/forum, /api/auth, /api/me). Reading works
// signed out; writing needs a session token from Sign in with Apple, kept in the iOS keychain
// (expo-secure-store; AsyncStorage only if the keychain module is missing). Nothing about the
// family's documents is ever sent — only what the person types into a question or answer.
import { useEffect, useState } from 'react';
import { apiBase } from './api';
import { native } from '../native/safe';
import { asyncKV } from '../native/asyncKV';

export type Author = { id: string; name: string };
export type CommunityUser = { id: string; name: string; provider: string; createdAt: string; rulesAccepted: boolean; rulesVersion: number; banned: boolean; notify: boolean };
export type PostSummary = { id: string; title: string; excerpt: string; tags: string[]; author: Author; createdAt: string; editedAt: string | null; score: number; answers: number; accepted: boolean; voted: boolean; mine: boolean; hidden: 'review' | null };
export type Post = PostSummary & { body: string };
export type Answer = { id: string; postId: string; body: string; author: Author; createdAt: string; editedAt: string | null; score: number; accepted: boolean; voted: boolean; mine: boolean; hidden: 'review' | null };
export type Feed = { posts: PostSummary[]; next: string | null; total: number };

export class CommunityError extends Error {
  constructor(message: string, public status = 0, public code?: string) { super(message); }
}

const TOKEN_KEY = 'community.session';
const USER_KEY = 'community.user';
const kv = asyncKV();
let token: string | null = null;
let user: CommunityUser | null = null;
let loaded: Promise<void> | null = null;
let isLoaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function readToken(): Promise<string | null> {
  const S = native.secureStore();
  try { if (S?.getItemAsync) return (await S.getItemAsync(TOKEN_KEY)) ?? null; } catch {}
  return kv.getItem(TOKEN_KEY);
}
async function writeToken(v: string | null) {
  const S = native.secureStore();
  try {
    if (S?.setItemAsync) {
      if (v) await S.setItemAsync(TOKEN_KEY, v, { keychainAccessible: S.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
      else await S.deleteItemAsync(TOKEN_KEY);
      return;
    }
  } catch {}
  if (v) await kv.setItem(TOKEN_KEY, v); else await kv.removeItem(TOKEN_KEY);
}

export function loadSession(): Promise<void> {
  loaded ??= (async () => {
    try {
      token = await readToken();
      const u = await kv.getItem(USER_KEY);
      user = token && u ? JSON.parse(u) : null;
    } catch { token = null; user = null; }
    isLoaded = true;
    emit();
    if (token) refreshMe().catch(() => {});
  })();
  return loaded;
}
async function setSession(t: string | null, u: CommunityUser | null) {
  token = t; user = u;
  await writeToken(t);
  if (u) await kv.setItem(USER_KEY, JSON.stringify(u)); else await kv.removeItem(USER_KEY);
  emit();
}
async function setUser(u: CommunityUser) { user = u; await kv.setItem(USER_KEY, JSON.stringify(u)); emit(); }

export const currentUser = () => user;
export const signedIn = () => !!token;

/** The signed-in community account (null when signed out). Re-renders on sign-in / out / rename. */
export function useCommunityUser(): { user: CommunityUser | null; ready: boolean } {
  const [, force] = useState(0);
  const [ready, setReady] = useState(isLoaded);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    loadSession().then(() => setReady(true));
    return () => { subs.delete(f); };
  }, []);
  return { user, ready };
}

export async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = 12000): Promise<T> {
  const b = apiBase();
  if (!b) throw new CommunityError('Community needs the internet connection to the Immigration Wallet server.', 0, 'offline');
  await loadSession();
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  let r: Response;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    r = await fetch(b + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl?.signal });
  } catch {
    throw new CommunityError('Can’t reach Community right now. Check your connection and try again.', 0, 'offline');
  } finally { clearTimeout(timer); }
  let j: any = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && token && j.code === 'auth') await setSession(null, null);
    throw new CommunityError(j.error || `Server error ${r.status}`, r.status, j.code);
  }
  return j as T;
}

// ---------- account ----------
export async function signInWith(provider: 'apple' | 'google', payload: Record<string, string | undefined>) {
  const r = await request<{ token: string; user: CommunityUser }>('POST', `/api/auth/${provider}`, payload);
  await setSession(r.token, r.user);
  return r.user;
}
export async function refreshMe() {
  const r = await request<{ user: CommunityUser }>('GET', '/api/me');
  await setUser(r.user);
  return r.user;
}
export async function updateMe(patch: { name?: string; pushToken?: string | null; acceptRules?: number }) {
  const r = await request<{ user: CommunityUser }>('POST', '/api/me', patch);
  await setUser(r.user);
  return r.user;
}
export async function signOut() {
  try { await request('POST', '/api/auth/signout', {}); } catch {}
  await setSession(null, null);
}
export async function deleteAccount() {
  await request('DELETE', '/api/me', {});
  await setSession(null, null);
}

// ---------- questions & answers ----------
export const getFeed = (query: string) => request<Feed>('GET', `/api/forum/posts${query}`);
export const getMine = (cursor?: string | null) => request<Feed>('GET', `/api/forum/posts?mine=1${cursor ? `&cursor=${cursor}` : ''}`);
export const getPost = (id: string) => request<{ post: Post; answers: Answer[] }>('GET', `/api/forum/posts/${encodeURIComponent(id)}`);
export const createPost = (d: { title: string; body: string; tags: string[] }) => request<{ post: Post }>('POST', '/api/forum/posts', d);
export const editPost = (id: string, d: { title: string; body: string; tags: string[] }) => request<{ post: Post }>('POST', `/api/forum/posts/${id}/edit`, d);
export const deletePost = (id: string) => request<{ ok: true }>('DELETE', `/api/forum/posts/${id}`, {});
export const postAnswer = (postId: string, body: string) => request<{ answer: Answer }>('POST', `/api/forum/posts/${postId}/answers`, { body });
export const editAnswer = (id: string, body: string) => request<{ answer: Answer }>('POST', `/api/forum/answers/${id}/edit`, { body });
export const deleteAnswer = (id: string) => request<{ ok: true }>('DELETE', `/api/forum/answers/${id}`, {});
export const vote = (kind: 'post' | 'answer', id: string, up: boolean) => request<{ score: number; voted: boolean }>('POST', `/api/forum/${kind === 'post' ? 'posts' : 'answers'}/${id}/vote`, { up });
export const acceptAnswer = (postId: string, answerId: string | null) => request<{ acceptedId: string | null }>('POST', `/api/forum/posts/${postId}/accept`, { answerId });
export const report = (kind: 'post' | 'answer', id: string, reason: string, note?: string) => request<{ ok: true; hidden: boolean }>('POST', '/api/forum/report', { kind, id, reason, note });
export const blockUser = (userId: string) => request<{ blocked: Author[] }>('POST', '/api/forum/blocks', { userId });
export const unblockUser = (userId: string) => request<{ blocked: Author[] }>('DELETE', '/api/forum/blocks', { userId });
export const getBlocks = () => request<{ blocked: Author[] }>('GET', '/api/forum/blocks');
export const contactModerators = (message: string, about?: string) => request<{ ok: true }>('POST', '/api/forum/contact', { message, about });
export const getRules = () => request<{ version: number; rules: string[]; contact: string | null; disclaimer: string }>('GET', '/api/forum/rules');
