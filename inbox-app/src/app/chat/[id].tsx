import { router, useLocalSearchParams } from 'expo-router';
import { ChatView } from '@/components/ChatView';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatView id={id!} onBack={() => (router.canGoBack() ? router.back() : router.replace('/chats'))} />;
}
