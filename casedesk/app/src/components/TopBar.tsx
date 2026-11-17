import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { tap } from './ui';

export function DetailScreen({ title, children, right, modal }: { title?: string; children: React.ReactNode; right?: React.ReactNode; modal?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => { tap(); router.canGoBack() ? router.back() : router.replace('/'); };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: modal ? 14 : insets.top + 6, paddingHorizontal: 12, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={back} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={modal ? 'close' : 'chevron-back'} size={20} color={t.text} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', color: t.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}
