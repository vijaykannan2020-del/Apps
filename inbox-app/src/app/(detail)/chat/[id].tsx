import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { DuoBar } from '@/components/DuoBar';
import { setCurrentChat, showList, useLayout, useStatusGutter } from '@/lib/layout';
import { S, isPrivateRoom } from '@/lib/matrix';
import { startCall, callsAvailable } from '@/lib/calls';
import { TargetScreen } from '@/components/TargetScreen';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatPage id={id!} />;
}

export function ChatPage({ id }: { id: string }) {
  const { collapsed, target } = useLayout();
  // Duo front screen: iOS shows its own back button under the clock, so don't add a second one.
  const sysBack = useStatusGutter() > 0;
  useEffect(() => { setCurrentChat(id!); }, [id]);
  const r = S.rooms.get(id!);
  const canCall = !!r && isPrivateRoom(r) && callsAvailable;
  const call = (video: boolean) => r && startCall(r, video).catch((e: any) => Alert.alert('Can’t call', e.message || ''));
  // Folded: iOS swaps this page in late — show what was just tapped instead of this (older) screen. See layout.ts.
  if (collapsed && target && target !== 'chat:' + id) return <TargetScreen />;
  return (
    <>
      {/* Duo open: tabs + call/video/info in Apple's glass side strip; the chat header then shows no call buttons. */}
      <DuoBar actions={{ onVideo: canCall ? () => call(true) : undefined, onCall: canCall ? () => call(false) : undefined, onInfo: () => router.push({ pathname: '/info/[id]', params: { id: id! } }) }} />
      {/* One column: a back button returns to the list; call buttons stay in the chat's own header (never top-right). */}
      <ChatView key={id} id={id!} nativeActions={!collapsed} onBack={collapsed && !sysBack ? () => { setCurrentChat(null); showList(); } : undefined} />
    </>
  );
}
