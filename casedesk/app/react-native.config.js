// Android-only native packages: kept out of the iPhone build so the App Store binary is unchanged.
// Google sign-in on iOS uses expo-auth-session; home-screen widgets on iOS are the WidgetKit target.
module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': { platforms: { ios: null } },
    'react-native-android-widget': { platforms: { ios: null } },
  },
};
