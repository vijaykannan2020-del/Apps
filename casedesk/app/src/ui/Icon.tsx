// Icons: SF Symbols on iOS (expo-symbols, in the installed build), Ionicons everywhere else and as
// a fallback if the native view isn't available.
import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Ion = React.ComponentProps<typeof Ionicons>['name'];
const MAP: Record<string, [string, Ion]> = {
  arrowL: ['arrow.left', 'arrow-back'], chevL: ['chevron.left', 'chevron-back'], chevR: ['chevron.right', 'chevron-forward'], x: ['xmark', 'close'], plus: ['plus', 'add'],
  minus: ['minus.circle', 'remove-circle-outline'], camera: ['camera', 'camera-outline'], photo: ['photo', 'image-outline'], folder: ['folder', 'folder-outline'],
  check: ['checkmark', 'checkmark'], checkc: ['checkmark.circle', 'checkmark-circle-outline'], alert: ['exclamationmark.triangle', 'warning-outline'],
  info: ['info.circle', 'information-circle-outline'], share: ['square.and.arrow.up', 'share-outline'], refresh: ['arrow.clockwise', 'refresh'],
  trash: ['trash', 'trash-outline'], home: ['house', 'home-outline'], clock: ['clock', 'time-outline'], doc: ['doc.text', 'document-text-outline'],
  grid: ['square.grid.2x2', 'grid-outline'], pin: ['mappin', 'location-outline'], case: ['briefcase', 'briefcase-outline'], briefcase: ['briefcase', 'briefcase-outline'],
  users: ['person.2', 'people-outline'], people: ['person.2', 'people-outline'], user: ['person', 'person-outline'], cap: ['graduationcap', 'school-outline'], school: ['graduationcap', 'school-outline'],
  idcard: ['person.text.rectangle', 'card-outline'], card: ['person.text.rectangle', 'card-outline'], flag: ['flag', 'flag-outline'], plane: ['airplane', 'airplane-outline'], airplane: ['airplane', 'airplane-outline'],
  help: ['questionmark.circle', 'help-circle-outline'], 'help-circle': ['questionmark.circle', 'help-circle-outline'], bell: ['bell', 'notifications-outline'],
  lock: ['lock', 'lock-closed-outline'], face: ['faceid', 'scan-outline'], download: ['arrow.down.doc', 'download-outline'], upload: ['arrow.up.doc', 'cloud-upload-outline'],
  book: ['book', 'book-outline'], chart: ['chart.line.uptrend.xyaxis', 'trending-up-outline'], dollar: ['dollarsign', 'cash-outline'], cal: ['calendar', 'calendar-outline'],
  search: ['magnifyingglass', 'search-outline'], copy: ['doc.on.doc', 'copy-outline'], compass: ['safari', 'compass-outline'], globe: ['globe', 'globe-outline'],
  building: ['building.2', 'business-outline'], dice: ['dice', 'dice-outline'], map: ['map', 'map-outline'], edit: ['pencil', 'create-outline'], ext: ['arrow.up.right.square', 'open-outline'],
  layers: ['square.stack.3d.up', 'layers-outline'], shield: ['checkmark.shield', 'shield-checkmark-outline'], play: ['play.circle', 'play-circle-outline'], list: ['list.bullet', 'list-outline'],
  scale: ['scalemass', 'scale-outline'], hr: ['chart.bar.doc.horizontal', 'stats-chart-outline'], sun: ['sun.max', 'sunny-outline'], moon: ['moon', 'moon-outline'],
  gear: ['gearshape', 'settings-outline'], news: ['newspaper', 'newspaper-outline'], bulb: ['lightbulb', 'bulb-outline'],
  up: ['arrow.up', 'arrow-up'], chat: ['bubble.left.and.bubble.right', 'chatbubbles-outline'], more: ['ellipsis', 'ellipsis-horizontal'], block: ['hand.raised', 'hand-left-outline'], // Community
  backup: ['externaldrive.badge.icloud', 'cloud-upload-outline'], restore: ['arrow.counterclockwise.icloud', 'cloud-download-outline'],
};

// SF Symbols only when the native SymbolModule view is really registered in this build. An OTA
// bundle can run on an older binary: if detection is uncertain, Ionicons are used.
function nativeSymbols(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    const g = globalThis as any;
    const viewConfig = g.expo?.getViewConfig?.('SymbolModule', undefined) ?? g.expo?.getViewConfig?.('SymbolModule');
    if (!viewConfig) return false;
    const { requireOptionalNativeModule } = require('expo-modules-core');
    return !!requireOptionalNativeModule?.('SymbolModule');
  } catch { return false; }
}
let SymbolView: any;
if (nativeSymbols()) { try { SymbolView = require('expo-symbols').SymbolView; } catch { SymbolView = undefined; } }

export function Icon({ name, size = 22, color, weight = 'regular' }: { name: string; size?: number; color: string; weight?: 'regular' | 'semibold' | 'bold' }) {
  const m = MAP[name] ?? ['circle', 'ellipse-outline' as Ion];
  if (SymbolView) return <SymbolView name={m[0]} size={size} tintColor={color} weight={weight} fallback={<Ionicons name={m[1]} size={size} color={color} />} />;
  return <Ionicons name={m[1]} size={size} color={color} />;
}
