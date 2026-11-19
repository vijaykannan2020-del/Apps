// Face ID lock + privacy cover: when on, documents are hidden in the app switcher and the app asks
// for Face ID / passcode when it comes back after a minute away.
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, View } from 'react-native';
import { useFamily } from '../data/FamilyProvider';
import { authenticate } from '../native/device';
import { Button, T, font, useTheme } from '../ui';

// The app icon (bundled asset, no native module).
const APP_ICON = require('../../assets/icon.png');

export function AppLock({ children }: { children: React.ReactNode }) {
  const f = useFamily();
  const t = useTheme();
  const on = !!f.settings.faceId;
  const [locked, setLocked] = useState(false);
  const [cover, setCover] = useState(false);
  const away = useRef<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!f.ready) return;
    if (first.current) { first.current = false; if (on) setLocked(true); }
  }, [f.ready, on]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (!on) return;
      if (s === 'inactive' || s === 'background') { setCover(true); if (away.current === null) away.current = Date.now(); }
      if (s === 'active') {
        setCover(false);
        if (away.current !== null && Date.now() - away.current > 60_000) setLocked(true);
        away.current = null;
      }
    });
    return () => sub.remove();
  }, [on]);
  // While the system Face ID / Touch ID prompt is up, only the icon and title show (nothing behind it).
  const [asking, setAsking] = useState(false);
  const unlock = () => {
    if (asking) return;
    setAsking(true);
    authenticate().then((ok) => { if (ok) setLocked(false); }).finally(() => setAsking(false));
  };
  useEffect(() => { if (locked) unlock(); }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1 }}>
      {children}
      {on && (locked || cover) ? (
        <View accessibilityViewIsModal testID="app-lock" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Image source={APP_ICON} accessibilityIgnoresInvertColors accessibilityLabel="Immigration Wallet" style={{ width: 84, height: 84, borderRadius: 20 }} />
          <T a11y="header" style={[font.title2, { marginTop: 18, textAlign: 'center' }]}>Immigration Wallet is locked</T>
          {/* One fixed-size Unlock button: a row wrapper so the button never stretches (was a tall blue bar). */}
          {locked && !asking ? (
            <View style={{ flexDirection: 'row', width: 220, marginTop: 28 }}>
              <Button title="Unlock" onPress={unlock} />
            </View>
          ) : <View style={{ height: 52 + 28 }} />}
        </View>
      ) : null}
    </View>
  );
}
