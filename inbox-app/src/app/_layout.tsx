// The app shell is Apple's split view (UISplitViewController), so iOS handles every iPhone and iPhone Duo pose
// natively: one column on iPhones and the Duo's front screen; chat list + chat side by side when the Duo is open
// (split onto the fold when folded like a book); pop-ups kept off the fold.
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SplitView } from 'expo-router/unstable-split-view';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { restore, S } from '@/lib/matrix';
import { useTheme, useStore } from '@/lib/theme';
import { Banner } from '@/components/Banner';
import { startPush } from '@/lib/push';
import { startCalls } from '@/lib/calls';
import { CallPill } from '@/components/CallPill';
import { Sidebar } from '@/components/Sidebar';
import { LoginScreen } from '@/components/LoginScreen';
import { setSplitRef, setCollapsed, useLayout } from '@/lib/layout';

export default function RootLayout() {
  const t = useTheme(); useStore();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { restore().finally(() => { setLoaded(true); if (S.token) { startPush(); startCalls(); } }); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        {!loaded ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator /></View>
        ) : !S.token ? (
          <LoginScreen />
        ) : (
          <Shell />
        )}
        {loaded && !!S.token && <Banner />}
        {loaded && !!S.token && <CallPill />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { current } = useLayout();
  const ref = useRef<any>(null);
  useEffect(() => { setSplitRef(ref.current); return () => setSplitRef(null); }, [ref.current]);
  return (
    <SplitView
      ref={ref}
      // Let iOS choose widths and the fold split; just ask for list + detail side by side when there's room.
      preferredDisplayMode="oneBesideSecondary"
      preferredSplitBehavior="tile"
      displayModeButtonVisibility="never"
      presentsWithGesture={false}
      showSecondaryToggleButton={false}
      // When the Duo closes: keep the open chat on screen; with no chat open, show the list.
      topColumnForCollapsing={current ? 'secondary' : 'primary'}
      onCollapse={() => setCollapsed(true)}
      onExpand={() => setCollapsed(false)}
    >
      <SplitView.Column>
        <Sidebar />
      </SplitView.Column>
    </SplitView>
  );
}
