import Constants from 'expo-constants';

// "v1.0.0 (build 2) · updated Nov 17, 6:40 PM" — build from the installed app, update from the last over-the-air update.
export function versionLine() {
  let build = '', upd = '';
  try { const A = require('expo-application'); if (A.nativeBuildVersion) build = ` (build ${A.nativeBuildVersion})`; } catch {}
  try {
    const U = require('expo-updates');
    if (U.createdAt && !U.isEmbeddedLaunch) upd = ` · updated ${new Date(U.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  } catch {}
  return `v${Constants.expoConfig?.version}${build}${upd}`;
}

