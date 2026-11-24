// A full-screen, searchable list of categories (replaces the long sideways chip row).
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from './theme';

export type PickItem = { id: string; title: string; count?: number };

export function CategoryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ color: C.dim, fontSize: 13, marginRight: 8 }}>Category</Text>
      <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{label}</Text>
      <Text style={{ color: C.accent, fontSize: 15, fontWeight: '700' }}>Change ▾</Text>
    </Pressable>
  );
}

export function CategoryPicker({ visible, items, selected, onPick, onClose, title }: {
  visible: boolean; items: PickItem[]; selected: string | null; onPick: (id: string) => void; onClose: () => void; title: string;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(i => words.every(w => i.title.toLowerCase().includes(w)));
  }, [items, q]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', flex: 1 }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ color: C.dim, fontSize: 16 }}>Done</Text></Pressable>
        </View>
        <TextInput value={q} onChangeText={setQ} placeholder="Type to find, e.g. arab, tamil, sports" placeholderTextColor="#5f5a7d" autoFocus autoCorrect={false} clearButtonMode="while-editing"
          style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: C.card, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 }} />
        <FlatList
          data={shown} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled" initialNumToRender={30}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 30 }}
          ListEmptyComponent={<Text style={{ color: C.dim, textAlign: 'center', marginTop: 30 }}>No category matches "{q}".</Text>}
          renderItem={({ item }) => {
            const on = item.id === selected;
            return (
              <Pressable onPress={() => { onPick(item.id); setQ(''); onClose(); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4, backgroundColor: on ? C.accent : pressed ? C.cardHi : 'transparent' })}>
                <Text style={{ color: on ? '#fff' : C.text, fontSize: 16, fontWeight: on ? '700' : '500', flex: 1 }}>{item.title}</Text>
                {item.count !== undefined ? <Text style={{ color: on ? '#fff' : C.dim, fontSize: 13 }}>{item.count}</Text> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
