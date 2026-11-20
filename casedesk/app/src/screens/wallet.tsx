// v2.5: Apple Wallet "Immigration status card" (person page + Family) and home-screen widget settings.
// The card is for personal reference only — NOT an official document (front and back say so).
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useFamily, usePerson } from '../data/FamilyProvider';
import { walletEnabled, requestPass, WalletUnavailable } from '../data/walletApi';
import { presentPass, walletPlatform } from '../native/wallet';
import { widgetsAvailable } from '../native/widgets';
import { nativeAddPassButton } from '../../modules/add-pass-button';
import { passFields, previewRows, PASS_BG, PASS_BACK_DISCLAIMER, PASS_FRONT_DISCLAIMER, ForbiddenOnPass, type NameStyle, type PassCard } from '../core/walletPass';
import { widgetHideLocked, widgetNames } from '../core/widgets';
import { fmt } from '../core/dates';
import { Button, ChipToggle, Chips, Group, Hint, Note, Row, Segmented, SheetButtons, Spinner, Switch, T, Why, font, useSheet, useTheme, useToast, TourButton, TourScope, TourTarget, useSheetTour } from '../ui';
import { go } from './common';

/** Is the Wallet card offered here? iPhone/iPad, and the server can sign passes (503 → hidden). */
export function useWalletReady(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!walletPlatform()) return;
    let live = true;
    walletEnabled().then((v) => { if (live) setOk(v); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return ok;
}

/** Apple's own Add to Apple Wallet button (PKAddPassButton) on v2.5 builds; a plain text button before. */
export function AddToWalletButton({ onPress, label = 'Add to Apple Wallet' }: { onPress: () => void; label?: string }) {
  const t = useTheme();
  const Native = Platform.OS === 'ios' ? nativeAddPassButton() : null;
  if (Native) return <Native outline={t.dark} onPress={onPress} accessibilityLabel={label} style={{ height: 48, width: '100%', maxWidth: 360, alignSelf: 'center' }} />;
  return <Button kind="tint" icon="card" title={label} onPress={onPress} block />;
}

/** Person page: the card entry point (hidden when Wallet signing isn't available). */
export function WalletCardRow({ pid }: { pid: string }) {
  const ready = useWalletReady();
  const sheet = useSheet();
  if (!ready) return null;
  return (
    <TourTarget id="wallet" style={{ marginTop: 16 }}>
      <AddToWalletButton onPress={() => sheet.open('Wallet status card', <WalletPreview pid={pid} />)} />
      <Hint center style={{ marginTop: 6 }}>{PASS_FRONT_DISCLAIMER}</Hint>
    </TourTarget>
  );
}

/** Family: pick a person, then the same preview. */
export function FamilyWalletRow() {
  const ready = useWalletReady();
  const f = useFamily();
  const sheet = useSheet();
  if (!ready || !f.people.length) return null;
  return (
    <TourTarget id="wallet" style={{ marginTop: 12 }}>
      <Group>
        <Row icon="card" title="Wallet status cards" subtitle="Add a reference card for anyone to Apple Wallet" onPress={() => sheet.open('Wallet status card', <WalletPickPerson />)} />
      </Group>
    </TourTarget>
  );
}

function WalletPickPerson() {
  const f = useFamily();
  const sheet = useSheet();
  return (
    <View>
      <Why>Whose card? You can add one for each person.</Why>
      <Group style={{ marginTop: 12 }}>
        {f.people.map((p) => <Row key={p.id} avatar={p.name} title={p.name} onPress={() => sheet.open('Wallet status card', <WalletPreview pid={p.id} />)} />)}
      </Group>
    </View>
  );
}

const STYLES: { value: NameStyle; label: string }[] = [{ value: 'full', label: 'Full name' }, { value: 'first', label: 'First name' }, { value: 'initials', label: 'Initials' }];

/** Preview first: exactly what goes on the card, the name style, and the disclaimer. */
export function WalletPreview({ pid }: { pid: string }) {
  const { family: f, person: p, rec, result } = usePerson(pid);
  const sheet = useSheet();
  const toast = useToast();
  const tour = useSheetTour('wallet-preview');
  const [style, setStyle] = useState<NameStyle>(f.settings.walletName ?? 'first');
  const [busy, setBusy] = useState(false);
  if (!p) return <Why>This person was removed.</Why>;
  let card: PassCard | null = null; let err = '';
  try { card = passFields({ person: p, rec, res: result, cases: f.caseList.filter((c) => c.ownerId === p.id), style }); } catch (e) { err = e instanceof ForbiddenOnPass ? e.message : 'Couldn’t prepare the card.'; }
  const add = async () => {
    if (!card) return;
    setBusy(true);
    try {
      if (f.settings.walletName !== style) f.actions.updateSettings({ walletName: style }).catch(() => {});
      const pkpass = await requestPass(card);
      const how = await presentPass(pkpass);
      if (how === 'failed') toast('Couldn’t open Wallet on this device');
      else { sheet.close(); if (how === 'shared') toast('Choose Wallet in the share sheet to add the card'); }
    } catch (e: any) {
      toast(e instanceof WalletUnavailable ? e.message : e?.message || 'Couldn’t make the card');
    } finally { setBusy(false); }
  };
  return (
    <TourScope tour={tour}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Why>{`A card in Apple Wallet with ${p.relation === 'self' ? 'your' : `${p.name}’s`} status and dates, as a reminder. It updates when you add it again after a change.`}</Why>
        <TourButton />
      </View>
      <TourTarget id="name-style">
        <T tone="text2" style={[font.foot, { marginTop: 12 }]}>Name on the card</T>
        <Chips>{STYLES.map((s) => <ChipToggle key={s.value} text={s.label} on={style === s.value} onPress={() => setStyle(s.value)} />)}</Chips>
      </TourTarget>
      {card ? <TourTarget id="card"><CardPreview card={card} /></TourTarget> : <Note tone="red">{err}</Note>}
      <Hint style={{ marginTop: 8 }}>No passport, receipt or A-numbers go on the card. To make it, these fields are sent once to our server to sign the pass, and not stored.</Hint>
      <T tone="text2" style={[font.caption, { marginTop: 8 }]}>{`On the back: ${PASS_BACK_DISCLAIMER}`}</T>
      {busy ? <View style={{ marginTop: 14, alignItems: 'center' }}><Spinner /></View> : card ? (
        <TourTarget id="add" style={{ marginTop: 16 }}><AddToWalletButton onPress={add} /></TourTarget>
      ) : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={sheet.close} grow /></SheetButtons>
    </TourScope>
  );
}

/** A look-alike of the generic pass front (not Apple's artwork; just our card's colours and fields). */
export function CardPreview({ card }: { card: PassCard }) {
  const rows = previewRows(card);
  const white = '#FFFFFF', soft = 'rgba(255,255,255,0.72)';
  return (
    <View accessible accessibilityLabel={`Card preview. ${card.name}. ${rows.map((r) => `${r.label} ${r.value}`).join('. ')}. ${PASS_FRONT_DISCLAIMER}`}
      style={{ marginTop: 12, backgroundColor: PASS_BG[card.colour], borderRadius: 14, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={[font.foot, { color: white, fontWeight: '600' }]}>Immigration Wallet</T>
        <T style={[font.caption, { color: soft }]}>NOT OFFICIAL</T>
      </View>
      <T style={{ color: white, fontSize: 24, lineHeight: 30, fontWeight: '600' }}>{card.name}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 18 }}>
        {rows.map((r) => (
          <View key={r.label} style={{ minWidth: 120 }}>
            <T style={[font.caption, { color: soft, textTransform: 'uppercase' }]}>{r.label}</T>
            <T style={[font.foot, { color: white, fontWeight: '600' }]}>{r.value}</T>
          </View>
        ))}
      </View>
      <T style={[font.caption, { color: soft }]}>{`${PASS_FRONT_DISCLAIMER} · updated ${fmt(card.updated)}`}</T>
    </View>
  );
}

/** Settings → Widgets: names and the Face ID rule. Shown on every build (the setting is harmless before v2.5). */
export function WidgetRows() {
  const f = useFamily();
  const toast = useToast();
  const names = widgetNames(f.settings);
  const available = widgetsAvailable();
  return (
    <TourTarget id="widgets"><Group>
      <Row icon="grid" title="Show names on widgets">
        <Segmented options={['Initials', 'First names']} value={names === 'first' ? 'First names' : 'Initials'} onChange={(v) => f.actions.updateSettings({ widgetNames: v === 'First names' ? 'first' : 'initials' })} />
      </Row>
      <Row icon="lock" title="Hide details on widgets when Face ID lock is on" subtitle="Widgets then only say “Open Immigration Wallet”"
        trailing={<Switch value={widgetHideLocked(f.settings)} label="Hide details on widgets when Face ID lock is on" onValueChange={(on) => { f.actions.updateSettings({ widgetHideLocked: on }); toast(on ? 'Widget details hidden while locked' : 'Widgets show details'); }} />} />
      <Row icon="bulb" title="Choose what a widget shows" subtitle="Long-press a widget → Edit Widget to choose what it shows" onPress={() => go('/help/widgets')} />
      <Row icon="help" title="Add a widget" subtitle={available ? 'Touch and hold the Home Screen → Edit → Add Widget → Immigration Wallet' : 'Needs the latest app version from the App Store'} onPress={() => go('/help/widgets')} />
    </Group></TourTarget>
  );
}
