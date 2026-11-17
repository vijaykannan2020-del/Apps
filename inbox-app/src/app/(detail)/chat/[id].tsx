import { useEffect } from 'react';
import { Alert, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { DuoBar } from '@/components/DuoBar';
import { setCurrentChat, showList, useLayout, useStatusGutter } from '@/lib/layout';
import { S, isPrivateRoom } from '@/lib/matrix';
import { startCall, callsAvailable } from '@/lib/calls';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { collapsed, target } = useLayout(); const t = useTheme();
  // Duo front screen: iOS shows its own back button under the clock, so don't add a second one.
  const sysBack = useStatusGutter() > 0;
  useEffect(() => { setCurrentChat(id!); }, [id]);
  const r = S.rooms.get(id!);
  const canCall = !!r && isPrivateRoom(r) && callsAvailable;
  const call = (video: boolean) => r && startCall(r, video).catch((e: any) => Alert.alert('Can’t call', e.message || ''));
  if (collapsed && target && target !== 'chat:' + id) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
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
      <ChatView key={id} id={id!} nativeActions={false} onBack={collapsed && !sysBack ? () => { setCurrentChat(null); showList(); } : undefined} />
    </>
  );
}
