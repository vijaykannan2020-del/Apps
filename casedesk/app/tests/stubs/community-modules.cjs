// Stand-ins for the Community tests: expo-constants with an apiBase, a fake Sign in with Apple
// module, and AsyncStorage / secure store absent (so the session falls back to memory).
const state = { appleResult: null, appleError: null, lastNonce: null };
module.exports = {
  state,
  constants: { default: { expoConfig: { extra: { apiBase: 'https://api.test', eas: { projectId: 'p1' } } } } },
  apple: {
    isAvailableAsync: async () => true,
    signInAsync: async (o) => { state.lastNonce = o.nonce; state.lastScopes = o.requestedScopes; if (state.appleError) throw state.appleError; return state.appleResult; },
  },
};
