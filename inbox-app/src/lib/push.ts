// Native iPhone notifications: Apple device token -> Matrix pusher -> your pushgw -> Apple Push.
import { Platform, AppState } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { S, api, visibleRooms, isUnread, isArchived } from '@/lib/matrix';
import { openChat } from '@/lib/layout';

export const IOS_APP = 'com.vijaykannan.myinbox';
const PUSH_URL = 'http://pushgw:8080/_matrix/push/v1/notify';
/** Expo Go can't receive real pushes — only the TestFlight app can. */
export const pushCapable = Platform.OS === 'ios' && Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// While the app is open, our own in-app banner shows new messages — don't double up.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export const apnsApi = {
  status: () => api('GET', '/push/apns/status') as Promise<{ configured: boolean; keyId: string | null }>,
  config: (keyId: string, teamId: string, key: string) => api('POST', '/push/apns/config', { keyId, teamId, key }),
  test: (token: string) => api('POST', '/push/apns/test', { token }),
};

let token: string | null = null;
export const deviceToken = () => token;

/** Ask permission (first time), get this iPhone's push token and register it with your server. */
export async function enableNativePush(ask = true): Promise<'on' | 'denied' | 'unsupported' | 'error'> {
  if (!pushCapable || !S.token) return 'unsupported';
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } })).status;
    if (status !== 'granted') return 'denied';
    token = (await Notifications.getDevicePushTokenAsync()).data as string;
    await api('POST', '/_matrix/client/v3/pushers/set', {
      kind: 'http', app_id: IOS_APP, pushkey: token, app_display_name: 'Inbox', device_display_name: Device.deviceName || 'iPhone',
      lang: 'en', data: { url: PUSH_URL }, append: false,
    });
    // The web Inbox on this iPhone would ring too — switch its notifications off so you get each message once.
    try {
      const { pushers } = await api('GET', '/_matrix/client/v3/pushers');
      for (const p of pushers || []) if (p.app_id === 'inbox.web' && p.device_display_name === 'iPhone')
        await api('POST', '/_matrix/client/v3/pushers/set', { kind: null, app_id: p.app_id, pushkey: p.pushkey });
    } catch {}
    await AsyncStorage.setItem('inbox.push', 'on');
    return 'on';
  } catch (e) { console.warn('push', e); return 'error'; }
}

export async function disableNativePush() {
  if (token) { try { await api('POST', '/_matrix/client/v3/pushers/set', { kind: null, app_id: IOS_APP, pushkey: token }); } catch {} }
  await AsyncStorage.setItem('inbox.push', 'off');
}
export async function pushWanted() { return (await AsyncStorage.getItem('inbox.push')) !== 'off'; }

export function updateBadge() {
  if (!pushCapable) return;
  const n = visibleRooms().filter(r => isUnread(r) && !isArchived(r) && !S.muted.has(r.id)).length;
  Notifications.setBadgeCountAsync(n).catch(() => {});
}

let started = false;
/** Call once after login: re-registers on every launch and opens the chat when a notification is tapped. */
export function startPush() {
  if (started || !pushCapable) return; started = true;
  pushWanted().then(w => { if (w) enableNativePush(true); });
  // The chat id can sit in a few places depending on how iOS hands the push over.
  const roomOf = (r: Notifications.NotificationResponse | null): string | undefined => {
    if (!r) return;
    const req: any = r.notification.request;
    const d: any = req.content?.data || {};
    const p: any = req.trigger?.payload || {};
    return d.room_id || d.body?.room_id || p.room_id || p.body?.room_id;
  };
  let lastHandled = '';
  const go = (r: Notifications.NotificationResponse | null, coldStart = false) => {
    const room = roomOf(r);
    const key = r?.notification.request.identifier || '';
    if (!room || key === lastHandled) return;
    lastHandled = key;
    // On a cold start the screens mount a moment after this runs — wait, then open (and wait for sync if needed).
    let tries = 0;
    const attempt = () => {
      if (S.rooms.has(room)) { openChat(room); return; }
      if (++tries < 30) setTimeout(attempt, 300);
    };
    setTimeout(attempt, coldStart ? 900 : 0);
  };
  Notifications.getLastNotificationResponseAsync().then(r => go(r, true)).catch(() => {});
  Notifications.addNotificationResponseReceivedListener(r => go(r));
  AppState.addEventListener('change', s => { if (s !== 'active') updateBadge(); else Notifications.dismissAllNotificationsAsync().catch(() => {}); });
}
