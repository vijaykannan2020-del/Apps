// One post with its comment threads (v2.7): the full post card, then threaded comments up to 4 levels
// with votes, collapse, Best / New sort, OP and accepted-answer badges, and a reply box that stays
// above the keyboard. Own comments can be edited or deleted; others can be reported or blocked.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COMMUNITY_DISCLAIMER, LIMITS, MAX_DEPTH, applyVote, buildTree, commentProblem, nextVote, threadRows, typeLabel, type CommentSort, type Dir, type ThreadRow } from '../core/community';
import { CARD_RADIUS, INK, PASTEL } from '../core/communityColors';
import { acceptAnswer, deleteComment, editComment, emitPost, emitRemoved, getPost, postComment, useCommunityUser, vote, type Comment, type Post } from '../data/communityApi';
import { Button, ChipToggle, EmptyState, Field, Icon, MIN_TOUCH, Note, Screen, SheetButtons, Spinner, T, font, useSheet, useTheme, useToast, TourTarget, useTour } from '../ui';
import { back, go } from './common';
import { BlockSheet, ReportSheet, maybeAskNotify, useCommunityGate } from './communityAccount';
import { PostActions, PostExtras, PostTags } from './communityCards';
import { ActionButton, AuthorLine, CAvatar, ConfirmSheet, MenuSheet, PostShell, TagChip, VoteCluster, type MenuItem } from './communityUi';

function EditCommentSheet({ c, onSaved, onClose }: { c: Comment; onSaved: (x: Comment) => void; onClose: () => void }) {
  const [body, setBody] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const local = commentProblem(body);
  return (
    <View>
      <Field label="Your comment" value={body} onChangeText={setBody} multiline maxLength={LIMITS.comment[1]} error={body !== c.body && local ? local : error} />
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow title="Save" disabled={!!local || body === c.body} busy={busy} onPress={async () => { setBusy(true); setError(''); try { onSaved((await editComment(c.id, body.trim())).comment); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      </SheetButtons>
    </View>
  );
}

const Badge = ({ text, pastel }: { text: string; pastel: keyof typeof PASTEL }) => (
  <View style={{ backgroundColor: PASTEL[pastel], borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: INK, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>{text}</Text></View>
);

/** One comment row inside a thread card. Depth shows as thread lines on the left; tapping the header collapses the thread. */
function CommentRow({ row, onVote, onReply, onMenu, onToggle }: { row: ThreadRow<Comment>; onVote: (c: Comment, d: 1 | -1) => void; onReply: (c: Comment) => void; onMenu: (c: Comment) => void; onToggle: (id: string) => void }) {
  const t = useTheme();
  const c = row.c;
  const lines = Array.from({ length: row.depth }, (_, i) => <View key={i} style={{ width: 14, alignItems: 'flex-start' }}><View style={{ width: 2, flex: 1, borderRadius: 1, backgroundColor: t.sep }} /></View>);
  const replies = c.replies.length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {lines}
      <View style={{ flex: 1, minWidth: 0, paddingTop: row.depth ? 8 : 0, paddingBottom: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AuthorLine a={c.author} at={c.createdAt} edited={c.editedAt} size={26}
              badges={<>{c.op ? <Badge text="OP" pastel="sky" /> : null}{c.accepted ? <TagChip text="Accepted" pastel="sage" icon="check" /> : null}</>} />
          </View>
          {replies || row.collapsed ? (
            <Pressable onPress={() => onToggle(c.id)} accessibilityRole="button" accessibilityState={{ expanded: !row.collapsed }} accessibilityLabel={row.collapsed ? `Show ${row.hidden} hidden repl${row.hidden === 1 ? 'y' : 'ies'}` : 'Collapse thread'} hitSlop={8}
              style={{ minWidth: MIN_TOUCH, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              {row.collapsed ? <T tone="text2" style={[font.caption, { fontWeight: '600' }]}>{`+${row.hidden}`}</T> : null}
              <Icon name={row.collapsed ? 'chevR' : 'chevD'} size={14} color={t.text2} weight="semibold" />
            </Pressable>
          ) : null}
        </View>
        {row.collapsed ? null : (
          <>
            {c.hidden ? <T tone="amber" style={[font.caption, { marginTop: 6 }]}>Only you can see this — waiting for a moderator.</T> : null}
            <T selectable tone={c.deleted ? 'text2' : 'text'} style={[font.sub, { marginTop: 6, lineHeight: 21 }, c.deleted ? { fontStyle: 'italic' } : {}]}>{c.body}</T>
            {c.deleted ? <View style={{ height: 8 }} /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -12, marginTop: 2 }}>
                <VoteCluster small score={c.score} myVote={c.myVote} onVote={(d) => onVote(c, d)} disabled={c.mine} />
                <ActionButton icon="reply" text="Reply" label={`Reply to ${c.author.name}`} onPress={() => onReply(c)} />
                <View style={{ flex: 1 }} />
                <ActionButton icon="more" label="More: report, block, edit or delete" onPress={() => onMenu(c)} />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

export function CommunityPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useCommunityUser();
  const gate = useCommunityGate();
  const sheet = useSheet();
  const toast = useToast();
  const t = useTheme();
  const [post, setPostState] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<CommentSort>('best');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const input = useRef<any>(null);
  const tour = useTour('communityPost', undefined, { auto: false });

  const setPost = useCallback((p: Post) => { setPostState(p); emitPost(p); }, []);
  const load = useCallback(async () => {
    setError('');
    try { const r = await getPost(String(id)); setPostState(r.post); setComments(r.comments ?? []); } catch (e: any) { setError(e.message); }
  }, [id, user?.id]);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => buildTree(comments, sort), [comments, sort]);
  const live = comments.filter((c) => !c.deleted).length;
  const patch = (x: Comment) => setComments((cs) => cs.map((c) => (c.id === x.id ? { ...c, ...x } : c)));
  const toggle = (cid: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });

  const voteComment = (c: Comment, tapped: 1 | -1) => gate(async () => {
    if (c.mine) { toast('You can’t vote on your own comment'); return; }
    const dir: Dir = nextVote(c.myVote, tapped);
    patch(applyVote(c, dir));
    try { const r = await vote('comment', c.id, dir); patch({ ...c, score: r.score, myVote: r.myVote, voted: r.voted }); } catch (e: any) { patch(c); toast(e.message); }
  });
  const startReply = (c: Comment | null) => gate(() => { setReplyTo(c); setSendError(''); setTimeout(() => input.current?.focus(), 50); });

  const commentMenu = (c: Comment) => {
    const drop = () => load();
    const items: MenuItem[] = c.mine ? [
      { icon: 'edit', title: 'Edit comment', run: () => sheet.open('Edit comment', <EditCommentSheet c={c} onClose={sheet.close} onSaved={patch} />) },
      { icon: 'trash', title: 'Delete comment', red: true, run: () => sheet.open('Delete this comment?', <ConfirmSheet body="Your comment is deleted for everyone. Replies below it stay, under [deleted]." action="Delete" onClose={sheet.close} onConfirm={async () => { await deleteComment(c.id); await load(); }} />) },
    ] : [
      { icon: 'flag', title: 'Report comment', red: true, run: () => gate(() => sheet.open('Report', <ReportSheet kind="comment" id={c.id} onClose={sheet.close} onDone={drop} />)) },
      ...(c.author.id ? [{ icon: 'block', title: `Block ${c.author.name}`, red: true, run: () => gate(() => sheet.open('Block this person?', <BlockSheet author={c.author} onClose={sheet.close} onDone={drop} />)) }] : []),
    ];
    if (c.author.id && !c.mine) items.unshift({ icon: 'user', title: `View ${c.author.name}’s profile`, run: () => { sheet.close(); go(`/community/user/${c.author.id}`); } });
    if (post?.mine && post.type === 'question' && !c.mine && !c.parentId) items.unshift({ icon: 'checkc', title: c.accepted ? 'Unmark as accepted' : 'Mark as accepted answer', run: async () => {
      sheet.close();
      try { const r = await acceptAnswer(post.id, c.accepted ? null : c.id); setComments((cs) => cs.map((x) => ({ ...x, accepted: x.id === r.acceptedId }))); setPost({ ...post, accepted: !!r.acceptedId }); } catch (e: any) { toast(e.message); }
    } });
    sheet.open(undefined, <MenuSheet items={items} />);
  };

  const send = () => gate(async () => {
    const problem = commentProblem(draft);
    if (problem) { setSendError(problem); return; }
    setSending(true); setSendError('');
    try {
      const r = await postComment(String(id), draft.trim(), replyTo?.id);
      setComments((cs) => [...cs, r.comment]); setDraft(''); setReplyTo(null);
      if (replyTo) setCollapsed((s) => { const n = new Set(s); n.delete(replyTo.id); return n; });
      if (post) setPost({ ...post, comments: post.comments + 1, answers: post.answers + 1 });
      input.current?.blur();
      toast(replyTo ? 'Reply posted' : 'Comment posted');
      maybeAskNotify(sheet.open, sheet.close);
    } catch (e: any) { setSendError(e.message); } finally { setSending(false); }
  });

  const nav = { title: post ? (post.repost ? 'Repost' : typeLabel(post.type)) : 'Post', back: 'Back', onBack: back };
  if (error && !post) return <Screen nav={nav}><EmptyState icon="chat" title="Can’t show this post" body={error} action={{ title: 'Try again', onPress: load }} /></Screen>;
  if (!post) return <Screen nav={nav}><Spinner /></Screen>;

  const live2 = draft.trim().length >= LIMITS.comment[0];
  const replyBar = post.deleted ? undefined : (
    <View style={{ flex: 1 }}>
      {replyTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <CAvatar a={replyTo.author} size={20} />
          <T tone="text2" numberOfLines={1} style={[font.caption, { flex: 1 }]}>{`Replying to ${replyTo.author.name}`}</T>
          <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={12} style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} color={t.text2} /></Pressable>
        </View>
      ) : null}
      {sendError ? <T tone="red" style={[font.caption, { marginBottom: 6 }]}>{sendError}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <TourTarget id="answer" style={{ flex: 1 }}>
          <TextInput ref={input} value={draft} onChangeText={(s) => { setDraft(s); if (sendError) setSendError(''); }} multiline maxLength={LIMITS.comment[1]}
            placeholder={!user ? 'Sign in to comment' : replyTo ? 'Write a reply…' : post.type === 'question' ? 'Add an answer…' : 'Add a comment…'} placeholderTextColor={t.text3}
            accessibilityLabel={replyTo ? `Reply to ${replyTo.author.name}` : 'Add a comment'} onFocus={() => { if (!user) { input.current?.blur(); startReply(null); } }}
            style={[font.callout, { minHeight: 44, maxHeight: 130, borderRadius: 22, backgroundColor: t.field, color: t.text, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }]} />
        </TourTarget>
        <Pressable onPress={send} disabled={sending || !live2} accessibilityRole="button" accessibilityLabel={replyTo ? 'Post reply' : 'Post comment'} accessibilityState={{ disabled: sending || !live2 }}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: live2 ? PASTEL.sage : t.fill, opacity: pressed ? 0.7 : 1 })}>
          {sending ? <Spinner /> : <Icon name="send" size={18} color={live2 ? INK : t.text3} weight="semibold" />}
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen nav={nav} keyboard tour={tour} footer={replyBar}>
      {post.hidden ? <Note tone="amber" style={{ marginBottom: 10 }}>Only you can see this right now — it was reported and is waiting for a moderator.</Note> : null}
      <PostShell>
        <AuthorLine a={post.author} at={post.createdAt} edited={post.editedAt} size={40} />
        <T a11y="header" selectable style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2, marginTop: 12, color: t.text }}>{post.title}</T>
        {post.body ? <T selectable tone={post.deleted ? 'text2' : 'text'} style={[font.callout, { marginTop: 8, lineHeight: 23 }]}>{post.body}</T> : null}
        <PostExtras p={post} onChange={setPost} />
        <PostTags p={post} />
        <TourTarget id="vote"><PostActions p={post} onChange={setPost} onRemoved={(pid) => { emitRemoved(pid); back(); }} onComment={() => startReply(null)} /></TourTarget>
      </PostShell>
      <T tone="text2" style={[font.caption, { marginTop: 10, marginHorizontal: 6 }]}>{COMMUNITY_DISCLAIMER}</T>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8, marginHorizontal: 4, gap: 8 }}>
        <T a11y="header" style={font.headline}>{live ? `${live} comment${live === 1 ? '' : 's'}` : 'Comments'}</T>
        {comments.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <ChipToggle text="Best" on={sort === 'best'} onPress={() => setSort('best')} />
            <ChipToggle text="New" on={sort === 'new'} onPress={() => setSort('new')} />
          </View>
        ) : null}
      </View>
      {tree.length ? (
        <View style={{ gap: 10 }}>
          {tree.map((root) => (
            <View key={root.id} style={{ backgroundColor: t.card, borderRadius: CARD_RADIUS - 4, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderWidth: root.accepted ? 1.5 : 0, borderColor: PASTEL.sage }}>
              {threadRows([root], collapsed).map((row) => <CommentRow key={row.c.id} row={row} onVote={voteComment} onReply={startReply} onMenu={commentMenu} onToggle={toggle} />)}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ backgroundColor: t.card, borderRadius: CARD_RADIUS - 4, padding: 18 }}>
          <T tone="text2" style={font.sub}>{post.deleted ? 'No comments.' : post.type === 'question' ? 'No answers yet. If you’ve been through this, share what happened.' : 'No comments yet. Be the first to reply.'}</T>
        </View>
      )}
      <T tone="text2" style={[font.caption, { textAlign: 'center', marginTop: 16 }]}>{`Threads go ${MAX_DEPTH} levels deep. Describe your own experience — not legal advice.`}</T>
    </Screen>
  );
}
