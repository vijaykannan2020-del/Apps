// Shown in the right-hand column on the open iPhone Duo until a chat is picked.
import { useCallback } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { isCollapsed, showList, setCurrentChat, useLayout } from '@/lib/layout';
import { Ionicons } from '@expo/vector-icons';
import { DuoBar } from '@/components/DuoBar';
import { useTheme } from '@/lib/theme';

export default function NoChat() {
  const t = useTheme();
  // One-column screens (iPhone, Duo folded): an empty right-hand column means "go back to the list".
  useFocusEffect(useCallback(() => { setCurrentChat(null); if (isCollapsed()) showList(); }, []));
  const { collapsed } = useLayout();
  if (collapsed) return <View style={{ flex: 1, backgroundColor: t.bg }} />; // never show "Pick a chat" on one-column screens
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: t.bg }}>
      <DuoBar />
      <Ionicons name="chatbubbles-outline" size={56} color={t.soft} />
      <Text style={{ color: t.soft, fontSize: 17 }}>Pick a chat</Text>
    </View>
  );
}
