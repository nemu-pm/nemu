const { getDefaultConfig } = require("expo/metro-config");
const {
  getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");
const path = require("path");
const crypto = require("crypto");
const rootEnv = require("./loadRootEnv.cjs")();

const config = getDefaultConfig(__dirname);

// babel-preset-expo inlines EXPO_PUBLIC_* values at transform time, but
// Metro's transform cache (shared between `expo export` and the Xcode/Gradle
// bundle phase under $TMPDIR/metro-cache) does not key on them. A release
// bundle once reused modules transformed against the dev Convex deployment
// after the env changed. Fold the mode and every public env value into the
// cache version so an env change invalidates the cache automatically.
const publicEnvFingerprint = crypto
  .createHash("sha1")
  .update(rootEnv.mode)
  .update(
    JSON.stringify(
      Object.keys(process.env)
        .filter((key) => key.startsWith("EXPO_PUBLIC_"))
        .sort()
        .map((key) => [key, process.env[key]]),
    ),
  )
  .digest("hex")
  .slice(0, 16);
config.cacheVersion = [config.cacheVersion, publicEnvFingerprint]
  .filter(Boolean)
  .join(":");
const defaultResolveRequest = config.resolver.resolveRequest;
const defaultGetModulesRunBeforeMainModule =
  config.serializer.getModulesRunBeforeMainModule;
const textEncodingPolyfill = path.join(
  __dirname,
  "src/polyfills/textEncoding.ts",
);
const dualReaderCoreEntry = path.resolve(
  __dirname,
  "../../packages/core/src/dual-reader/index.ts",
);

function withBrowserCondition(context) {
  const conditionNames = context.unstable_conditionNames ?? [];
  return {
    ...context,
    unstable_conditionNames: Array.from(
      new Set(["browser", ...conditionNames]),
    ),
  };
}

const resolveWithExistingConfig = (context, moduleName, platform) => {
  if (moduleName === "@nemu/core/dual-reader") {
    return { type: "sourceFile", filePath: dualReaderCoreEntry };
  }
  if (moduleName === "cheerio" || moduleName.startsWith("cheerio/")) {
    return context.resolveRequest(
      withBrowserCondition(context),
      moduleName,
      platform,
    );
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.serializer.getModulesRunBeforeMainModule = (...args) => [
  textEncodingPolyfill,
  ...defaultGetModulesRunBeforeMainModule(...args),
];

// Bundle Mode supplies stable module ids, the worklet runtime entry point, and
// inline-require transform options. Metro development intentionally leaves it
// disabled: HMR retains complete bundle generations in JSC worklet runtimes
// and can otherwise grow the app until Android kills it for memory pressure.
// Release/export builds still use Bundle Mode for off-thread dual-reader FFT.
const workletsBundleModeEnabled = process.env.NODE_ENV !== "development";
if (workletsBundleModeEnabled) {
  getBundleModeMetroConfig(config);
}
const bundleModeResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Bundle Mode emits virtual modules below react-native-worklets/.worklets.
  // Metro treats those as living inside a third-party package and does not
  // traverse back to the workspace sibling package, so resolve the shared
  // dual-reader entry explicitly for both app and worklet-runtime bundles.
  if (moduleName === "@nemu/core/dual-reader") {
    return { type: "sourceFile", filePath: dualReaderCoreEntry };
  }
  if (moduleName === "cheerio" || moduleName.startsWith("cheerio/")) {
    return bundleModeResolveRequest(
      withBrowserCondition(context),
      moduleName,
      platform,
    );
  }
  if (
    defaultResolveRequest &&
    !moduleName.includes("react-native-worklets/.worklets")
  ) {
    return resolveWithExistingConfig(context, moduleName, platform);
  }
  return bundleModeResolveRequest
    ? bundleModeResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
