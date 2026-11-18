// Face ID lock + privacy cover: when on, documents are hidden in the app switcher and the app asks
// for Face ID / passcode when it comes back after a minute away.
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFamily } from '../data/FamilyProvider';
import { authenticate } from '../native/device';
import { Button, Icon, T, font, useTheme } from '../ui';

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
  useEffect(() => { if (locked) authenticate().then((ok) => ok && setLocked(false)); }, [locked]);
  return (
    <View style={{ flex: 1 }}>
      {children}
      {on && (locked || cover) ? (
        <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <Icon name="lock" size={44} color={t.accent} />
          <T style={font.title2}>CaseDesk is locked</T>
          {locked ? <Button title="Unlock" icon="face" onPress={() => authenticate().then((ok) => ok && setLocked(false))} /> : null}
        </View>
      ) : null}
    </View>
  );
}
