const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, "bin", "gguf"];

module.exports = config;
