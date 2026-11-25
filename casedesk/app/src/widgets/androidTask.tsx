// Android widget task: Android asks for the widget (added, timed update, resized); we render it from
// the last snapshot the app saved. Runs headless, so it reads AsyncStorage directly.
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import type { WidgetSnapshot } from '../core/widgets';
import { AndroidFamilyWidget } from './AndroidFamilyWidget';

export const ANDROID_WIDGET = 'Family';
export const ANDROID_WIDGET_KEY = 'iw.widget.snapshot.v1';

export async function readAndroidSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const AS = require('@react-native-async-storage/async-storage').default;
    const raw = await AS.getItem(ANDROID_WIDGET_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch { return null; }
}

export async function androidWidgetTask(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  const snap = await readAndroidSnapshot();
  props.renderWidget(<AndroidFamilyWidget snap={snap} />);
}
