import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { useWide, setSelected } from '@/lib/layout';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useWide();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));
  // Unfolding the iPhone Duo while a chat is open: go back to list + chat side by side, same chat selected.
  useEffect(() => { if (wide && id) { setSelected(id); router.dismissTo('/inbox'); } }, [wide]);
  return <ChatView id={id!} onBack={back} />;
}
