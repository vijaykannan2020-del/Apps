// Ask (or edit) a question: title, details, up to 5 tags (the family's first), a live privacy check
// and the not-legal-advice line. After the first question, asks once about answer notifications.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COMMUNITY_DISCLAIMER, LIMITS, MAX_TAGS, draftProblem, orderedTags, privacyProblem, toggleTag } from '../core/community';
import { createPost, editPost, getPost } from '../data/communityApi';
import { Button, ChipToggle, Chips, Field, Hint, Note, Screen, SectionHeader, Spinner, T, font, useSheet, useToast, TourTarget, useTour } from '../ui';
import { back, replace } from './common';
import { useFamilyCommunityTags } from './community';
import { maybeAskNotify } from './communityAccount';

export function CommunityComposeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const fam = useFamilyCommunityTags();
  const sheet = useSheet();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const tour = useTour('communityCompose');

  useEffect(() => {
    if (!id) { setTags(fam.slice(0, 1)); return; }
    getPost(String(id)).then((r) => { setTitle(r.post.title); setBody(r.post.body); setTags(r.post.tags); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const problem = draftProblem({ title, body, tags });
  const privacy = privacyProblem(`${title}\n${body}`);
  const all = orderedTags(fam);
  const shown = showAll ? all : [...new Set([...all.slice(0, 12), ...tags])];

  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true); setError('');
    try {
      const d = { title: title.trim(), body: body.trim(), tags };
      if (id) { await editPost(String(id), d); toast('Question updated'); back(); return; }
      const r = await createPost(d);
      toast('Question posted');
      replace(`/community/post/${r.post.id}`);
      setTimeout(() => maybeAskNotify(sheet.open, sheet.close), 600);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const nav = { title: id ? 'Edit question' : 'Ask a question', back: 'Cancel', onBack: back };
  if (loading) return <Screen nav={nav}><Spinner /></Screen>;
  return (
    <Screen nav={nav} keyboard tour={tour} footer={<Button icon="check" title={id ? 'Save' : 'Post question'} busy={busy} onPress={submit} />}>
      <TourTarget id="title"><Field label="Title" value={title} onChangeText={setTitle} maxLength={LIMITS.title[1]} placeholder="H-1B extension: RFE answered 8 weeks ago — normal?" error={tried && title.trim().length < LIMITS.title[0] ? `At least ${LIMITS.title[0]} characters.` : undefined} /></TourTarget>
      <Field label="Details" value={body} onChangeText={setBody} multiline maxLength={LIMITS.body[1]} placeholder="Visa, form, service center (EAC, WAC…), dates and what you’ve tried. No names or receipt numbers."
        error={tried && body.trim().length < LIMITS.body[0] ? `At least ${LIMITS.body[0]} characters.` : undefined} />
      <T tone="text2" style={[font.caption, { marginTop: 4, textAlign: 'right' }]}>{`${body.length} / ${LIMITS.body[1]}`}</T>
      {privacy ? <Note tone="amber">{privacy}</Note> : null}
      <SectionHeader>{`Tags · ${tags.length} of ${MAX_TAGS}`}</SectionHeader>
      {fam.length ? <Hint style={{ marginTop: 0 }}>Your family’s visa types and forms are first.</Hint> : null}
      <TourTarget id="tags"><Chips>{shown.map((g) => <ChipToggle key={g} role="checkbox" text={g} on={tags.includes(g)} onPress={() => setTags((x) => toggleTag(x, g))} />)}</Chips></TourTarget>
      {!showAll ? <View style={{ marginTop: 6 }}><Button size="sm" kind="ghost" title="More tags" onPress={() => setShowAll(true)} /></View> : null}
      {tried && problem && !privacy ? <Note tone="amber">{problem}</Note> : null}
      {error ? <Note tone="red">{error}</Note> : null}
      <TourTarget id="privacy"><Note tone="grey">{`${COMMUNITY_DISCLAIMER} Questions are public — anyone using the app can read them.`}</Note></TourTarget>
    </Screen>
  );
}
