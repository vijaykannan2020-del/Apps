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
    $accent: { light: '#0A84FF', dark: '#0A84FF' },
    $widgetBackground: { light: '#FFFFFF', dark: '#16181C' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [GROUP],
  },
});
