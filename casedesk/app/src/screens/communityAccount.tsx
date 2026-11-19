// Community account: the join sheet (Sign in with Apple → accept the rules), the "Get notified when
// someone answers" ask, report / block sheets, contact moderators, and the Account screen (display
// name, my questions, notifications, blocked people, sign out, Delete account — Apple 5.1.1(v)).
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { COMMUNITY_DISCLAIMER, COMMUNITY_RULES, REPORT_REASONS, RULES_VERSION, nameProblem, timeAgo } from '../core/community';
import {
  blockUser, contactModerators, deleteAccount, getBlocks, getMine, getRules, report, signOut, unblockUser, updateMe, useCommunityUser,
  type Author, type PostSummary,
} from '../data/communityApi';
import { appleModule, appleSupport, disableAnswerPush, enableAnswerPush, finishGoogle, googleConfig, googleModule, signInWithApple, type AppleSupport } from '../data/communityAuth';
import { asyncKV } from '../native/asyncKV';
import { Button, Card, EmptyState, Field, Group, Hint, Icon, LinkButton, Note, Option, Row, Screen, SectionHeader, SheetButtons, Spinner, Switch, T, Why, font, useSheet, useTheme, useToast, TourButton, TourScope, TourTarget, useSheetTour, useTour } from '../ui';
import { back, go } from './common';

const kv = asyncKV();
const NOTIFY_ASKED = 'community.notifyAsked';

// ---------- join: sign in + rules ----------
function AppleButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  const t = useTheme();
  const A = appleModule();
  if (A?.AppleAuthenticationButton && !busy) {
    return (
      <A.AppleAuthenticationButton buttonType={A.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={t.dark ? A.AppleAuthenticationButtonStyle.WHITE : A.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={14} style={{ height: 50, width: '100%', marginTop: 18 }} onPress={onPress} />
    );
  }
  return <Button block icon="lock" title="Sign in with Apple" busy={busy} onPress={onPress} />;
}

function GoogleButton({ onSignedIn, setError }: { onSignedIn: () => void; setError: (s: string) => void }) {
  const cfg = googleConfig()!;
  const G = googleModule();
  const [req, res, prompt] = G.useIdTokenAuthRequest({ iosClientId: cfg.iosClientId, webClientId: cfg.webClientId });
  useEffect(() => {
    if (res?.type !== 'success') return;
    const idToken = res.params?.id_token || res.authentication?.idToken;
    if (!idToken) { setError('Google didn’t return a sign-in token. Try again.'); return; }
    finishGoogle(idToken).then(onSignedIn).catch((e) => setError(e.message));
  }, [res]);
  return <Button block kind="ghost" icon="globe" title="Sign in with Google" disabled={!req} onPress={() => prompt()} />;
}

export function RulesList() {
  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {COMMUNITY_RULES.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <T tone="accent" style={[font.sub, { fontWeight: '700', width: 18 }]}>{`${i + 1}`}</T>
          <T style={[font.sub, { flex: 1 }]}>{r}</T>
        </View>
      ))}
    </View>
  );
}

/** Sign in (if needed) → accept rules (if needed) → onReady. */
export function JoinSheet({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  const { user } = useCommunityUser();
  const [support, setSupport] = useState<AppleSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tour = useSheetTour('communitySignIn');
  useEffect(() => { appleSupport().then(setSupport); }, []);
  const showGoogle = !!googleConfig() && !!googleModule()?.useIdTokenAuthRequest;
  const done = React.useRef(false);
  const finish = () => { if (done.current) return; done.current = true; onClose(); setTimeout(onReady, 50); };
  useEffect(() => { if (user?.rulesAccepted && !user.banned) finish(); }, [user?.rulesAccepted, user?.banned]);

  if (user && user.rulesAccepted && !user.banned) return <Spinner />;
  if (user && user.banned) return <Note tone="red">This account can’t post because it broke the community rules.</Note>;
  if (user) {
    return (
      <TourScope tour={tour}>
        <Why>{`You’re ${user.name}. Before your first post, please read the community rules.`}</Why>
        <TourTarget id="rules"><RulesList /></TourTarget>
        {error ? <Note tone="red">{error}</Note> : null}
        <SheetButtons>
          <Button kind="ghost" title="Not now" onPress={onClose} />
          <Button grow title="I agree" busy={busy} onPress={async () => {
            setBusy(true); setError('');
            try { await updateMe({ acceptRules: RULES_VERSION }); finish(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
          }} />
        </SheetButtons>
      </TourScope>
    );
  }
  return (
    <TourScope tour={tour}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><View style={{ flex: 1 }}><Why>Reading is open to everyone. To ask, answer or upvote, sign in — other people only see a made-up display name you can change. We never see or show your email.</Why></View><TourButton /></View>
      <Hint>{COMMUNITY_DISCLAIMER}</Hint>
      {support === null ? <View style={{ marginTop: 18 }}><Spinner /></View> : null}
      {support === 'update' ? <Note tone="amber">Update the app from TestFlight to join the community. You can keep reading questions in this version.</Note> : null}
      {support === 'unsupported' && !showGoogle ? <Note tone="grey">Sign in with Apple isn’t available on this device. You can keep reading questions.</Note> : null}
      {support === 'ok' ? <TourTarget id="apple"><AppleButton busy={busy} onPress={async () => {
        setBusy(true); setError('');
        try { await signInWithApple(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }} /></TourTarget> : null}
      {showGoogle ? <GoogleButton onSignedIn={() => {}} setError={setError} /> : null}
      {error ? <Note tone="red">{error}</Note> : null}
      <Hint center style={{ marginTop: 14 }}>By joining you agree to the community rules. Content that breaks them is removed and accounts are banned.</Hint>
      <TourTarget id="rules"><LinkButton align="left" title="Read the community rules" onPress={() => { onClose(); go('/community/rules'); }} /></TourTarget>
    </TourScope>
  );
}

/** ensure(action): runs it at once when signed in with rules accepted, otherwise opens the join sheet first. */
export function useCommunityGate() {
  const sheet = useSheet();
  const { user } = useCommunityUser();
  return useCallback((action: () => void) => {
    if (user && user.rulesAccepted && !user.banned) return action();
    sheet.open(user ? 'Community rules' : 'Join the community', <JoinSheet onReady={action} onClose={sheet.close} />);
  }, [user, sheet]);
}

// ---------- notifications ask (after the first question / answer) ----------
export async function maybeAskNotify(open: (title: string, node: React.ReactNode) => void, close: () => void) {
  if (await kv.getItem(NOTIFY_ASKED)) return;
  await kv.setItem(NOTIFY_ASKED, '1');
  open('Get notified when someone answers', <NotifySheet onClose={close} />);
}
function NotifySheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  return (
    <View>
      <Why>We’ll send one notification when someone answers your question. Nothing else, and you can turn it off in Community → Account.</Why>
      <SheetButtons>
        <Button kind="ghost" title="Not now" onPress={onClose} />
        <Button grow icon="bell" title="Notify me" onPress={async () => { const ok = await enableAnswerPush(true); onClose(); toast(ok ? 'You’ll be notified of answers' : 'Notifications are off in iOS Settings'); }} />
      </SheetButtons>
    </View>
  );
}

// ---------- report / block / contact ----------
export function ReportSheet({ kind, id, onDone, onClose }: { kind: 'post' | 'answer'; id: string; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  return (
    <View>
      <Why>{`Why are you reporting this ${kind === 'post' ? 'question' : 'answer'}? Moderators review reports within 24 hours. You won’t see it again.`}</Why>
      <View style={{ gap: 8, marginTop: 12 }}>{REPORT_REASONS.map((r) => <Option key={r.id} title={r.label} selected={reason === r.id} onPress={() => setReason(r.id)} />)}</View>
      <Field label="More detail (optional)" value={note} onChangeText={setNote} maxLength={300} multiline />
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow kind="danger" icon="flag" title="Report" disabled={!reason} busy={busy} onPress={async () => {
          setBusy(true); setError('');
          try { await report(kind, id, reason, note); onClose(); toast('Thanks — reported'); onDone(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      </SheetButtons>
    </View>
  );
}

export function BlockSheet({ author, onDone, onClose }: { author: Author; onDone: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  return (
    <View>
      <Why>{`You won’t see questions or answers from ${author.name}, and they can’t notify you. They aren’t told. Undo it any time in Community → Account.`}</Why>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow kind="danger" icon="block" title={`Block ${author.name}`} busy={busy} onPress={async () => {
          setBusy(true); setError('');
          try { await blockUser(author.id); onClose(); toast(`${author.name} blocked`); onDone(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      </SheetButtons>
    </View>
  );
}

export function ContactSheet({ onClose }: { onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => { getRules().then((r) => setEmail(r.contact)).catch(() => {}); }, []);
  return (
    <View>
      <Why>Tell the moderators about a problem — abusive content, a scam, or a question about your account. To report one post, use its ••• menu instead.</Why>
      {email ? <Hint>{`Or email ${email}.`}</Hint> : null}
      <Field label="Message" value={msg} onChangeText={setMsg} maxLength={1000} multiline />
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow title="Send" disabled={msg.trim().length < 5} busy={busy} onPress={async () => {
          setBusy(true); setError('');
          try { await contactModerators(msg.trim()); onClose(); toast('Sent to the moderators'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      </SheetButtons>
    </View>
  );
}

// ---------- account screen ----------
function NameSheet({ current, onClose }: { current: string; onClose: () => void }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const local = nameProblem(name);
  return (
    <View>
      <Why>This is the only thing other people see. Don’t use your real full name.</Why>
      <Field label="Display name" value={name} onChangeText={setName} maxLength={24} autoCapitalize="words" error={name !== current && local ? local : error} />
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow title="Save" disabled={!!local || name.trim() === current} busy={busy} onPress={async () => {
          setBusy(true); setError('');
          try { await updateMe({ name: name.trim() }); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      </SheetButtons>
    </View>
  );
}

function DeleteSheet({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  return (
    <View>
      <Why>This deletes your community account and every question, answer and vote you made. It can’t be undone. Your family’s documents on this phone are not affected.</Why>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow kind="danger" icon="trash" title="Delete account" busy={busy} onPress={async () => {
          setBusy(true); setError('');
          try { await deleteAccount(); onClose(); toast('Community account deleted'); back(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      </SheetButtons>
    </View>
  );
}

export function MyPostRow({ p }: { p: PostSummary }) {
  return <Row title={p.title} titleStyle={font.callout} onPress={() => go(`/community/post/${p.id}`)}
    subtitle={`${p.hidden ? 'Hidden while a moderator reviews it · ' : ''}${p.answers} answer${p.answers === 1 ? '' : 's'} · ${p.score} upvote${p.score === 1 ? '' : 's'} · ${timeAgo(p.createdAt)}`} />;
}

export function CommunityAccountScreen() {
  const { user, ready } = useCommunityUser();
  const sheet = useSheet();
  const toast = useToast();
  const [mine, setMine] = useState<PostSummary[] | null>(null);
  const [blocked, setBlocked] = useState<Author[]>([]);
  const [notify, setNotify] = useState(false);
  const tour = useTour('communityAccount', undefined, { auto: !!user });
  const load = useCallback(() => {
    if (!user) return;
    getMine().then((r) => setMine(r.posts)).catch(() => setMine([]));
    getBlocks().then((r) => setBlocked(r.blocked)).catch(() => {});
  }, [user?.id]);
  useEffect(load, [load]);
  useEffect(() => { setNotify(!!user?.notify); }, [user?.notify]);

  if (!ready) return <Screen nav={{ title: 'Account', back: 'Community', onBack: back }}><Spinner /></Screen>;
  if (!user) {
    return (
      <Screen nav={{ title: 'Account', back: 'Community', onBack: back }}>
        <EmptyState icon="user" title="You’re reading as a guest" body="Sign in with Apple to ask, answer and upvote. Others only see a made-up name." action={{ title: 'Join the community', onPress: () => sheet.open('Join the community', <JoinSheet onReady={() => {}} onClose={sheet.close} />) }} />
        <Group><Row icon="book" title="Community rules" onPress={() => go('/community/rules')} /><Row icon="chat" title="Contact moderators" chevron={false} onPress={() => sheet.open('Contact moderators', <ContactSheet onClose={sheet.close} />)} /></Group>
      </Screen>
    );
  }
  return (
    <Screen tour={tour} nav={{ title: 'Account', back: 'Community', onBack: back }}>
      {user.banned ? <Note tone="red">This account can’t post because it broke the community rules. You can still read, and delete the account below.</Note> : null}
      <SectionHeader>You in Community</SectionHeader>
      <Group>
        <TourTarget id="name"><Row icon="user" title={user.name} subtitle="Display name — tap to change" onPress={() => sheet.open('Display name', <NameSheet current={user.name} onClose={sheet.close} />)} /></TourTarget>
        <Row icon="bell" title="Notify me of answers" subtitle="One notification when someone answers your question" trailing={<Switch value={notify} label="Notify me of answers" onValueChange={async (on) => {
          setNotify(on);
          if (on) { const ok = await enableAnswerPush(true); if (!ok) { setNotify(false); toast('Turn on notifications for Immigration Wallet in iOS Settings'); } }
          else await disableAnswerPush();
        }} />} />
      </Group>
      <SectionHeader>My questions</SectionHeader>
      <TourTarget id="mine">{mine === null ? <Spinner /> : mine.length ? <Group>{mine.map((p) => <MyPostRow key={p.id} p={p} />)}</Group> : <Card><T tone="text2" style={font.sub}>You haven’t asked anything yet.</T></Card>}</TourTarget>
      {blocked.length ? (
        <>
          <SectionHeader>Blocked</SectionHeader>
          <Group>{blocked.map((b) => <Row key={b.id} icon="block" title={b.name} trailing={<LinkButton title="Unblock" onPress={async () => { try { setBlocked((await unblockUser(b.id)).blocked); toast(`${b.name} unblocked`); } catch (e: any) { toast(e.message); } }} />} />)}</Group>
        </>
      ) : null}
      <SectionHeader>Help</SectionHeader>
      <Group>
        <Row icon="book" title="Community rules" onPress={() => go('/community/rules')} />
        <Row icon="help" title="How the community works" onPress={() => go('/help/community')} />
        <Row icon="chat" title="Contact moderators" chevron={false} onPress={() => sheet.open('Contact moderators', <ContactSheet onClose={sheet.close} />)} />
      </Group>
      <SectionHeader>Account</SectionHeader>
      <Group>
        <Row icon="lock" title="Sign out" chevron={false} onPress={async () => { await signOut(); toast('Signed out'); back(); }} />
        <TourTarget id="delete"><Row icon="trash" iconTone="red" title="Delete account" titleTone="red" chevron={false} onPress={() => sheet.open('Delete your community account?', <DeleteSheet onClose={sheet.close} />)} /></TourTarget>
      </Group>
      <Hint center style={{ marginTop: 14 }}>{`Signed in with ${user.provider === 'google' ? 'Google' : 'Apple'} · member since ${timeAgo(user.createdAt)}. Your email is never stored or shown.`}</Hint>
    </Screen>
  );
}

export function CommunityRulesScreen() {
  const sheet = useSheet();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { getRules().then((r) => setEmail(r.contact)).catch(() => {}); }, []);
  return (
    <Screen nav={{ title: 'Community rules', back: 'Back', onBack: back }}>
      <Why>Community is for people sharing real experience with US immigration paperwork. These rules keep it useful and safe.</Why>
      <Card style={{ marginTop: 14 }}><RulesList /></Card>
      <Note tone="amber">{COMMUNITY_DISCLAIMER}</Note>
      <SectionHeader>Moderation</SectionHeader>
      <Card>
        <T style={font.sub}>Every question and answer has a ••• menu with Report and Block. Content reported by several people is hidden until a moderator reviews it. Content that breaks the rules is removed and the account is banned. We act on reports within 24 hours.</T>
        {email ? <T tone="text2" style={[font.foot, { marginTop: 8 }]}>{`Moderators: ${email}`}</T> : null}
      </Card>
      <Button block kind="tint" icon="chat" title="Contact moderators" onPress={() => sheet.open('Contact moderators', <ContactSheet onClose={sheet.close} />)} />
    </Screen>
  );
}
void Icon;
