// One person (you or a family member): their details and one list of their documents. Each row is a
// document they should have — tap it to open the saved file, or "Add" to scan it.
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Pill, Button, Field, Note, DateField, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useProfile, visaLabel, Profile, loadProfile, saveProfile, WorkLocation } from '../../src/lib/profile';
import { useFamily, loadFamily, saveMember } from '../../src/lib/family';
import { metroOf, differentMetro } from '../../src/lib/metro';
import { useVault, VaultDoc } from '../../src/lib/vault';
import { useCases } from '../../src/lib/store';
import { stageOf } from '../../src/lib/caseStatus';
import { people, initials } from '../../src/lib/people';
import { familyChecks, fmt, daysTo, statusLine, worst, classLabel } from '../../src/lib/compliance';
import { DOC_ICON } from '../../src/components/DocIcon';
import { slotsFor } from '../../src/lib/slots';

export default function PersonPage() {
  const t = useTheme();
  const router = useRouter();
  const { id = 'me' } = useLocalSearchParams<{ id?: string }>();
  const [me] = useProfile();
  const [family] = useFamily();
  const [docs] = useVault();
  const [cases] = useCases();
  const [open, setOpen] = useState('');
  const [moving, setMoving] = useState(false);
  const [city, setCity] = useState('');
  const [checked, setChecked] = useState<WorkLocation | null>(null);
  const [editApproved, setEditApproved] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const person = people(me, family).find((x) => x.id === id);
  if (!person) return <DetailScreen title="Documents"><View style={{ padding: 20 }}><T v="sub">This person was removed.</T></View></DetailScreen>;
  const p = person.profile;
  const isMe = id === 'me';
  const editPath = isMe ? '/status/edit' : `/status/edit?member=${id}`;
  const mine = docs.filter((d) => (d.owner || 'me') === id);
  const myCases = cases.filter((c) => (c.owner || 'me') === id);
  const slots = slotsFor(p);
  // Current document per slot: the latest date (an older passport or approval stays listed as superseded).
  const currentOf = (type: string) => mine.filter((d) => d.type === type).sort((a, b) => (b.expires || '').localeCompare(a.expires || ''))[0];
  const chosen = new Set(slots.map((s) => currentOf(s.type)?.id).filter(Boolean));
  const extra = mine.filter((d) => !chosen.has(d.id));
  const all = familyChecks({ id: 'me', profile: me, relation: 'You', name: me?.name }, family.map((m) => ({ id: m.id, profile: m.profile, relation: m.relation })));
  const mineChecks = all[id] || [];
  const issues = mineChecks.filter((c) => c.tone !== 'green');
  const w = worst(mineChecks);
  const approvals = [...(p?.approvals || [])].sort((a, b) => Number(!!a.superseded) - Number(!!b.superseded) || (b.noticeDate || '').localeCompare(a.noticeDate || ''));
  const approvedAt = p?.approvedWorkLocation ?? approvals.find((a) => !a.superseded)?.workLocation;
  const at = (l?: WorkLocation) => (l ? [l.city, l.state].filter(Boolean).join(', ') || l.metro || '' : '');
  const parseCity = (v: string): WorkLocation | null => { const [c, st] = v.split(',').map((x) => x.trim()); return c ? { city: c, state: st?.toUpperCase().slice(0, 2), metro: metroOf(c, st?.toUpperCase()) } : null; };
  const amendmentPending = !!(p?.extFiled || p?.extReceipt) && p?.extKind === 'amendment';
  const saveWork = async (field: 'workLocation' | 'approvedWorkLocation', loc: WorkLocation) => {
    const cur = await loadProfile();
    if (cur) await saveProfile({ ...cur, [field]: loc });
    tap(); setMoving(false); setChecked(null); setCity(''); setEditApproved(false);
  };
  // Job end (employee) and travel plans (anyone) — they drive the grace-period (C18) and travel (C16) checks.
  const savePatch = async (patch: Partial<Profile>) => {
    const clean = (x: Profile) => { const o: any = { ...x, ...patch }; for (const k of Object.keys(patch)) if ((patch as any)[k] === undefined) delete o[k]; return o as Profile; };
    if (isMe) { const cur = await loadProfile(); if (cur) await saveProfile(clean(cur)); }
    else { const m = (await loadFamily()).find((x) => x.id === id); if (m) await saveMember({ ...m, profile: clean(m.profile) }); }
    tap();
  };
  const name = isMe ? (person.named ? person.name : 'You') : person.named ? person.name : person.relation;

  const color = (d: number | null) => (d === null ? t.sub : d < 0 ? t.red : d <= 90 ? t.amber : t.green);
  const DocRow = ({ icon, label, date, doc, onPress, first }: { icon: any; label: string; date?: string; doc?: VaultDoc; onPress?: () => void; first?: boolean }) => {
    const d = daysTo(date);
    return (
      <Pressable disabled={!onPress} onPress={() => { tap(); onPress?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 0.5, borderTopColor: t.border }}>
        <Ionicons name={icon} size={20} color={t.text} />
        <View style={{ flex: 1 }}>
          <T v="body" style={{ fontSize: 16 }}>{label}</T>
          <T v="small" style={{ marginTop: 1 }}>{doc ? 'Tap to view' : date ? 'Date entered — no file' : 'Not uploaded'}</T>
        </View>
        {date ? <T v="h3" style={{ fontSize: 14, color: color(d) }}>{fmt(date)}</T> : doc ? <T v="small">Saved</T> : <T v="small" style={{ color: t.faint }}>—</T>}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={t.faint} /> : null}
      </Pressable>
    );
  };

  return (
    <DetailScreen title={name}>
      <View style={{ paddingHorizontal: 20 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T v="h3" style={{ color: t.accent }}>{person.named ? initials(person.name) : isMe ? 'Me' : person.relation[0]}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T v="h3">{person.named ? person.name : isMe ? 'Add your name' : `Add ${person.relation.toLowerCase()}’s name`}</T>
            {p?.legalName && p.legalName !== person.name ? <T v="small" style={{ marginTop: 1 }}>{p.legalName}</T> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <T v="sub">{isMe ? 'You' : person.relation}{p ? ` · ${visaLabel(p)}` : ''}</T>
              <Pill small label={p?.location === 'Outside' ? `In ${p.country || 'another country'}` : 'In US'} />
            </View>
          </View>
          <Pressable onPress={() => router.push(editPath as any)} hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: t.surface2 }}>
            <T v="small" style={{ color: t.text, fontWeight: '700' }}>Edit</T>
          </Pressable>
        </Card>

        <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T v="h3" style={{ flex: 1, fontSize: 17 }}>{statusLine(p, me)}</T>
          <Pill label={w === 'act now' ? 'Act now' : w === 'review' ? 'Review' : w === 'info' ? 'Info' : 'Good'} tone={w === 'act now' ? 'red' : w === 'review' ? 'amber' : w === 'info' ? 'accent' : 'green'} />
        </Card>
        {issues.length ? (
          <Card style={{ marginTop: 10, paddingVertical: 2 }}>
            {issues.map((c, i) => (
              <Pressable key={c.id} onPress={() => { tap(); setOpen(open === c.id ? '' : c.id); }} style={{ paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tone === 'red' ? t.red : c.tone === 'amber' ? t.amber : t.sub }} />
                  <T v="body" style={{ flex: 1, fontSize: 15 }}>{c.title}</T>
                  <Ionicons name={open === c.id ? 'chevron-up' : 'chevron-down'} size={14} color={t.sub} />
                </View>
                {open === c.id ? <T v="sub" style={{ marginTop: 6, marginLeft: 18 }}>{c.detail}</T> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}

        <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>Documents</T>
        <Card style={{ paddingVertical: 2 }}>
          {slots.map((s, i) => {
            const doc = currentOf(s.type);
            const date = doc?.expires || (p ? (p[s.key] as string | undefined) : undefined);
            return <DocRow key={s.type} first={i === 0} icon={DOC_ICON[s.type] ?? 'document-outline'} label={s.label} date={date} doc={doc} onPress={doc ? () => router.push(`/status/doc?id=${doc.id}` as any) : undefined} />;
          })}
          {extra.map((d) => <DocRow key={d.id} icon={DOC_ICON[d.type] ?? 'document-outline'} label={`${d.type === 'Other' ? d.title : d.type.replace(/ \(.*\)/, '')}${slots.some((s) => s.type === d.type) ? ' · superseded' : ''}`} date={d.expires} doc={d} onPress={() => router.push(`/status/doc?id=${d.id}` as any)} />)}
        </Card>
        <T v="small" style={{ marginTop: 8, textAlign: 'center' }}>To add or renew a document, use Upload documents on the Documents tab.</T>

        {approvals.length ? (
          <>
            <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>Approvals</T>
            <Card style={{ paddingVertical: 2 }}>
              {approvals.map((a, i) => (
                <View key={`${a.receipt}-${a.noticeDate}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                  <View style={{ flex: 1 }}>
                    <T v="body" style={{ fontSize: 15, color: a.superseded ? t.sub : t.text }}>{`${a.form === 'I-129S' ? 'I-129S (blanket L)' : a.form ?? 'Approval'}${a.cls ? ` · ${classLabel(a.cls)}` : ''}${a.kind && a.form !== 'I-129S' ? ` · ${a.kind}` : ''}`}</T>
                    <T v="small" numberOfLines={1}>{[a.receipt, a.noticeDate ? `notice ${fmt(a.noticeDate)}` : null, a.validTo ? `valid to ${fmt(a.validTo)}` : null].filter(Boolean).join(' · ')}</T>
                  </View>
                  <Pill small label={a.superseded ? 'Superseded' : 'Current'} tone={a.superseded ? 'neutral' : 'green'} />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {p ? (
          <>
            <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>{isMe ? 'Job & travel' : 'Travel'}</T>
            <Card style={{ paddingVertical: 2 }}>
              <Pressable onPress={() => savePatch({ travelPlanned: p.travelPlanned ? undefined : true })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
                <Ionicons name="airplane-outline" size={20} color={t.accent} />
                <T v="body" style={{ flex: 1, fontSize: 16 }}>Planning to travel outside the US</T>
                <Ionicons name={p.travelPlanned ? 'checkbox' : 'square-outline'} size={22} color={p.travelPlanned ? t.accent : t.sub} />
              </Pressable>
              {isMe ? (
                <>
                  <Pressable onPress={() => { tap(); setJobOpen(!jobOpen); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: t.border }}>
                    <Ionicons name="briefcase-outline" size={20} color={t.accent} />
                    <View style={{ flex: 1 }}>
                      <T v="body" style={{ fontSize: 16 }}>{p.jobEnded ? `Job ended ${fmt(p.jobEnded)}` : 'Job ended?'}</T>
                      <T v="small">{p.jobEnded ? 'Grace period is counted from this day · tap to change' : 'Layoff or resignation — starts the 60-day grace period'}</T>
                    </View>
                    <Ionicons name={jobOpen ? 'chevron-up' : 'chevron-forward'} size={16} color={t.faint} />
                  </Pressable>
                  {jobOpen ? (
                    <View style={{ paddingBottom: 10 }}>
                      <DateField label="Last day of work" value={p.jobEnded} onChange={(v) => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) savePatch({ jobEnded: v }); }} />
                      {p.jobEnded ? <Button label="Still employed — clear" kind="secondary" onPress={() => { savePatch({ jobEnded: undefined }); setJobOpen(false); }} /> : null}
                    </View>
                  ) : null}
                </>
              ) : null}
            </Card>
          </>
        ) : null}

        {isMe && p ? (
          <>
            <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>Work</T>
            <Card style={{ paddingVertical: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
                <Ionicons name="location-outline" size={20} color={t.accent} />
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontSize: 16 }}>{at(p.workLocation) || 'Work location not set'}</T>
                  <T v="small">{p.workLocation ? `${p.workLocation.metro || metroOf(p.workLocation.city, p.workLocation.state) || 'Unknown'} metro · work location` : 'Add it to check moves against your approval'}</T>
                </View>
              </View>
              <Pressable onPress={() => { tap(); setEditApproved(!editApproved); setCity(''); setChecked(null); setMoving(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: t.border }}>
                <Ionicons name="ribbon-outline" size={20} color={t.sub} />
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontSize: 15 }}>{approvedAt ? at(approvedAt) : 'Approval’s work location not set'}</T>
                  <T v="small">On the approval / LCA · tap to {approvedAt ? 'change' : 'add'}</T>
                </View>
              </Pressable>
              {editApproved ? (
                <View style={{ paddingBottom: 10 }}>
                  <Field label="Work location on the approval (city, state)" placeholder="e.g. Irving, TX" value={city} onChangeText={setCity} autoCapitalize="words" />
                  <Button label="Save" kind="secondary" disabled={!parseCity(city)} onPress={() => saveWork('approvedWorkLocation', parseCity(city)!)} />
                </View>
              ) : null}
              <Pressable onPress={() => { tap(); setMoving(!moving); setCity(''); setChecked(null); setEditApproved(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: t.border }}>
                <T v="body" style={{ flex: 1, color: t.accent, fontSize: 16 }}>Work location changed?</T>
                <Ionicons name={moving ? 'chevron-up' : 'chevron-forward'} size={16} color={t.faint} />
              </Pressable>
              {moving ? (
                <View style={{ paddingBottom: 12 }}>
                  <T v="sub" style={{ marginBottom: 10 }}>Where will you work now? Count working from home too.</T>
                  <Field label="New city (city, state)" placeholder="e.g. Austin, TX" value={city} onChangeText={(v) => { setCity(v); setChecked(null); }} autoCapitalize="words" />
                  {!checked ? <Button label="Check" disabled={!parseCity(city)} onPress={() => setChecked(parseCity(city))} /> : (() => {
                    const ref = approvedAt ?? p.workLocation;
                    const isH1B = p.visa === 'H-1B';
                    const known = !!checked.metro;
                    const diff = ref ? differentMetro(checked, ref) : false;
                    return (
                      <View style={{ gap: 10 }}>
                        {!isH1B ? <Note tone="accent">{`${p.visa.startsWith('L') ? 'L-1 has no LCA. ' : ''}Tell your immigration team before the move.`}</Note>
                          : !ref ? <Note tone="amber">Add the approval’s work location first, so the move can be checked.</Note>
                          : diff && amendmentPending ? <Note tone="accent">{`${checked.city} is in another metro. Your amendment is pending — keep it on file.`}</Note>
                          : diff ? <Note tone="red">{`${checked.city} is in ${known ? `the ${checked.metro}` : 'another'} metro. An amended H-1B and a new LCA are needed before you start working there. Your employer files it — remote work from another metro counts too.`}</Note>
                          : known ? <Note tone="accent">{`Same metro (${checked.metro}). No amendment needed — your employer posts the LCA notice at the new site.`}</Note>
                          : <Note tone="amber">{`Couldn’t tell which metro ${checked.city} is in. Ask your immigration team before you move.`}</Note>}
                        <Button label="Save as my work location" kind="secondary" onPress={() => saveWork('workLocation', checked)} />
                      </View>
                    );
                  })()}
                </View>
              ) : null}
            </Card>
          </>
        ) : null}

        {myCases.length ? (
          <>
            <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>Cases</T>
            <Card style={{ paddingVertical: 2 }}>
              {myCases.map((c, i) => {
                const st = stageOf(c.status);
                return (
                  <Pressable key={c.receipt} onPress={() => router.push(`/case/${c.receipt}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <View style={{ flex: 1 }}>
                      <T v="body" style={{ fontSize: 15 }}>{c.form ?? 'Case'} · {c.receipt}</T>
                      <T v="small" numberOfLines={1}>{c.status ?? 'Tap to check status'}</T>
                    </View>
                    <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} small />
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : null}
        <T v="small" style={{ textAlign: 'center', marginTop: 18 }}>Stored only on this phone · not legal advice</T>
      </View>
    </DetailScreen>
  );
}
