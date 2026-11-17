// Prevailing-wage data ships as one asset file per state (assets/wages/*.wage), loaded only when needed.
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wage');
module.exports = config;
