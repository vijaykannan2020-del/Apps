// Opened by the "Open in Sideline TV" button in the Sideline web app:
// sidelinetv://setup?portal=…&mac=…&model=…&serial=…&deviceId=…
// Saves those details on this phone and goes straight to the channels.
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loadSettings, saveSettings } from '../src/store';
import { C } from '../src/theme';

export default function Setup() {
  const q = useLocalSearchParams<{ portal?: string; mac?: string; model?: string; serial?: string; deviceId?: string }>();
  useEffect(() => {
    (async () => {
      const cur = await loadSettings();
      const pick = (v: unknown, d: string) => (typeof v === 'string' ? v.trim() : d);
      if (q.portal && q.mac) {
        await saveSettings({
          portal: pick(q.portal, cur.portal),
          mac: pick(q.mac, cur.mac),
          model: pick(q.model, cur.model) || 'MAG254',
          serial: pick(q.serial, ''),
          deviceId: pick(q.deviceId, ''),
        });
      }
      router.replace('/');
    })();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.accent} />
    </View>
  );
}
