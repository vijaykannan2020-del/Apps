// Words that differ between iPhone and Android (lock, backup, store). Everything else is shared.
import { Platform } from 'react-native';

const android = Platform.OS === 'android';
/** The biometric lock: Face ID on iPhone; on Android the phone's fingerprint, face or screen lock. */
export const LOCK_NAME = android ? 'Fingerprint' : 'Face ID';
/** The automatic backup place. */
export const CLOUD_NAME = android ? 'Google Drive' : 'iCloud';
export const STORE_NAME = android ? 'Google Play' : 'the App Store';
/** The phone's settings app. */
export const OS_SETTINGS = android ? 'Android Settings' : 'iOS Settings';
export const KEYCHAIN = android ? 'this phone’s secure storage' : 'this iPhone’s keychain';
