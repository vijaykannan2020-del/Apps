// Folded iPhone Duo: iOS only updates the right-hand page after it has slid in, so for a moment the previous screen is
// still on top. That screen renders whatever was just tapped instead (same content as the real screen that follows),
// so there's no flash of the old chat / Accounts and no blank frame.
import { View } from 'react-native';
import { useLayout } from '@/lib/layout';
import { useTheme } from '@/lib/theme';
import Accounts from '@/app/(detail)/accounts';
import { ChatPage } from '@/app/(detail)/chat/[id]';

export function TargetScreen() {
  const { target } = useLayout(); const t = useTheme();
  if (target === 'accounts') return <Accounts />;
  if (target?.startsWith('chat:')) return <ChatPage id={target.slice(5)} />;
  return <View style={{ flex: 1, backgroundColor: t.bg }} />;
}
