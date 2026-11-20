// Share with family (v2.9). Self-contained: the two entry rows (person page / Family tab, Settings)
// and both screens live here so the person and Family screens only gain one line each.
//  - /share?pid=…   sender: choose people, documents, scans, expiry -> encrypted .iwshare file ->
//                   share sheet; the one-time 6-word code is shown on this screen only.
//  - /share-import?file=…   recipient: file (opened from iOS or picked) -> code -> preview -> merge.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DOC_LABEL, type Document } from '../core/model';
import { fmt } from '../core/dates';
import { CODE_WORDS, DEFAULT_EXPIRY_DAYS, ShareExpired, WRONG_CODE, guessMe, previewShare, readCode, readShareHeader, type ShareReport, type SharePayload } from '../core/share';
import { useFamily } from '../data/FamilyProvider';
import { shareInviteText, appInviteText } from '../core/invite';
import { INVITE_URL } from '../content/links';
import { buildShare, sendInvite, clearOldShares, forgetIncoming, importShare, openShare, pickShareFile, readShareUrl, sendShare, type BuiltShare, type PickedShare } from '../data/shareIO';
import { Avatar, Button, CheckRow, Field, Group, Hint, Meter, Note, Option, PastelScope, Row, Screen, SectionHeader, Segmented, SheetButtons, Spinner, Switch, T, Why, font, useTheme, useToast } from '../ui';
import { back, go, home, relationLabel } from './common';

// ---------- entry points (one line each in other screens) ----------
/** Person page (pid) and Family tab (no pid). */
export function ShareRow({ pid, section }: { pid?: string; section?: boolean }) {
  const f = useFamily();
  if (!f.people.length) return null;
  const p = pid ? f.people.find((x) => x.id === pid) : undefined;
  const row = <Row icon="share" iconPastel="sky" title="Share with family" subtitle={p ? `Send ${p.relation === 'self' ? 'your' : `${p.name}’s`} documents to another phone, encrypted` : 'Send documents to your spouse’s phone, encrypted'} onPress={() => go('/share', pid ? { pid } : undefined)} />;
  return section ? <><SectionHeader>Share</SectionHeader><Group>{row}</Group></> : <Group style={{ marginTop: 12 }}>{row}</Group>;
}
/** Settings (inside a Group). */
export function ImportSharedRow() {
  return <Row icon="download" title="Import shared documents" subtitle="From a family member’s share file" onPress={() => go('/share-import')} />;
}

/** Settings → Invite family: the app link only, no documents. */
export function InviteRow() {
  const f = useFamily();
  const me = f.people.find((x) => x.relation === 'self');
  return <Row icon="send" title="Invite family" subtitle="Send the app link, no documents" onPress={() => { sendInvite(appInviteText(me?.name, INVITE_URL)); }} />;
}

const dateOf = (iso: string) => fmt(iso.slice(0, 10));
const docLine = (d: Document) => `${DOC_LABEL[d.type] ?? 'Document'}${d.fields.validTo ? ` · until ${fmt(d.fields.validTo)}` : ''}${d.files?.length ? ' · scan' : ''}`;

function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <View style={{ marginTop: 14 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Spinner /><T tone="text2" style={font.foot}>{`${label}… ${pct}%`}</T></View>
      <Meter value={pct} max={100} />
    </View>
  );
}

// ---------- sender ----------
const EXPIRY: [string, number][] = [['1 day', 1], ['7 days', 7], ['30 days', 30]];

export function ShareScreen() {
  const f = useFamily(); const toast = useToast();
  const { pid } = useLocalSearchParams<{ pid?: string }>();
  const [people, setPeople] = useState<Set<string>>(() => new Set(pid && f.people.some((x) => x.id === pid) ? [pid] : f.people.map((x) => x.id)));
  const [off, setOff] = useState<Set<string>>(new Set()); // documents unticked
  const [scans, setScans] = useState(true);
  const [days, setDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const [built, setBuilt] = useState<BuiltShare | null>(null);
  useEffect(() => () => { clearOldShares(); }, []); // the file isn't kept after leaving this screen

  const chosenDocs = f.docs.filter((d) => people.has(d.ownerId) && !off.has(d.id));
  const flip = <K,>(s: Set<K>, k: K) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const send = async (b: BuiltShare) => {
    const me = f.people.find((x) => x.relation === 'self');
    if (!b.uri || !(await sendShare(b.uri, shareInviteText(me?.name, INVITE_URL)))) toast('The share sheet isn’t available here');
  };
  const create = async () => {
    if (!people.size) { toast('Choose at least one person'); return; }
    setBusy(true); setPct(0);
    try {
      const b = await buildShare(f.store, { people: [...people], docs: chosenDocs.map((d) => d.id), scans, expiresInDays: days, from: f.main?.name }, (x) => setPct(Math.round(x * 100)));
      setBuilt(b);
      if (b.uri) setTimeout(() => send(b), 400); // straight to the share sheet; the code stays on screen
    } catch (e) { toast((e as Error).message || 'Couldn’t create the file'); } finally { setBusy(false); }
  };

  if (built) return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'Share code' }}>
      <T a11y="header" style={font.title}>Tell them this code</T>
      <Why>Say it on a call or in person. Don’t send it in the same chat as the file — anyone with both can open it.</Why>
      <CodeCard code={built.code} />
      <Group style={{ marginTop: 14 }}>
        <Row icon="clock" title="Expires" value={dateOf(built.expiresAt)} subtitle="After that the file can’t be opened" />
        <Row icon="doc" title="In the file" subtitle={`${built.people} ${built.people === 1 ? 'person' : 'people'} · ${built.docs} documents · ${built.files} scans`} />
      </Group>
      {built.missingFiles ? <Note tone="amber">{`${built.missingFiles} scan${built.missingFiles === 1 ? ' wasn’t' : 's weren’t'} found on this phone and ${built.missingFiles === 1 ? 'isn’t' : 'aren’t'} in the file.`}</Note> : null}
      <Hint>This code is shown only now. It isn’t saved in the app or inside the file. If you lose it, make a new share.</Hint>
      <SheetButtons>
        <Button kind="ghost" title="Done" onPress={back} />
        <Button grow icon="share" title="Send file" onPress={() => send(built)} />
      </SheetButtons>
    </Screen>
  );

  return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'Share with family' }}>
      <T a11y="header" style={font.title}>Share with family</T>
      <Why>Send documents to your spouse’s (or another family member’s) phone. The file is locked with a one-time code that only this phone shows. Nothing goes to our server.</Why>

      <SectionHeader>People</SectionHeader>
      <Group>{f.people.map((p) => <CheckRow key={p.id} title={`${p.name} · ${relationLabel(p)}`} checked={people.has(p.id)} onPress={() => setPeople(flip(people, p.id))} />)}</Group>

      {f.people.filter((p) => people.has(p.id)).map((p) => {
        const docs = f.docs.filter((d) => d.ownerId === p.id);
        return (
          <React.Fragment key={p.id}>
            <SectionHeader>{`${p.name}’s documents`}</SectionHeader>
            {docs.length ? <Group>{docs.map((d) => <CheckRow key={d.id} title={docLine(d)} checked={!off.has(d.id)} onPress={() => setOff(flip(off, d.id))} />)}</Group>
              : <Hint>No documents yet — only the person is shared.</Hint>}
          </React.Fragment>
        );
      })}

      <SectionHeader>Options</SectionHeader>
      <Group>
        <Row icon="photo" title="Include scans" subtitle="Images and PDFs. Off: only the details read from them" trailing={<Switch value={scans} label="Include scans" onValueChange={setScans} />} />
        <Row icon="clock" title="Code works for">
          <Segmented options={EXPIRY.map((x) => x[0])} value={EXPIRY.find((x) => x[1] === days)?.[0] ?? '7 days'} onChange={(v) => setDays(EXPIRY.find((x) => x[0] === v)?.[1] ?? DEFAULT_EXPIRY_DAYS)} />
        </Row>
      </Group>
      {busy ? <Progress pct={pct} label="Locking the file" /> : null}
      <SheetButtons>
        <Button grow icon="lock" title={`Create secure file · ${chosenDocs.length} documents`} busy={busy} disabled={!people.size} onPress={create} />
      </SheetButtons>
      <Hint>The other phone needs Immigration Wallet. They open the file, type the code, and the documents are added to their app.</Hint>
    </Screen>
  );
}

function CodeCard({ code }: { code: string }) {
  const t = useTheme();
  const words = code.split(' ');
  return (
    <View style={{ marginTop: 16, backgroundColor: t.pastel.sky, borderRadius: 24, padding: 18 }} accessible accessibilityLabel={`Share code: ${words.join(', ')}`}>
      <PastelScope tone="sky">
        <T tone="text2" style={[font.caption, { marginBottom: 10 }]}>{`${CODE_WORDS}-WORD CODE`}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
          {words.map((w, i) => (
            <View key={i} style={{ width: '50%', flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T tone="text2" style={[font.foot, { width: 16, textAlign: 'right' }]}>{String(i + 1)}</T>
              <T selectable style={[font.title, { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 22 }]}>{w}</T>
            </View>
          ))}
        </View>
      </PastelScope>
    </View>
  );
}

// ---------- recipient ----------
export function ShareImportScreen() {
  const f = useFamily(); const toast = useToast();
  const params = useLocalSearchParams<{ file?: string }>();
  const [file, setFile] = useState<PickedShare | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [report, setReport] = useState<ShareReport | null>(null);
  const fails = useRef(0); const [waitUntil, setWaitUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    const u = params.file;
    if (!u) return;
    readShareUrl(String(u)).then(setFile, (e) => setFileError((e as Error).message));
  }, [params.file]);
  useEffect(() => { if (waitUntil <= Date.now()) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [waitUntil]);

  const header = useMemo(() => { try { return file ? readShareHeader(file.text) : null; } catch { return null; } }, [file]);
  const expiredAlready = !!header && Date.parse(header.expiresAt) <= Date.now();
  const waiting = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));

  const choose = async () => { try { const x = await pickShareFile(); if (x) { setFile(x); setFileError(null); } } catch (e) { toast((e as Error).message); } };
  const open = async () => {
    if (!file) return;
    const c = readCode(code);
    if (!('code' in c)) { setCodeError(c.problem); return; }
    setCodeError(undefined); setBusy(true); setPct(0);
    try {
      const p = await openShare(file.text, c.code, new Date(), (x) => setPct(Math.round(x * 100)));
      fails.current = 0;
      setPayload(p);
      setMe(guessMe(f, p) ?? (f.people.length ? null : p.people.find((x) => x.relation === 'spouse')?.id ?? null));
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof ShareExpired) setFileError(msg);
      else {
        setCodeError(msg === WRONG_CODE ? WRONG_CODE : msg);
        if (msg === WRONG_CODE && ++fails.current >= 5) setWaitUntil(Date.now() + 30_000 * 2 ** (fails.current - 5));
      }
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!payload) return;
    setBusy(true);
    try { const r = await importShare(f.store, payload, me); forgetIncoming(file?.uri); setReport(r); }
    catch { toast('Couldn’t add these documents'); } finally { setBusy(false); }
  };

  if (report) return (
    <Screen nav={{ back: 'Back', onBack: home, title: 'Imported' }}>
      <T a11y="header" style={font.title}>Added to this phone</T>
      <Why>Nothing that was already on this phone was removed.</Why>
      <Group style={{ marginTop: 14 }}>
        <Row title="People added" subtitle={report.peopleAdded.join(', ') || 'None'} value={String(report.peopleAdded.length)} />
        <Row title="People already here" subtitle={report.peopleMatched.join(', ') || 'None'} value={String(report.peopleMatched.length)} />
        <Row title="Documents added" value={String(report.docsAdded)} />
        <Row title="Documents updated (newer copy)" value={String(report.docsUpdated)} />
        <Row title="Already up to date (kept)" value={String(report.docsKept)} />
        {report.scansAdded ? <Row title="Scans added to existing documents" value={String(report.scansAdded)} /> : null}
      </Group>
      <Hint>When they send an updated file later, import it the same way: documents are merged, never duplicated.</Hint>
      <SheetButtons><Button grow title="Done" onPress={home} /></SheetButtons>
    </Screen>
  );

  if (payload) {
    const v = previewShare(payload);
    return (
      <Screen nav={{ back: 'Back', onBack: () => setPayload(null), title: 'What’s inside' }}>
        <T a11y="header" style={font.title}>{v.from ? `From ${v.from}` : 'Shared documents'}</T>
        <Why>{`Made ${dateOf(v.createdAt)} · expires ${dateOf(v.expiresAt)} · ${v.docs} documents · ${v.files} scans`}</Why>
        <Group style={{ marginTop: 14 }}>
          {v.people.map((x) => <Row key={x.id} avatar={x.name} title={x.name} subtitle={`${x.docs} document${x.docs === 1 ? '' : 's'}`} />)}
        </Group>
        <SectionHeader>Which one is you?</SectionHeader>
        <View style={{ gap: 10 }}>
          {v.people.map((x) => <Option key={x.id} title={x.name} subtitle={f.main && me === x.id ? `Matched to your profile (${f.main.name})` : undefined} selected={me === x.id} onPress={() => setMe(x.id)} />)}
          <Option title="None of these" subtitle="Add everyone as family members" selected={me === null} onPress={() => setMe(null)} />
        </View>
        <Note tone="blue">Documents already on this phone are kept. When both phones have the same document, the newer copy is used. Nothing here is deleted.</Note>
        <SheetButtons><Button kind="ghost" title="Cancel" onPress={() => setPayload(null)} /><Button grow title="Add to this phone" busy={busy} onPress={apply} /></SheetButtons>
      </Screen>
    );
  }

  return (
    <Screen keyboard nav={{ back: 'Back', onBack: back, title: 'Import' }}>
      <T a11y="header" style={font.title}>Import shared documents</T>
      <Why>Open the share file a family member sent you, then type the 6-word code they tell you. Nothing leaves this phone.</Why>
      <View style={{ marginTop: 14 }}>
        <Button kind={file ? 'ghost' : 'tint'} icon="folder" title={file ? file.name : 'Choose share file'} onPress={choose} />
      </View>
      {header && !fileError ? <Hint>{expiredAlready ? `Expired on ${dateOf(header.expiresAt)}` : `Code works until ${dateOf(header.expiresAt)}`}</Hint> : null}
      {fileError ? <Note tone="red">{fileError}</Note> : expiredAlready ? <Note tone="red">{`This share expired on ${dateOf(header!.expiresAt)}. Ask for a new one.`}</Note> : null}
      {file && !expiredAlready && !fileError ? (
        <>
          <Field label="6-word code" value={code} onChangeText={(s) => { setCode(s); setCodeError(undefined); }} placeholder="e.g. word word word word word word" autoCapitalize="none" error={codeError} />
          <Hint>Spaces, capitals and the numbers don’t matter. The first 4 letters of each word are enough.</Hint>
        </>
      ) : null}
      {busy ? <Progress pct={pct} label="Unlocking" /> : null}
      {waiting ? <Note tone="amber">{`Too many wrong codes. Try again in ${waiting} s.`}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={back} />
        <Button grow title="Open" disabled={!file || !code.trim() || expiredAlready || !!fileError || !!waiting} busy={busy} onPress={open} />
      </SheetButtons>
      <Hint>If a share file doesn’t open from Messages or AirDrop, save it to Files, then choose it here.</Hint>
    </Screen>
  );
}

