// iPhone Duo open: All / WhatsApp / Instagram / Messenger / Accounts as Apple's native toolbar — iOS places it in
// the Duo's vertical side bar, like WhatsApp. On one-column screens (normal iPhones, Duo folded) it isn't shown;
// the glass bar at the bottom of the chat list is used there instead.
import { Stack } from 'expo-router';
import { useImage } from 'expo-image';
import { useLayout, setListTab, openDetail, ListTab } from '@/lib/layout';
import { usePathname } from 'expo-router';

const ENABLED = false;
export function DuoBar() {
  const { collapsed, tab } = useLayout();
  const path = usePathname();
  const all = useImage(require('../../assets/bar/all.png'));
  const wa = useImage(require('../../assets/bar/whatsapp.png'));
  const ig = useImage(require('../../assets/bar/instagram.png'));
  const fb = useImage(require('../../assets/bar/messenger.png'));
  const me = useImage(require('../../assets/bar/accounts.png'));
  // Off for now: Apple's toolbar buttons don't behave like a real tab bar (no sliding across, odd selection look).
  if (collapsed || !ENABLED) return null;
  const onAccounts = path === '/accounts';
  const pick = (k: ListTab) => setListTab(k);
  return (
    <Stack.Toolbar>
      <Stack.Toolbar.Button image={all} accessibilityLabel="All chats" selected={!onAccounts && tab === 'all'} onPress={() => pick('all')} />
      <Stack.Toolbar.Button image={wa} accessibilityLabel="WhatsApp" selected={!onAccounts && tab === 'whatsapp'} onPress={() => pick('whatsapp')} />
      <Stack.Toolbar.Button image={ig} accessibilityLabel="Instagram" selected={!onAccounts && tab === 'instagram'} onPress={() => pick('instagram')} />
      <Stack.Toolbar.Button image={fb} accessibilityLabel="Messenger" selected={!onAccounts && tab === 'messenger'} onPress={() => pick('messenger')} />
      <Stack.Toolbar.Button image={me} accessibilityLabel="Accounts" selected={onAccounts} onPress={() => openDetail('/accounts')} />
    </Stack.Toolbar>
  );
}
