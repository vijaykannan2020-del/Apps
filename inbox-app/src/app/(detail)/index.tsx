// Shown in the right-hand column on the open iPhone Duo until a chat is picked.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';

export default function NoChat() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: t.bg }}>
      <Ionicons name="chatbubbles-outline" size={56} color={t.soft} />
      <Text style={{ color: t.soft, fontSize: 17 }}>Pick a chat</Text>
    </View>
  );
}
