import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { DuoBar } from '@/components/DuoBar';
import { setCurrentChat, showList, useLayout } from '@/lib/layout';
import { S, isPrivateRoom } from '@/lib/matrix';
import { startCall, callsAvailable } from '@/lib/calls';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { collapsed } = useLayout();
  useEffect(() => { setCurrentChat(id!); }, [id]);
  const r = S.rooms.get(id!);
  const canCall = !!r && isPrivateRoom(r) && callsAvailable;
  const call = (video: boolean) => r && startCall(r, video).catch((e: any) => Alert.alert('Can’t call', e.message || ''));
  return (
    <>
      {/* Duo open: chat actions as Apple's native header buttons → iOS puts them in the Duo's side bar (like WhatsApp). */}
      {false && !collapsed && (
        <Stack.Toolbar placement="right">
          {canCall && <Stack.Toolbar.Button icon="video" accessibilityLabel="Video call" onPress={() => call(true)} />}
          {canCall && <Stack.Toolbar.Button icon="phone" accessibilityLabel="Voice call" onPress={() => call(false)} />}
          <Stack.Toolbar.Button icon="info.circle" accessibilityLabel="Chat info" onPress={() => router.push({ pathname: '/info/[id]', params: { id: id! } })} />
        </Stack.Toolbar>
      )}
      <DuoBar />
      {/* One column: a back button returns to the list; call buttons stay in the chat's own header (never top-right). */}
      <ChatView key={id} id={id!} nativeActions={false} onBack={collapsed ? () => { setCurrentChat(null); showList(); } : undefined} />
    </>
  );
}
