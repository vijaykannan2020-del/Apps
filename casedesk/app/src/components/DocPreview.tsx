// Shows a document (photo or PDF) so extracted details can be checked against it.
import React, { useEffect, useState } from 'react';
import { View, Image, Platform, Pressable, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';
import { useTheme } from '../theme';

function Body({ uri, mime, full }: { uri: string; mime: string; full?: boolean }) {
  const t = useTheme();
  const isPdf = mime === 'application/pdf' || uri.toLowerCase().endsWith('.pdf') || uri.startsWith('data:application/pdf');
  if (!isPdf) return <Image source={{ uri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />;
  if (Platform.OS === 'web') return <iframe src={uri} style={{ flex: 1, width: '100%', height: '100%', border: 0, background: '#fff' } as any} />;
  // iOS renders PDFs natively in a WebView; Android WebView can't, so offer the system viewer there.
  if (Platform.OS === 'ios') {
    try {
      const { WebView } = require('react-native-webview');
      return <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowingReadAccessToURL={uri} style={{ flex: 1, backgroundColor: '#fff' }} startInLoadingState renderLoading={() => <ActivityIndicator style={{ flex: 1 }} color={t.sub} />} />;
    } catch {}
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Ionicons name="document-text-outline" size={42} color={t.faint} />
      <T v="sub" style={{ marginTop: 8, textAlign: 'center' }}>PDF preview opens in your phone’s viewer.</T>
    </View>
  );
}

export function DocPreview({ uri, mime, height = 220, onOpenExternal }: { uri: string | null; mime: string; height?: number; onOpenExternal?: () => void }) {
  const t = useTheme();
  const [full, setFull] = useState(false);
  if (!uri) return <View style={{ height, borderRadius: 14, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.sub} /></View>;
  const isPdf = mime === 'application/pdf' || uri.toLowerCase().endsWith('.pdf');
  const androidPdf = Platform.OS === 'android' && isPdf;
  return (
    <>
      <Pressable onPress={() => (androidPdf ? onOpenExternal?.() : setFull(true))} style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: t.surface2 }}>
        <View pointerEvents="none" style={{ flex: 1 }}><Body uri={uri} mime={mime} /></View>
        <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: '#000A', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Ionicons name="expand-outline" size={13} color="#fff" />
          <T v="small" style={{ color: '#fff', fontSize: 12 }}>View</T>
        </View>
      </Pressable>
      <Modal visible={full} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 14 }}>
            <Pressable onPress={() => setFull(false)} hitSlop={10}><T v="h3" style={{ color: t.accent }}>Done</T></Pressable>
          </View>
          <Body uri={uri} mime={mime} full />
        </View>
      </Modal>
    </>
  );
}

// Resolves a stored document to something viewable (web preview keeps files as data URLs).
export function useDocUri(doc?: { uri: string; id: string } | null) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (!doc.uri.startsWith('web:')) { setU(doc.uri); return; }
    import('../lib/vault').then((v) => v.webData(doc as any)).then((d) => setU(typeof d === 'string' ? d : null)).catch(() => setU(null));
  }, [doc?.uri]);
  return u;
}
