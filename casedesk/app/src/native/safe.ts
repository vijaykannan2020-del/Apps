// Crash-safe access to optional native modules. An OTA bundle may run on an installed build that
// lacks a module, so each one is required lazily (with a literal name — Metro needs that) inside
// try/catch. Callers get undefined and show "not available" instead of crashing.
export const native = {
  haptics: (): any => { try { return require('expo-haptics'); } catch { return undefined; } },
  localAuth: (): any => { try { return require('expo-local-authentication'); } catch { return undefined; } },
  notifications: (): any => { try { return require('expo-notifications'); } catch { return undefined; } },
  imagePicker: (): any => { try { return require('expo-image-picker'); } catch { return undefined; } },
  documentPicker: (): any => { try { return require('expo-document-picker'); } catch { return undefined; } },
  fileSystem: (): any => { try { return require('expo-file-system'); } catch { return undefined; } },
  sharing: (): any => { try { return require('expo-sharing'); } catch { return undefined; } },
  clipboard: (): any => { try { return require('expo-clipboard'); } catch { return undefined; } },
  webBrowser: (): any => { try { return require('expo-web-browser'); } catch { return undefined; } },
  updates: (): any => { try { return require('expo-updates'); } catch { return undefined; } },
  // v2.2 native build (iCloud backup). On older binaries these are missing: callers show
  // "Needs the latest app version from TestFlight" instead of crashing.
  cloudStorage: (): any => { try { return require('react-native-cloud-storage'); } catch { return undefined; } },
  secureStore: (): any => { try { return require('expo-secure-store'); } catch { return undefined; } },
  network: (): any => { try { return require('expo-network'); } catch { return undefined; } },
};
