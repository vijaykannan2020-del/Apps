// Expo config plugin: adds the "NotificationService" app extension (profile photos in notifications, like WhatsApp),
// the Communication Notifications entitlement and the INSendMessageIntent activity type to the main app.
const fs = require('fs');
const path = require('path');
const { withXcodeProject, withDangerousMod, withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const TARGET = 'NotificationService';
const FILES = ['NotificationService.m', 'Info.plist', 'NotificationService.entitlements'];

module.exports = function withNotificationService(config) {
  // Only when the capability is ticked for the App ID (the build workflow checks and sets INBOX_COMM), otherwise
  // signing would fail; without it the extension still runs and shows normal notifications.
  if (process.env.INBOX_COMM === '1') config = withEntitlementsPlist(config, c => { c.modResults['com.apple.developer.usernotifications.communication'] = true; return c; });
  config = withInfoPlist(config, c => {
    const t = new Set(c.modResults.NSUserActivityTypes || []); t.add('INSendMessageIntent');
    c.modResults.NSUserActivityTypes = [...t]; return c;
  });
  config = withDangerousMod(config, ['ios', async c => {
    const dir = path.join(c.modRequest.platformProjectRoot, TARGET);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of FILES) fs.copyFileSync(path.join(__dirname, TARGET, f), path.join(dir, f));
    return c;
  }]);
  config = withXcodeProject(config, c => {
    const proj = c.modResults;
    if (proj.pbxTargetByName(TARGET)) return c;
    const bundleId = `${c.ios.bundleIdentifier}.${TARGET}`;
    const objects = proj.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    const group = proj.addPbxGroup(FILES, TARGET, TARGET);
    const groups = objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      if (typeof g === 'object' && g.name === undefined && g.path === undefined) proj.addToPbxGroup(group.uuid, key); // main group
    }
    const target = proj.addTarget(TARGET, 'app_extension', TARGET, bundleId); // also embeds it in the app
    proj.addBuildPhase(['NotificationService.m'], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    // Same deployment target / team / version as the app
    const confs = proj.pbxXCBuildConfigurationSection();
    let appDeploy = '15.1', team = process.env.EXPO_APPLE_TEAM_ID || undefined;
    for (const k of Object.keys(confs)) {
      const bs = confs[k] && confs[k].buildSettings;
      if (bs && (bs.PRODUCT_BUNDLE_IDENTIFIER || '').replace(/"/g, '') === c.ios.bundleIdentifier) {
        if (bs.IPHONEOS_DEPLOYMENT_TARGET) appDeploy = bs.IPHONEOS_DEPLOYMENT_TARGET;
        if (bs.DEVELOPMENT_TEAM) team = bs.DEVELOPMENT_TEAM;
      }
    }
    for (const k of Object.keys(confs)) {
      const bs = confs[k] && confs[k].buildSettings;
      if (!bs || (bs.PRODUCT_NAME || '').replace(/"/g, '') !== TARGET) continue;
      Object.assign(bs, {
        PRODUCT_BUNDLE_IDENTIFIER: `"${bundleId}"`,
        INFOPLIST_FILE: `${TARGET}/Info.plist`,
        CODE_SIGN_ENTITLEMENTS: `${TARGET}/${TARGET}.entitlements`,
        IPHONEOS_DEPLOYMENT_TARGET: appDeploy,
        TARGETED_DEVICE_FAMILY: '"1,2"',
        MARKETING_VERSION: c.version || '1.0.0',
        CURRENT_PROJECT_VERSION: String((c.ios && c.ios.buildNumber) || '1'),
        CLANG_ENABLE_MODULES: 'YES',
        CLANG_ENABLE_OBJC_ARC: 'YES',
        OTHER_LDFLAGS: ['"$(inherited)"', '"-framework"', 'Intents', '"-framework"', 'UserNotifications'],
        SKIP_INSTALL: 'YES',
        GCC_C_LANGUAGE_STANDARD: 'gnu11',
        ...(team ? { DEVELOPMENT_TEAM: team } : {}),
      });
    }
    if (team) proj.addTargetAttribute('DevelopmentTeam', team, target);
    return c;
  });
  return config;
};
