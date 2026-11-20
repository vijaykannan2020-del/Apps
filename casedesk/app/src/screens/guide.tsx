// v3.0 Guided tour (owner: after setup, walk people through the app itself, screen to screen).
// <Guide> wraps the app (app/_layout.tsx, outside <Tours> so per-screen tips stay quiet while it runs).
// Each stop opens its real screen, finds the real element (a <TourTarget>, see ui/tour.tsx
// guideTargetsFor) and draws a spotlight ring with a card: Step x of N, Back, Next, Skip tour. A missing
// element never blocks: the card is centred instead. Which stops apply: core/guide.ts (tested).
// Start: setup Done (Show me around), Settings → Help → Take the tour (/guide), the one-time Home card.
// No native modules: JS only, so it ships over the air onto installed builds.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { guideInput, guideLabel, guideStep, guideStops, showGuideCard, WIDGET_LOCK_LINE, WIDGET_STEPS, type GuideRoute as Route, type GuideStop, type GuideTab } from '../core/guide';
import { markSeen, placeTip, type Rect } from '../core/tours';
import { useFamily } from '../data/FamilyProvider';
import { walletEnabled } from '../data/walletApi';
import { widgetsAvailable } from '../native/widgets';
import { Button, Icon, Pastel, T, font, guideTargetsFor, useReduceMotion, useTheme, MIN_TOUCH } from '../ui';

type Run = { stops: GuideStop[]; i: number };
type Ctx = { start: () => void; active: boolean };
const GuideCtx = createContext<Ctx>({ start: () => {}, active: false });
export const useGuide = () => useContext(GuideCtx);

const TAB_PATH: Record<GuideTab, string> = { index: '/', family: '/family', cases: '/cases', forum: '/forum', tools: '/tools' };
const TAB_HREF: Record<GuideTab, string> = { index: '/(tabs)', family: '/(tabs)/family', cases: '/(tabs)/cases', forum: '/(tabs)/forum', tools: '/(tabs)/tools' };
const inTabs = (path: string) => Object.values(TAB_PATH).includes(path);
const toTabs = (path: string) => { if (!inTabs(path)) { try { if (router.canDismiss()) router.dismissAll(); } catch {} } };

/** Open a stop's screen the way a person would. Returns how long to wait before looking for the element. */
function navigate(r: Route, path: string): number {
  if ('tab' in r) {
    if (path === TAB_PATH[r.tab]) return 80;
    toTabs(path);
    router.navigate(TAB_HREF[r.tab] as never);
    return 520;
  }
  if (path === r.push) return 80;
  toTabs(path);
  if (path !== TAB_PATH[r.via]) {
    // show the tab it lives under first (Family → the person), then open the page
    router.navigate(TAB_HREF[r.via] as never);
    setTimeout(() => router.push(r.push as never), 320);
    return 1000;
  }
  router.push(r.push as never);
  return 650;
}

/** walletEnabled() asks the pass server; never wait more than a moment for it. */
async function walletOffered(): Promise<boolean> {
  if (Platform.OS === 'web') return true; // preview: the stop shows a drawn card instead of the button
  if (Platform.OS !== 'ios') return false;
  try { return await Promise.race([walletEnabled(), new Promise<boolean>((r) => setTimeout(() => r(false), 1500))]); } catch { return false; }
}

export function Guide({ children }: { children: React.ReactNode }) {
  const f = useFamily();
  const path = usePathname();
  const pathRef = useRef(path); pathRef.current = path;
  const fRef = useRef(f); fRef.current = f;
  const [run, setRun] = useState<Run | null>(null);

  const start = useCallback(async () => {
    const fam = fRef.current;
    if (!fam.people.length) return;
    const wallet = await walletOffered();
    const widgets = Platform.OS === 'web' || (Platform.OS === 'ios' && widgetsAvailable());
    const stops = guideStops(guideInput({ people: fam.people, records: fam.records as never, results: fam.results as never, cases: fam.caseList.length }, { wallet, widgets }));
    if (!stops.length) return;
    fam.actions.updateSettings({ guideSeen: true }).catch(() => {});
    setRun({ stops, i: 0 });
  }, []);

  const finish = useCallback((done: boolean) => {
    setRun(null);
    const fam = fRef.current;
    // the tour covered Home's one tip ("Tap ? on any screen for tips"): don't pop it straight after
    fam.actions.updateSettings({ guideSeen: true, toursSeen: markSeen(fam.settings.toursSeen, 'home') }).catch(() => {});
    if (done) navigate({ tab: 'index' }, pathRef.current);
  }, []);

  const value = useMemo<Ctx>(() => ({ start, active: !!run }), [start, run]);
  return (
    <GuideCtx.Provider value={value}>
      <View style={{ flex: 1 }} importantForAccessibility={run ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!run}>{children}</View>
      {run ? (
        <GuideOverlay run={run} path={pathRef}
          onNext={() => (run.i + 1 < run.stops.length ? setRun({ ...run, i: run.i + 1 }) : finish(true))}
          onBack={() => run.i > 0 && setRun({ ...run, i: run.i - 1 })}
          onSkip={() => finish(false)} />
      ) : null}
    </GuideCtx.Provider>
  );
}

/** /guide (Settings → Help, Help, Search): starts the tour, which opens Home. */
export function GuideRoute() {
  const t = useTheme();
  const g = useGuide();
  const f = useFamily();
  useEffect(() => {
    if (!f.ready) return;
    const h = setTimeout(() => { if (f.people.length) g.start(); else router.replace('/(tabs)' as never); }, 60);
    return () => clearTimeout(h);
  }, [f.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={{ flex: 1, backgroundColor: t.bg }} />;
}

/** Home: one-time card for people who finished setup before the tour existed. */
export function GuideCard() {
  const f = useFamily();
  const g = useGuide();
  const t = useTheme();
  if (!f.ready || !showGuideCard(f.settings, f.people.length)) return null;
  const close = () => f.actions.updateSettings({ guideSeen: true });
  return (
    <Pastel tone="sky" style={{ marginTop: 10 }} onPress={g.start} label="Take a 1-minute tour of the app">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T style={font.headline}>Take a 1-minute tour</T>
          <T style={[font.foot, { marginTop: 2 }]}>See where everything is: your status card, documents, cases, the widget and the Wallet card.</T>
        </View>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close tour card" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -10 }}><Icon name="x" size={16} color={t.ink} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 14 }}><Button size="sm" title="Start the tour" onPress={g.start} /></View>
    </Pastel>
  );
}

// ---------- the overlay ----------

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

function GuideOverlay({ run, path, onNext, onBack, onSkip }: { run: Run; path: React.MutableRefObject<string>; onNext: () => void; onBack: () => void; onSkip: () => void }) {
  const t = useTheme();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const stop = run.stops[run.i];
  const n = run.stops.length;
  const last = run.i === n - 1;
  const rootRef = useRef<any>(null);
  const [rect, setRect] = useState<Rect | null | undefined>(undefined); // undefined = moving / measuring
  const [tipH, setTipH] = useState(stop.art === 'widget' ? 520 : 180);
  const fade = useRef(new Animated.Value(0)).current;

  // open the screen, then find the element (retry while the screen mounts), scroll it into view, measure
  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(() => { if (alive) fn(); }, ms)); };
    setRect(undefined);
    fade.setValue(0);
    const wait = navigate(stop.route, path.current);
    const top = insets.top + 8, bottom = win.height - Math.max(insets.bottom, 12) - 70; // clear of the floating tab bar
    const done = (r: Rect | null) => {
      if (!r) {
        // nothing to ring: bring the nearby element on screen behind the centred card, if there is one
        const near = stop.near ? guideTargetsFor(stop.near)[0] : undefined;
        const node = near?.ref.current as Measurable | null | undefined;
        if (near?.scrollBy && node?.measureInWindow) node.measureInWindow((_x, y, _w, h) => { if (alive && h && (y < top || y > win.height * 0.4)) near.scrollBy!(y - top - 40); if (alive) setRect(null); });
        else setRect(null);
        return;
      }
      const root = rootRef.current as unknown as Measurable | null;
      if (root?.measureInWindow) root.measureInWindow((ox, oy) => alive && setRect({ x: r.x - (ox || 0), y: r.y - (oy || 0), width: r.width, height: r.height }));
      else setRect(r);
    };
    const look = (attempt: number, scrolled: boolean) => {
      if (!stop.target) { done(null); return; }
      const found = guideTargetsFor(stop.target);
      const tryAt = (k: number) => {
        const e = found[k];
        if (!e) { if (attempt < 12) later(() => look(attempt + 1, scrolled), 150); else done(null); return; }
        const node = e.ref.current as Measurable | null;
        if (!node?.measureInWindow) { tryAt(k + 1); return; }
        node.measureInWindow((x, y, w, h) => {
          if (!alive) return;
          if (!w || !h || x >= win.width || x + w <= 0) { tryAt(k + 1); return; }
          const shown = Math.min(h, (bottom - top) * 0.5);
          if (!scrolled && e.scrollBy && (y < top + 40 || y + shown > bottom)) {
            e.scrollBy(y - Math.max(top + 60, win.height * 0.22));
            later(() => look(attempt, true), 220);
            return;
          }
          // a tall element: ring only what is on screen
          const y0 = Math.max(y, top), y1 = Math.min(y + h, bottom);
          done(y1 - y0 > 8 ? { x, y: y0, width: w, height: y1 - y0 } : null);
        });
      };
      tryAt(0);
    };
    later(() => look(0, false), wait);
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [run.i, run.stops]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rect === undefined) return;
    if (reduce) fade.setValue(1);
    else Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
    AccessibilityInfo.announceForAccessibility?.(guideLabel(stop, run.i, n));
  }, [rect, reduce, fade, stop, run.i, n]);

  const pad = 6;
  const hole = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.width + 2 * pad, h: rect.height + 2 * pad } : null;
  const place = placeTip(hole ? { x: hole.x, y: hole.y, width: hole.w, height: hole.h } : null, { width: win.width, height: win.height - insets.bottom }, tipH, 16, 14);
  const top = hole ? place.top : Math.max(insets.top + 12, (win.height - tipH) / 2);
  const shade = t.dark ? 'rgba(0,0,0,0.68)' : 'rgba(0,0,0,0.5)';
  const card = t.dark ? t.card2 : '#FFFFFF';
  const moving = rect === undefined;
  const B = Math.max(win.width, win.height) * 1.5, R = 18;

  return (
    <View ref={rootRef} collapsable={false} style={[StyleSheet.absoluteFill, { zIndex: 90, elevation: 90 }]}>
      {/* swallow every tap while the tour is up (even while a screen opens) */}
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => {}} />
      <Animated.View pointerEvents={moving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {hole ? (
          <>
            {/* a rounded cut-out: one view whose very wide border is the dim (inner radius = outer − border) */}
            <View pointerEvents="none" style={{ position: 'absolute', left: hole.x - B, top: hole.y - B, width: hole.w + 2 * B, height: hole.h + 2 * B, borderWidth: B, borderColor: shade, borderRadius: B + R }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: hole.x - 1, top: hole.y - 1, width: hole.w + 2, height: hole.h + 2, borderRadius: R + 1, borderWidth: 3, borderColor: t.dark ? t.pastel.sky : t.primary }} />
          </>
        ) : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: shade }]} />}

        <View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (Math.abs(h - tipH) > 1) setTipH(h); }}
          accessibilityViewIsModal
          style={{ position: 'absolute', top, left: place.left, width: place.width, backgroundColor: card, borderRadius: 26, padding: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
          {hole && place.arrow ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: place.arrowX - 9, [place.arrow === 'up' ? 'top' : 'bottom']: -8, width: 18, height: 18, backgroundColor: card, transform: [{ rotate: '45deg' }], borderRadius: 3 }} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {run.stops.map((_, k) => <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= run.i ? t.text : t.outline }} />)}
          </View>
          <View accessible accessibilityRole="text" accessibilityLabel={guideLabel(stop, run.i, n)} accessibilityLiveRegion="polite">
            <T tone="text2" style={[font.caption, { fontWeight: '600' }]}>{guideStep(run.i, n)}</T>
            <T style={[font.headline, { marginTop: 4 }]}>{stop.title}</T>
            <T style={[font.sub, { marginTop: 3 }]}>{stop.text}</T>
          </View>
          {stop.art === 'widget' ? <WidgetHowTo /> : null}
          {stop.art === 'wallet' && rect === null ? <WalletArt /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
            {!last ? (
              <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip tour" style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingRight: 8 }}>
                <T tone="text2" style={font.sub}>Skip tour</T>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            {run.i > 0 ? (
              <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
                <T tone="accent" style={[font.sub, { fontWeight: '600' }]}>Back</T>
              </Pressable>
            ) : null}
            <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={last ? 'Done' : 'Next'}
              style={({ pressed }) => ({ minHeight: MIN_TOUCH, paddingHorizontal: 22, borderRadius: 22, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <T style={[font.sub, { color: t.onPrimary, fontWeight: '600' }]}>{last ? 'Done' : 'Next'}</T>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------- drawings (plain views, not pictures of Apple's screens) ----------

function Phone({ children, h = 96 }: { children?: React.ReactNode; h?: number }) {
  const t = useTheme();
  return (
    <View style={{ height: h, borderRadius: 16, borderWidth: 2, borderColor: t.text2, backgroundColor: t.dark ? '#16171A' : '#EEF0F3', overflow: 'hidden', padding: 8 }}>
      {children}
    </View>
  );
}
const Dot = ({ c, s = 14, r = 4 }: { c: string; s?: number; r?: number }) => <View style={{ width: s, height: s, borderRadius: r, backgroundColor: c }} />;

function Art({ kind }: { kind: 'hold' | 'gallery' | 'size' | 'edit' }) {
  const t = useTheme();
  const p = t.pastel;
  const line = t.dark ? '#3A3C41' : '#D3D6DB';
  const app = [p.sky, p.sage, p.butter, p.blush, p.mint, p.sky, p.butter, p.sage];
  if (kind === 'hold') {
    return (
      <Phone>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ paddingHorizontal: 6, height: 14, borderRadius: 7, backgroundColor: line, justifyContent: 'center' }}><T style={{ fontSize: 8, lineHeight: 10, fontWeight: '700', color: t.text }}>Edit</T></View>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: line, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 10, lineHeight: 12, fontWeight: '700', color: t.text }}>+</T></View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {app.map((c, i) => <View key={i} style={{ transform: [{ rotate: i % 2 ? '-6deg' : '6deg' }] }}><Dot c={c} s={16} r={5} /></View>)}
        </View>
        <View style={{ position: 'absolute', right: 14, bottom: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(120,140,255,0.35)', borderWidth: 2, borderColor: p.sky }} />
      </Phone>
    );
  }
  if (kind === 'gallery') {
    return (
      <Phone>
        <View style={{ height: 18, borderRadius: 9, backgroundColor: line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 }}>
          <Icon name="search" size={9} color={t.text2} />
          <T numberOfLines={1} style={{ fontSize: 8, lineHeight: 10, color: t.text, flex: 1 }}>Immigration Wallet</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: p.sage, alignItems: 'center', justifyContent: 'center' }}><Icon name="card" size={12} color={t.ink} /></View>
          <View style={{ flex: 1, gap: 3 }}><View style={{ height: 5, width: '80%', borderRadius: 3, backgroundColor: t.text2 }} /><View style={{ height: 4, width: '55%', borderRadius: 2, backgroundColor: line }} /></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, opacity: 0.45 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: line }} />
          <View style={{ height: 5, width: '50%', borderRadius: 3, backgroundColor: line }} />
        </View>
      </Phone>
    );
  }
  if (kind === 'size') {
    return (
      <Phone>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', justifyContent: 'center', flex: 1 }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: p.butter, padding: 4 }}><View style={{ height: 4, width: 14, borderRadius: 2, backgroundColor: t.ink }} /><T style={{ fontSize: 10, lineHeight: 12, fontWeight: '800', color: t.ink, marginTop: 3 }}>42</T></View>
          <View style={{ width: 62, height: 30, borderRadius: 8, backgroundColor: p.sage, padding: 4, gap: 3 }}>{[0, 1, 2].map((k) => <View key={k} style={{ height: 4, width: k === 1 ? '60%' : '85%', borderRadius: 2, backgroundColor: t.ink, opacity: 0.8 }} />)}</View>
        </View>
        <View style={{ alignSelf: 'center', marginTop: 8, paddingHorizontal: 8, height: 16, borderRadius: 8, backgroundColor: p.sky, justifyContent: 'center' }}><T style={{ fontSize: 8, lineHeight: 10, fontWeight: '700', color: t.ink }}>Add Widget</T></View>
      </Phone>
    );
  }
  return (
    <Phone>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: p.butter, padding: 5 }}><View style={{ height: 4, width: 16, borderRadius: 2, backgroundColor: t.ink }} /><T style={{ fontSize: 11, lineHeight: 13, fontWeight: '800', color: t.ink, marginTop: 3 }}>42</T></View>
      <View style={{ position: 'absolute', left: 30, top: 30, right: 8, borderRadius: 8, backgroundColor: t.dark ? '#2A2C31' : '#FFFFFF', paddingVertical: 4, paddingHorizontal: 6, gap: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="edit" size={9} color={t.text} /><T style={{ fontSize: 8, lineHeight: 10, fontWeight: '700', color: t.text }}>Edit Widget</T></View>
        <View style={{ height: 1, backgroundColor: line }} />
        <T numberOfLines={1} style={{ fontSize: 7, lineHeight: 9, color: t.text2 }}>Person · Show</T>
      </View>
    </Phone>
  );
}

function WidgetHowTo() {
  const t = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {WIDGET_STEPS.map((s, i) => (
          <View key={s.art} style={{ flexBasis: '46%', flexGrow: 1 }} accessible accessibilityLabel={`${i + 1}. ${s.text}`}>
            <Art kind={s.art} />
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
              <T style={[font.caption, { fontWeight: '700' }]}>{`${i + 1}`}</T>
              <T tone="text2" style={[font.caption, { flex: 1 }]}>{s.text}</T>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: t.fill }}>
        <Icon name="lock" size={16} color={t.text} />
        <T style={[font.caption, { flex: 1 }]}>{WIDGET_LOCK_LINE}</T>
      </View>
    </View>
  );
}

/** Shown when the Add to Apple Wallet button isn't on screen (older build, web preview). */
function WalletArt() {
  const t = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 12, borderRadius: 16, backgroundColor: t.pastel.sage, padding: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="card" size={14} color={t.ink} /><T style={[font.caption, { fontWeight: '700', color: t.ink }]}>Immigration Wallet</T></View>
        <T style={[font.caption, { color: t.ink }]}>Status card</T>
      </View>
      <View style={{ height: 7, width: '55%', borderRadius: 4, backgroundColor: t.ink, opacity: 0.75, marginTop: 14 }} />
      <View style={{ height: 6, width: '35%', borderRadius: 3, backgroundColor: t.ink, opacity: 0.45, marginTop: 7 }} />
      <T style={[font.caption, { color: t.ink, marginTop: 12, fontWeight: '600' }]}>For personal reference · not an official document</T>
    </View>
  );
}
