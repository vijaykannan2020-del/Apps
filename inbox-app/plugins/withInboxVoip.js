// Expo config plugin: adds InboxVoip.m (PushKit -> CallKit) to the iOS app and links PushKit.
const fs = require('fs');
const path = require('path');
const { withXcodeProject, withDangerousMod, IOSConfig } = require('expo/config-plugins');

const HEADER_PATHS = [
  '"$(SRCROOT)/../node_modules/react-native-voip-push-notification/ios/RNVoipPushNotification"',
  '"$(SRCROOT)/../node_modules/react-native-callkeep/ios/RNCallKeep"',
];

module.exports = function withInboxVoip(config) {
  config = withDangerousMod(config, ['ios', async (c) => {
    const name = IOSConfig.XcodeUtils.sanitizedName(c.modRequest.projectName || c.name);
    const dest = path.join(c.modRequest.platformProjectRoot, name, 'InboxVoip.m');
    fs.copyFileSync(path.join(__dirname, 'InboxVoip.m'), dest);
    return c;
  }]);
  config = withXcodeProject(config, (c) => {
    const project = c.modResults;
    const name = IOSConfig.XcodeUtils.sanitizedName(c.modRequest.projectName || c.name);
    const file = `${name}/InboxVoip.m`;
    if (!project.hasFile(file)) IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: file, groupName: name, project });
    project.addFramework('PushKit.framework', { weak: false });
    const configs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const bs = configs[key] && configs[key].buildSettings;
      if (!bs || (bs.PRODUCT_NAME || '').replace(/"/g, '') !== project.productName) continue;
      if (!bs.HEADER_SEARCH_PATHS) bs.HEADER_SEARCH_PATHS = ['"$(inherited)"'];
      if (!Array.isArray(bs.HEADER_SEARCH_PATHS)) bs.HEADER_SEARCH_PATHS = [bs.HEADER_SEARCH_PATHS];
      for (const h of HEADER_PATHS) if (!bs.HEADER_SEARCH_PATHS.includes(h)) bs.HEADER_SEARCH_PATHS.push(h);
    }
    return c;
  });
  return config;
};
