// First-visit coach marks. One reusable system for every screen — see casedesk/app/TOURS.md.
//
//   const tour = useTour('cases');                       // steps from src/content/tours.ts
//   const tour = useTour('my-screen', steps, { help: 'cases' }); // or your own steps
//   <Screen nav={{ … }} tour={tour}>                      // adds the "?" to the nav bar + scope
//     <TourTarget id="add"><IconButton … /></TourTarget>  // what a step points at
//
// Shown once per screen (remembered in settings.toursSeen), replayed with the "?" button, reset
// from Settings → Help → Show all tips again. Drawn in the app's own overlay layer (no RN Modal),
// like sheets and toasts, so it also sits above an open sheet.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { autoSteps, normalizeSteps, placeTip, shouldAutoShow, stepLabel, type Rect, type TourStep } from '../core/tours';
import { useTheme, useReduceMotion, MIN_TOUCH, font } from './theme';
import { Icon } from './Icon';
import { T } from './kit';

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };
export type Tour = {
  id: string;
  steps: TourStep[];
  help?: string;
  start: () => void;
  /** registry of targets on this screen (filled by <TourTarget>) */
  refs: Map<string, React.RefObject<Measurable | null>>;
  /** the scroll area each target sits in, so a step can bring it on screen */
  scrolls?: Map<string, Scroller>;
};
type Scroller = { scrollBy: (dy: number) => void };
const ScrollCtx = createContext<Scroller | null>(null);

/** ScrollView that lets tour steps scroll their target into view (used by <Screen>). */
export function TourScroll({ children, onScroll, ...props }: ScrollViewProps & { children?: React.ReactNode }) {
  const ref = useRef<any>(null);
  const y = useRef(0);
  const api = useMemo<Scroller>(() => ({ scrollBy: (dy) => { ref.current?.scrollTo({ y: Math.max(0, y.current + dy), animated: false }); } }), []);
  return (
    <ScrollCtx.Provider value={api}>
      <ScrollView ref={ref} scrollEventThrottle={32} onScroll={(e) => { y.current = e.nativeEvent.contentOffset.y; onScroll?.(e); }} {...props}>{children}</ScrollView>
    </ScrollCtx.Provider>
  );
}

type Active = { tour: Tour; i: number } | null;
type Ctx = {
  active: Active;
  show: (tour: Tour) => void;
  seen: string[];
  ready: boolean;
  off: boolean;
  /** Settings → Help → Show tips on each screen (off by default: only Home's one tip auto-shows) */
  all: boolean;
  disabled: boolean;
};
const TourCtx = createContext<Ctx | null>(null);
const ScopeCtx = createContext<Tour | null>(null);

/** Words for screens that don't pass their own steps (set by the app, see screens/tours.tsx). */
let registry: Record<string, { steps: TourStep[]; help?: string }> = {};
export function registerTours(r: Record<string, { steps: TourStep[]; help?: string }>) { registry = { ...registry, ...r }; }

/** QA / screenshots: `localStorage['cd2.notours'] = '1'` (web) or globalThis.__NO_TOURS__ stops auto-show. */
function autoDisabled(): boolean {
  try { if ((globalThis as any).__NO_TOURS__) return true; } catch {}
  if (Platform.OS === 'web') { try { return (globalThis as any).localStorage?.getItem('cd2.notours') === '1'; } catch {} }
  return false;
}

export function TourProvider({ children, seen, ready, off, all, onSeen, onSkipAll, onHelp }: {
  children: React.ReactNode; seen: string[]; ready: boolean; off?: boolean; all?: boolean;
  onSeen: (id: string) => void; onSkipAll?: () => void; onHelp?: (topic: string) => void;
}) {
  const [active, setActive] = useState<Active>(null);
  const show = useCallback((tour: Tour) => { if (tour.steps.length) setActive({ tour, i: 0 }); }, []);
  const close = useCallback((all?: boolean) => {
    setActive((a) => { if (a) onSeen(a.tour.id); return null; });
    if (all) onSkipAll?.();
  }, [onSeen, onSkipAll]);
  const disabled = useMemo(autoDisabled, []);
  const value = useMemo<Ctx>(() => ({ active, show, seen, ready, off: !!off, all: !!all, disabled }), [active, show, seen, ready, off, all, disabled]);
  return (
    <TourCtx.Provider value={value}>
      <View style={{ flex: 1 }} importantForAccessibility={active ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!active}>{children}</View>
      {active ? (
        <TourOverlay key={`${active.tour.id}:${active.i}`} tour={active.tour} i={active.i}
          onNext={() => setActive((a) => (a && a.i + 1 < a.tour.steps.length ? { ...a, i: a.i + 1 } : (onSeen(a!.tour.id), null)))}
          onBack={() => setActive((a) => (a && a.i > 0 ? { ...a, i: a.i - 1 } : a))}
          onSkip={() => close(false)}
          onHelp={active.tour.help && onHelp ? () => { const h = active.tour.help!; close(false); onHelp(h); } : undefined} />
      ) : null}
    </TourCtx.Provider>
  );
}

function useTourCore(id: string, steps: TourStep[] | undefined, opts: { help?: string; auto?: boolean }) {
  const ctx = useContext(TourCtx);
  const refs = useRef(new Map<string, React.RefObject<Measurable | null>>()).current;
  const reg = registry[id];
  const list = useMemo(() => normalizeSteps(steps ?? reg?.steps ?? []), [steps, reg]);
  const help = opts.help ?? reg?.help;
  const tourRef = useRef<Tour>({ id, steps: list, help, refs, start: () => {} });
  tourRef.current.id = id; tourRef.current.steps = list; tourRef.current.help = help;
  tourRef.current.start = () => ctx?.show(tourRef.current);
  const ctxRef = useRef(ctx); ctxRef.current = ctx;
  const auto = opts.auto !== false;
  /** schedules the once-only auto-show; returns a cleanup */
  const trigger = () => {
    if (!auto) return undefined;
    const timer = setTimeout(() => {
      const c = ctxRef.current;
      if (!c) return;
      // calm by default: Home shows its one tip once; other screens only when the user asked for tips
      const st = autoSteps(id, tourRef.current.steps, c.all);
      if (!shouldAutoShow(id, { ready: c.ready, seen: c.seen, off: c.off, active: c.active?.tour.id ?? null, steps: st.length, disabled: c.disabled })) return;
      c.show(st.length === tourRef.current.steps.length ? tourRef.current : { ...tourRef.current, steps: st, help: undefined });
    }, 700);
    return () => clearTimeout(timer);
  };
  return { tour: tourRef.current, trigger, deps: [id, auto, ctx?.ready, ctx?.seen.length, ctx?.all] as unknown[] };
}

/**
 * Register a screen's tour. Auto-shows once, ~0.7 s after the screen is focused, if it hasn't been
 * seen. `steps` default to the app's registry entry for `id`. Returns a Tour to give to
 * <Screen tour={…}> or <TourScope tour={…}> and <TourButton tour={…}>.
 */
export function useTour(id: string, steps?: TourStep[], opts: { help?: string; auto?: boolean } = {}): Tour {
  const { tour, trigger, deps } = useTourCore(id, steps, opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(trigger, deps));
  return tour;
}

/** Same as useTour for content shown in a sheet (sheets live outside the navigator, so no focus). */
export function useSheetTour(id: string, steps?: TourStep[], opts: { help?: string; auto?: boolean } = {}): Tour {
  const { tour, trigger, deps } = useTourCore(id, steps, opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(trigger, deps);
  return tour;
}

/**
 * Every <TourTarget> also registers here under "<tour id>:<target id>" (e.g. "home:hero"), so the guided
 * tour (screens/guide.tsx) can point at elements on any screen. Newest first: a screen pushed again wins.
 */
type GuideEntry = { ref: React.RefObject<Measurable | null>; scroller?: Scroller };
const guideTargets = new Map<string, GuideEntry[]>();
export function guideTargetsFor(key: string): { ref: React.RefObject<Measurable | null>; scrollBy?: (dy: number) => void }[] {
  return [...(guideTargets.get(key) ?? [])].reverse().map((e) => ({ ref: e.ref, scrollBy: e.scroller?.scrollBy }));
}

/** Makes <TourTarget>s inside belong to `tour`. <Screen tour={…}> does this for you. */
export function TourScope({ tour, children }: { tour?: Tour | null; children: React.ReactNode }) {
  if (!tour) return <>{children}</>;
  return <ScopeCtx.Provider value={tour}>{children}</ScopeCtx.Provider>;
}

/** Marks what a tour step points at. Renders a plain View around its child. */
export function TourTarget({ id, children, style, tour }: { id: string; children: React.ReactNode; style?: any; tour?: Tour }) {
  const scope = useContext(ScopeCtx);
  const scroller = useContext(ScrollCtx);
  const owner = tour ?? scope;
  const ref = useRef<any>(null);
  useEffect(() => {
    if (!owner) return;
    owner.refs.set(id, ref as never);
    if (scroller) (owner.scrolls ??= new Map()).set(id, scroller);
    const entry: GuideEntry = { ref, scroller: scroller ?? undefined };
    const key = `${owner.id}:${id}`;
    const list = guideTargets.get(key) ?? [];
    guideTargets.set(key, [...list, entry]);
    return () => {
      if (owner.refs.get(id) === (ref as never)) { owner.refs.delete(id); owner.scrolls?.delete(id); }
      const l = (guideTargets.get(key) ?? []).filter((e) => e !== entry);
      if (l.length) guideTargets.set(key, l); else guideTargets.delete(key);
    };
  }, [owner, id, scroller]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

/** The "?" for a nav bar or large title: replays this screen's tour (the last tip links to help). */
/** Off everywhere (owner, Nov 2026). Kept as a switch so the buttons can come back in one line. */
export const HIDE_TIP_BUTTONS = true;
export function TourButton({ tour, label }: { tour?: Tour | null; label?: string }) {
  const t = useTheme();
  const scope = useContext(ScopeCtx);
  const owner = tour ?? scope;
  // owner, Nov 2026: no "?" on individual screens — help lives in setup and Settings → Help & tips
  if (HIDE_TIP_BUTTONS || !owner || !owner.steps.length) return null;
  return (
    <TourTarget id="help" tour={owner}>
      <Pressable onPress={owner.start} accessibilityRole="button" accessibilityLabel={label ?? 'Tips for this screen'} accessibilityHint="Shows what each part of this screen does" hitSlop={6}
        style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="help" size={22} color={t.text2} />
      </Pressable>
    </TourTarget>
  );
}

/** Is a tour on screen right now (e.g. to pause other prompts)? */
export const useTourActive = () => !!useContext(TourCtx)?.active;

function TourOverlay({ tour, i, onNext, onBack, onSkip, onHelp }: { tour: Tour; i: number; onNext: () => void; onBack: () => void; onSkip: () => void; onHelp?: () => void }) {
  const t = useTheme();
  const win = useWindowDimensions();
  const step = tour.steps[i];
  const n = tour.steps.length;
  const last = i === n - 1;
  const rootRef = useRef<any>(null);
  const [rect, setRect] = useState<Rect | null | undefined>(undefined); // undefined = measuring
  const [tipH, setTipH] = useState(150);
  const reduce = useReduceMotion();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    const target = step.target ? tour.refs.get(step.target)?.current : null;
    const done = (r: Rect | null) => { if (alive) setRect(r); };
    if (!target?.measureInWindow) { done(null); return; }
    const root = rootRef.current as unknown as Measurable | null;
    const scroller = step.target ? tour.scrolls?.get(step.target) : undefined;
    const measure = (again: boolean) => target.measureInWindow!((x, y, w, h) => {
      if (!alive) return;
      if (!w || !h) { done(null); return; }
      // Off screen (or under the bars)? Scroll its own scroll area so it sits in the top third, then measure again.
      if (!again && scroller && (y < 80 || y + Math.min(h, win.height * 0.4) > win.height - 140)) {
        scroller.scrollBy(y - win.height * 0.22);
        setTimeout(() => measure(true), 160);
        return;
      }
      if (root?.measureInWindow) root.measureInWindow((ox, oy) => done({ x: x - (ox || 0), y: y - (oy || 0), width: w, height: h }));
      else done({ x, y, width: w, height: h });
    });
    measure(false);
    return () => { alive = false; };
  }, [step, tour, win.width, win.height]);

  useEffect(() => {
    if (rect === undefined) return;
    if (reduce) fade.setValue(1);
    else Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
    AccessibilityInfo.announceForAccessibility?.(stepLabel(step, i, n));
  }, [rect, reduce, fade, step, i, n]);

  const pad = 6;
  const hole = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.width + 2 * pad, h: rect.height + 2 * pad } : null;
  const place = placeTip(hole ? { x: hole.x, y: hole.y, width: hole.w, height: hole.h } : null, win, tipH);
  const shade = t.dark ? 'rgba(0,0,0,0.66)' : 'rgba(0,0,0,0.5)';
  const card = t.dark ? t.card2 : '#FFFFFF';

  return (
    <View ref={rootRef} style={[StyleSheet.absoluteFill, { zIndex: 80, elevation: 80 }]} collapsable={false}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: rect === undefined ? 0 : fade }]}>
        {/* dim everything except the target */}
        {hole ? (
          <>
            <Pressable accessible={false} onPress={onSkip} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, hole.y), backgroundColor: shade }} />
            <Pressable accessible={false} onPress={onSkip} style={{ position: 'absolute', left: 0, right: 0, top: hole.y + hole.h, bottom: 0, backgroundColor: shade }} />
            <Pressable accessible={false} onPress={onSkip} style={{ position: 'absolute', left: 0, width: Math.max(0, hole.x), top: hole.y, height: hole.h, backgroundColor: shade }} />
            <Pressable accessible={false} onPress={onSkip} style={{ position: 'absolute', left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h, backgroundColor: shade }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 22, borderWidth: 2.5, borderColor: t.pastel.sky }} />
          </>
        ) : <Pressable accessible={false} onPress={onSkip} style={[StyleSheet.absoluteFill, { backgroundColor: shade }]} />}

        <View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (Math.abs(h - tipH) > 1) setTipH(h); }}
          accessibilityViewIsModal accessible={false}
          style={{ position: 'absolute', top: place.top, left: place.left, width: place.width, backgroundColor: card, borderRadius: 26, padding: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
          {place.arrow ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: place.arrowX - 9, [place.arrow === 'up' ? 'top' : 'bottom']: -8, width: 18, height: 18, backgroundColor: card, transform: [{ rotate: '45deg' }], borderRadius: 3 }} />
          ) : null}
          <View accessible accessibilityRole="text" accessibilityLabel={stepLabel(step, i, n)} accessibilityLiveRegion="polite">
            <T tone="text2" style={[font.caption, { fontWeight: '600' }]}>{`Tip ${i + 1} of ${n}`}</T>
            {step.title ? <T style={[font.headline, { marginTop: 4 }]}>{step.title}</T> : null}
            <T style={[font.sub, { marginTop: step.title ? 2 : 4 }]}>{step.text}</T>
          </View>
          {last && onHelp ? (
            <Pressable onPress={onHelp} accessibilityRole="link" style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
              <T tone="accent" style={[font.sub, { fontWeight: '600' }]}>Open the help topic</T>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: last && onHelp ? 0 : 10, gap: 4 }}>
            <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip tips for this screen" style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: 'center' }}>
              <T tone="text2" style={font.sub}>Skip</T>
            </Pressable>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5 }} accessible={false}>
              {tour.steps.map((_, k) => <View key={k} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k === i ? t.text : t.outline }} />)}
            </View>
            {i > 0 ? (
              <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous tip" style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                <T tone="accent" style={font.sub}>Back</T>
              </Pressable>
            ) : null}
            <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={last ? 'Done' : 'Next tip'}
              style={({ pressed }) => ({ minHeight: MIN_TOUCH, paddingHorizontal: 18, borderRadius: 22, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <T style={[font.sub, { color: t.onPrimary, fontWeight: '600' }]}>{last ? 'Got it' : 'Next'}</T>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
