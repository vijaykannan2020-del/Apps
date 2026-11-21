// New post (or edit): pick a type — Question, Discussion, Timeline share (form, office, dates → a small
// timeline card) or Poll (2–4 options) — then title, details and up to 5 tags (the family's first).
// A live privacy check warns about receipt numbers and other personal details before anything is sent.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COMMUNITY_DISCLAIMER, composePrefill, newsPrefill, newsPostUntouched, LIMITS, MAX_TAGS, OFFICES, POST_TYPES, STEPS, TAGS, draftProblem, orderedTags, privacyProblem, timelineProblem, timelineTitle, toggleTag, type PostType, type TimelineData, type TimelineStep } from '../core/community';
import { createPost, editPost, getPost, type NewPost } from '../data/communityApi';
import { Button, ChipToggle, Chips, DateField, Field, Hint, LinkButton, Note, Row, Group, Screen, SectionHeader, SelectField, Spinner, Switch, T, font, useSheet, useToast, TourTarget, useTour } from '../ui';
import { back, replace } from './common';
import { newsById } from '../data/news';
import { fmt } from '../core/dates';
import { useFamilyCommunityTags } from './community';
import { maybeAskNotify } from './communityAccount';
import { PollCard, TimelineCard } from './communityUi';

const opt = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const blankSteps = (): TimelineStep[] => [{ label: 'Filed', date: '' }, { label: 'Approved', date: '' }];

export function CommunityComposeScreen() {
  // type / tag: a Start a conversation prompt (v2.9) opens New post with these picked
  // news: Discuss in Community from an update (v3.0) — Discussion type, title, the update quoted, its tags
  const { id, type: pType, tag: pTag, news: pNews } = useLocalSearchParams<{ id?: string; type?: string; tag?: string; news?: string }>();
  const fromNews = !id && pNews ? newsById(String(pNews)) : undefined;
  const fam = useFamilyCommunityTags();
  const sheet = useSheet();
  const toast = useToast();
  const [type, setType] = useState<PostType>(() => (id ? 'question' : fromNews ? 'discussion' : composePrefill({ type: pType, tag: pTag }, []).type));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [tl, setTl] = useState<TimelineData>({ form: '', office: '', premium: false, steps: blankSteps() });
  const [isRepost, setIsRepost] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const tour = useTour('communityCompose', undefined, { auto: false });

  useEffect(() => {
    if (!id && fromNews) {
      let when = fromNews.date; try { when = fmt(fromNews.date); } catch {}
      const p = newsPrefill(fromNews, when, fam);
      setTitle(p.title); setBody(p.body); setTags(p.tags);
      return;
    }
    if (!id) { setTags(composePrefill({ type: pType, tag: pTag }, fam).tags); return; }
    getPost(String(id)).then((r) => {
      setType(r.post.type); setTitle(r.post.title); setBody(r.post.body); setTags(r.post.tags); setIsRepost(!!r.post.repost);
      if (r.post.poll) setOptions(r.post.poll.options.map((o) => o.text));
      if (r.post.timeline) setTl(r.post.timeline);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const steps = tl.steps.filter((s) => s.label && s.date);
  const cleanTl: TimelineData = { ...tl, steps };
  const pollOptions = options.map((o) => o.trim()).filter(Boolean);
  const draft = { type, title, body, tags, poll: pollOptions, timeline: cleanTl, repost: isRepost };
  const problem = fromNews && newsPostUntouched(body) ? 'Write your question or thoughts at the top, above the update.' : draftProblem(draft);
  const privacy = privacyProblem([title, body, ...options].join('\n'));
  const all = orderedTags(fam);
  const shown = showAll ? all : [...new Set([...all.slice(0, 12), ...tags])];
  const meta = POST_TYPES.find((x) => x.id === type)!;
  const tlReady = type === 'timeline' && !timelineProblem(cleanTl);
  const suggested = tlReady ? timelineTitle(cleanTl) : '';

  const setStep = (i: number, patch: Partial<TimelineStep>) => setTl((x) => ({ ...x, steps: x.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const pickForm = (form: string) => { setTl((x) => ({ ...x, form })); if (!tags.includes(form) && tags.length < MAX_TAGS) setTags((x) => [...x, form]); };

  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true); setError('');
    try {
      const d: NewPost = { title: title.trim(), body: body.trim(), tags, type };
      if (type === 'poll' && !id) d.poll = { options: pollOptions };
      if (type === 'timeline') d.timeline = cleanTl;
      if (id) { await editPost(String(id), d); toast('Post updated'); back(); return; }
      const r = await createPost(d);
      toast('Posted');
      replace(`/community/post/${r.post.id}`);
      setTimeout(() => maybeAskNotify(sheet.open, sheet.close), 600);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const nav = { title: id ? 'Edit post' : 'New post', back: 'Cancel', onBack: back };
  if (loading) return <Screen nav={nav}><Spinner /></Screen>;
  const titleHint = type === 'question' ? 'H-1B extension: RFE answered 8 weeks ago — normal?' : type === 'poll' ? 'How long did your STEM OPT approval take?' : type === 'timeline' ? 'H-4 EAD renewal: filed Aug, approved Nov' : 'Premium processing is back for I-539 — worth it?';
  return (
    <Screen nav={nav} keyboard tour={tour} footer={<Button icon="check" title={id ? 'Save' : 'Post'} busy={busy} onPress={submit} />}>
      {fromNews ? <Note tone="blue" style={{ marginTop: 0, marginBottom: 12 }}>{`Discussing the update “${fromNews.title}”. Write your question or thoughts at the top of Details — the update is quoted below it with its source link.`}</Note> : null}
      {!id ? (
        <TourTarget id="type">
          <Chips style={{ marginTop: 0 }}>{POST_TYPES.map((x) => <ChipToggle key={x.id} text={x.label} on={type === x.id} onPress={() => setType(x.id)} />)}</Chips>
          <Hint>{meta.hint}</Hint>
        </TourTarget>
      ) : <TourTarget id="type"><Hint style={{ marginTop: 0 }}>{`${isRepost ? 'Repost' : meta.label} — the type can’t be changed after posting.`}</Hint></TourTarget>}

      {type === 'timeline' ? (
        <>
          <SectionHeader>Your case</SectionHeader>
          <SelectField label="Form" value={tl.form} options={opt(TAGS.form)} onChange={pickForm} />
          <SelectField label="Office (the first letters of the receipt number — never the number itself)" value={tl.office} options={opt(OFFICES)} onChange={(office) => setTl((x) => ({ ...x, office }))} />
          <Group style={{ marginTop: 12 }}><Row title="Premium processing" trailing={<Switch value={tl.premium} label="Premium processing" onValueChange={(premium) => setTl((x) => ({ ...x, premium }))} />} /></Group>
          <SectionHeader>{`Dates · ${tl.steps.length} of ${LIMITS.steps[1]}`}</SectionHeader>
          {tl.steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><SelectField label={`Step ${i + 1}`} value={s.label} options={opt(STEPS.filter((x) => x === s.label || !tl.steps.some((y) => y.label === x)))} onChange={(label) => setStep(i, { label })} /></View>
              <View style={{ flex: 1 }}><DateField label="Date" value={s.date || undefined} onChange={(date) => setStep(i, { date: date ?? '' })} /></View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {tl.steps.length < LIMITS.steps[1] ? <LinkButton align="left" title="Add a step" onPress={() => setTl((x) => ({ ...x, steps: [...x.steps, { label: '', date: '' }] }))} /> : <View />}
            {tl.steps.length > LIMITS.steps[0] ? <LinkButton title="Remove last" onPress={() => setTl((x) => ({ ...x, steps: x.steps.slice(0, -1) }))} /> : null}
          </View>
          {tlReady ? <><T tone="text2" style={[font.caption, { marginTop: 6 }]}>Preview</T><TimelineCard tl={cleanTl} /></> : tried ? <Note tone="amber">{timelineProblem(cleanTl)}</Note> : null}
        </>
      ) : null}

      <TourTarget id="title"><Field label="Title" value={title} onChangeText={setTitle} maxLength={LIMITS.title[1]} placeholder={titleHint} error={tried && title.trim().length < LIMITS.title[0] && !isRepost ? `At least ${LIMITS.title[0]} characters.` : undefined} /></TourTarget>
      {suggested && title.trim() !== suggested ? <LinkButton align="left" title={`Use “${suggested}”`} onPress={() => setTitle(suggested.slice(0, LIMITS.title[1]))} /> : null}
      <Field label={type === 'question' || type === 'discussion' ? 'Details' : isRepost ? 'Your comment' : 'Details (optional)'} value={body} onChangeText={setBody} multiline maxLength={LIMITS.body[1]}
        placeholder={type === 'timeline' ? 'Anything that helps others: RFE topic, service level, what you’d do differently.' : type === 'poll' ? 'Add context for the poll, if you like.' : 'Visa, form, service center (EAC, WAC…), dates and what you’ve tried. No names or receipt numbers.'}
        error={tried && (type === 'question' || type === 'discussion') && !isRepost && body.trim().length < LIMITS.body[0] ? `At least ${LIMITS.body[0]} characters.` : undefined} />
      <T tone="text2" style={[font.caption, { marginTop: 4, textAlign: 'right' }]}>{`${body.length} / ${LIMITS.body[1]}`}</T>

      {type === 'poll' ? (
        id ? <><SectionHeader>Poll</SectionHeader><Hint style={{ marginTop: 0 }}>Poll options can’t be changed after posting.</Hint><PollCard poll={{ options: options.map((text) => ({ text, votes: 0 })), total: 0, myVote: null }} /></> : (
          <>
            <SectionHeader>{`Options · ${options.length} of ${LIMITS.pollOptions[1]}`}</SectionHeader>
            {options.map((o, i) => <Field key={i} label={`Option ${i + 1}`} value={o} onChangeText={(v) => setOptions((x) => x.map((y, k) => (k === i ? v : y)))} maxLength={LIMITS.pollOption[1]} placeholder={['Under 2 months', '2–4 months', 'Over 4 months', 'Still waiting'][i]} />)}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {options.length < LIMITS.pollOptions[1] ? <LinkButton align="left" title="Add an option" onPress={() => setOptions((x) => [...x, ''])} /> : <View />}
              {options.length > LIMITS.pollOptions[0] ? <LinkButton title="Remove last" onPress={() => setOptions((x) => x.slice(0, -1))} /> : null}
            </View>
            <Hint>Everyone gets one vote and can change it. Results show after voting.</Hint>
          </>
        )
      ) : null}

      {privacy ? <Note tone="amber">{privacy}</Note> : null}
      <SectionHeader>{`Tags · ${tags.length} of ${MAX_TAGS}`}</SectionHeader>
      {fam.length ? <Hint style={{ marginTop: 0 }}>Your family’s visa types and forms are first.</Hint> : null}
      <TourTarget id="tags"><Chips>{shown.map((g) => <ChipToggle key={g} role="checkbox" text={g} on={tags.includes(g)} onPress={() => setTags((x) => toggleTag(x, g))} />)}</Chips></TourTarget>
      {!showAll ? <View style={{ marginTop: 6 }}><Button size="sm" kind="ghost" title="More tags" onPress={() => setShowAll(true)} /></View> : null}
      {tried && problem && !privacy ? <Note tone="amber">{problem}</Note> : null}
      {error ? <Note tone="red">{error}</Note> : null}
      <TourTarget id="privacy"><Note tone="grey">{`${COMMUNITY_DISCLAIMER} Posts are public — anyone using the app can read them.`}</Note></TourTarget>
    </Screen>
  );
}
