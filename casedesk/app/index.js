// App entry: expo-router, plus the Android home-screen widget task (no-op elsewhere).
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { androidWidgetTask } = require('./src/widgets/androidTask');
    registerWidgetTaskHandler(androidWidgetTask);
  } catch { /* builds without the widget module */ }
}
