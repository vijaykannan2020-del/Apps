// `Linking.canOpenURL` answers from globalThis.__canOpen (a Set of schemes "in this build") so tests can play an old or a new binary.
module.exports = {
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
  Linking: { canOpenURL: async (url) => { const s = globalThis.__canOpen; return !!s && s.has(String(url).split(':')[0]); } },
};
