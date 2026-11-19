import { RELEASE } from '../content/release';
// Settings → About: version, build and the OTA update the app is running (pure, tested).
export type AppInfo = { version?: string; build?: string; updateId?: string | null; channel?: string | null; updateAt?: string | null; embedded?: boolean; runtime?: string | null };

/** Rows for About: "Version 1.0.0 (12)", "Update a1b2c3d4 · Nov 18, 2026" or "Built-in (no update yet)". */
export function versionRows(i: AppInfo): { label: string; value: string }[] {
  const rows = [{ label: 'Version', value: `${RELEASE}${i.build ? ` (build ${i.build})` : ''}` }, { label: 'App Store version', value: i.version ?? '—' }];
  if (i.updateId && !i.embedded) {
    const d = i.updateAt ? new Date(i.updateAt) : null;
    const when = d && !isNaN(+d) ? ` · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
    rows.push({ label: 'Update', value: `${i.updateId.slice(0, 8)}${when}` });
  } else rows.push({ label: 'Update', value: 'Built-in (no over-the-air update yet)' });
  if (i.channel) rows.push({ label: 'Channel', value: i.channel });
  if (i.runtime) rows.push({ label: 'Runtime', value: i.runtime });
  return rows;
}
