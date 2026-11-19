// Notifications (v2.3): a short explanation first, then the iOS permission prompt — shown once,
// right after the first case or document is saved. Settings shows the state and links to iOS Settings.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFamily } from '../data/FamilyProvider';
import { askNotificationPermission, notificationPermission, openNotificationSettings } from '../native/reminders';
import { alertOn, permText, shouldAskNotifications, type AlertKind, type Perm } from '../core/notify';
import { Button, Group, Icon, Row, SheetButtons, Switch, T, TourTarget, Why, font, useSheet, useTheme, useToast, useTourActive } from '../ui';

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
      <Why>Alerts are worked out on this phone. Nothing about you is sent to us.</Why>
      <View style={{ gap: 14, marginTop: 16 }}>
        {items.map(([icon, title, sub]) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={t.inkAccent} /></View>
            <View style={{ flex: 1 }}><T style={font.headline}>{title}</T><T tone="text2" style={font.sub}>{sub}</T></View>
          </View>
        ))}
      </View>
      <T tone="text2" style={[font.caption, { marginTop: 14 }]}>iPhone asks next. You can change this any time in Settings.</T>
      <SheetButtons><Button kind="ghost" title="Not now" onPress={() => finish(false)} /><Button grow title="Turn on alerts" onPress={() => finish(true)} /></SheetButtons>
    </View>
  );
}

/** Mounted once (app/_layout): after the first case or document, show the explainer once. */
export function NotifyPrompt() {
  const f = useFamily(); const sheet = useSheet();
  const touring = useTourActive();
  const [perm] = usePermission();
  const shown = useRef(false);
  const want = !!perm && f.ready && shouldAskNotifications({ perm, settings: f.settings, docs: f.docs.length, cases: f.cases.length });
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
  const txt = permText(perm ?? 'unavailable');
  const onPress = perm === 'denied' ? openNotificationSettings : perm === 'undetermined' ? () => sheet.open('Get alerts?', <NotifyExplainer onDone={refresh} />) : undefined;
  const toggle = (k: AlertKind, title: string, sub: string) => (
    <Row title={title} subtitle={sub} trailing={<Switch value={alertOn(f.settings, k)} label={title} onValueChange={(on) => f.actions.updateSettings({ alerts: { ...(f.settings.alerts ?? {}), [k]: on } })} />} />
  );
  return (
    <TourTarget id="notify">
      <Group>
        <Row icon="bell" title={`Notifications · ${perm ? txt.title : '…'}`} subtitle={perm ? txt.sub : 'Checking…'} onPress={onPress} chevron={!!onPress} />
        {perm === 'denied' ? <Row title="Open iOS Settings" titleTone="accent" chevron={false} onPress={openNotificationSettings} /> : null}
        {toggle('cases', 'Case status changes', 'When a check shows a new status')}
        {toggle('docs', 'Document expiry reminders', 'Before passports, I-94s, approvals and cards expire')}
        {toggle('bulletin', 'New Visa Bulletin', 'Once a month')}
      </Group>
    </TourTarget>
  );
}
