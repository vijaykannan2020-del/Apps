// Background check, run by iOS / Android every few hours (the system picks the exact time):
// looks up each tracked case and notifies when its status changed, and refreshes date reminders.
// Receipt numbers never leave the phone except for the status lookup itself.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCase, isLive } from './api';
import { loadPrefs, scheduleReminders } from './alerts';
import type { TrackedCase } from './store';

export const TASK = 'casedesk-check';

export async function checkCasesNow(notify = true): Promise<number> {
  if (!isLive()) return 0;
  const prefs = await loadPrefs();
  const cases: TrackedCase[] = JSON.parse((await AsyncStorage.getItem('cd.cases.v1')) || '[]');
  let changed = 0;
  for (const c of cases) {
    try {
      const r = await fetchCase(c.receipt);
      if (r.status && r.status !== c.status) {
        changed++;
        Object.assign(c, { form: r.form, status: r.status, detail: r.detail, updated: r.updated, history: r.history });
        if (notify && prefs.caseUpdates && Platform.OS !== 'web') {
          const N = require('expo-notifications');
          await N.scheduleNotificationAsync({ content: { title: `${c.nickname || c.form || 'Your case'} updated`, body: r.status, data: { url: `/case/${c.receipt}` } }, trigger: null });
        }
      }
    } catch {}
  }
  if (changed) await AsyncStorage.setItem('cd.cases.v1', JSON.stringify(cases));
  return changed;
}

if (Platform.OS !== 'web') {
  try {
    const TaskManager = require('expo-task-manager');
    TaskManager.defineTask(TASK, async () => {
      try {
        await checkCasesNow(true);
        await scheduleReminders();
      } catch {}
      return require('expo-background-task').BackgroundTaskResult.Success;
    });
  } catch {}
}

export async function registerBackground() {
  if (Platform.OS === 'web') return;
  try {
    const BT = require('expo-background-task');
    const TaskManager = require('expo-task-manager');
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await BT.registerTaskAsync(TASK, { minimumInterval: 60 * 4 }); // minutes
  } catch {}
}
