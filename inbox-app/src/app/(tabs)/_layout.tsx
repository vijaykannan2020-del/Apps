import { useMemo } from 'react';
import { NativeTabs } from 'expo-router/native-tabs';
import { Redirect } from 'expo-router';
import { S, visibleRooms, netOf, isUnread, isArchived } from '@/lib/matrix';
import { useStore, useTheme } from '@/lib/theme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useWide } from '@/lib/layout';

const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : String(n)) : undefined);

export default function TabsLayout() {
  const v = useStore(); const t = useTheme(); const wide = useWide();
  const c = useMemo(() => {
    const out: Record<string, number> = { all: 0, whatsapp: 0, instagram: 0, messenger: 0 };
    for (const r of visibleRooms()) if (isUnread(r) && !isArchived(r) && !S.muted.has(r.id)) { out.all++; const n = netOf(r); if (n && n in out) out[n]++; }
    return out;
  }, [v]);
  if (!S.token) return <Redirect href="/login" />;
  return (
    <NativeTabs hidden minimizeBehavior="onScrollDown" tintColor={t.dark ? '#FFFFFF' : '#000000'}>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon sf={{ default: 'tray', selected: 'tray.fill' }} />
        <NativeTabs.Trigger.Label>All</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!c.all}>{badge(c.all)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="whatsapp">
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="logo-whatsapp" />} />
        <NativeTabs.Trigger.Label>WhatsApp</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!c.whatsapp}>{badge(c.whatsapp)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="instagram">
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="logo-instagram" />} />
        <NativeTabs.Trigger.Label>Instagram</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!c.instagram}>{badge(c.instagram)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messenger">
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name="facebook-messenger" />} />
        <NativeTabs.Trigger.Label>Messenger</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!c.messenger}>{badge(c.messenger)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="accounts">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>Accounts</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
