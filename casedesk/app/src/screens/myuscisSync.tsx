// Case status sync page (Case → Status & sync). Ways to update a case, best first:
//  • IOE cases: "Sync with myUSCIS (sign in here)" — Experimental. In-app incognito WebView; the person
//    signs in on USCIS's own page; after sign-in (detected by URL) one pass fetches the four JSON links
//    (method A: fetch in the page's session; method B: open the link in the WebView and read it).
//  • Every case: "Check public status in the app" — uscis.gov in a WebView, receipt filled in, the
//    person taps Check Status, the result text is read and saved.
//  • Live check (official USCIS API via our server) — only when the server runs with production keys.
//  • Fallbacks: Safari + paste; paste the myUSCIS case page text or JSON; import a .json/.txt file;
//    open the JSON links in the Safari app (Advanced).
// The last saved snapshot is the case's cached status ("From myUSCIS · synced …"), offline too.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, Share, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFamily } from '../data/FamilyProvider';
import { Button, Card, Field, Group, Hint, LegalLine, Note, Row, Screen, SectionHeader, SheetButtons, Switch, T, Timeline, TourTarget, Why, font, useSheet, useSheetTour, useTheme, useToast, useTour, TourScope, TourButton, EmptyState, tint } from '../ui';
import { back, go, runFlow } from './common';
import { startCaseCheck } from './sheets';
import type { CaseView } from '../core/cases';
import { fmt } from '../core/dates';
import { today } from '../core/dates';
import { parseCaseText } from '../core/uscis';
import {
  egovToPart, isIOE, mergedTimeline, myuscisUrls, noticeChecklist, parseMyuscis, sourceName, touchedAfterLastEvent, NO_DATA_REASONS, MYUSCIS_ACCOUNT_URL,
  type ParseFail, type ParseOk, type PartKind, type MySnapshot,
} from '../core/myuscis';
import {
  MYUSCIS_SIGNIN_URL, EGOV_START_URL, allowedEgovHost, allowedMyuscisHost, describeResult, egovScript, isAuthPage, isEndpointUrl, isSignedInUrl,
  myuscisFetchScript, needsFallback, newNonce, readPageScript, readWebMessage, type EndpointReport, type FetchResult,
} from '../core/myuscisWeb';
import { dismissNotice, lastSnap, liveCheck, markSeen, readRaw, saveRaw, saveReport, saveSync, scheduleWeekly, setLiveBackground, setPrefs, useCaseSync, useLiveAvailable, useSyncState, type SaveResult } from '../data/myuscis';
import { webViewModule } from '../native/webview';
import { copy, readClipboard } from '../native/device';
import { native } from '../native/safe';
import { readText, share, writeCacheText } from '../native/files';
import { isPendingCase } from '../core/cases';

const when = (iso?: string) => {
  if (!iso) return '';
  try { const d = new Date(iso); return `${fmt(iso.slice(0, 10))} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; } catch { return fmt(iso.slice(0, 10)); }
};
const SRC_LABEL: Record<string, string> = { web: 'myUSCIS (in the app)', paste: 'pasted text', file: 'imported file', egov: 'uscis.gov (in the app)', live: 'Live check' };
const ID_TO_KIND: Record<string, PartKind> = { case: 'case', notice: 'case', receipt: 'receipt', documents: 'documents' };
export const DISCLAIMER = 'Immigration Wallet is not affiliated with USCIS. myUSCIS event codes are internal and undocumented: the plain-English meanings are an informal decoding from public write-ups and may be wrong.';

/** Route: /case/sync?id=<case id> */
export function SyncScreen() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const f = useFamily();
  const c = f.caseList.find((x) => x.id === decodeURIComponent(id ?? ''));
  const tour = useTour('case-sync');
  useEffect(() => { if (c) markSeen(c.id).catch(() => {}); }, [c?.id]);
  if (!c) return <Screen nav={{ back: 'Back', onBack: back }}><EmptyState icon="doc" title="Case deleted" /></Screen>;
  return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'Status & sync' }} tour={tour}>
      <SyncBody view={c} autoStart={start} />
    </Screen>
  );
}

function SyncBody({ view, autoStart }: { view: CaseView; autoStart?: string }) {
  const f = useFamily();
  const sheet = useSheet();
  const toast = useToast();
  const state = useSyncState();
  const rec = state.cases[view.id];
  const snap = lastSnap(rec);
  const live = useLiveAvailable();
  const [web, setWeb] = useState<null | 'myuscis' | 'egov'>(null);
  const [result, setResult] = useState<{ fail?: ParseFail; saved?: SaveResult; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const wv = !!webViewModule();
  const ioe = isIOE(view.receipt);
  const owner = f.people.find((p) => p.id === view.ownerId);
  const started = useRef(false);

  const startMyuscis = () => {
    if (!wv) { toast('Needs the latest app version'); return; }
    if (!state.prefs.webNoticeSeen) { sheet.open('Before you sign in', <WebNotice onOk={() => { setPrefs({ webNoticeSeen: true }); setWeb('myuscis'); }} />); return; }
    setWeb('myuscis');
  };
  useEffect(() => { if (!started.current && autoStart === 'myuscis' && ioe) { started.current = true; setTimeout(startMyuscis, 400); } }, [autoStart]);

  const onSaved = (r: SaveResult, what: string) => {
    if (!r.ok) { setResult({ note: r.message }); return; }
    setResult({ saved: r });
    markSeen(view.id).catch(() => {});
    toast(r.diff.first ? `Synced · ${what}` : r.diff.any ? `${r.diff.changes.length} change${r.diff.changes.length === 1 ? '' : 's'} found` : 'No changes since last sync');
  };
  const save = async (parts: ParseOk[], source: string) => onSaved(await saveSync(view, parts, f.actions, { settings: f.settings, foreground: true, source }), SRC_LABEL[source] ?? source);

  const doLive = async () => { setBusy(true); try { onSaved(await liveCheck(view, f.actions, { settings: f.settings, foreground: true }), 'Live check'); } finally { setBusy(false); } };

  return (
    <>
      <CachedStatus view={view} />
      {result?.fail ? <FailCard fail={result.fail} onEgov={() => (wv ? setWeb('egov') : startCaseCheck(view, sheet.open))} /> : null}
      {result?.note ? <Note tone="amber"><T style={font.sub}>{result.note}</T></Note> : null}

      <SectionHeader>Update this case</SectionHeader>
      <TourTarget id="sync-main">
        <Card>
          {ioe ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T style={[font.headline, { flex: 1 }]}>Sync with myUSCIS</T>
                <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#8E8E93' }}><T tone="text2" style={font.caption}>Experimental</T></View>
              </View>
              <Hint>Sign in on USCIS’s own page inside the app. Then the app reads your case history, notices and last update once. Your password never touches Immigration Wallet, and nothing of the sign-in is kept.</Hint>
              <View style={{ marginTop: 12 }}><Button block icon="lock" title="Sync with myUSCIS (sign in here)" onPress={startMyuscis} disabled={!wv} /></View>
              {!wv ? <Hint>Needs the latest app version from TestFlight. Use the options below meanwhile.</Hint> : null}
              <View style={{ height: 14 }} />
            </>
          ) : null}
          <T style={font.headline}>Public status</T>
          <Hint>{wv ? 'Opens uscis.gov in the app with your receipt number filled in. You tap Check Status; the result is saved here.' : 'Copies the receipt number and opens uscis.gov in Safari. Copy the result and paste it back.'}</Hint>
          <View style={{ marginTop: 12 }}>
            <Button block kind={ioe ? 'tint' : 'primary'} icon="compass" title={wv ? 'Check public status in the app' : 'Copy number & open uscis.gov'} onPress={() => (wv ? setWeb('egov') : startCaseCheck(view, sheet.open))} />
          </View>
          {live ? (
            <>
              <View style={{ height: 14 }} />
              <T style={font.headline}>Live check</T>
              <Hint>Asks the official USCIS Case Status API through our server. Your receipt number is sent only to ask USCIS — it isn’t stored or logged (the answer is kept in the server’s memory for up to 3 hours).</Hint>
              <View style={{ marginTop: 12 }}><Button block kind="tint" icon="refresh" title="Check now" busy={busy} onPress={doLive} /></View>
              <Row icon="bell" title="Check my cases automatically" subtitle="When you open the app and in the background (iOS decides when)" trailing={<Switch value={!!state.prefs.live} label="Check my cases automatically" onValueChange={async (on) => { await setPrefs({ live: on }); await setLiveBackground(on); toast(on ? 'Automatic checks on' : 'Automatic checks off'); }} />} />
            </>
          ) : null}
        </Card>
      </TourTarget>

      <SectionHeader>Other ways</SectionHeader>
      <TourTarget id="sync-paste"><PasteCard view={view} onParts={(p, src) => save(p, src)} onFail={(fail) => setResult({ fail })} /></TourTarget>
      <Group>
        {wv ? <Row icon="compass" title="Check in Safari and paste" subtitle="Copies the receipt, opens uscis.gov in Safari" onPress={() => startCaseCheck(view, sheet.open)} /> : null}
        <Row icon="ext" title="Advanced: myUSCIS JSON links" subtitle="Open in Safari where you’re signed in, copy, paste here" onPress={() => sheet.open('myUSCIS JSON links', <LinksSheet receipt={view.receipt!} />)} />
      </Group>

      <Checklist view={view} snap={snap} dismissed={rec?.dismissed} ownerId={owner?.id} />
      <SyncTimeline view={view} snap={snap} />
      <Details view={view} snap={snap} report={rec?.report} />
      <Reminders />
      <Note tone="grey" style={{ marginTop: 20 }}><T tone="text2" style={font.caption}>{DISCLAIMER}</T></Note>

      {web === 'myuscis' ? <MyuscisWebSync view={view} onClose={() => setWeb(null)} onDone={async (parts, fails, reports) => {
        setWeb(null);
        await saveReport(view.id, reports);
        if (parts.length) await save(parts, 'web');
        else setResult({ fail: fails[0] ?? { ok: false, kind: 'noData', title: 'myUSCIS didn’t return data', message: 'Nothing came back from myUSCIS.' } });
      }} /> : null}
      {web === 'egov' ? <EgovCheck view={view} onClose={() => setWeb(null)} onDone={async (part) => { setWeb(null); await save([part], 'egov'); }} /> : null}
    </>
  );
}

/** The cached status: the last saved sync, with changes since the one before. Also used on the case page. */
export function CachedStatus({ view, compact }: { view: CaseView; compact?: boolean }) {
  const rec = useCaseSync(view.id);
  const snap = lastSnap(rec);
  const t = useTheme();
  if (!snap) return compact ? null : <Note tone="blue"><T style={font.sub}>Not synced yet. Pick a way below — the result is saved on this phone and shows here, even offline.</T></Note>;
  const ch = rec?.changes;
  const fresh = ch && ch.at === rec?.lastAt;
  const touched = touchedAfterLastEvent(snap);
  return (
    <Card style={compact ? { marginTop: 12 } : undefined}>
      <T tone="text2" style={font.foot}>{`From ${rec?.lastSource === 'egov' ? 'uscis.gov' : rec?.lastSource === 'live' ? 'Live check' : 'myUSCIS'} · synced ${when(rec?.lastAt)}`}</T>
      <T style={[font.headline, { marginTop: 4 }]}>{snap.status ?? (snap.events.length ? snap.events[snap.events.length - 1].text : 'Synced')}</T>
      {snap.updatedAt ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{`USCIS last updated the case ${fmt(snap.updatedAt.slice(0, 10))}`}</T> : null}
      {ch ? (
        <View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: tint(ch.silentAt ? t.amber : t.accent, 0.14) }}>
          <T style={[font.foot, { fontWeight: '600' }]}>{fresh ? 'Changes since last sync' : `Last changes · ${when(ch.at)}`}</T>
          {ch.list.slice(0, compact ? 3 : 8).map((c, i) => <T key={i} style={[font.foot, { marginTop: 3 }]}>{`• ${c.text}${c.date && c.kind !== 'silent' ? ` (${fmt(c.date.slice(0, 10))})` : ''}`}</T>)}
        </View>
      ) : rec && rec.snaps.length > 1 ? <T tone="text2" style={[font.foot, { marginTop: 8 }]}>No changes since the previous sync.</T> : null}
      {!ch?.silentAt && touched ? <T tone="amber" style={[font.foot, { marginTop: 8 }]}>{`Touched on ${fmt(touched.slice(0, 10))} after its latest event — a possible silent update.`}</T> : null}
      {compact ? <View style={{ marginTop: 10, flexDirection: 'row' }}><Button size="sm" kind="tint" title="Status & sync" onPress={() => go('/case/sync', { id: view.id })} /></View> : null}
    </Card>
  );
}

function FailCard({ fail, onEgov }: { fail: ParseFail; onEgov: () => void }) {
  const toast = useToast();
  return (
    <Note tone="amber">
      <T style={[font.sub, { fontWeight: '600' }]}>{fail.title}</T>
      <T style={[font.sub, { marginTop: 4 }]}>{fail.message}</T>
      {fail.kind === 'noData' || fail.kind === 'notSignedIn' ? (
        <View style={{ marginTop: 8 }}>
          <T tone="text2" style={font.foot}>Likely reasons:</T>
          {NO_DATA_REASONS.map((r, i) => <T key={i} style={[font.foot, { marginTop: 4 }]}>{`${i + 1}. ${r}`}</T>)}
        </View>
      ) : null}
      {fail.requestId ? (
        <Pressable onPress={async () => { await copy(fail.requestId!); toast('Request ID copied'); }} accessibilityRole="button" accessibilityLabel="Copy request ID">
          <T tone="text2" selectable style={[font.caption, { marginTop: 8, fontFamily: 'Menlo' }]}>{`Request ID ${fail.requestId} · tap to copy`}</T>
        </Pressable>
      ) : null}
      <View style={{ marginTop: 10, flexDirection: 'row' }}><Button size="sm" kind="tint" icon="compass" title="Check the public status instead" onPress={onEgov} /></View>
    </Note>
  );
}

function WebNotice({ onOk }: { onOk: () => void }) {
  const s = useSheet();
  return (
    <View>
      <Why>This uses myUSCIS’s internal pages, which USCIS doesn’t document. It may stop working at any time.</Why>
      <Why>You sign in on USCIS’s own page. Your password and codes never touch Immigration Wallet — the app doesn’t read, store or fill them in.</Why>
      <Why>The sign-in isn’t kept: each sync starts fresh and the session is gone when the window closes. The case data read is saved on this phone only.</Why>
      <SheetButtons><Button grow kind="ghost" title="Not now" onPress={() => s.close()} /><Button grow title="Continue" onPress={() => { s.close(); setTimeout(onOk, 350); }} /></SheetButtons>
    </View>
  );
}

// ---------- in-app myUSCIS sync (incognito WebView) ----------
type Phase = 'signin' | 'fetch' | 'fallback' | 'done';
function MyuscisWebSync({ view, onClose, onDone }: { view: CaseView; onClose: () => void; onDone: (parts: ParseOk[], fails: ParseFail[], reports: EndpointReport[]) => void }) {
  const WebView = webViewModule();
  const t = useTheme();
  const ref = useRef<any>(null);
  const nonce = useMemo(newNonce, []);
  const [phase, setPhaseState] = useState<Phase>('signin');
  const phaseRef = useRef<Phase>('signin');
  const setPhase = (x: Phase) => { phaseRef.current = x; setPhaseState(x); };
  const curUrl = useRef('');
  const settle = useRef<any>(null);
  const [onAccount, setOnAccount] = useState(false);
  const [uri, setUri] = useState(MYUSCIS_SIGNIN_URL);
  const [msg, setMsg] = useState('Sign in on the USCIS page below.');
  const links = useMemo(() => myuscisUrls(view.receipt!), [view.receipt]);
  const results = useRef<Record<string, { r: FetchResult; m: 'A' | 'B' }>>({});
  const queue = useRef<string[]>([]);
  const httpStatus = useRef<number>(200);
  const timer = useRef<any>(null);
  const ran = useRef(false);

  const finish = async () => {
    setPhase('done');
    clearTimeout(timer.current);
    const reports: EndpointReport[] = links.map((l) => { const x = results.current[l.id]; return x ? describeResult(x.r, x.m) : { id: l.id, method: '-', status: 0, json: false, dataNull: false, size: 0, ok: false }; });
    const parts: ParseOk[] = [];
    const fails: ParseFail[] = [];
    for (const l of links) {
      const x = results.current[l.id];
      if (!x || !x.r.text) continue;
      const p = parseMyuscis(x.r.text, ID_TO_KIND[l.id]);
      if (p.ok) parts.push(p); else fails.push(p);
    }
    await saveRaw(view.id, links.map((l) => ({ id: l.id, method: results.current[l.id]?.m ?? '-', status: results.current[l.id]?.r.status ?? 0, text: results.current[l.id]?.r.text ?? '' })));
    try { ref.current?.clearCache?.(true); } catch {}
    onDone(parts, fails.sort((a, b) => Number(b.kind === 'noData') - Number(a.kind === 'noData')), reports);
  };
  const nextFallback = () => {
    const id = queue.current.shift();
    if (!id) { finish(); return; }
    const l = links.find((x) => x.id === id)!;
    httpStatus.current = 200;
    setMsg(`Trying another way: ${l.title}…`);
    setUri(`${l.url}?_=${Date.now()}`);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { results.current[id] ??= { r: { id, status: 0, text: '', error: 'timeout' }, m: 'B' }; nextFallback(); }, 15000);
  };
  const runFetch = () => {
    if (ran.current) return;
    ran.current = true;
    setPhase('fetch');
    setMsg('Signed in. Reading your case…');
    ref.current?.injectJavaScript(myuscisFetchScript(view.receipt!, nonce));
    timer.current = setTimeout(() => { if (phaseRef.current === 'fetch') { queue.current = links.map((l) => l.id).filter((id) => !results.current[id]); setPhase('fallback'); nextFallback(); } }, 20000);
  };
  // Signed in = still on a my.uscis.gov/account page 2.5 s after it loaded (a signed-out visit redirects to sign-in first).
  const onNav = (e: { url: string; loading?: boolean }) => {
    curUrl.current = e.url;
    const acct = isSignedInUrl(e.url) && !isAuthPage(e.url);
    setOnAccount(acct);
    clearTimeout(settle.current);
    if (phaseRef.current === 'signin' && !e.loading && acct) settle.current = setTimeout(() => { if (isSignedInUrl(curUrl.current)) runFetch(); }, 2500);
  };
  const onLoadEnd = (e: any) => {
    const url = e?.nativeEvent?.url ?? '';
    if (phaseRef.current === 'fallback' && isEndpointUrl(url)) ref.current?.injectJavaScript(readPageScript(nonce));
    else onNav({ url, loading: false });
  };
  const onMessage = (e: any) => {
    const m = readWebMessage(e?.nativeEvent?.data ?? '', nonce);
    if (!m) return;
    if (m.type === 'myuscis') {
      clearTimeout(timer.current);
      for (const r of m.results ?? []) results.current[r.id] = { r, m: 'A' };
      queue.current = links.map((l) => l.id).filter((id) => { const x = results.current[id]; return !x || needsFallback(describeResult(x.r, 'A')); });
      if (queue.current.length) { setPhase('fallback'); nextFallback(); } else finish();
    } else if (m.type === 'myuscis-page' && phaseRef.current === 'fallback') {
      const l = links.find((x) => m.url.split('?')[0].endsWith(x.path));
      if (!l) return;
      const b: FetchResult = { id: l.id, status: httpStatus.current, text: m.text };
      const prevA = results.current[l.id];
      // keep method B only if it did better than method A
      if (!prevA || describeResult(b, 'B').ok || !prevA.r.text) results.current[l.id] = { r: b, m: 'B' };
      clearTimeout(timer.current);
      nextFallback();
    }
  };
  if (!WebView) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 0.5, borderColor: t.sep ?? '#3A3A3C' }}>
          <Button size="sm" kind="ghost" title="Close" onPress={() => { try { ref.current?.clearCache?.(true); } catch {} onClose(); }} />
          <View style={{ flex: 1 }}>
            <T style={font.headline} numberOfLines={1}>myUSCIS · Experimental</T>
            <T tone="text2" style={font.caption} numberOfLines={2}>{msg}</T>
          </View>
          {phase === 'fetch' || phase === 'fallback' ? <ActivityIndicator /> : phase === 'signin' && onAccount ? <Button size="sm" title="Read my case" onPress={runFetch} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            ref={ref}
            source={{ uri }}
            incognito
            sharedCookiesEnabled={false}
            cacheEnabled={false}
            javaScriptEnabled
            originWhitelist={['https://*']}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(r: { url: string }) => { if (allowedMyuscisHost(r.url)) return true; Linking.openURL(r.url).catch(() => {}); return false; }}
            onNavigationStateChange={onNav}
            onLoadEnd={onLoadEnd}
            onHttpError={(e: any) => { httpStatus.current = e?.nativeEvent?.statusCode ?? 0; }}
            onMessage={onMessage}
            style={{ flex: 1, opacity: phase === 'signin' ? 1 : 0.35 }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ---------- in-app uscis.gov public check ----------
function EgovCheck({ view, onClose, onDone }: { view: CaseView; onClose: () => void; onDone: (p: ParseOk) => void }) {
  const WebView = webViewModule();
  const t = useTheme();
  const nonce = useMemo(newNonce, []);
  const [filled, setFilled] = useState(false);
  const done = useRef(false);
  useEffect(() => { if (view.receipt) copy(view.receipt).catch(() => {}); }, []);
  if (!WebView) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }}>
          <Button size="sm" kind="ghost" title="Close" onPress={onClose} />
          <View style={{ flex: 1 }}>
            <T style={font.headline}>uscis.gov case status</T>
            <T tone="text2" style={font.caption} numberOfLines={2}>{filled ? 'Receipt filled in — tap Check Status on the page.' : `Receipt ${view.receipt} is copied — paste it if the box is empty, then tap Check Status.`}</T>
          </View>
        </View>
        <WebView
          source={{ uri: EGOV_START_URL }}
          incognito
          javaScriptEnabled
          originWhitelist={['https://*']}
          setSupportMultipleWindows={false}
          injectedJavaScript={egovScript(view.receipt ?? '', nonce)}
          onShouldStartLoadWithRequest={(r: { url: string }) => { if (allowedEgovHost(r.url)) return true; Linking.openURL(r.url).catch(() => {}); return false; }}
          onMessage={(e: any) => {
            const m = readWebMessage(e?.nativeEvent?.data ?? '', nonce);
            if (!m) return;
            if (m.type === 'egov-filled') setFilled(true);
            if (m.type === 'egov-text' && !done.current) {
              const p = egovToPart(parseCaseText(m.text, view.receipt), today());
              if (p.ok) { done.current = true; onDone(p); }
            }
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}

// ---------- paste / import ----------
function PasteCard({ view, onParts, onFail }: { view: CaseView; onParts: (p: ParseOk[], src: string) => void; onFail: (f: ParseFail) => void }) {
  const [text, setText] = useState('');
  const [box, setBox] = useState(false);
  const toast = useToast();
  const read = (x: string, src: string) => {
    const p = parseMyuscis(x);
    if (p.ok) { onParts([p], src); setText(''); setBox(false); return; }
    // a uscis.gov Case Status Online copy is fine too
    const eg = egovToPart(parseCaseText(x, view.receipt), today());
    if (eg.ok && (p.kind === 'notMyuscis')) { onParts([eg], src); setText(''); setBox(false); return; }
    onFail(p);
  };
  const paste = async () => { const x = await readClipboard(); if (x === undefined) { setBox(true); return; } read(x, 'paste'); };
  const importFile = async () => {
    const DP = native.documentPicker();
    if (!DP?.getDocumentAsync) { toast('Files aren’t available in this build'); return; }
    try {
      const r = await DP.getDocumentAsync({ type: ['application/json', 'text/plain', 'public.json', 'public.plain-text', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      if ((a.size ?? 0) > 2_000_000) { toast('That file is too big'); return; }
      const x = a.file && typeof a.file.text === 'function' ? await a.file.text() : await readText(a.uri);
      if (!x) { toast('Couldn’t open that file'); return; }
      read(x, 'file');
    } catch { toast('Couldn’t open that file'); }
  };
  return (
    <Card>
      <T style={font.headline}>Paste or import</T>
      <Hint>The status text from the myUSCIS case page (status, case history, documents), a uscis.gov result, or a myUSCIS JSON answer. Read on this phone only.</Hint>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <Button size="sm" icon="copy" title="Paste" onPress={paste} />
        <Button size="sm" kind="tint" icon="folder" title="Import .json or .txt" onPress={importFile} />
        <Button size="sm" kind="ghost" icon="edit" title="Type or paste here" onPress={() => setBox(true)} />
      </View>
      {box ? (
        <>
          <Field label="Paste here" value={text} onChangeText={setText} multiline autoCapitalize="none" placeholder="Case Was Received…" />
          <View style={{ marginTop: 8, flexDirection: 'row' }}><Button size="sm" kind="tint" title="Read this" disabled={!text.trim()} onPress={() => read(text, 'paste')} /></View>
        </>
      ) : null}
    </Card>
  );
}

function LinksSheet({ receipt }: { receipt: string }) {
  const toast = useToast();
  const tour = useSheetTour('myuscis-links');
  return (
    <TourScope tour={tour}>
      <View style={{ alignItems: 'flex-end' }}><TourButton /></View>
      <Why>These are myUSCIS’s internal JSON pages. They only answer in the browser where you’re signed in — the Safari app, not a window inside another app. A direct visit often comes back empty, even for your own case.</Why>
      <TourTarget id="signin"><Row icon="lock" title="1. Sign in to myUSCIS in Safari" subtitle="my.uscis.gov/account" onPress={() => Linking.openURL(MYUSCIS_ACCOUNT_URL).catch(() => {})} /></TourTarget>
      {myuscisUrls(receipt).map((l, i) => (
        <Row key={l.id} icon="ext" title={`${i + 2}. ${l.title}`} subtitle="Open in Safari, Select All, Copy, come back and Paste" onPress={() => Linking.openURL(l.url).catch(() => {})}
          trailing={<Button size="sm" kind="ghost" title="Copy link" onPress={async () => { await copy(l.url); toast('Link copied'); }} />} />
      ))}
      <Hint>Safari may copy only part of a long page. If the app says the text is cut off, use Select All again.</Hint>
    </TourScope>
  );
}

// ---------- checklist, timeline, details, reminders ----------
function Checklist({ view, snap, dismissed, ownerId }: { view: CaseView; snap?: MySnapshot; dismissed?: string[]; ownerId?: string }) {
  const f = useFamily();
  const toast = useToast();
  const items = noticeChecklist(snap, view.receipt ?? '', f.docs.filter((d) => d.ownerId === view.ownerId), dismissed);
  if (!items.length) return null;
  return (
    <>
      <SectionHeader>Notices to keep</SectionHeader>
      <TourTarget id="sync-notices">
        <Group>
          {items.map((it) => (
            <Row key={it.key} icon={it.attached ? 'checkc' : 'doc'} iconTone={it.attached ? 'green' : undefined} title={it.title} subtitle={`${it.date ? `${fmt(it.date.slice(0, 10))} · ` : ''}${it.attached ? 'In the wallet' : 'Tap to attach the PDF or a photo'}`}
              onPress={it.attached || !ownerId ? undefined : () => runFlow({ mode: 'renew', pids: [ownerId], only: [it.step] }, f, toast)}
              trailing={!it.attached ? <Button size="sm" kind="ghost" title="Hide" onPress={() => dismissNotice(view.id, it.key)} /> : undefined} />
          ))}
        </Group>
      </TourTarget>
    </>
  );
}

function SyncTimeline({ view, snap }: { view: CaseView; snap?: MySnapshot }) {
  const items = mergedTimeline(view.history, snap);
  const SRC = { uscis: 'uscis.gov', myuscis: 'myUSCIS', you: 'You' } as const;
  return (
    <>
      <SectionHeader>History</SectionHeader>
      <TourTarget id="sync-history"><Card>{items.length ? <Timeline items={items.slice(0, 40).map((h, i) => ({ title: h.text, sub: `${fmt(h.date)} · ${SRC[h.source]}`, state: i ? 'done' : 'now' }))} /> : <T tone="text2" style={font.foot}>No history yet.</T>}</Card></TourTarget>
    </>
  );
}

function Details({ view, snap, report }: { view: CaseView; snap?: MySnapshot; report?: { at: string; items: EndpointReport[] } }) {
  const toast = useToast();
  const loc = snap?.location;
  const flags = snap?.flags ?? {};
  const rows: [string, string][] = [];
  if (loc?.fieldOffice || loc?.serviceCenter || loc?.office) rows.push(['Location', [loc.fieldOffice, loc.serviceCenter, loc.office].filter(Boolean).join(' · ') + (loc.code ? ` (${loc.code})` : '')]);
  if (snap?.submittedAt) rows.push(['Filed', fmt(snap.submittedAt.slice(0, 10))]);
  if (snap?.actionCode) rows.push(['Status code', snap.actionCode]);
  if (flags.acked !== undefined) rows.push(['Acknowledged by officer + system', flags.acked ? 'Yes (informal reading)' : 'Not yet']);
  if (flags.actionRequired) rows.push(['Action for you', 'Yes — check myUSCIS']);
  if (flags.closed) rows.push(['Closed in myUSCIS', 'Yes']);
  if (flags.cmsFailure) rows.push(['Case-system sync flag', 'On']);
  if (snap?.concurrent?.length) rows.push(['Filed together with', `${snap.concurrent.length} other case${snap.concurrent.length === 1 ? '' : 's'}`]);
  if (snap) rows.push(['Sources', Object.keys(snap.stamps ?? {}).map((s) => sourceName(s as any)).join(', ') || '—']);
  if (!rows.length && !report) return null;
  const shareRaw = async () => {
    const raw = await readRaw(view.id);
    if (!raw) { toast('No raw data saved yet'); return; }
    if (Platform.OS === 'web') { Share.share({ message: raw }).catch(() => {}); return; }
    const uri = await writeCacheText('myuscis-raw.json', raw);
    if (!uri || !(await share(uri, 'application/json', 'myUSCIS raw data'))) Share.share({ message: raw }).catch(() => {});
  };
  return (
    <>
      <SectionHeader>Details</SectionHeader>
      {rows.length ? <Group>{rows.map(([k, v]) => <Row key={k} title={k} subtitle={v} />)}</Group> : null}
      {report ? (
        <>
          <SectionHeader>{`Sync details · ${when(report.at)}`}</SectionHeader>
          <Card>
            {report.items.map((r) => (
              <View key={r.id} style={{ paddingVertical: 4 }}>
                <T style={[font.foot, { fontWeight: '600' }]}>{`${r.id} · ${r.ok ? 'data' : r.dataNull ? 'data: null' : r.json ? 'no data' : r.size ? 'not JSON' : 'no answer'}`}</T>
                <T tone="text2" selectable style={[font.caption, { fontFamily: 'Menlo' }]}>{`method ${r.method} · HTTP ${r.status || '—'} · ${r.size} chars${r.requestId ? ` · requestId ${r.requestId}` : ''}${r.error ? ` · ${r.error}` : ''}`}</T>
              </View>
            ))}
            <Hint>Method A = read inside the signed-in page; B = opened the link in the window. The raw data contains your case details — share it only with people you trust.</Hint>
            <View style={{ marginTop: 10, flexDirection: 'row' }}><Button size="sm" kind="tint" icon="share" title="Share raw data for support" onPress={shareRaw} /></View>
          </Card>
        </>
      ) : null}
    </>
  );
}

function Reminders() {
  const s = useSyncState();
  const f = useFamily();
  const toast = useToast();
  const on = s.prefs.weekly !== false;
  return (
    <>
      <SectionHeader>Reminder</SectionHeader>
      <Group>
        <Row icon="bell" title="Weekly: check your open cases" subtitle="A gentle Saturday reminder while a case is pending" trailing={<Switch value={on} label="Weekly reminder" onValueChange={async (v) => { await setPrefs({ weekly: v }); await scheduleWeekly(v, f.caseList.filter(isPendingCase).length); toast(v ? 'Weekly reminder on' : 'Weekly reminder off'); }} />} />
      </Group>
    </>
  );
}

/** Mounted once at the root: weekly reminder, Live check on open (when on and offered), background task. */
export function SyncAuto() {
  const f = useFamily();
  const s = useSyncState();
  const open = f.caseList.filter(isPendingCase);
  const key = open.map((c) => c.id).join(',');
  useEffect(() => { if (f.ready) scheduleWeekly(s.prefs.weekly !== false, open.length).catch(() => {}); }, [f.ready, key, s.prefs.weekly]);
  useEffect(() => {
    if (!f.ready || !s.prefs.live) return;
    const { liveCheckDue } = require('../data/myuscis');
    liveCheckDue(open, f.actions, { settings: f.settings, foreground: true }).catch(() => {});
    setLiveBackground(true).catch(() => {});
  }, [f.ready, s.prefs.live]);
  return null;
}
