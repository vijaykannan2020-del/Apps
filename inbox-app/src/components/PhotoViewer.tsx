// Full-screen photo: pinch or double-tap to zoom, drag down to close, Share and Save to Photos.
import { useRef, useState } from 'react';
import { Modal, View, Pressable, StyleSheet, ScrollView, Animated, PanResponder, Alert, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaSource } from '@/lib/matrix';

async function download(mxc: string) {
  const src = mediaSource(mxc); if (!src) throw new Error('No photo');
  const name = 'inbox-' + mxc.split('/').pop()!.slice(0, 24) + '.jpg';
  const f = await File.downloadFileAsync(src.uri, new File(Paths.cache, name), { headers: src.headers, idempotent: true });
  return f.uri;
}

export function PhotoViewer({ mxc, onClose }: { mxc: string | null; onClose: () => void }) {
  const ins = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const [busy, setBusy] = useState<'' | 'share' | 'save'>('');
  const [zoomed, setZoomed] = useState(false);
  const scroll = useRef<any>(null);
  const y = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !zoomedRef.current && g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120 || g.vy > 0.9) Animated.timing(y, { toValue: height, duration: 180, useNativeDriver: true }).start(() => { y.setValue(0); onClose(); });
      else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;
  const zoomedRef = useRef(false); zoomedRef.current = zoomed;
  if (!mxc) return null;
  const bgOpacity = y.interpolate({ inputRange: [0, 300], outputRange: [1, 0.3], extrapolate: 'clamp' });

  async function share() {
    setBusy('share');
    try { const uri = await download(mxc!); await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' }); }
    catch (e: any) { Alert.alert('Could not share', e.message || ''); }
    setBusy('');
  }
  async function save() {
    setBusy('save');
    try {
      const p = await MediaLibrary.requestPermissionsAsync(true);
      if (!p.granted) { Alert.alert('Photos access', 'Allow Expo Go to add photos in Settings → Privacy → Photos.'); setBusy(''); return; }
      const uri = await download(mxc!); await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Saved to Photos');
    } catch (e: any) { Alert.alert('Could not save', e.message || ''); }
    setBusy('');
  }
  function onTap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      const s = scroll.current as any;
      if (zoomed) s?.scrollResponderZoomTo?.({ x: 0, y: 0, width, height, animated: true });
      else s?.scrollResponderZoomTo?.({ x: width / 4, y: height / 4, width: width / 2, height: height / 2, animated: true });
      setZoomed(!zoomed);
    }
    lastTap.current = now;
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: bgOpacity }]} />
      <Animated.View style={{ flex: 1, transform: [{ translateY: y }] }} {...pan.panHandlers}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ width, height }} maximumZoomScale={4} minimumZoomScale={1}
          centerContent bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
          onScroll={e => { const z = (e.nativeEvent as any).zoomScale || 1; if ((z > 1.01) !== zoomed) setZoomed(z > 1.01); }} scrollEventThrottle={32}>
          <Pressable onPress={onTap} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={mediaSource(mxc)} style={{ width, height: height * 0.9 }} contentFit="contain" transition={150} placeholder={mediaSource(mxc, 640)} />
          </Pressable>
        </ScrollView>
      </Animated.View>
      <View style={[styles.bar, { top: ins.top + 8 }]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.btn}><Ionicons name="close" size={24} color="#fff" /></Pressable>
      </View>
      <View style={[styles.bottom, { bottom: ins.bottom + 16 }]}>
        <Pressable onPress={share} style={styles.btn} disabled={!!busy}>{busy === 'share' ? <ActivityIndicator color="#fff" /> : <Ionicons name="share-outline" size={24} color="#fff" />}</Pressable>
        {Platform.OS !== 'web' && <Pressable onPress={save} style={styles.btn} disabled={!!busy}>{busy === 'save' ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={24} color="#fff" />}</Pressable>}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, flexDirection: 'row' },
  bottom: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 28 },
  btn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
});
