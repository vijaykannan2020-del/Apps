// Shareable image cards (case milestones, Visa Bulletin moves, test results) for WhatsApp, LinkedIn, etc.
// Rendered on the phone, captured as a PNG and handed to the share sheet. Receipt numbers are never shown.
import React, { useRef, useState } from 'react';
import { Modal, View, Text, Pressable, Platform, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, T, tap } from './ui';
import { useTheme } from '../theme';

export type CardData = { kind: 'case' | 'pd' | 'bulletin' | 'civics'; title: string; subtitle?: string; stat?: string; statLabel?: string };

const ACCENT: Record<CardData['kind'], string> = { case: '#30D158', pd: '#0A84FF', bulletin: '#FF9F0A', civics: '#BF5AF2' };
const ICON: Record<CardData['kind'], React.ComponentProps<typeof Ionicons>['name']> = { case: 'checkmark-seal', pd: 'calendar', bulletin: 'trending-up', civics: 'ribbon' } as any;

export function CardArt({ c }: { c: CardData }) {
  const a = ACCENT[c.kind];
  return (
    <View style={{ width: 340, height: 340, borderRadius: 28, backgroundColor: '#0B0B0C', padding: 26, justifyContent: 'space-between', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -60, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: a, opacity: 0.18 }} />
      <View style={{ position: 'absolute', left: -40, bottom: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: a, opacity: 0.08 }} />
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: a + '33', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={ICON[c.kind]} size={24} color={a} />
      </View>
      <View>
        {c.stat ? <Text style={{ color: a, fontSize: 44, fontWeight: '800', letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>{c.stat}</Text> : null}
        {c.statLabel ? <Text style={{ color: '#8E8E93', fontSize: 13, fontWeight: '600', marginTop: -2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>{c.statLabel}</Text> : null}
        <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '700', lineHeight: 29 }}>{c.title}</Text>
        {c.subtitle ? <Text style={{ color: '#AEAEB2', fontSize: 15, marginTop: 6 }}>{c.subtitle}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: a }} />
        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>CaseDesk</Text>
        <Text style={{ color: '#8E8E93', fontSize: 13 }}>· US immigration tracker</Text>
      </View>
    </View>
  );
}

export function ShareCardButton({ card, label = 'Share as image', kind = 'secondary' }: { card: CardData; label?: string; kind?: 'primary' | 'secondary' }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  const share = async () => {
    tap();
    if (Platform.OS === 'web') { await Share.share({ message: `${card.title}${card.subtitle ? ' — ' + card.subtitle : ''} · via CaseDesk` }); return; }
    try {
      const { captureRef } = require('react-native-view-shot');
      const Sharing = require('expo-sharing');
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share' });
    } catch {
      await Share.share({ message: `${card.title}${card.subtitle ? ' — ' + card.subtitle : ''} · via CaseDesk` });
    }
  };
  return (
    <>
      <Button label={label} kind={kind} icon="share-outline" onPress={() => setOpen(true)} />
      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000C', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View ref={ref} collapsable={false} style={{ borderRadius: 28, overflow: 'hidden' }}><CardArt c={card} /></View>
          <View style={{ width: 340, marginTop: 18, gap: 10 }}>
            <Button label="Share" icon="share-outline" onPress={share} />
            <Pressable onPress={() => setOpen(false)} style={{ alignSelf: 'center', padding: 8 }}><T v="body" style={{ color: '#FFF' }}>Close</T></Pressable>
          </View>
          <T v="small" style={{ marginTop: 6, color: '#AEAEB2' }}>No receipt numbers or personal details are included.</T>
        </View>
      </Modal>
    </>
  );
}
