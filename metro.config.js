// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// lucide-react-native's ESM build references per-icon .mjs files that Metro
// cannot resolve; route the package to its CJS build instead.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lucide-react-native') {
    return {
      type: 'sourceFile',
      filePath: require('path').join(
        __dirname,
        'node_modules',
        'lucide-react-native',
        'dist',
        'cjs',
        'lucide-react-native.js',
      ),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
