// Expo's own preset (it ships inside the expo package, so resolve it from there).
module.exports = function (api) {
  api.cache(true);
  const preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });
  return { presets: [preset] };
};
