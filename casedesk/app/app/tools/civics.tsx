// Naturalization civics test practice — 2025 test (128 questions; officer asks up to 20, pass with 12).
import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Segmented, Chips, Button, Note, Pill, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { CIVICS, CIVICS_SOURCE, TEST_UPDATES_URL, CivicsQ } from '../../src/data/civics';
import { useStored } from '../../src/lib/store';
import { ShareCardButton } from '../../src/components/ShareCard';

type Progress = { known: number[]; missed: number[]; tests: { date: string; correct: number; asked: number; passed: boolean }[] };
const EMPTY: Progress = { known: [], missed: [], tests: [] };
type Pool = 'all' | 'star' | 'missed' | 'gov' | 'hist' | 'sym';

const shuffle = <X,>(a: X[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const changes = (q: CivicsQ) => q.a.some((x) => /testupdates|Answers will vary/i.test(x));

function Answers({ q }: { q: CivicsQ }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      {q.a.map((a) => (
        <View key={a} style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <T v="body" style={{ color: t.green }}>•</T>
          <T v="body" style={{ flex: 1 }}>{a}</T>
        </View>
      ))}
      {changes(q) ? <View style={{ marginTop: 10 }}><Button label="Current answer on uscis.gov" kind="secondary" icon="open-outline" href={TEST_UPDATES_URL} /></View> : null}
    </View>
  );
}

function Flashcards({ prog, setProg }: { prog: Progress; setProg: (p: Progress) => void }) {
  const t = useTheme();
  const [pool, setPool] = useState<Pool>('all');
  const list = useMemo(() => {
    const base = CIVICS.filter((q) =>
      pool === 'star' ? q.star : pool === 'missed' ? prog.missed.includes(q.n) : pool === 'gov' ? q.section === 'American Government' : pool === 'hist' ? q.section === 'American History' : pool === 'sym' ? q.section.startsWith('Symbols') : true);
    return shuffle(base);
  }, [pool]);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const q = list[i % Math.max(1, list.length)];
  const mark = (ok: boolean) => {
    if (!q) return;
    const known = ok ? Array.from(new Set([...prog.known, q.n])) : prog.known.filter((n) => n !== q.n);
    const missed = ok ? prog.missed.filter((n) => n !== q.n) : Array.from(new Set([...prog.missed, q.n]));
    setProg({ ...prog, known, missed });
    tap(); setFlip(false); setI(i + 1);
  };
  return (
    <>
      <View style={{ marginTop: 12 }}>
        <Chips<Pool> options={[
          { label: 'All 128', value: 'all' }, { label: '65/20 (20)', value: 'star' }, { label: `To review (${prog.missed.length})`, value: 'missed' },
          { label: 'Government', value: 'gov' }, { label: 'History', value: 'hist' }, { label: 'Symbols & holidays', value: 'sym' },
        ]} value={pool} onChange={(v) => { setPool(v); setI(0); setFlip(false); }} />
      </View>
      <Section>
        {q ? (
          <Card onPress={() => { tap(); setFlip(!flip); }} style={{ minHeight: 220 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="label">Question {q.n}{q.star ? ' · 65/20' : ''}</T>
              <T v="small">{(i % list.length) + 1} of {list.length}</T>
            </View>
            <T v="h2" style={{ marginTop: 12, lineHeight: 28 }}>{q.q}</T>
            {flip ? <Answers q={q} /> : <T v="sub" style={{ marginTop: 18 }}>Say your answer out loud, then tap to check.</T>}
          </Card>
        ) : <Card><T v="sub">Nothing to review here yet.</T></Card>}
        {q && flip ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Button label="Missed it" kind="secondary" icon="close" onPress={() => mark(false)} /></View>
            <View style={{ flex: 1 }}><Button label="Got it" icon="checkmark" onPress={() => mark(true)} /></View>
          </View>
        ) : null}
        <T v="small" style={{ marginTop: 12, textAlign: 'center', color: t.sub }}>Known {prog.known.length} of 128</T>
      </Section>
    </>
  );
}

function PracticeTest({ prog, setProg }: { prog: Progress; setProg: (p: Progress) => void }) {
  const t = useTheme();
  const [senior, setSenior] = useState(false);
  const [qs, setQs] = useState<CivicsQ[] | null>(null);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  const asked = senior ? 10 : 20, need = senior ? 6 : 12;
  const done = qs && (score.ok >= need || score.bad > asked - need || i >= asked);
  const passed = score.ok >= need;

  const start = () => { setQs(shuffle(CIVICS.filter((q) => (senior ? q.star : true))).slice(0, asked)); setI(0); setShow(false); setScore({ ok: 0, bad: 0 }); };
  const answer = (ok: boolean) => {
    const s = { ok: score.ok + (ok ? 1 : 0), bad: score.bad + (ok ? 0 : 1) };
    setScore(s); tap(); setShow(false); setI(i + 1);
    const q = qs![i];
    const missed = ok ? prog.missed.filter((n) => n !== q.n) : Array.from(new Set([...prog.missed, q.n]));
    const finished = s.ok >= need || s.bad > asked - need || i + 1 >= asked;
    setProg({ ...prog, missed, tests: finished ? [{ date: new Date().toISOString().slice(0, 10), correct: s.ok, asked: i + 1, passed: s.ok >= need }, ...prog.tests].slice(0, 20) : prog.tests });
  };

  if (!qs) {
    return (
      <Section>
        <Card>
          <T v="h3">Like the real interview</T>
          <T v="sub" style={{ marginTop: 6 }}>{senior ? 'The officer asks up to 10 of the 20 starred questions; 6 correct passes.' : 'The officer asks up to 20 of the 128 questions and stops once you have 12 right (or can no longer pass).'}</T>
          <View style={{ marginTop: 12 }}>
            <Segmented options={[{ label: 'Standard (20 / 12)', value: 'std' }, { label: '65/20 (10 / 6)', value: 'senior' }]} value={senior ? 'senior' : 'std'} onChange={(v) => setSenior(v === 'senior')} />
          </View>
          <View style={{ marginTop: 14 }}><Button label="Start practice test" icon="play" onPress={start} /></View>
        </Card>
        {prog.tests.length ? (
          <Card style={{ marginTop: 12 }}>
            <T v="label">Recent tests</T>
            {prog.tests.slice(0, 5).map((x, k) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: k ? 0.5 : 0, borderTopColor: t.border }}>
                <T v="body">{x.date}</T>
                <T v="h3" style={{ color: x.passed ? t.green : t.red }}>{x.correct}/{x.asked} · {x.passed ? 'Pass' : 'Not yet'}</T>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>
    );
  }
  if (done) {
    return (
      <Section>
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Ionicons name={passed ? 'ribbon' : 'refresh-circle'} size={52} color={passed ? t.green : t.amber} />
          <T v="h1" style={{ marginTop: 10 }}>{passed ? 'You passed' : 'Not yet'}</T>
          <T v="sub" style={{ marginTop: 6 }}>{score.ok} correct of {score.ok + score.bad} asked · needed {need}</T>
          {passed ? <View style={{ alignSelf: 'stretch', marginTop: 16 }}><ShareCardButton kind="primary" label="Share my score" card={{ kind: 'civics', title: 'I passed a US citizenship civics practice test', subtitle: '2025 civics test · 128 questions', stat: `${score.ok}/${score.ok + score.bad}`, statLabel: 'correct' }} /></View> : null}
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><Button label="Try another test" icon="refresh" kind={passed ? 'secondary' : 'primary'} onPress={start} /></View>
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><Button label="Done" kind="secondary" onPress={() => setQs(null)} /></View>
        </Card>
      </Section>
    );
  }
  const q = qs[i];
  return (
    <Section>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <Pill label={`Question ${i + 1} of ${asked}`} />
        <Pill label={`${score.ok} right`} tone="green" />
        {score.bad ? <Pill label={`${score.bad} missed`} tone="red" /> : null}
      </View>
      <Card style={{ minHeight: 200 }}>
        <T v="h2" style={{ lineHeight: 28 }}>{q.q}</T>
        {show ? <Answers q={q} /> : <T v="sub" style={{ marginTop: 18 }}>Answer out loud as you would to the officer.</T>}
      </Card>
      <View style={{ marginTop: 12 }}>
        {show ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="I missed it" kind="secondary" icon="close" onPress={() => answer(false)} /></View>
            <View style={{ flex: 1 }}><Button label="I got it" icon="checkmark" onPress={() => answer(true)} /></View>
          </View>
        ) : <Button label="Show the answer" icon="eye-outline" onPress={() => setShow(true)} />}
      </View>
      <Pressable onPress={() => setQs(null)} style={{ alignSelf: 'center', marginTop: 14 }}><T v="small" style={{ color: t.accent }}>End test</T></Pressable>
    </Section>
  );
}

export default function Civics() {
  const [mode, setMode] = useState<'cards' | 'test' | 'about'>('cards');
  const [prog, setProg] = useStored<Progress>('cd.civics.v1', EMPTY);
  return (
    <DetailScreen title="Citizenship test">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Civics test practice</T>
        <T v="sub" style={{ marginTop: 4 }}>2025 version · for Form N-400 filed on or after Oct 20, 2025</T>
        <View style={{ marginTop: 14 }}>
          <Segmented options={[{ label: 'Flashcards', value: 'cards' }, { label: 'Practice test', value: 'test' }, { label: 'About', value: 'about' }]} value={mode} onChange={setMode} />
        </View>
      </View>
      {mode === 'cards' ? <Flashcards prog={prog} setProg={setProg} /> : null}
      {mode === 'test' ? <PracticeTest prog={prog} setProg={setProg} /> : null}
      {mode === 'about' ? (
        <Section>
          <Card>
            {[
              ['Civics test', 'Oral. Up to 20 of the 128 questions; answer 12 correctly to pass. The officer stops once you reach 12 right.'],
              ['65/20', 'Age 65+ with 20+ years as a permanent resident: study only the 20 starred questions; 10 asked, 6 to pass, and you may use your language.'],
              ['Filed before Oct 20, 2025?', 'You take the 2008 test (100 questions, 6 of 10 to pass).'],
              ['English test', 'Reading, writing and speaking are unchanged.'],
              ['Answers that change', 'President, Vice President, Speaker, Chief Justice, your senators, representative and governor — check before your interview.'],
            ].map(([a, b], k) => (
              <View key={a} style={{ paddingVertical: 9, borderTopWidth: k ? 0.5 : 0, borderTopColor: '#8883' }}>
                <T v="h3" style={{ fontSize: 15 }}>{a}</T>
                <T v="sub" style={{ marginTop: 2 }}>{b}</T>
              </View>
            ))}
          </Card>
          <View style={{ marginTop: 12 }}><Button label="Test updates on uscis.gov" kind="secondary" icon="open-outline" href={TEST_UPDATES_URL} /></View>
          <View style={{ marginTop: 10 }}><Note>{CIVICS_SOURCE}. Progress stays on this phone.</Note></View>
        </Section>
      ) : null}
    </DetailScreen>
  );
}
