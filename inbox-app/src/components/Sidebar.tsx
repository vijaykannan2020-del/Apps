// Left column of the split view: the chat list with All / WhatsApp / Instagram / Messenger, and Accounts.
import { useState } from 'react';
import { ChatList } from '@/components/ChatList';

type Tab = 'all' | 'whatsapp' | 'instagram' | 'messenger';
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('all');
  return <ChatList tab={tab} onTab={k => setTab(k as Tab)} />;
}
