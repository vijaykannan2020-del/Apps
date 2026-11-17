// Left column of the split view: the chat list with All / WhatsApp / Instagram / Messenger, and Accounts.
import { useRef } from 'react';
import { View } from 'react-native';
import { setSidebarRight, useLayout, setListTab } from '@/lib/layout';
import { ChatList } from '@/components/ChatList';

export function Sidebar() {
  const { tab } = useLayout();
  const ref = useRef<any>(null);
  const measure = () => ref.current?.measureInWindow((x: number, _y: number, w: number) => setSidebarRight(x + w));
  return (
    <View ref={ref} style={{ flex: 1 }} onLayout={measure}>
      <ChatList tab={tab} onTab={k => setListTab(k as any)} />
    </View>
  );
}
