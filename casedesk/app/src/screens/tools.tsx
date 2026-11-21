// Tools tab and every tool. Look-ups use the CaseDesk server when it answers and a dated built-in
// copy otherwise (each screen says which). "Can I travel?" runs the real rules on the family's documents.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { addDays, daysTo, fmt, isISO, today } from '../core/dates';
import { evaluateFamily } from '../core/rules/engine';
import { isResident } from '../core/model';
import { useFamily } from '../data/FamilyProvider';
import { fetchOr, getJSON } from '../data/api';
import { BULLETIN, COUNTRIES as VB_COUNTRIES, fmtCell, isCurrent, type Bulletin, type Country } from '../content/bulletin';
import { PROCESSING, PT_AS_OF, fmtMonths } from '../content/processing';
import { FEE_CASES, FEES_AS_OF, type EmployerSize } from '../content/fees';
import { WAITS_BUILT_IN, INTERVIEW_RULES, WAITS_URL, type Waits } from '../content/waits';
import { VISAS, GUIDES_REVIEWED } from '../content/visas';
import { WEIGHTS, WEIGHT_NOTE, STEPS as LOT_STEPS, LAST_SEASON, CAP_GAP, FEE_STATUS, LOTTERY_AS_OF, NEXT_SEASON } from '../content/lottery';
import { CIVICS, CIVICS_SOURCE } from '../content/civics';
import { TOP_INITIAL_FY25, H1B_SOURCE } from '../content/h1b';
import {
  TourButton, TourTarget, useTour, tint, radius, IconTile, Avatar, BigText, Button, Card, CheckRow, useLayout, Chip, ChipToggle, Chips, DateField, Field, Group, H1, Hint, Icon, LargeTitle, LinkButton, Note, Option, Row, Screen, SectionHeader, Segmented, SelectField, Stack, T, Timeline, Why, font, useSheet, useTheme, useToast, Pill,
} from '../ui';
import { back, DataFooter, go, statusLabel } from './common';
import { SOURCES } from '../content/legal';
import { TOURS } from '../content/tours';

/** '17-SEP-2026' → 'Sep 17, 2026'. */
const waitsDate = (u?: string | null) => { if (!u) return undefined; const m = u.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i); return m ? `${m[2][0]}${m[2].slice(1).toLowerCase()} ${+m[1]}, ${m[3]}` : u; };
import { answerState, ANSWER_LABEL, quizSummary, type AnswerState, type QuizResult } from '../core/quiz';
import { FamilyFilings, familyForms } from './filings';
import { GcPlanBody } from './gc';
import { gcTrackOf } from '../core/gc';
import { WORK_VISAS } from '../core/guide';
import { useProcessing } from '../data/processing';
import { COUNTRIES } from './sheets';
import { openUrl } from '../native/device';

type ToolDef = { id: string; icon: string; title: string; sub: string };
export const TOOLS: [string, ToolDef[]][] = [
  ['My plans', [
    { id: 'travel', icon: 'plane', title: 'Can I travel?', sub: 'Check a trip against everyone’s documents' },
    { id: 'pd', icon: 'cal', title: 'Priority date', sub: 'Is your green card date current?' },
    { id: 'gcp', icon: 'map', title: 'Green card planner', sub: 'Expected wait and when to gather documents' },
  ]],
  ['Look up', [
    { id: 'vb', icon: 'list', title: 'Visa Bulletin', sub: 'This month’s dates by category and country' },
    { id: 'proc', icon: 'clock', title: 'Processing times', sub: 'How long USCIS is taking, by form' },
    { id: 'wage', icon: 'dollar', title: 'Prevailing wage', sub: 'Wage levels for a job and area' },
    { id: 'fees', icon: 'scale', title: 'Fees', sub: 'Filing fees by form' },
    { id: 'waits', icon: 'globe', title: 'Visa appointment waits', sub: 'Wait times at consulates' },
    { id: 'lca', icon: 'search', title: 'LCA / PERM status', sub: 'Labor filings by case number' },
    { id: 'emp', icon: 'building', title: 'Employer H-1B data', sub: 'Approvals by employer' },
  ]],
  ['Learn', [
    { id: 'guides', icon: 'book', title: 'Visa guides', sub: 'Plain-English guides with sources' },
    { id: 'lottery', icon: 'dice', title: 'H-1B lottery', sub: 'How selection works and the odds' },
    { id: 'civics', icon: 'flag', title: 'Citizenship test', sub: 'Practise the civics questions' },
    { id: 'i9', icon: 'idcard', title: 'I-9 documents', sub: 'What to show a new employer' },
  ]],
];
const TILE_TONES = ['sky', 'sage', 'butter', 'blush', 'mint'] as const;
const HR: [string, ToolDef[]] = ['For HR', [{ id: 'hr', icon: 'hr', title: 'Expiring documents', sub: 'Every date coming up across the family' }]];

/** v3.0 (owner, approved preview): the 4 tools that fit this family's visas first; every other tool
 *  sits behind All tools. Green card tools show up front only for families with a green card process,
 *  the citizenship test only for green card holders, I lost my job only for work visas. */
export function pickTools(f: ReturnType<typeof useFamily>): string[] {
  const who = f.people.map((p) => ({ person: p, rec: f.records[p.id] })).filter((w) => !!w.rec);
  const st = (w: typeof who[number]) => `${w.person.status ?? ''} ${w.rec?.visa ?? ''}`;
  const work = who.some((w) => WORK_VISAS.test(st(w)));
  const holder = who.some((w) => /green-card(?!-applicant)|conditional-green-card|citizenship-applicant/.test(w.person.status ?? ''));
  const gc = who.some((w) => /green-card-applicant/.test(w.person.status ?? '') || (() => { try { const t = gcTrackOf(w, who as never); return !!t && (t.stage !== 'not-started' || !!t.priorityDate); } catch { return false; } })());
    // owner, Nov 20 2026: Visa Bulletin first, then LCA / PERM status; I-9 documents and Fees sit in the lists below
  const order = ['vb', 'travel', 'pd', 'lca', work ? 'layoff' : '', 'proc', holder ? 'civics' : ''].filter(Boolean);
  return [...new Set(order)].slice(0, 6);
}

export function ToolsTab() {
  const f = useFamily();
  const L = useLayout();
  const t = useTheme();
  const me = f.main ?? f.people[0];
  const work = !!me && WORK_VISAS.test(`${f.records[me.id]?.visa ?? ''} ${me.status ?? ''}`);
  const layoff: ToolDef = { id: 'layoff', icon: 'case', title: 'I lost my job', sub: 'Last day in status and what to do' };
  const plans: [string, ToolDef[]] = [TOOLS[0][0], [...TOOLS[0][1], ...(work ? [layoff] : [])]];
  const base: [string, ToolDef[]][] = [plans, ...TOOLS.slice(1)];
  const groups = f.settings.hrTools ? [...base, HR] : base;
  const byId: Record<string, ToolDef> = Object.fromEntries([...groups.flatMap(([, l]) => l), layoff].map((x) => [x.id, x]));
  const picks = pickTools(f).map((id) => byId[id]).filter(Boolean);
  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  const tour = useTour('tools');
  const basis = L.fontScale > 1.5 ? '100%' : L.width >= 1000 ? '23%' : L.twoCol ? '31%' : '47%';
  const cols = L.width >= 1000 ? 4 : L.twoCol ? 3 : 2;
  const openTool = (x: ToolDef) => go(x.id === 'layoff' && me ? `/layoff/${me.id}` : x.id === 'news' ? '/news' : `/tools/${x.id}`);
  const grid = (list: ToolDef[], gi: number) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {list.map((x, i) => (
        <IconTile key={x.id} tone={TILE_TONES[(i + gi) % TILE_TONES.length]} icon={x.icon} title={x.title} sub={x.sub} onPress={() => openTool(x)}
          style={{ flexBasis: basis, flexGrow: 1, minWidth: 0 }} />
      ))}
      {/* keep the last row's tiles the same width as the rows above */}
      {L.fontScale > 1.5 ? null : Array.from({ length: cols - 1 }).map((_, k) => <View key={`pad${k}`} style={{ flexBasis: basis, flexGrow: 1, height: 0 }} />)}
    </View>
  );
  const fam = [...new Set(f.people.map((p) => p.status).filter((x): x is NonNullable<typeof x> => !!x && !/citizen/.test(x)).map((x) => x.replace(/^green-card-applicant$/, 'green card').replace(/^(conditional-)?green-card$/, 'green card')))].slice(0, 3);
  return (
    <Screen tabRoot wide tour={tour}>
      <LargeTitle title="Tools" right={<TourButton />} />
      <TourTarget id="plan">
        <SectionHeader>{fam.length ? `For your family · ${fam.join(', ')}` : 'For you'}</SectionHeader>
        {grid(picks, 0)}
      </TourTarget>
      {/* owner, Nov 20 2026: no "All tools" fold — every other tool is listed with what it does, as compact rows */}
      <TourTarget id="lookup">
        {groups.map(([g, list], gi) => {
          const rest = list.filter((x) => !picks.some((p) => p.id === x.id));
          return rest.length ? (
            <View key={g}>
              <SectionHeader>{g}</SectionHeader>
              <Group>{rest.map((x, i) => <Row key={x.id} icon={x.icon} iconPastel={TILE_TONES[(i + gi + 1) % TILE_TONES.length]} title={x.title} subtitle={x.sub} onPress={() => openTool(x)} />)}</Group>
            </View>
          ) : null;
        })}
      </TourTarget>
    </Screen>
  );
}

/** Tools whose own body has no data footer: official source + disclaimer at the bottom. */
const FOOTER_SOURCE: Record<string, keyof typeof SOURCES> = { travel: 'travel', lca: 'lca', guides: 'guides', hr: 'guides' };
const TOOL_TOUR: Record<string, string> = { travel: 'tool-travel', pd: 'tool-pd', vb: 'tool-vb', proc: 'tool-proc', fees: 'tool-fees', civics: 'tool-civics', i9: 'tool-i9', wage: 'tool-wage', emp: 'tool-h1b' };
const TOOL_HELP: Record<string, string> = { travel: 'travel', pd: 'priority-date', proc: 'processing', vb: 'priority-date', civics: 'citizenship', i9: 'i9' };
const ALL = Object.fromEntries([...TOOLS, HR].flatMap(([, l]) => l).map((x) => [x.id, x]));
const Src = ({ text, live }: { text: string; live?: boolean }) => { const t = useTheme(); return <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 }}><Icon name="globe" size={14} color={t.text2} /><T tone="text2" style={[font.caption, { flex: 1 }]}>{`${text}${live === false ? ' · built-in copy' : live ? ' · live' : ''}`}</T></View>; };

export function ToolScreen() {
  const { tool, pid } = useLocalSearchParams<{ tool: string; pid?: string }>();
  const def = ALL[tool ?? ''] ?? { id: tool, title: 'Tool', sub: '' };
  const [foot, setFoot] = useState<React.ReactNode>(null);
  const tid = TOOL_TOUR[def.id] ?? `tool-${def.id}`;
  const tour = useTour(tid, TOURS[tid] ? undefined : TOURS.tool.steps, { help: TOURS[tid]?.help ?? TOOL_HELP[def.id] ?? 'overview' });
  const body = (() => {
    switch (def.id) {
      case 'travel': return <Travel pid={pid} setFoot={setFoot} />;
      case 'pd': return <PriorityDate />;
      case 'gcp': return <GcPlanTool />;
      case 'vb': return <VisaBulletin />;
      case 'proc': return <Processing />;
      case 'wage': return <Wage />;
      case 'fees': return <Fees />;
      case 'waits': return <WaitTimes />;
      case 'lca': return <LcaPerm setFoot={setFoot} />;
      case 'emp': return <Employer />;
      case 'guides': return <Guides />;
      case 'lottery': return <Lottery />;
      case 'civics': return <Civics setFoot={setFoot} />;
      case 'i9': return <I9 />;
      case 'hr': return <Expiring />;
      default: return <Why>This tool isn’t available.</Why>;
    }
  })();
  return (
    <Screen keyboard nav={{ back: 'Tools', onBack: back, title: def.title }} footer={foot ?? undefined} tour={tour}>
      {/* the nav bar already has the title: one short line here, the rest is behind ? */}
      <TourTarget id="body">{def.sub ? <T tone="text2" style={font.sub}>{def.sub}</T> : <View />}</TourTarget>
      {body}
      {FOOTER_SOURCE[def.id] ? <DataFooter source={SOURCES[FOOTER_SOURCE[def.id]]} /> : null}
    </Screen>
  );
}

// ---------- Can I travel? (real rules) ----------
function Travel({ pid, setFoot }: { pid?: string; setFoot: (n: React.ReactNode) => void }) {
  const f = useFamily();
  const [who, setWho] = useState(pid ?? 'all');
  const [from, setFrom] = useState<string | undefined>(addDays(today(), 30));
  const [to, setTo] = useState<string | undefined>(addDays(today(), 50));
  const [country, setCountry] = useState('India');
  const [go2, setGo] = useState(false);
  const [ck, setCk] = useState<Record<number, boolean>>({});
  useEffect(() => { setFoot(<TourTarget id="result" style={{ flex: 1 }}><Button title="Check trip" onPress={() => setGo(true)} /></TourTarget>); }, [setFoot]);
  const result = useMemo(() => {
    if (!go2 || !from || !to || !isISO(from) || !isISO(to)) return null;
    if (to <= from) return 'bad' as const;
    const ids = who === 'all' ? f.people.filter((p) => f.records[p.id]?.location !== 'Outside').map((p) => p.id) : [who];
    // Run the rules with this trip added for the travellers.
    const people = f.people.map((p) => (ids.includes(p.id) ? { ...p, facts: { ...p.facts, trips: [...(p.facts.trips ?? []), { id: 'check', depart: from, return: to, country, planned: true }] } } : p));
    const res = evaluateFamily({ members: people.filter((p) => f.records[p.id]).map((p) => ({ person: p, rec: ids.includes(p.id) ? { ...f.records[p.id], trips: [...f.records[p.id].trips, { depart: from, return: to, country, planned: true }] } : f.records[p.id] })), docs: f.docs, settings: f.settings, cases: f.cases, bulletin: f.bulletin.data });
    return ids.map((id) => {
      const p = f.people.find((x) => x.id === id)!;
      const r = f.records[id];
      const items: { tone: 'red' | 'amber' | 'green' | 'blue'; text: string }[] = [];
      const pp = r?.passportExpiry;
      if (pp && pp < to) items.push({ tone: 'red', text: `Passport expires ${fmt(pp)} — before you return. Renew it first.` });
      else if (pp && (daysTo(pp, to) ?? 999) < 180) items.push({ tone: 'amber', text: 'Passport under 6 months on return. Check airline and country rules.' });
      for (const x of res[id]?.findings ?? []) if (['R26', 'R16', 'R17', 'R25', 'C16', 'R10', 'R11', 'R8'].includes(x.rule ?? '')) items.push({ tone: x.severity === 'act' ? 'red' : x.severity === 'review' ? 'amber' : 'blue', text: x.title });
      if (isResident(r?.visa) && !items.length) items.push({ tone: 'green', text: 'Green card + passport are enough to return.' });
      else if (!isResident(r?.visa) && !items.some((x) => /stamp|visa/i.test(x.text)) && r?.visaStamp?.expires) items.push({ tone: 'green', text: `Visa valid until ${fmt(r.visaStamp.expires)}.` });
      if (r?.visa === 'F-1 OPT' || r?.visa === 'STEM OPT') items.push({ tone: 'blue', text: 'Carry the I-20 with a travel signature under 6 months old, the EAD and a job letter.' });
      const stamp = (res[id]?.findings ?? []).some((x) => x.rule === 'R26');
      return { p, items, stamp };
    });
  }, [go2, from, to, who, country, f]);
  const stamping = Array.isArray(result) && result.some((x) => x.stamp);
  const CK = ['Passport valid 6+ months past the trip', 'DS-160 confirmation for each person', `Appointment in ${country} (country of nationality or residence)`, 'Approval copies (I-797 / I-129S) and employer letter', 'Recent pay slips', 'In-person interview — no dropbox for most people', 'Online-presence review: social media on the DS-160 must be accurate', 'Book early — waits in India can run months'];
  return (
    <>
      <TourTarget id="form"><Card style={{ marginTop: 18 }}>
        <SelectField label="Who’s travelling" value={who} onChange={(v) => { setWho(v); setGo(false); }} options={[{ value: 'all', label: 'Everyone in the US' }, ...f.people.map((p) => ({ value: p.id, label: p.name }))]} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 140 }}><DateField label="Leave" value={from} onChange={(v) => { setFrom(v); setGo(false); }} /></View>
          <View style={{ flex: 1, minWidth: 140 }}><DateField label="Return" value={to} onChange={(v) => { setTo(v); setGo(false); }} /></View>
        </View>
        <SelectField label="Country" value={country} onChange={(v) => { setCountry(v); setGo(false); }} options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
      </Card></TourTarget>
      {result === 'bad' ? <Note tone="amber">The return date must be after the leave date.</Note> : null}
      {Array.isArray(result) ? (
        <>
          <SectionHeader>Result</SectionHeader>
          <Stack>
            {result.map(({ p, items }) => (
              <Card key={p.id}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 }}><Avatar name={p.name} size="sm" /><T style={[font.body, { fontWeight: '600', flex: 1 }]}>{p.name}</T><Chip text={statusLabel(p, f.records[p.id], f.results[p.id])} /></View>
                {items.map((x, i) => <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}><View style={{ marginTop: 6 }}><DotWord tone={x.tone} /></View><T style={[font.sub, { flex: 1 }]}>{x.text}</T></View>)}
                {!items.length ? <T tone="text2" style={font.sub}>No problems found for these dates.</T> : null}
              </Card>
            ))}
          </Stack>
          {stamping ? (
            <>
              <SectionHeader>Visa stamping checklist</SectionHeader>
              <Group>{CK.map((x, i) => <CheckRow key={i} title={x} checked={!!ck[i]} onPress={() => setCk({ ...ck, [i]: !ck[i] })} />)}</Group>
              <LinkButton title="See appointment waits" onPress={() => go('/tools/waits')} />
            </>
          ) : null}
          <Hint>{`Sources: travel.state.gov, cbp.gov · checked ${fmt('2026-11-18')}. Not legal advice.`}</Hint>
        </>
      ) : null}
    </>
  );
}
function DotWord({ tone }: { tone: 'red' | 'amber' | 'green' | 'blue' }) {
  const t = useTheme();
  const c = tone === 'red' ? t.red : tone === 'amber' ? t.amber : tone === 'green' ? t.green : t.grey;
  return <View accessible accessibilityLabel={{ red: 'Act now', amber: 'Review', green: 'Good', blue: 'Info' }[tone]} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />;
}

// ---------- Visa Bulletin & priority date ----------
const useBulletin = () => useFamily().bulletin; // one bulletin for the rules and the tools
function PriorityDate() {
  const f = useFamily();
  const b = useBulletin();
  const i140 = f.people.flatMap((p) => f.records[p.id]?.cases ?? []).find((c) => c.form === 'I-140' && c.priorityDate);
  const cats = b.data.rows.map((r) => r.cat);
  const [cat, setCat] = useState(i140?.category?.replace(/^EB(\d)$/, 'EB-$1') ?? 'EB-2');
  const [ctry, setCtry] = useState<Country>('india');
  const [pd, setPd] = useState<string | undefined>(i140?.priorityDate);
  const row = b.data.rows.find((r) => r.cat === cat) ?? b.data.rows[0];
  const chart = b.data.uscisChart;
  const cell = row[chart][ctry] ?? row.final[ctry];
  const cur = pd ? isCurrent(pd, cell) : false;
  return (
    <>
      <TourTarget id="input"><Card style={{ marginTop: 18 }}>
        <SelectField label="Category" value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c }))} />
        <SelectField label="Country of birth" value={ctry} onChange={(v) => setCtry(v as Country)} options={VB_COUNTRIES.map((c) => ({ value: c.value, label: c.label }))} />
        <DateField label="Priority date (from the I-140)" value={pd} onChange={setPd} />
      </Card></TourTarget>
      <Card style={{ marginTop: 12, alignItems: 'center' }}>
        <TourTarget id="result" style={{ alignSelf: 'stretch', alignItems: 'center' }}>
        <T tone="text2" style={font.foot}>{`${chart === 'filing' ? 'Dates for filing' : 'Final action date'} · ${b.data.month}`}</T>
        <BigText size={34} style={{ marginTop: 6, textAlign: 'center', alignSelf: 'stretch' }}>{fmtCell(cell)}</BigText>
        </TourTarget>
        <View style={{ marginTop: 12 }}>{pd ? (cur ? <Pill severity="good" text="Current — you may be able to file I-485" /> : <Pill severity="review" text="Not current yet" />) : <T tone="text2" style={font.foot}>Add your priority date</T>}</View>
        <View style={{ alignSelf: 'stretch', marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: useTheme().sep, gap: 4 }}>
          {(['filing', 'final'] as const).map((k) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T tone="text2" style={font.foot}>{k === 'final' ? 'Final action date (approval)' : 'Date for filing (I-485)'}</T>
              <T style={[font.foot, { fontWeight: k === chart ? '600' : '400' }]}>{fmtCell(row[k][ctry] ?? row.final[ctry])}</T>
            </View>
          ))}
          <T tone="text2" style={[font.caption, { marginTop: 4 }]}>{`News often quotes the final action date; USCIS takes I-485s by the ${chart === 'filing' ? 'date for filing' : 'final action date'} this month.`}</T>
        </View>
      </Card>
      <DataFooter live={b.live} asOf={`${b.data.month} Visa Bulletin`} fetchedAt={b.fetchedAt} source={{ label: SOURCES.bulletin.label, url: b.data.source || SOURCES.bulletin.url }} note={`USCIS accepts I-485s by the ${chart === 'filing' ? 'Dates for Filing' : 'Final Action'} chart this month.`} />
    </>
  );
}
function VisaBulletin() {
  const b = useBulletin();
  const [chart, setChart] = useState('Final action');
  const key = chart === 'Final action' ? 'final' : 'filing';
  const cols: Country[] = ['india', 'china', 'all'];
  const L = useLayout();
  const stacked = L.width < 400 || L.fontScale > 1.2; // a 4-column table only fits on wide screens at normal text size
  return (
    <>
      <TourTarget id="picker"><Segmented options={['Final action', 'Dates for filing']} value={chart} onChange={setChart} /></TourTarget>
      {stacked ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          {b.data.rows.map((r) => (
            <Group joined key={r.cat} style={{ marginTop: 8 }}>
              <Row title={r.cat} subtitle={r.label} titleStyle={{ ...font.body, fontWeight: '600' }} />
              {cols.map((c) => { const v = r[key][c]; return <Row key={c} title={c === 'all' ? 'All other countries' : c[0].toUpperCase() + c.slice(1)} value={v === 'C' ? 'Current' : v ? fmt(v) : '—'} />; })}
            </Group>
          ))}
        </View>
      ) : (
      <Group joined style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 }}>
          {['Category', 'India', 'China', 'All other'].map((h, i) => <T key={h} tone="text2" style={[font.caption, { flex: i ? 1 : 1.2, fontWeight: '600', textTransform: 'uppercase' }]}>{h}</T>)}
        </View>
        {b.data.rows.map((r) => (
          <View key={r.cat} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 }}>
            <T style={[font.sub, { flex: 1.2, fontWeight: '600' }]}>{r.cat}</T>
            {cols.map((c) => { const v = r[key][c]; return <T key={c} tone={v === 'C' ? 'green' : 'text'} style={[font.sub, { flex: 1, fontWeight: v === 'C' ? '600' : '400' }]}>{v === 'C' ? 'Current' : v ? fmt(v).replace(/ \d+,/, '') : '—'}</T>; })}
          </View>
        ))}
      </Group>
      )}
      <DataFooter live={b.live} asOf={`${b.data.month} Visa Bulletin`} fetchedAt={b.fetchedAt} source={{ label: SOURCES.bulletin.label, url: b.data.source || SOURCES.bulletin.url }} />
    </>
  );
}

/** v2.9: the planner uses the green-card track (core/gc.ts) for the main person. */
function GcPlanTool() {
  const f = useFamily();
  return <GcPlanBody pid={f.main?.id} />;
}
export function Planner() {
  const f = useFamily();
  const cases = f.people.flatMap((p) => f.records[p.id]?.cases ?? []);
  const i140 = cases.find((c) => c.form === 'I-140'), i485 = cases.find((c) => c.form === 'I-485');
  const gc = f.people.some((p) => isResident(f.records[p.id]?.visa));
  const [open, setOpen] = useState(1);
  const S: { t: string; s: string; st: 'done' | 'now' | ''; n?: string }[] = [
    { t: 'PERM labor certification', s: 'Employer tests the job market (DOL).', st: i140 || gc ? 'done' : 'now' },
    { t: 'I-140 immigrant petition', s: 'Employer files with USCIS. Sets your priority date.', st: i140?.status === 'approved' || i485 || gc ? 'done' : i140 ? 'now' : '', n: i140?.priorityDate ? `Priority date ${fmt(i140.priorityDate)}` : undefined },
    { t: 'Wait for your priority date', s: 'Check the Visa Bulletin every month (Tools → Priority date).', st: i485 || gc ? 'done' : i140?.status === 'approved' ? 'now' : '' },
    { t: 'I-485 + EAD/AP combo card', s: 'File when your date is current. Family files together.', st: gc ? 'done' : i485 ? 'now' : '', n: i485?.received ? `Filed ${fmt(i485.received)}` : undefined },
    { t: 'Green card', s: 'Card arrives by mail. Citizenship 5 years later.', st: gc ? 'now' : '' },
  ];
  return (
    <>
      <Card style={{ marginTop: 18 }}>
        <Timeline items={S.map((x, i) => ({ title: x.t, state: x.st, sub: x.n, onPress: () => setOpen(i), extra: open === i ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{x.s}</T> : null }))} />
      </Card>
      <Hint>Tap a step to see what happens. Based on the cases saved in Immigration Wallet.</Hint>
    </>
  );
}

function Processing() {
  const f = useFamily();
  const d = useProcessing();
  const forms = Array.from(new Set(d.data.map((p) => p.form)));
  const mine = familyForms(f);
  const [form, setForm] = useState(mine[0]?.form ?? 'I-765'); // preselected for the family
  const rows = d.data.filter((p) => p.form === form);
  const ours = new Set(mine.map((m) => `${m.form}|${m.category}`));
  return (
    <>
      <FamilyFilings />
      <SectionHeader>All forms</SectionHeader>
      <TourTarget id="form"><Card><SelectField label="Form" value={form} onChange={setForm} options={forms.map((x) => ({ value: x, label: x }))} /></Card></TourTarget>
      <SectionHeader>8 in 10 cases decided within</SectionHeader>
      <Group>{rows.map((r) => <Row key={r.category} title={r.category} titleStyle={font.callout} value={fmtMonths(r.months)} trailing={ours.has(`${r.form}|${r.category}`) ? <Pill severity="info" text="Your family" /> : undefined} />)}</Group>
      <DataFooter live={d.live} asOf={d.live ? undefined : PT_AS_OF} fetchedAt={d.fetchedAt} source={SOURCES.processing} note="Times are USCIS’s published 8-in-10 figures and change monthly." />
    </>
  );
}

// ---------- prevailing wage (server) ----------
type Lvl = { soc: string; title: string; area: string; areaName: string; hourly: [number, number, number, number]; wageYear: string };
function Wage() {
  const [q, setQ] = useState('');
  const [socs, setSocs] = useState<{ code: string; title: string }[]>([]);
  const [soc, setSoc] = useState<{ code: string; title: string }>();
  const [states, setStates] = useState<{ code: string; name: string }[]>([]);
  const [st, setSt] = useState('TX');
  const [counties, setCounties] = useState<{ county: string; area: string; areaName: string }[]>([]);
  const [area, setArea] = useState('');
  const [lv, setLv] = useState<Lvl>();
  const [sal, setSal] = useState('');
  const [err, setErr] = useState<string>();
  useEffect(() => { getJSON<{ items: { code: string; name: string }[] }>('/api/wage/states').then((r) => setStates(r.items)).catch(() => setErr('Wage look-ups need the internet. Official tool: flag.dol.gov.')); }, []);
  useEffect(() => { getJSON<{ items: { county: string; area: string; areaName: string }[] }>(`/api/wage/counties?state=${st}`).then((r) => { setCounties(r.items); setArea(r.items[0]?.area ?? ''); }).catch(() => {}); }, [st]);
  useEffect(() => { if (soc && area) getJSON<Lvl>(`/api/wage?soc=${soc.code}&area=${area}`).then(setLv).catch(() => setLv(undefined)); }, [soc, area]);
  const search = () => getJSON<{ items: { code: string; title: string }[] }>(`/api/wage/soc?q=${encodeURIComponent(q)}`).then((r) => setSocs(r.items.slice(0, 8))).catch(() => setErr('Couldn’t reach the wage data. Try again later.'));
  const yearly = (h: number) => Math.round((h * 2080) / 100) * 100;
  const s = parseInt(sal.replace(/\D/g, ''), 10) || 0;
  const lvl = lv ? lv.hourly.filter((h) => s >= yearly(h)).length : 0;
  return (
    <>
      {err ? <Note tone="amber" actions={<Button size="sm" kind="tint" title="Open flag.dol.gov" onPress={() => openUrl('https://flag.dol.gov/wage-data/wage-search')} />}>{err}</Note> : null}
      <TourTarget id="search"><Card style={{ marginTop: 18 }}>
        <Field label="Job title" value={q} onChangeText={setQ} placeholder="e.g. Software developer" onBlur={() => q && search()} />
        {socs.length && !soc ? <Chips>{socs.map((x) => <ChipToggle key={x.code} role="button" text={x.title} onPress={() => { setSoc(x); setSocs([]); }} />)}</Chips> : null}
        {soc ? <Chips><ChipToggle on text={`${soc.title} (${soc.code})`} onPress={() => setSoc(undefined)} /></Chips> : null}
        {states.length ? <SelectField label="State" value={st} onChange={setSt} options={states.map((x) => ({ value: x.code, label: x.name }))} /> : null}
        {counties.length ? <SelectField label="County / work area" value={area} onChange={setArea} options={counties.map((x) => ({ value: x.area, label: `${x.county} · ${x.areaName}` }))} /> : null}
        <Field label="Your yearly salary ($)" value={sal} onChangeText={setSal} keyboardType="number-pad" />
      </Card></TourTarget>
      {lv ? (
        <>
          <Group style={{ marginTop: 12 }}>{lv.hourly.map((h, i) => <Row key={i} title={`Level ${['I', 'II', 'III', 'IV'][i]}`} value={`$${yearly(h).toLocaleString()}`} trailing={s && lvl === i + 1 ? <Pill severity="good" text="You" /> : undefined} />)}</Group>
          {s && lvl === 0 ? <Note tone="red">Below Level I. An H-1B or PERM at this wage would not be approved.</Note> : null}
          <DataFooter live asOf={`OFLC wage year ${lv.wageYear}`} source={SOURCES.wage} note={lv.areaName} />
        </>
      ) : <DataFooter source={SOURCES.wage} note="Wage levels load from Department of Labor data when you’re online. There is no built-in copy." />}
    </>
  );
}

function Fees() {
  const [id, setId] = useState(FEE_CASES[0].id);
  const [size, setSize] = useState<EmployerSize>('large');
  const [premium, setPremium] = useState(false);
  const fc = FEE_CASES.find((x) => x.id === id)!;
  const lines = fc.build({ size, acwiaSmall: size === 'small', covered: false, online: true, premium }).filter((l) => l.amount > 0);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <>
      <TourTarget id="case"><Card style={{ marginTop: 18 }}>
        <SelectField label="What are you filing?" value={id} onChange={setId} options={FEE_CASES.map((x) => ({ value: x.id, label: x.label, sub: x.group }))} />
        {fc.employer ? <Segmented options={['Large', 'Small', 'Nonprofit']} value={size[0].toUpperCase() + size.slice(1)} onChange={(v) => setSize(v.toLowerCase() as EmployerSize)} /> : null}
      </Card></TourTarget>
      <Group style={{ marginTop: 12 }}>
        {lines.map((l) => <Row key={l.label} title={l.label} subtitle={l.note} value={`$${l.amount.toLocaleString()}`} />)}
        <CheckRow title="Add premium processing" checked={premium} onPress={() => setPremium(!premium)} />
      </Group>
      <Card style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T style={font.headline}>Total</T><View style={{ flexShrink: 1, minWidth: 0 }}><BigText size={28}>{`$${total.toLocaleString()}`}</BigText></View></Card>
      {fc.alert ? <Note tone="amber">{fc.alert}</Note> : null}
      <DataFooter live={false} asOf={`${FEES_AS_OF} (USCIS fee rule of Apr 1, 2024; premium processing from Mar 1, 2026)`} source={SOURCES.fees} note="Check uscis.gov/fees before you pay. Immigration Wallet never takes payments." />
    </>
  );
}

function WaitTimes() {
  const [d, setD] = useState<{ data: Waits; live: boolean; fetchedAt?: string }>({ data: WAITS_BUILT_IN, live: false });
  useEffect(() => { fetchOr<Waits>('/api/visa-waits', WAITS_BUILT_IN).then(setD).catch(() => {}); }, []);
  const posts = d.data.posts.filter((p) => !d.live || /chennai|hyderabad|kolkata|mumbai|delhi/i.test(p.post) || true).slice(0, 60);
  const [kind, setKind] = useState('Work (H / L)');
  const val = (p: (typeof posts)[number]) => (kind === 'Work (H / L)' ? p.petition : kind === 'Students' ? p.student : p.visitor) ?? '—';
  return (
    <>
      <Segmented options={['Work (H / L)', 'Students', 'Visitors']} value={kind} onChange={setKind} />
      <Group style={{ marginTop: 14 }}>{posts.map((p) => <Row key={p.post} title={p.post} value={val(p)} />)}</Group>
      <Note tone="amber">Interviews must be in your country of nationality or residence. Most people can no longer use the dropbox.</Note>
      <SectionHeader>Interview rules</SectionHeader>
      <Group>{INTERVIEW_RULES.map(([a, b]) => <Row key={a} title={a} subtitle={b} titleStyle={{ ...font.callout, fontWeight: '500' }} />)}</Group>
      <DataFooter live={d.live} asOf={waitsDate(d.data.updated)} fetchedAt={d.fetchedAt} source={SOURCES.waits} note={d.live ? undefined : 'Built-in copy covers the five posts in India.'} />
    </>
  );
}

function LcaPerm({ setFoot }: { setFoot: (n: React.ReactNode) => void }) {
  const [kind, setKind] = useState('LCA');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string>();
  const ok = /^[IG]-\d{3}-\d{5}-\d{6}$/.test(q.trim());
  useEffect(() => {
    setFoot(<Button title="Look up on flag.dol.gov" onPress={() => { if (q && !ok) { setErr(`Check the number — it looks like ${kind === 'LCA' ? 'I-200-26001-000001' : 'G-100-26001-000001'}.`); return; } openUrl('https://flag.dol.gov/case-status-search'); }} />);
  }, [setFoot, q, ok, kind]);
  return (
    <>
      <Segmented options={['LCA', 'PERM']} value={kind} onChange={setKind} />
      <Card style={{ marginTop: 14 }}>
        <Field label={`${kind} case number`} value={q} onChangeText={(x) => { setQ(x.toUpperCase()); setErr(undefined); }} placeholder={kind === 'LCA' ? 'I-200-26001-000001' : 'G-100-26001-000001'} autoCapitalize="characters" mono error={err} />
        <Hint>The Department of Labor’s official FLAG site shows the status. Immigration Wallet opens it in Safari — it never logs in or reads the site for you.</Hint>
      </Card>
    </>
  );
}

type Emp = { name: string; state?: string; h1b: { fy: string; initialApproval: number; initialDenial: number; continuingApproval: number; continuingDenial: number }[] };
function Employer() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Emp[] | null>(null);
  const [err, setErr] = useState<string>();
  const search = () => { if (!q.trim()) return; setErr(undefined); getJSON<{ items: Emp[] }>(`/api/employer?q=${encodeURIComponent(q)}`).then((r) => setItems(r.items.slice(0, 10))).catch(() => setErr('Employer search needs the internet. Showing the built-in top list.')); };
  return (
    <>
      <TourTarget id="search"><Field label="Employer" value={q} onChangeText={setQ} placeholder="Search employers" onBlur={search} /></TourTarget>
      <View style={{ marginTop: 10 }}><Button size="sm" kind="tint" icon="search" title="Search" onPress={search} /></View>
      {err ? <Note tone="amber">{err}</Note> : null}
      {items ? items.map((e) => {
        const y = e.h1b[0];
        const total = y ? y.initialApproval + y.continuingApproval : 0;
        const denied = y ? y.initialDenial + y.continuingDenial : 0;
        return (
          <Card key={e.name + e.state} style={{ marginTop: 12 }}>
            <T style={font.headline}>{e.name}</T>
            <T tone="text2" style={font.foot}>{`${e.state ?? ''}${y ? ` · FY ${y.fy}` : ''}`}</T>
            {y ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><BigText size={24}>{total.toLocaleString()}</BigText><T tone="text2" style={font.foot}>H-1B approvals</T></View>
              <View style={{ flex: 1 }}><BigText size={24}>{`${total + denied ? ((denied / (total + denied)) * 100).toFixed(1) : '0'}%`}</BigText><T tone="text2" style={font.foot}>denial rate</T></View>
            </View> : null}
          </Card>
        );
      }) : (
        <>
          <SectionHeader>Most new H-1B approvals · FY 2025</SectionHeader>
          <Group>{TOP_INITIAL_FY25.map((x) => <Row key={x.label} title={x.label} value={x.value.toLocaleString()} />)}</Group>
        </>
      )}
      <DataFooter live={!!items} asOf={items ? undefined : H1B_SOURCE.replace(/^USCIS H-1B Employer Data Hub · /, '')} source={SOURCES.h1b} />
    </>
  );
}

function Guides() {
  const sheet = useSheet();
  // v2.9 search: /tools/guides?visa=<id> opens that guide
  const { visa } = useLocalSearchParams<{ visa?: string }>();
  useEffect(() => { const v = VISAS.find((x) => x.id === visa); if (v) setTimeout(() => openGuide(v), 350); }, [visa]); // eslint-disable-line react-hooks/exhaustive-deps
  const openGuide = (v: (typeof VISAS)[number]) => sheet.open(`${v.code} · ${v.name}`, (
            <View>
              <Why>{v.tagline}</Why>
              <Group style={{ marginTop: 12 }}>{v.facts.map((x) => <Row key={x.label} title={x.label} value={x.value} />)}</Group>
              <SectionHeader>Key points</SectionHeader>
              <Stack gap={6}>{v.keyPoints.map((x) => <T key={x} style={font.sub}>{`• ${x}`}</T>)}</Stack>
              {v.alert ? <Note tone="amber">{v.alert}</Note> : null}
              <Src text={`Source: ${v.source.replace(/^https?:\/\//, '').split('/')[0]} · reviewed ${GUIDES_REVIEWED}`} />
              <View style={{ marginTop: 14 }}><Button kind="tint" title="Open source" onPress={() => { sheet.close(); openUrl(v.source); }} /></View>
            </View>
  ));
  return (
    <>
      <Group style={{ marginTop: 18 }}>
        {VISAS.map((v) => <Row key={v.id} icon="book" title={v.code} subtitle={v.tagline} onPress={() => openGuide(v)} />)}
      </Group>
    </>
  );
}

function Lottery() {
  return (
    <>
      <Card style={{ marginTop: 18 }}>
        <T tone="text2" style={font.foot}>{`Next registration · ${NEXT_SEASON.fy}`}</T>
        <T style={[font.big, { marginTop: 4 }]}>{NEXT_SEASON.opens ? `${fmt(NEXT_SEASON.opens)} – ${fmt(NEXT_SEASON.closes ?? '')}` : NEXT_SEASON.expected}</T>
      </Card>
      <SectionHeader>Chance of selection by wage level</SectionHeader>
      <Group>{WEIGHTS.map((w) => <Row key={w.level} title={w.level} subtitle={`${w.entries} entr${w.entries === 1 ? 'y' : 'ies'}`} value={w.odds} />)}</Group>
      <Hint>{WEIGHT_NOTE}</Hint>
      <SectionHeader>How it works</SectionHeader>
      <Group>{LOT_STEPS.map(([a, b]) => <Row key={a} title={a} subtitle={b} titleStyle={{ ...font.callout, fontWeight: '500' }} />)}</Group>
      <SectionHeader>Last season</SectionHeader>
      <Group>{LAST_SEASON.map(([a, b]) => <Row key={a} title={a} subtitle={b} />)}</Group>
      <SectionHeader>Cap-gap for F-1 students</SectionHeader>
      <Group>{CAP_GAP.map((x) => <Row key={x} title={x} titleStyle={font.sub} />)}</Group>
      <SectionHeader>Fees in the news</SectionHeader>
      <Group>{FEE_STATUS.map(([a, b]) => <Row key={a} title={a} subtitle={b} />)}</Group>
      <DataFooter live={false} asOf={LOTTERY_AS_OF} source={SOURCES.lottery} />
    </>
  );
}

function Civics({ setFoot }: { setFoot: (n: React.ReactNode) => void }) {
  const [round, setRound] = useState(0);
  const qs = useMemo(() => {
    const pool = [...CIVICS].sort(() => Math.random() - 0.5).slice(0, 10);
    return pool.map((q) => {
      const wrong = CIVICS.filter((x) => x.topic === q.topic && x.n !== q.n).sort(() => Math.random() - 0.5).slice(0, 2).map((x) => x.a[0]);
      const opts = [q.a[0], ...wrong].sort(() => Math.random() - 0.5);
      return { q: q.q, opts, right: opts.indexOf(q.a[0]) };
    });
  }, [round]);
  const [i, setI] = useState(0);
  const [a, setA] = useState<number | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);
  const done = i >= qs.length;
  const t = useTheme();
  useEffect(() => {
    setFoot(done ? <Button title="Practise again" onPress={() => { setRound(round + 1); setI(0); setA(null); setResults([]); }} /> : <TourTarget id="next" style={{ flex: 1 }}><Button title={i === qs.length - 1 ? 'See my score' : 'Next question'} disabled={a === null} onPress={() => { setI(i + 1); setA(null); }} /></TourTarget>);
  }, [setFoot, done, a, i, round, qs.length]);
  if (done) {
    const sum = quizSummary(results);
    return (
      <>
        <Card style={{ marginTop: 18, alignItems: 'center' }}>
          <Icon name={sum.passed ? 'checkc' : 'alert'} size={36} color={sum.passed ? t.inkGreen : t.inkAmber} />
          <BigText size={34} style={{ marginTop: 6 }}>{`${sum.right} of ${sum.total}`}</BigText>
          <T style={[font.headline, { marginTop: 4 }]} tone={sum.passed ? 'green' : 'amber'}>{sum.passed ? `Pass — ${sum.pct}% right` : `Keep practising — ${sum.pct}% right`}</T>
          <Why>{`You need ${sum.passMark} of ${sum.total} here — the same share as the real test (12 of up to 20 questions).`}</Why>
        </Card>
        {sum.missed.length ? (
          <>
            <SectionHeader>{`To review · ${sum.missed.length}`}</SectionHeader>
            <Group>{sum.missed.map((m, k) => <Row key={k} alignTop title={m.q} titleStyle={font.callout} subtitle={`Right answer: ${m.right} · You chose: ${m.chosen}`} />)}</Group>
          </>
        ) : null}
        <DataFooter source={SOURCES.civics} note={CIVICS_SOURCE} />
      </>
    );
  }
  const q = qs[i];
  const right = results.filter((r) => r.ok).length;
  const choose = (k: number) => {
    if (a !== null) return;
    setA(k);
    setResults([...results, { q: q.q, chosen: q.opts[k], right: q.opts[q.right], ok: k === q.right }]);
  };
  return (
    <>
      <T tone="text2" style={[font.caption, { marginTop: 14 }]}>{`Question ${i + 1} of ${qs.length} · ${right} right so far`}</T>
      <T style={[font.big, { marginTop: 12 }]}>{q.q}</T>
      <TourTarget id="answers"><View style={{ gap: 8, marginTop: 8 }} accessibilityRole="radiogroup">
        {q.opts.map((o, k) => <AnswerOption key={k} text={o} state={answerState(k, a, q.right)} onPress={() => choose(k)} />)}
      </View></TourTarget>
      {a !== null ? (
        <View accessibilityLiveRegion="polite" style={{ marginTop: 10 }}>
          <T tone={a === q.right ? 'green' : 'red'} style={[font.headline]}>{a === q.right ? '✓ Correct' : '✕ Not quite'}</T>
          {a !== q.right ? <T style={[font.sub, { marginTop: 2 }]}>{`The right answer is “${q.opts[q.right]}”.`}</T> : null}
        </View>
      ) : null}
      <DataFooter source={SOURCES.civics} note={CIVICS_SOURCE} />
    </>
  );
}

/** One answer. After a choice: green fill + ✓ “Correct”, red fill + ✕ “Not quite”, the right answer
 *  in green with “Right answer” — colour is never the only signal (icon + word too). */
function AnswerOption({ text, state, onPress }: { text: string; state: AnswerState; onPress: () => void }) {
  const t = useTheme();
  const green = state === 'correct' || state === 'answer';
  const red = state === 'wrong';
  // chosen right = sage block, chosen wrong = blush block (ink text on both); the right answer when
  // you missed it = a sage outline on the card.
  const block = state === 'correct' ? t.pastel.good : red ? t.pastel.urgent : undefined;
  const fg = block ? t.ink : t.text;
  const label = ANSWER_LABEL[state];
  return (
    <Pressable onPress={onPress} disabled={state !== 'idle'} accessibilityRole="radio" accessibilityState={{ checked: state === 'correct' || state === 'wrong', disabled: state !== 'idle' }}
      accessibilityLabel={label ? `${text}, ${label}` : text}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 56, borderRadius: radius.row, backgroundColor: block ?? t.card, borderWidth: 2, borderColor: state === 'answer' ? t.green : 'transparent', opacity: state === 'dim' ? 0.6 : pressed ? 0.85 : 1 })}>
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: block ? t.ink : state === 'answer' ? t.green : 'transparent', borderWidth: green || red ? 0 : 2, borderColor: t.text3 }}>
        {green ? <Icon name="check" size={15} color={block ? '#fff' : t.dark ? t.ink : '#fff'} weight="bold" /> : red ? <Icon name="x" size={14} color="#fff" weight="bold" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T style={[font.body, { color: fg, fontWeight: state === 'idle' || state === 'dim' ? '500' : '600' }]}>{text}</T>
        {label ? <T tone={block ? 'text' : 'green'} style={[font.foot, { fontWeight: '600', marginTop: 2 }, block ? { color: t.ink } : {}]}>{label}</T> : null}
      </View>
    </Pressable>
  );
}

function I9() {
  const [s, setS] = useState<Record<string, boolean>>({});
  const A = ['US passport', 'Green card', 'EAD card', 'Foreign passport + I-94 (work visa)'], B = ['Driver’s license', 'State ID card'], C = ['Social Security card', 'US birth certificate'];
  const has = (l: string[], k: string) => l.some((_, i) => s[k + i]);
  const ok = has(A, 'a') || (has(B, 'b') && has(C, 'c'));
  const list = (l: string[], k: string, t: string) => (
    <View key={k}><SectionHeader>{t}</SectionHeader><Group>{l.map((x, i) => <CheckRow key={x} title={x} checked={!!s[k + i]} onPress={() => setS({ ...s, [k + i]: !s[k + i] })} />)}</Group></View>
  );
  return (
    <>
      <Hint>Tick what you have. You need one from List A, or one from B and one from C.</Hint>
      <TourTarget id="lists">{list(A, 'a', 'List A · identity and work')}</TourTarget>{list(B, 'b', 'List B · identity')}{list(C, 'c', 'List C · work')}
      <TourTarget id="result"><Note tone={ok ? 'green' : 'amber'}>{ok ? 'This works for the I-9.' : 'Not enough yet. Add one from List A, or one each from B and C.'}</Note></TourTarget>
      <DataFooter source={SOURCES.i9} />
    </>
  );
}

function Expiring() {
  const f = useFamily();
  const [w, setW] = useState('90 days');
  const n = parseInt(w, 10);
  const items = f.people.flatMap((p) => {
    const r = f.records[p.id];
    return ([['I-94', r?.i94?.until], ['Passport', r?.passportExpiry], ['EAD', r?.ead?.expires], ['Green card', r?.greenCard?.expires]] as [string, string | undefined][])
      .filter(([, d]) => d && (daysTo(d) ?? 999) <= n && (daysTo(d) ?? -1) >= -30).map(([what, d]) => ({ p, what, d: d! }));
  }).sort((a, b) => a.d.localeCompare(b.d));
  return (
    <>
      <Segmented options={['30 days', '90 days', '180 days']} value={w} onChange={setW} />
      <Group style={{ marginTop: 14 }}>
        {items.length ? items.map((x) => <Row key={x.p.id + x.what} dot={(daysTo(x.d) ?? 0) <= 30 ? 'red' : 'amber'} title={`${x.p.name} · ${x.what}`} subtitle={`Ends ${fmt(x.d)}`} value={`${daysTo(x.d)} d`} />) : <Row title="Nothing ending in this window." titleTone="text2" />}
      </Group>
    </>
  );
}
