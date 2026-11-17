import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { setCurrentChat, showList, useLayout } from '@/lib/layout';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { collapsed } = useLayout();
  useEffect(() => { setCurrentChat(id!); }, [id]);
  // One column (iPhone / Duo closed): a back button returns to the list. Side by side: the list is already there.
  return <ChatView key={id} id={id!} onBack={collapsed ? () => { setCurrentChat(null); showList(); } : undefined} />;
}
