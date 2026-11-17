// Left column of the split view: the chat list with All / WhatsApp / Instagram / Messenger, and Accounts.
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { setSidebarRight } from '@/lib/layout';
import { ChatList } from '@/components/ChatList';

type Tab = 'all' | 'whatsapp' | 'instagram' | 'messenger';
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('all');
  const ref = useRef<any>(null);
  const measure = () => ref.current?.measureInWindow((x: number, _y: number, w: number) => setSidebarRight(x + w));
  return (
    <View ref={ref} style={{ flex: 1 }} onLayout={measure}>
      <ChatList tab={tab} onTab={k => setTab(k as Tab)} />
    </View>
  );
}
