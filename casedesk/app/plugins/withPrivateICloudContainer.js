// Keep CaseDesk's iCloud container private: no "CaseDesk" folder in the Files app / iCloud Drive.
// react-native-cloud-storage's plugin always writes NSUbiquitousContainerIsDocumentScopePublic = true;
// backups use the app-data scope anyway, so this only stops iOS from showing an empty folder.
// ORDER: listed BEFORE react-native-cloud-storage in app.json — Info.plist mods run last-to-first,
// so this one runs after it (tests/config.test.ts checks the result).
const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withPrivateICloudContainer(config) {
  return withInfoPlist(config, (c) => {
    const containers = c.modResults.NSUbiquitousContainers || {};
    for (const id of Object.keys(containers)) containers[id] = { ...containers[id], NSUbiquitousContainerIsDocumentScopePublic: false };
    c.modResults.NSUbiquitousContainers = containers;
    return c;
  });
};
