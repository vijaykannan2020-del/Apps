// The Reddit-style post card (feed, profile, saved, and the top of a post) and what its buttons do:
// vote (optimistic), comment, Share (system share sheet or Repost to community), Save, and the •••
// menu (edit / delete own; report / block others — App Review 1.2).
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { applyVote, nextVote, privacyProblem, shareText, type Dir } from '../core/community';
import { PASTEL } from '../core/communityColors';
import { deletePost, repost, savePost, vote, votePoll, type Post, type PostSummary } from '../data/communityApi';
import { Button, Field, SheetButtons, T, Why, font, useSheet, useTheme, useToast } from '../ui';
import { back, go } from './common';
import { BlockSheet, ReportSheet, useCommunityGate } from './communityAccount';
import { ActionButton, AuthorLine, ConfirmSheet, EmbedCard, MenuSheet, PollCard, PostShell, TagChip, Tags, TimelineCard, TypeChip, VoteCluster, type MenuItem } from './communityUi';

type AnyPost = PostSummary | Post;

/** Share → the phone's share sheet with the title and the in-app link; copies the text where there is no share sheet (web). */
export async function sharePost(p: { id: string; title: string }, toast: (m: string) => void) {
  const message = shareText(p);
  try { await Share.share({ message }); return; } catch {}
  try { await require('expo-clipboard').setStringAsync(message); toast('Link copied'); } catch { toast('Sharing isn’t available here'); }
}

function RepostSheet({ p, onClose }: { p: AnyPost; onClose: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const original = p.repost && !p.repost.removed ? p.repost : { id: p.id, type: p.type, title: p.title, excerpt: p.excerpt, tags: p.tags, author: p.author, createdAt: p.createdAt, score: p.score, comments: p.comments, timeline: p.timeline, poll: p.poll };
  const privacy = body ? privacyProblem(body) : null;
  return (
    <View>
      <Why>Posts it again under your name with the original shown below your comment.</Why>
      <Field label="Your comment (optional)" value={body} onChangeText={setBody} multiline maxLength={5000} placeholder="Why is this worth reading?" error={privacy ?? (error || undefined)} />
      <EmbedCard e={original} press={false} />
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow icon="repost" title="Repost" busy={busy} disabled={!!privacy} onPress={async () => {
          setBusy(true); setError('');
          try { const r = await repost(p.id, body.trim()); onClose(); toast('Reposted'); go(`/community/post/${r.post.id}`); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      </SheetButtons>
    </View>
  );
}

/** Everything a post's buttons do. `onChange` gets the updated post; `onRemoved` runs after delete / report / block. */
export function usePostActions<P extends AnyPost>(p: P, onChange: (p: P) => void, onRemoved?: (id: string) => void) {
  const gate = useCommunityGate();
  const sheet = useSheet();
  const toast = useToast();
  const [pollBusy, setPollBusy] = useState(false);

  const doVote = (tapped: 1 | -1) => gate(async () => {
    if (p.mine) { toast('You can’t vote on your own post'); return; }
    const dir: Dir = nextVote(p.myVote, tapped);
    onChange(applyVote(p, dir));
    try { const r = await vote('post', p.id, dir); onChange({ ...p, score: r.score, myVote: r.myVote, voted: r.voted }); } catch (e: any) { onChange(p); toast(e.message); }
  });
  const doSave = () => gate(async () => {
    const on = !p.saved;
    onChange({ ...p, saved: on });
    try { await savePost(p.id, on); toast(on ? 'Saved' : 'Removed from saved'); } catch (e: any) { onChange(p); toast(e.message); }
  });
  const doPoll = (i: number) => gate(async () => {
    if (pollBusy || p.poll?.myVote === i) return;
    setPollBusy(true);
    try { const r = await votePoll(p.id, i); onChange({ ...p, poll: r.poll }); } catch (e: any) { toast(e.message); } finally { setPollBusy(false); }
  });
  const doShare = () => sheet.open('Share', <MenuSheet items={[
    { icon: 'share', title: 'Share link…', run: () => { sheet.close(); sharePost(p, toast); } },
    { icon: 'repost', title: 'Repost to community', run: () => gate(() => sheet.open('Repost to community', <RepostSheet p={p} onClose={sheet.close} />)) },
  ]} />);
  const doMenu = () => {
    const gone = () => (onRemoved ? onRemoved(p.id) : back());
    const items: MenuItem[] = p.mine ? [
      { icon: 'edit', title: 'Edit post', run: () => { sheet.close(); go('/community/compose', { id: p.id }); } },
      { icon: 'trash', title: 'Delete post', red: true, run: () => sheet.open('Delete this post?', <ConfirmSheet body="Your post is deleted for everyone. If other people commented, their comments stay under a [deleted] post." action="Delete" onClose={sheet.close} onConfirm={async () => { await deletePost(p.id); toast('Post deleted'); gone(); }} />) },
    ] : [
      { icon: 'flag', title: 'Report post', red: true, run: () => gate(() => sheet.open('Report', <ReportSheet kind="post" id={p.id} onClose={sheet.close} onDone={gone} />)) },
      ...(p.author.id ? [{ icon: 'block', title: `Block ${p.author.name}`, red: true, run: () => gate(() => sheet.open('Block this person?', <BlockSheet author={p.author} onClose={sheet.close} onDone={gone} />)) }] : []),
    ];
    if (p.author.id && !p.mine) items.unshift({ icon: 'user', title: `View ${p.author.name}’s profile`, run: () => { sheet.close(); go(`/community/user/${p.author.id}`); } });
    sheet.open(undefined, <MenuSheet items={items} />);
  };
  return { doVote, doSave, doPoll, doShare, doMenu, pollBusy };
}

/** vote · comments · Share · Save · ••• */
export function PostActions<P extends AnyPost>({ p, onChange, onRemoved, onComment }: { p: P; onChange: (p: P) => void; onRemoved?: (id: string) => void; onComment?: () => void }) {
  const a = usePostActions(p, onChange, onRemoved);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginHorizontal: -8 }}>
      <VoteCluster score={p.score} myVote={p.myVote} onVote={a.doVote} disabled={p.mine || p.deleted} />
      <ActionButton icon="comment" text={`${p.comments}`} label={`${p.comments} comments`} onPress={onComment ?? (() => go(`/community/post/${p.id}`))} />
      <View style={{ flex: 1 }} />
      {p.deleted ? null : <ActionButton icon="share" label="Share or repost" onPress={a.doShare} />}
      {p.deleted ? null : <ActionButton icon={p.saved ? 'bookmarkOn' : 'bookmark'} label={p.saved ? 'Remove from saved' : 'Save post'} active={p.saved} color={p.saved ? PASTEL.butter : undefined} onPress={a.doSave} />}
      {p.deleted ? null : <ActionButton icon="more" label="More: report, block, edit or delete" onPress={a.doMenu} />}
    </View>
  );
}

/** What sits between the title and the action row: poll, timeline card or the reposted original. */
export function PostExtras<P extends AnyPost>({ p, onChange, compact }: { p: P; onChange: (p: P) => void; compact?: boolean }) {
  const a = usePostActions(p, onChange);
  return (
    <>
      {p.timeline ? <TimelineCard tl={p.timeline} compact={compact} /> : null}
      {p.poll ? <PollCard poll={p.poll} mine={p.mine} busy={a.pollBusy} onVote={a.doPoll} /> : null}
      {p.repost ? <EmbedCard e={p.repost} /> : null}
    </>
  );
}

export function PostTags({ p }: { p: AnyPost }) {
  if (!p.tags.length && p.type === 'question' && !p.accepted) return null;
  return (
    <Tags style={{ marginTop: 10 }}>
      {p.repost ? <TagChip text="Repost" pastel="sky" icon="repost" /> : <TypeChip type={p.type} />}
      {p.accepted ? <TagChip text="Answered" pastel="sage" icon="check" /> : null}
      {p.tags.slice(0, 4).map((g) => <TagChip key={g} text={g} />)}
    </Tags>
  );
}

/** Feed card: avatar, name · flair · time, title, 3-line preview, tags, action row. */
export function PostCard({ p, onChange, onRemoved }: { p: PostSummary; onChange: (p: PostSummary) => void; onRemoved?: (id: string) => void }) {
  const t = useTheme();
  const open = () => go(`/community/post/${p.id}`);
  return (
    <PostShell onPress={open} label={`${p.title}. ${p.score} points, ${p.comments} comments, by ${p.author.name}`}>
      <AuthorLine a={p.author} at={p.createdAt} edited={p.editedAt} />
      <T style={{ fontSize: 16.5, lineHeight: 22, fontWeight: '600', marginTop: 10, color: t.text }}>{p.title}</T>
      {p.excerpt ? <T tone="text2" numberOfLines={3} style={[font.foot, { marginTop: 6 }]}>{p.excerpt}</T> : null}
      <PostExtras p={p} onChange={onChange} compact />
      <PostTags p={p} />
      {p.hidden ? <T tone="amber" style={[font.caption, { marginTop: 8 }]}>Hidden while a moderator reviews it</T> : null}
      <PostActions p={p} onChange={onChange} onRemoved={onRemoved} onComment={open} />
    </PostShell>
  );
}
