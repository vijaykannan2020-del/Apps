// Community account: the join sheet (Sign in with Apple, or Google once it is set up → accept the rules),
// the "Get notified" ask, report / block sheets (posts, comments and profiles), contact moderators, and
// the Account screen (avatar, display name, visa flair, karma, saved posts, notifications, blocked
// people, sign out, Delete account — Apple 5.1.1(v)).
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { AVATARS, COMMUNITY_DISCLAIMER, COMMUNITY_RULES, FLAIRS, REPORT_REASONS, RULES_VERSION, fmtCount, joined, nameProblem, type PastelName } from '../core/community';
import {
  blockUser, contactModerators, deleteAccount, getBlocks, getRules, refreshMe, report, signOut, unblockUser, updateMe, useCommunityUser,
  type Author, type CommunityUser,
} from '../data/communityApi';
import { androidGoogleClient, appleModule, appleSupport, disableAnswerPush, enableAnswerPush, finishGoogle, googleModule, googleSupport, signInWithApple, signInWithGoogleNative, type AppleSupport } from '../data/communityAuth';
import { asyncKV } from '../native/asyncKV';
import { Button, Card, ChipToggle, Chips, EmptyState, Field, Group, Hint, LinkButton, MIN_TOUCH, Note, Option, Row, Screen, SectionHeader, SheetButtons, Spinner, Switch, T, Why, font, useSheet, useTheme, useToast, TourButton, TourScope, TourTarget, useSheetTour, useTour } from '../ui';
import { back, go } from './common';
import { CAvatar, TagChip } from './communityUi';

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

type GoogleCfg = { iosClientId: string; webClientId?: string; redirectUri?: string };
/** Shown beside Sign in with Apple only when googleSupport() says this build can finish the Google flow (see GOOGLE.md). */
function GoogleButton({ cfg, setError }: { cfg: GoogleCfg; setError: (s: string) => void }) {
  const t = useTheme();
  const G = googleModule();
  const [req, res, prompt] = G.useIdTokenAuthRequest({ iosClientId: cfg.iosClientId, webClientId: cfg.webClientId, redirectUri: cfg.redirectUri, scopes: ['openid'] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!res) return;
    if (res.type === 'error') { setError('Google sign-in didn’t finish. Try again.'); return; }
    if (res.type !== 'success') return;
    const idToken = res.params?.id_token || res.authentication?.idToken;
    if (!idToken) { setError('Google didn’t return a sign-in token. Try again.'); return; }
    setBusy(true);
    finishGoogle(idToken).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [res]);
  return (
    <Pressable onPress={() => { setError(''); prompt(); }} disabled={!req || busy} accessibilityRole="button" accessibilityLabel="Sign in with Google" accessibilityState={{ disabled: !req || busy }}
      style={({ pressed }) => ({ height: 50, width: '100%', marginTop: 10, borderRadius: 14, backgroundColor: t.dark ? t.primary : t.card, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !req || busy ? 0.5 : pressed ? 0.8 : 1 })}>
      <Text allowFontScaling={false} style={{ color: '#4285F4', fontSize: 20, fontWeight: '700' }}>G</Text>
      <Text style={{ color: t.dark ? t.onPrimary : t.text, fontSize: 19, fontWeight: '600' }}>Sign in with Google</Text>
    </Pressable>
  );
}

/** Android: Google's own account picker (no browser), then the same server sign-in as iOS. */
function NativeGoogleButton({ webClientId, setError }: { webClientId: string; setError: (s: string) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable onPress={async () => { setError(''); setBusy(true); try { await signInWithGoogleNative(webClientId); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} disabled={busy} accessibilityRole="button" accessibilityLabel="Sign in with Google" accessibilityState={{ disabled: busy }}
      style={({ pressed }) => ({ height: 50, width: '100%', marginTop: 10, borderRadius: 14, backgroundColor: t.dark ? t.primary : t.card, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.5 : pressed ? 0.8 : 1 })}>
      <Text allowFontScaling={false} style={{ color: '#4285F4', fontSize: 20, fontWeight: '700' }}>G</Text>
      <Text style={{ color: t.dark ? t.onPrimary : t.text, fontSize: 19, fontWeight: '600' }}>Sign in with Google</Text>
    </Pressable>
  );
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
  const [google, setGoogle] = useState<GoogleCfg | null>(null);
  const tour = useSheetTour('communitySignIn', undefined, { auto: false });
  useEffect(() => { appleSupport().then(setSupport); googleSupport().then(setGoogle).catch(() => {}); }, []);
  const androidGoogle = androidGoogleClient();
  const showGoogle = !!google || !!androidGoogle;
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><View style={{ flex: 1 }}><Why>Reading is open to everyone. To post, comment or vote, sign in — other people only see a made-up display name you can change. We never see or show your email.</Why></View><TourButton /></View>
      <Hint>{COMMUNITY_DISCLAIMER}</Hint>
      {support === null ? <View style={{ marginTop: 18 }}><Spinner /></View> : null}
      {support === 'update' ? <Note tone="amber">Update the app from the App Store to join the community. You can keep reading in this version.</Note> : null}
      {support === 'unsupported' && !showGoogle ? <Note tone="grey">{Platform.OS === 'android' ? 'Google sign-in is coming to Android soon. You can keep reading.' : 'Sign in with Apple isn’t available on this device. You can keep reading.'}</Note> : null}
      {support === 'ok' ? <TourTarget id="apple"><AppleButton busy={busy} onPress={async () => {
        setBusy(true); setError('');
        try { await signInWithApple(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }} /></TourTarget> : null}
      {google ? <GoogleButton cfg={google} setError={setError} /> : null}
      {androidGoogle ? <NativeGoogleButton webClientId={androidGoogle} setError={setError} /> : null}
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
  open('Get notified of replies', <NotifySheet onClose={close} />);
}
function NotifySheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  return (
    <View>
      <Why>We’ll notify you when someone replies to you, and when a post or comment of yours reaches an upvote milestone. Nothing else, and you can turn it off in Community → Account.</Why>
      <SheetButtons>
        <Button kind="ghost" title="Not now" onPress={onClose} />
        <Button grow icon="bell" title="Notify me" onPress={async () => { const ok = await enableAnswerPush(true); onClose(); toast(ok ? 'You’ll be notified of replies' : 'Notifications are off in iOS Settings'); }} />
      </SheetButtons>
    </View>
  );
}

// ---------- report / block / contact ----------
export function ReportSheet({ kind, id, onDone, onClose }: { kind: 'post' | 'comment' | 'user'; id: string; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  return (
    <View>
      <Why>{kind === 'user' ? 'Why are you reporting this profile? Moderators review reports within 24 hours. To stop seeing this person, block them too.' : `Why are you reporting this ${kind}? Moderators review reports within 24 hours. You won’t see it again.`}</Why>
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
      <Why>{`You won’t see posts or comments from ${author.name}, and they can’t notify you. They aren’t told. Undo it any time in Community → Account.`}</Why>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow kind="danger" icon="block" title={`Block ${author.name}`} busy={busy} onPress={async () => {
          setBusy(true); setError('');
          try { await blockUser(String(author.id)); onClose(); toast(`${author.name} blocked`); onDone(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
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
      <Why>This deletes your community account, votes, saved posts and notifications. Posts and comments nobody replied to are removed. Where others replied, your name and words are replaced with [deleted] so their thread still makes sense. It can’t be undone. Your family’s documents on this phone are not affected.</Why>
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

/** Pick a look: your initials on a pastel circle, or one of the 24 built-in avatars. No photo uploads (moderation). */
function AvatarSheet({ user, onClose }: { user: CommunityUser; onClose: () => void }) {
  const t = useTheme();
  const [pick, setPick] = useState<string | null>(user.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cell = (id: string | null, label: string) => (
    <Pressable key={id ?? 'initials'} onPress={() => setPick(id)} accessibilityRole="radio" accessibilityState={{ checked: pick === id }} accessibilityLabel={label}
      style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: pick === id ? t.text : 'transparent' }}>
      <CAvatar a={{ ...user, avatar: id }} size={48} />
    </Pressable>
  );
  return (
    <View>
      <Why>Shown next to your posts and comments. Photos aren’t supported, so nobody can upload anything unsafe.</Why>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14, justifyContent: 'center' }}>
        {cell(null, 'Your initials')}
        {AVATARS.map((a) => cell(a.id, a.name))}
      </View>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow title="Save" disabled={pick === (user.avatar ?? null)} busy={busy} onPress={async () => { setBusy(true); setError(''); try { await updateMe({ avatar: pick }); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      </SheetButtons>
    </View>
  );
}

function FlairSheet({ user, onClose }: { user: CommunityUser; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(user.flair ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <View>
      <Why>Optional. A small label next to your name, such as L-1A, so people know which experience you’re speaking from. Everyone can see it.</Why>
      <Chips>
        <ChipToggle text="None" on={pick === null} onPress={() => setPick(null)} />
        {FLAIRS.map((f) => <ChipToggle key={f} text={f} on={pick === f} onPress={() => setPick(f)} />)}
      </Chips>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow title="Save" disabled={pick === (user.flair ?? null)} busy={busy} onPress={async () => { setBusy(true); setError(''); try { await updateMe({ flair: pick }); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      </SheetButtons>
    </View>
  );
}

/** Karma · posts · comments */
export function StatRow({ karma, posts, comments }: { karma: number; posts: number; comments: number }) {
  const t = useTheme();
  const cell = (n: number, label: string, pastel: PastelName) => (
    <View accessible accessibilityLabel={`${n} ${label}`} style={{ flex: 1, backgroundColor: t.pastel[pastel], borderRadius: 22, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>{fmtCount(n)}</Text>
      <Text style={{ color: t.ink, fontSize: 12.5, fontWeight: '600', opacity: 0.85 }}>{label}</Text>
    </View>
  );
  return <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>{cell(karma, 'karma', 'sage')}{cell(posts, posts === 1 ? 'post' : 'posts', 'blush')}{cell(comments, comments === 1 ? 'comment' : 'comments', 'butter')}</View>;
}

/** Big avatar, name, flair and join date — the top of the Account screen and of public profiles. */
export function ProfileHeader({ a, createdAt, onAvatar }: { a: { id: string | null; name: string; avatar?: string | null; flair?: string | null }; createdAt: string; onAvatar?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      {onAvatar ? <Pressable onPress={onAvatar} accessibilityRole="button" accessibilityLabel="Change avatar" style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH }}><CAvatar a={a} size={76} /></Pressable> : <CAvatar a={a} size={76} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T a11y="header" style={font.title2}>{a.name}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {a.flair ? <TagChip text={a.flair} pastel="sky" /> : null}
          <T tone="text2" style={font.caption}>{joined(createdAt)}</T>
        </View>
      </View>
    </View>
  );
}

export function CommunityAccountScreen() {
  const { user, ready } = useCommunityUser();
  const sheet = useSheet();
  const toast = useToast();
  const [blocked, setBlocked] = useState<Author[]>([]);
  const [notify, setNotify] = useState(false);
  const tour = useTour('communityAccount', undefined, { auto: false });
  const load = useCallback(() => {
    if (!user) return;
    refreshMe().catch(() => {});
    getBlocks().then((r) => setBlocked(r.blocked)).catch(() => {});
  }, [user?.id]);
  useEffect(load, [load]);
  useEffect(() => { setNotify(!!user?.notify); }, [user?.notify]);

  if (!ready) return <Screen nav={{ title: 'Account', back: 'Community', onBack: back }}><Spinner /></Screen>;
  if (!user) {
    return (
      <Screen nav={{ title: 'Account', back: 'Community', onBack: back }}>
        <EmptyState icon="user" title="You’re reading as a guest" body="Sign in to post, comment, vote and save. Others only see a made-up name." action={{ title: 'Join the community', onPress: () => sheet.open('Join the community', <JoinSheet onReady={() => {}} onClose={sheet.close} />) }} />
        <Group><Row icon="book" title="Community rules" onPress={() => go('/community/rules')} /><Row icon="chat" title="Contact moderators" chevron={false} onPress={() => sheet.open('Contact moderators', <ContactSheet onClose={sheet.close} />)} /></Group>
      </Screen>
    );
  }
  const avatarSheet = () => sheet.open('Choose an avatar', <AvatarSheet user={user} onClose={sheet.close} />);
  return (
    <Screen tour={tour} nav={{ title: 'Account', back: 'Community', onBack: back }}>
      {user.banned ? <Note tone="red" style={{ marginBottom: 12 }}>This account can’t post because it broke the community rules. You can still read, and delete the account below.</Note> : null}
      <ProfileHeader a={user} createdAt={user.createdAt} onAvatar={avatarSheet} />
      <StatRow karma={user.karma ?? 0} posts={user.posts ?? 0} comments={user.comments ?? 0} />
      <Hint>Karma is the upvotes on your posts and comments, minus downvotes.</Hint>
      <SectionHeader>How others see you</SectionHeader>
      <Group>
        <TourTarget id="avatar"><Row icon="user" title="Avatar" subtitle={user.avatar ? AVATARS.find((a) => a.id === user.avatar)?.name ?? 'Built-in avatar' : 'Your initials'} onPress={avatarSheet} /></TourTarget>
        <TourTarget id="name"><Row icon="edit" title="Display name" subtitle={user.name} onPress={() => sheet.open('Display name', <NameSheet current={user.name} onClose={sheet.close} />)} /></TourTarget>
        <Row icon="idcard" title="Visa flair" subtitle={user.flair ?? 'None — optional'} onPress={() => sheet.open('Visa flair', <FlairSheet user={user} onClose={sheet.close} />)} />
      </Group>
      <SectionHeader>Your activity</SectionHeader>
      <TourTarget id="mine">
        <Group>
          <Row icon="users" title="My profile" subtitle="Your posts and comments, as others see them" onPress={() => go(`/community/user/${user.id}`)} />
          <Row icon="bookmark" title="Saved posts" onPress={() => go('/community/saved')} />
          <Row icon="bell" title="Notifications" value={user.unread ? `${user.unread} new` : undefined} onPress={() => go('/community/notifications')} />
        </Group>
      </TourTarget>
      <Group style={{ marginTop: 12 }}>
        <Row icon="bell" title="Push notifications" subtitle="Replies to you and upvote milestones" trailing={<Switch value={notify} label="Push notifications for replies and upvote milestones" onValueChange={async (on) => {
          setNotify(on);
          if (on) { const ok = await enableAnswerPush(true); if (!ok) { setNotify(false); toast('Turn on notifications for Immigration Wallet in iOS Settings'); } }
          else await disableAnswerPush();
        }} />} />
      </Group>
      {blocked.length ? (
        <>
          <SectionHeader>Blocked</SectionHeader>
          <Group>{blocked.map((b) => <Row key={b.id} icon="block" title={b.name} trailing={<LinkButton title="Unblock" onPress={async () => { try { setBlocked((await unblockUser(String(b.id))).blocked); toast(`${b.name} unblocked`); } catch (e: any) { toast(e.message); } }} />} />)}</Group>
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
      <Hint center style={{ marginTop: 14 }}>{`Signed in with ${user.provider === 'google' ? 'Google' : 'Apple'}. Your email is never stored or shown.`}</Hint>
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
        <T style={font.sub}>Every post, comment and profile has a ••• menu with Report and Block. Content reported by several people is hidden until a moderator reviews it. Content that breaks the rules is removed and the account is banned. We act on reports within 24 hours.</T>
        {email ? <T tone="text2" style={[font.foot, { marginTop: 8 }]}>{`Moderators: ${email}`}</T> : null}
      </Card>
      <Button block kind="tint" icon="chat" title="Contact moderators" onPress={() => sheet.open('Contact moderators', <ContactSheet onClose={sheet.close} />)} />
    </Screen>
  );
}
