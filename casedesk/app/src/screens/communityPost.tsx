// One question with its answers: upvote, accept (asker), answer, edit / delete own, and the ••• menu
// with Report and Block (App Review 1.2). Reported or blocked content disappears for this person at once.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COMMUNITY_DISCLAIMER, answerProblem, timeAgo } from '../core/community';
import { acceptAnswer, deleteAnswer, deletePost, editAnswer, getPost, postAnswer, useCommunityUser, vote, type Answer, type Author, type Post } from '../data/communityApi';
import { Button, Card, EmptyState, Field, Hint, Icon, MIN_TOUCH, Note, Row, Group, Screen, SectionHeader, SheetButtons, Spinner, T, Tag, Why, font, tint, useSheet, useTheme, useToast, TourTarget, useTour } from '../ui';
import { back, go } from './common';
import { BlockSheet, ReportSheet, maybeAskNotify, useCommunityGate } from './communityAccount';

function VoteButton({ score, voted, onPress, disabled }: { score: number; voted: boolean; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: voted, disabled: !!disabled }} accessibilityLabel={`${voted ? 'Remove upvote' : 'Upvote'}, ${score} upvotes`} hitSlop={4}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 12, borderRadius: 22, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: voted ? tint(t.accent, t.dark ? 0.22 : 0.14) : t.fill, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Icon name="up" size={16} color={voted ? t.inkAccent : t.text} weight="semibold" />
      <T tone={voted ? 'accent' : 'text'} style={[font.sub, { fontWeight: '600' }]}>{`${score}`}</T>
    </Pressable>
  );
}
function MoreButton({ onPress, label }: { onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="more" size={20} color={t.text2} />
    </Pressable>
  );
}
const Byline = ({ a, at, edited }: { a: Author; at: string; edited: string | null }) => (
  <T tone="text2" style={font.caption}>{`${a.name} · ${timeAgo(at)}${edited ? ' · edited' : ''}`}</T>
);

type MenuItem = { icon: string; title: string; red?: boolean; run: () => void };
function MenuSheet({ items }: { items: MenuItem[] }) {
  return <Group style={{ marginTop: 12 }}>{items.map((i) => <Row key={i.title} icon={i.icon} iconTone={i.red ? 'red' : undefined} titleTone={i.red ? 'red' : undefined} title={i.title} chevron={false} onPress={i.run} />)}</Group>;
}
function ConfirmSheet({ body, action, onConfirm, onClose }: { body: string; action: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <View>
      <Why>{body}</Why>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow kind="danger" title={action} busy={busy} onPress={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      </SheetButtons>
    </View>
  );
}
function EditAnswerSheet({ a, onSaved, onClose }: { a: Answer; onSaved: (x: Answer) => void; onClose: () => void }) {
  const [body, setBody] = useState(a.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const local = answerProblem(body);
  return (
    <View>
      <Field label="Your answer" value={body} onChangeText={setBody} multiline maxLength={5000} error={body !== a.body && local ? local : error} />
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow title="Save" disabled={!!local || body === a.body} busy={busy} onPress={async () => { setBusy(true); setError(''); try { onSaved((await editAnswer(a.id, body.trim())).answer); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      </SheetButtons>
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
  const [post, setPost] = useState<Post | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const tour = useTour('communityPost', undefined, { auto: !!post });

  const load = useCallback(async () => {
    setError('');
    try { const r = await getPost(String(id)); setPost(r.post); setAnswers(r.answers); } catch (e: any) { setError(e.message); }
  }, [id, user?.id]);
  useEffect(() => { load(); }, [load]);

  const doVote = (kind: 'post' | 'answer', it: { id: string; voted: boolean; mine: boolean }) => gate(async () => {
    if (it.mine) { toast('You can’t upvote your own post'); return; }
    try {
      const r = await vote(kind, it.id, !it.voted);
      if (kind === 'post') setPost((p) => (p ? { ...p, score: r.score, voted: r.voted } : p));
      else setAnswers((as) => as.map((a) => (a.id === it.id ? { ...a, score: r.score, voted: r.voted } : a)));
    } catch (e: any) { toast(e.message); }
  });

  const postMenu = () => {
    if (!post) return;
    const items: MenuItem[] = post.mine ? [
      { icon: 'edit', title: 'Edit question', run: () => { sheet.close(); go('/community/compose', { id: post.id }); } },
      { icon: 'trash', title: 'Delete question', red: true, run: () => sheet.open('Delete this question?', <ConfirmSheet body="The question and all its answers are deleted for everyone." action="Delete" onClose={sheet.close} onConfirm={async () => { await deletePost(post.id); toast('Question deleted'); back(); }} />) },
    ] : [
      { icon: 'flag', title: 'Report question', red: true, run: () => gate(() => sheet.open('Report', <ReportSheet kind="post" id={post.id} onClose={sheet.close} onDone={back} />)) },
      { icon: 'block', title: `Block ${post.author.name}`, red: true, run: () => gate(() => sheet.open('Block this person?', <BlockSheet author={post.author} onClose={sheet.close} onDone={back} />)) },
    ];
    sheet.open(undefined, <MenuSheet items={items} />);
  };
  const answerMenu = (a: Answer) => {
    const items: MenuItem[] = a.mine ? [
      { icon: 'edit', title: 'Edit answer', run: () => sheet.open('Edit answer', <EditAnswerSheet a={a} onClose={sheet.close} onSaved={(x) => setAnswers((as) => as.map((y) => (y.id === x.id ? x : y)))} />) },
      { icon: 'trash', title: 'Delete answer', red: true, run: () => sheet.open('Delete this answer?', <ConfirmSheet body="Your answer is deleted for everyone." action="Delete" onClose={sheet.close} onConfirm={async () => { await deleteAnswer(a.id); setAnswers((as) => as.filter((x) => x.id !== a.id)); }} />) },
    ] : [
      { icon: 'flag', title: 'Report answer', red: true, run: () => gate(() => sheet.open('Report', <ReportSheet kind="answer" id={a.id} onClose={sheet.close} onDone={() => setAnswers((as) => as.filter((x) => x.id !== a.id))} />)) },
      { icon: 'block', title: `Block ${a.author.name}`, red: true, run: () => gate(() => sheet.open('Block this person?', <BlockSheet author={a.author} onClose={sheet.close} onDone={load} />)) },
    ];
    if (post?.mine && !a.mine) items.unshift({ icon: 'checkc', title: a.accepted ? 'Unmark as accepted' : 'Mark as accepted answer', run: async () => {
      sheet.close();
      try { const r = await acceptAnswer(post.id, a.accepted ? null : a.id); setAnswers((as) => as.map((x) => ({ ...x, accepted: x.id === r.acceptedId }))); setPost((p) => (p ? { ...p, accepted: !!r.acceptedId } : p)); } catch (e: any) { toast(e.message); }
    } });
    sheet.open(undefined, <MenuSheet items={items} />);
  };

  const send = () => gate(async () => {
    const problem = answerProblem(draft);
    if (problem) { setSendError(problem); return; }
    setSending(true); setSendError('');
    try {
      const r = await postAnswer(String(id), draft.trim());
      setAnswers((as) => [...as, r.answer]); setDraft('');
      toast('Answer posted');
      maybeAskNotify(sheet.open, sheet.close);
    } catch (e: any) { setSendError(e.message); } finally { setSending(false); }
  });

  const nav = { title: 'Question', back: 'Back', onBack: back };
  if (error && !post) return <Screen nav={nav}><EmptyState icon="chat" title="Can’t show this question" body={error} action={{ title: 'Try again', onPress: load }} /></Screen>;
  if (!post) return <Screen nav={nav}><Spinner /></Screen>;
  return (
    <Screen nav={nav} keyboard tour={tour}>
      {post.hidden ? <Note tone="amber">Only you can see this right now — it was reported and is waiting for a moderator.</Note> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{post.tags.map((g) => <Tag key={g} text={g} />)}</View>
      <T a11y="header" selectable style={[font.title2, { marginTop: 10 }]}>{post.title}</T>
      <View style={{ marginTop: 4 }}><Byline a={post.author} at={post.createdAt} edited={post.editedAt} /></View>
      <Card style={{ marginTop: 12 }}>
        <T selectable style={font.body}>{post.body}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <TourTarget id="vote"><VoteButton score={post.score} voted={post.voted} onPress={() => doVote('post', post)} disabled={post.mine} /></TourTarget>
          <TourTarget id="menu"><MoreButton onPress={postMenu} label="More: report, block, edit or delete" /></TourTarget>
        </View>
      </Card>
      <Note tone="grey">{COMMUNITY_DISCLAIMER}</Note>

      <SectionHeader>{answers.length ? `${answers.length} answer${answers.length === 1 ? '' : 's'}` : 'Answers'}</SectionHeader>
      {answers.length ? (
        <View style={{ gap: 10 }}>
          {answers.map((a) => (
            <Card key={a.id} style={a.accepted ? { borderWidth: 1.5, borderColor: t.green } : undefined}>
              {a.accepted ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}><Icon name="checkc" size={15} color={t.green} /><T tone="green" style={[font.caption, { fontWeight: '600' }]}>Accepted by the asker</T></View> : null}
              {a.hidden ? <T tone="amber" style={[font.caption, { marginBottom: 6 }]}>Only you can see this — waiting for a moderator.</T> : null}
              <T selectable style={font.callout}>{a.body}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <VoteButton score={a.score} voted={a.voted} onPress={() => doVote('answer', a)} disabled={a.mine} />
                <View style={{ flex: 1 }}><Byline a={a.author} at={a.createdAt} edited={a.editedAt} /></View>
                <MoreButton onPress={() => answerMenu(a)} label="More: report, block, edit or delete" />
              </View>
            </Card>
          ))}
        </View>
      ) : <Card><T tone="text2" style={font.sub}>No answers yet. If you’ve been through this, share what happened.</T></Card>}

      <SectionHeader>Your answer</SectionHeader>
      <TourTarget id="answer"><Field label="Share your experience" value={draft} onChangeText={(s) => { setDraft(s); if (sendError) setSendError(''); }} multiline maxLength={5000} placeholder="What happened in your case? Leave out receipt numbers and names." error={sendError || (draft.length > 20 ? answerProblem(draft) ?? undefined : undefined)} /></TourTarget>
      <Button block icon="chat" title={user ? 'Post answer' : 'Sign in to answer'} busy={sending} disabled={!!user && draft.trim().length < 10} onPress={send} />
      <Hint center style={{ marginTop: 12 }}>Describe your own experience. Not legal advice — for your case, talk to an immigration attorney.</Hint>
    </Screen>
  );
}
