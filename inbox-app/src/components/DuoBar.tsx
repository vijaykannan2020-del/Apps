// iPhone Duo open: All / WhatsApp / Instagram / Messenger / Accounts, plus call / video / info when a chat is open, as
// Apple's native glass toolbar — iOS places it in the Duo's side strip. Icons are see-through glyphs tinted by iOS
// (before, the logos were drawn in their original black, which looked broken on the glass).
// One-column screens (normal iPhones, Duo folded) use the glass bar at the bottom of the chat list instead.
import { Stack, usePathname } from 'expo-router';
import { useImage } from 'expo-image';
import { useLayout, setListTab, openDetail, ListTab } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

export type DuoActions = { onVideo?: () => void; onCall?: () => void; onInfo?: () => void };

export function DuoBar({ actions }: { actions?: DuoActions }) {
  const { collapsed, tab } = useLayout();
  const t = useTheme();
  const path = usePathname();
  const all = useImage(require('../../assets/bar/all.png'));
  const wa = useImage(require('../../assets/bar/whatsapp.png'));
  const ig = useImage(require('../../assets/bar/instagram.png'));
  const fb = useImage(require('../../assets/bar/messenger.png'));
  const me = useImage(require('../../assets/bar/accounts.png'));
  if (collapsed) return null;
  const onAccounts = path === '/accounts';
  const on = '#0A84FF', off = t.ink;
  const tabBtn = (img: any, label: string, k: ListTab) => {
    const sel = !onAccounts && tab === k;
    return <Stack.Toolbar.Button image={img} iconRenderingMode="template" tintColor={sel ? on : off} accessibilityLabel={label} selected={sel} onPress={() => setListTab(k)} />;
  };
  return (
    <Stack.Toolbar>
      {tabBtn(all, 'All chats', 'all')}
      {tabBtn(wa, 'WhatsApp', 'whatsapp')}
      {tabBtn(ig, 'Instagram', 'instagram')}
      {tabBtn(fb, 'Messenger', 'messenger')}
      <Stack.Toolbar.Button image={me} iconRenderingMode="template" tintColor={onAccounts ? on : off} accessibilityLabel="Accounts" selected={onAccounts} onPress={() => openDetail('/accounts')} />
      {actions && <Stack.Toolbar.Spacer />}
      {actions?.onVideo && <Stack.Toolbar.Button icon="video" tintColor={off} accessibilityLabel="Video call" onPress={actions.onVideo} />}
      {actions?.onCall && <Stack.Toolbar.Button icon="phone" tintColor={off} accessibilityLabel="Voice call" onPress={actions.onCall} />}
      {actions?.onInfo && <Stack.Toolbar.Button icon="info.circle" tintColor={off} accessibilityLabel="Chat info" onPress={actions.onInfo} />}
    </Stack.Toolbar>
  );
}
