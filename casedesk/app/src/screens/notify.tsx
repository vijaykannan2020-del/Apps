// Notifications (v2.3): a short explanation first, then the iOS permission prompt — shown once,
// right after the first case or document is saved. Settings shows the state and links to iOS Settings.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFamily } from '../data/FamilyProvider';
import { askNotificationPermission, notificationPermission, openNotificationSettings } from '../native/reminders';
import { setupOpen } from '../core/onboarding';
import { useGuide } from './guide';
import { alertOn, newsTopicsText, permText, pushTopics, shouldAskNotifications, type AlertKind, type Perm } from '../core/notify';
import { router } from 'expo-router';
import { useCommunityUser } from '../data/communityApi';
import { disableAnswerPush, enableAnswerPush } from '../data/communityAuth';
import { sendTestPush } from '../data/pushAlerts';
import { Button, Group, Icon, Row, SheetButtons, Switch, T, TourTarget, Why, font, useSheet, useTheme, useToast, useTourActive } from '../ui';
import { OS_SETTINGS } from '../ui/platformWords';

/** Permission state, refreshed when the app comes back from iOS Settings. */
export function usePermission(): [Perm | null, () => void] {
  const [p, setP] = useState<Perm | null>(null);
  const refresh = useCallback(() => { notificationPermission().then(setP).catch(() => setP('unavailable')); }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);
  return [p, refresh];
}

export function NotifyExplainer({ onDone }: { onDone?: (granted: boolean) => void }) {
  const t = useTheme(); const s = useSheet(); const f = useFamily(); const toast = useToast();
  const items: [string, string, string][] = [
    ['clock', 'Case status changes', 'When a check on uscis.gov shows something new.'],
    ['cal', 'Before documents expire', 'Passport, I-94, approvals, EAD and green card — at the times you pick.'],
    ['list', 'New Visa Bulletin', 'Each month, so you know if your date moved.'],
    ['news', 'Important immigration news', 'USCIS and DOL updates for your visa types.'],
  ];
  const finish = async (ask: boolean) => {
    await f.actions.updateSettings({ notifAskedAt: new Date().toISOString() });
    s.close();
    if (!ask) { onDone?.(false); return; }
    const ok = await askNotificationPermission();
    toast(ok ? 'Alerts on' : 'Alerts off · you can turn them on in Settings');
    onDone?.(ok);
  };
  return (
    <View>
      <Why>Reminders are worked out on this phone. For news and the Visa Bulletin we keep only an anonymous phone code and the topics you follow — never names, dates or receipt numbers.</Why>
      <View style={{ gap: 14, marginTop: 16 }}>
        {items.map(([icon, title, sub]) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.pastel.sky, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={t.ink} /></View>
            <View style={{ flex: 1 }}><T style={font.headline}>{title}</T><T tone="text2" style={font.sub}>{sub}</T></View>
          </View>
        ))}
      </View>
      <T tone="text2" style={[font.caption, { marginTop: 14 }]}>iPhone asks next. You can change this any time in Settings.</T>
      <SheetButtons><Button kind="ghost" title="Not now" onPress={() => finish(false)} /><Button grow title="Turn on alerts" onPress={() => finish(true)} /></SheetButtons>
    </View>
  );
}

/** Mounted once (app/_layout): after the first case or document, show the explainer once. Not during the
 *  onboarding (v3.0), which has its own Alerts step. */
export function NotifyPrompt() {
  const f = useFamily(); const sheet = useSheet();
  const guide = useGuide();
  const touring = useTourActive() || guide.active;
  const [perm] = usePermission();
  const shown = useRef(false);
  const want = !!perm && f.ready && !!f.settings.setupDone && !setupOpen(f.settings) && shouldAskNotifications({ perm, settings: f.settings, docs: f.docs.length, cases: f.cases.length });
  useEffect(() => {
    if (!want || touring || shown.current) return;
    const timer = setTimeout(() => { shown.current = true; sheet.open('Get alerts?', <NotifyExplainer />); }, 1500);
    return () => clearTimeout(timer);
  }, [want, touring, sheet]);
  return null;
}

/** Settings → Notifications: permission state (+ iOS Settings link when denied) and what to alert. */
export function NotifyRows() {
  const f = useFamily(); const sheet = useSheet();
  const [perm, refresh] = usePermission();
  const txt = permText(perm ?? 'unavailable', OS_SETTINGS);
  const onPress = perm === 'denied' ? openNotificationSettings : perm === 'undetermined' ? () => sheet.open('Get alerts?', <NotifyExplainer onDone={refresh} />) : undefined;
  const toast = useToast();
  const cu = useCommunityUser();
  const [replies, setReplies] = useState(!!cu.user?.notify);
  useEffect(() => { setReplies(!!cu.user?.notify); }, [cu.user?.notify]);
  const topics = pushTopics(f.settings, f.people, f.records);
  const bulletinSub = topics.bulletin.categories.length ? `Once a month · how ${topics.bulletin.categories.join(', ')} moved` : 'Once a month';
  const isOn = (k: AlertKind | 'newsAll') => (k === 'newsAll' ? f.settings.alerts?.newsAll === true : alertOn(f.settings, k));
  const toggle = (k: AlertKind | 'newsAll', title: string, sub: string) => (
    <Row title={title} subtitle={sub} trailing={<Switch value={isOn(k)} label={title} onValueChange={(on) => f.actions.updateSettings({ alerts: { ...(f.settings.alerts ?? {}), [k]: on } })} />} />
  );
  return (
    <TourTarget id="notify">
      <Group>
        <Row icon="bell" title={`Notifications · ${perm ? txt.title : '…'}`} subtitle={perm ? txt.sub : 'Checking…'} onPress={onPress} chevron={!!onPress} />
        {perm === 'denied' ? <Row title={`Open ${OS_SETTINGS}`} titleTone="accent" chevron={false} onPress={openNotificationSettings} /> : null}
        {toggle('cases', 'Case status changes', 'When a check shows a new status')}
        {toggle('docs', 'Document expiry reminders', 'Before passports, I-94s, approvals and cards expire')}
        {toggle('bulletin', 'New Visa Bulletin', bulletinSub)}
        {toggle('news', 'Immigration news', `USCIS and DOL updates · ${newsTopicsText(topics)}`)}
        {alertOn(f.settings, 'news') ? toggle('newsAll', 'Every news update', 'Off: only important changes') : null}
        <Row title="Community replies" subtitle={cu.user ? 'Answers to your posts and comments' : 'Sign in to Community to get replies'}
          trailing={cu.user ? <Switch value={replies} label="Community replies" onValueChange={async (on) => {
            setReplies(on);
            if (on) { const ok = await enableAnswerPush(true); if (!ok) { setReplies(false); toast(`Turn on notifications for Immigration Wallet in ${OS_SETTINGS}`); } }
            else await disableAnswerPush();
          }} /> : undefined}
          onPress={cu.user ? undefined : () => router.push('/community/account' as any)} chevron={!cu.user} />
        {perm === 'granted' ? (
          <Row title="Send a test notification" subtitle="Arrives in a few seconds — you can lock the phone" chevron={false}
            onPress={async () => {
              toast('Sending…');
              const r = await sendTestPush();
              toast(r.ok ? 'Sent — it should arrive in a few seconds' : `Couldn’t send: ${r.error}`);
            }} />
        ) : null}
      </Group>
    </TourTarget>
  );
}
