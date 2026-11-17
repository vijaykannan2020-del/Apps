// Drag photos/videos from another app (Photos, Files, Safari…) onto a chat to send them. Needs the native part that
// ships in the app build; on older builds this is a plain View, so nothing breaks.
import { useState, ReactNode } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp, LayoutChangeEvent } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';

export type DroppedFile = { uri: string; mime: string; kind: 'image' | 'video'; name: string; width?: number; height?: number; durationMs?: number };

const Native: any = requireOptionalNativeModule('InboxDrop') ? requireNativeView('InboxDrop') : null;
export const dropSupported = !!Native;

export function DropZone({ children, style, onLayout, onFiles, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void; onFiles: (f: DroppedFile[]) => void; label?: string }) {
  const t = useTheme(); const [over, setOver] = useState(false);
  if (!Native) return <View style={style} onLayout={onLayout}>{children}</View>;
  return (
    <Native style={style} onLayout={onLayout}
      onDragOver={(e: any) => setOver(!!e.nativeEvent.over)}
      onDropFiles={(e: any) => { setOver(false); const f = e.nativeEvent.files as DroppedFile[]; if (f?.length) onFiles(f); }}>
      {children}
      {over && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.over, { borderColor: t.blue, backgroundColor: t.dark ? 'rgba(10,132,255,0.16)' : 'rgba(10,132,255,0.10)' }]}>
          <Ionicons name="images" size={44} color={t.blue} />
          <Text style={{ color: t.ink, fontSize: 18, fontWeight: '700', marginTop: 10 }}>{label || 'Drop to send'}</Text>
        </View>
      )}
    </Native>
  );
}

const styles = StyleSheet.create({
  over: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderStyle: 'dashed', borderRadius: 24, margin: 8 },
});
