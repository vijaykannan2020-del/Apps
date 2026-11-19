// Community (v2.7: posts, threaded comments, votes, polls, profiles) — talks to the CaseDesk server (/api/forum, /api/auth, /api/me). Reading works
// signed out; writing needs a session token from Sign in with Apple, kept in the iOS keychain
// (expo-secure-store; AsyncStorage only if the keychain module is missing). Nothing about the
// family's documents is ever sent — only what the person types into a question or answer.
import { useEffect, useState } from 'react';
import { apiBase } from './api';
import { native } from '../native/safe';
import { asyncKV } from '../native/asyncKV';

import type { Dir, PostType, TimelineData } from '../core/community';

export type Author = { id: string | null; name: string; avatar?: string | null; flair?: string | null; deleted?: boolean; official?: boolean };
export type Stats = { karma: number; postKarma: number; commentKarma: number; posts: number; comments: number };
export type CommunityUser = { id: string; name: string; avatar?: string | null; flair?: string | null; provider: string; createdAt: string; rulesAccepted: boolean; rulesVersion: number; banned: boolean; notify: boolean; unread?: number } & Partial<Stats>;
export type Poll = { options: { text: string; votes: number }[]; total: number; myVote: number | null };
export type Embed = { id: string; removed?: boolean; type?: PostType; title?: string; excerpt?: string; tags?: string[]; author?: Author; createdAt?: string; score?: number; comments?: number; timeline?: TimelineData | null; poll?: { options: { text: string }[]; total: number } | null };
export type PostSummary = {
  id: string; type: PostType; title: string; excerpt: string; tags: string[]; author: Author; createdAt: string; editedAt: string | null;
  score: number; myVote: Dir; voted: boolean; comments: number; answers: number; accepted: boolean; saved: boolean; mine: boolean; hidden: 'review' | null; deleted: boolean;
  timeline: TimelineData | null; poll: Poll | null; repost: Embed | null;
  /** v2.9 server: the Welcome post (older servers leave these out). */
  pinned?: boolean; official?: boolean;
};
export type Post = PostSummary & { body: string };
export type Comment = { id: string; postId: string; parentId: string | null; depth: number; body: string; author: Author; createdAt: string; editedAt: string | null; score: number; up: number; down: number; myVote: Dir; voted: boolean; accepted: boolean; op: boolean; mine: boolean; hidden: 'review' | null; deleted: boolean };
/** v2.4 name for a top-level comment. */
export type Answer = Comment;
export type Feed = { posts: PostSummary[]; next: string | null; total: number };
export type Profile = { user: Author & Stats & { id: string; createdAt: string; mine: boolean }; blocked: boolean; posts: PostSummary[]; comments: (Comment & { postTitle: string })[] };
export type Notice = { id: string; kind: 'reply' | 'milestone'; title: string; text: string; postId: string; commentId: string | null; at: string; read: boolean };
export type NewPost = { title: string; body: string; tags: string[]; type?: PostType; poll?: { options: string[] }; timeline?: TimelineData; repostOf?: string };

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
export async function updateMe(patch: { name?: string; avatar?: string | null; flair?: string | null; pushToken?: string | null; acceptRules?: number }) {
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

// ---------- posts, comments, votes ----------
const enc = encodeURIComponent;
export const getFeed = (query: string) => request<Feed>('GET', `/api/forum/posts${query}`);
export const getMine = (cursor?: string | null) => request<Feed>('GET', `/api/forum/posts?mine=1${cursor ? `&cursor=${cursor}` : ''}`);
export const getSaved = (cursor?: string | null) => request<Feed>('GET', `/api/forum/posts?saved=1${cursor ? `&cursor=${cursor}` : ''}`);
export const getPost = (id: string) => request<{ post: Post; comments: Comment[] }>('GET', `/api/forum/posts/${enc(id)}`);
export const createPost = (d: NewPost) => request<{ post: Post }>('POST', '/api/forum/posts', d);
export const editPost = (id: string, d: NewPost) => request<{ post: Post }>('POST', `/api/forum/posts/${enc(id)}/edit`, d);
export const deletePost = (id: string) => request<{ ok: true }>('DELETE', `/api/forum/posts/${enc(id)}`, {});
export const postComment = (postId: string, body: string, parentId?: string | null) => request<{ comment: Comment }>('POST', `/api/forum/posts/${enc(postId)}/comments`, { body, parentId: parentId || undefined });
export const editComment = (id: string, body: string) => request<{ comment: Comment }>('POST', `/api/forum/comments/${enc(id)}/edit`, { body });
export const deleteComment = (id: string) => request<{ ok: true }>('DELETE', `/api/forum/comments/${enc(id)}`, {});
/** dir: 1 upvote, -1 downvote, 0 clear. */
export const vote = (kind: 'post' | 'comment', id: string, dir: Dir) => request<{ score: number; voted: boolean; myVote: Dir }>('POST', `/api/forum/${kind === 'post' ? 'posts' : 'comments'}/${enc(id)}/vote`, { dir });
export const acceptAnswer = (postId: string, commentId: string | null) => request<{ acceptedId: string | null }>('POST', `/api/forum/posts/${enc(postId)}/accept`, { commentId });
export const votePoll = (postId: string, option: number) => request<{ poll: Poll }>('POST', `/api/forum/posts/${enc(postId)}/poll`, { option });
export const savePost = (postId: string, on: boolean) => request<{ saved: boolean }>('POST', `/api/forum/posts/${enc(postId)}/save`, { on });
export const repost = (postId: string, body: string) => request<{ post: Post }>('POST', '/api/forum/posts', { repostOf: postId, body });
export const getProfile = (userId: string) => request<Profile>('GET', `/api/forum/users/${enc(userId)}`);
export const getNotifications = () => request<{ items: Notice[]; unread: number }>('GET', '/api/forum/notifications');
export const readNotifications = () => request<{ ok: true; unread: number }>('POST', '/api/forum/notifications/read', {});
export const report = (kind: 'post' | 'comment' | 'user', id: string, reason: string, note?: string) => request<{ ok: true; hidden: boolean }>('POST', '/api/forum/report', { kind, id, reason, note });
export const blockUser = (userId: string) => request<{ blocked: Author[] }>('POST', '/api/forum/blocks', { userId });
export const unblockUser = (userId: string) => request<{ blocked: Author[] }>('DELETE', '/api/forum/blocks', { userId });
export const getBlocks = () => request<{ blocked: Author[] }>('GET', '/api/forum/blocks');
export const contactModerators = (message: string, about?: string) => request<{ ok: true }>('POST', '/api/forum/contact', { message, about });
export const getRules = () => request<{ version: number; rules: string[]; contact: string | null; disclaimer: string }>('GET', '/api/forum/rules');

// ---------- keeping lists in step ----------
// A vote, save or poll vote on the post page should show on the feed card behind it without a reload.
type BusEvent = { kind: 'post'; post: PostSummary } | { kind: 'removed'; id: string };
const bus = new Set<(e: BusEvent) => void>();
export const emitPost = (post: PostSummary) => bus.forEach((f) => f({ kind: 'post', post }));
export const emitRemoved = (id: string) => bus.forEach((f) => f({ kind: 'removed', id }));
/** Apply a bus event to a list of posts (pure — unit-tested). */
export function applyBus<T extends PostSummary>(list: T[], e: BusEvent): T[] {
  if (e.kind === 'removed') return list.some((p) => p.id === e.id) ? list.filter((p) => p.id !== e.id) : list;
  return list.some((p) => p.id === e.post.id) ? list.map((p) => (p.id === e.post.id ? ({ ...p, ...e.post, excerpt: p.excerpt } as T) : p)) : list;
}
/** Keep `list` state in step with changes made on other screens. */
export function usePostBus(set: (fn: (list: PostSummary[] | null) => PostSummary[] | null) => void) {
  useEffect(() => {
    const f = (e: BusEvent) => set((list) => (list ? applyBus(list, e) : list));
    bus.add(f);
    return () => { bus.delete(f); };
  }, [set]);
}
