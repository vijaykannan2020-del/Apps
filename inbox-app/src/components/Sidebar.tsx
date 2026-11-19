// Left column of the split view: the chat list with All / WhatsApp / Instagram / Messenger, and Accounts.
import { useRef } from 'react';
import { View, Dimensions } from 'react-native';
import { setSidebarRight, useLayout, setListTab, setCollapsed } from '@/lib/layout';
import { ChatList } from '@/components/ChatList';

export function Sidebar({ standalone = false }: { standalone?: boolean }) {
  const { tab } = useLayout();
  const ref = useRef<any>(null);
  // Work out one-column vs side by side from the real layout: iOS only reports changes, not the starting state
  // (opening the app already unfolded sent nothing, so it was wrongly treated as folded).
  const measure = () => !standalone && ref.current?.measureInWindow((x: number, _y: number, w: number) => {
    setSidebarRight(x + w);
    if (w > 0) setCollapsed(w >= Dimensions.get('window').width - 2);
  });
  return (
    <View ref={ref} style={{ flex: 1 }} onLayout={() => { measure(); setTimeout(measure, 300); }}>
      <ChatList tab={tab} onTab={k => setListTab(k as any)} />
    </View>
  );
}
