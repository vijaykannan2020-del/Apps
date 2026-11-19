// Home-screen + Lock Screen widgets (WidgetKit, SwiftUI). Built by @bacons/apple-targets at prebuild.
// Data: the app writes a small JSON summary to the shared App Group (src/native/widgets.ts);
// the widget only reads it. See casedesk/app/WIDGETS.md.
const GROUP = 'group.com.vijaykannan.casedesk';

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'widget',
  displayName: 'Immigration Wallet',
  bundleIdentifier: '.widget', // com.vijaykannan.casedesk.widget (own App ID + App Store profile)
  deploymentTarget: '17.0', // containerBackground, accented / tinted rendering, interactive-ready
  icon: '../../assets/icon.png',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    // v2.7 pastel look (same values as src/ui/tokens.ts): sage accent, dark grey card, and the three
    // meanings as text-safe colours (deep on white, pastel on dark) — good / attention / urgent.
    $accent: { light: '#2A7359', dark: '#A9CDB9' },
    $widgetBackground: { light: '#FFFFFF', dark: '#1C1D1F' },
    $good: { light: '#1E6B50', dark: '#7FE0A8' },
    $attention: { light: '#7D5200', dark: '#FDD78C' },
    $urgent: { light: '#A52A36', dark: '#FFA9AC' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [GROUP],
  },
});
