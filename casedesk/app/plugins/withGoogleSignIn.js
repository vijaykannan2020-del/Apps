// Google sign-in for Community (see GOOGLE.md). When app.json has extra.googleIosClientId, the iOS
// build registers Google's "reversed client id" URL scheme (com.googleusercontent.apps.<id>) so Google
// can send the person back to the app after signing in. The same scheme is also listed under
// LSApplicationQueriesSchemes: that lets the app ask iOS "is this scheme in my build?" at runtime, so
// an over-the-air update running on an OLDER build (without the scheme) keeps the Google button hidden.
// Without a client id this plugin changes nothing.
const { withInfoPlist } = require('@expo/config-plugins');

const reversed = (id) => { const m = /^([\w-]+)\.apps\.googleusercontent\.com$/.exec(String(id || '').trim()); return m ? `com.googleusercontent.apps.${m[1]}` : null; };

module.exports = function withGoogleSignIn(config) {
  const scheme = reversed(config.extra && config.extra.googleIosClientId);
  if (!scheme) return config;
  return withInfoPlist(config, (c) => {
    const types = c.modResults.CFBundleURLTypes || [];
    if (!types.some((t) => (t.CFBundleURLSchemes || []).includes(scheme))) types.push({ CFBundleURLSchemes: [scheme] });
    c.modResults.CFBundleURLTypes = types;
    const q = c.modResults.LSApplicationQueriesSchemes || [];
    if (!q.includes(scheme)) q.push(scheme);
    c.modResults.LSApplicationQueriesSchemes = q;
    return c;
  });
};
module.exports.reversed = reversed;
