const { getDefaultConfig } = require("expo/metro-config");
const {
  getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");
const path = require("path");
const crypto = require("crypto");
const rootEnv = require("./loadRootEnv.cjs")();
const { isWorkletsBundleModeEnabled } = require("./workletsBundleMode.cjs");
// A production bundle (Xcode Release archive, Gradle release, production
// `expo export`) must not bake the dev backend; fail the bundle step instead.
require("./preflightRelease.cjs").enforceReleaseEnv(rootEnv);

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
const workletsBundleModeEnabled = isWorkletsBundleModeEnabled();
// Bundle Mode changes how react-native-worklets itself is transformed (its
// `_WORKLETS_BUNDLE_MODE_ENABLED` flag is rewritten by the Babel plugin), so a
// cached transform from the other mode must never be reused.
config.cacheVersion = [
  config.cacheVersion,
  publicEnvFingerprint,
  workletsBundleModeEnabled ? "worklets-bundle-mode" : "worklets-serialized",
]
  .filter(Boolean)
  .join(":");
const defaultResolveRequest = config.resolver.resolveRequest;
const defaultGetModulesRunBeforeMainModule =
  config.serializer.getModulesRunBeforeMainModule;
// Expo's lazy global `URL` (whatwg-url-minimum) decodes its tables with `atob`
// while its module initialises, and the dev client reaches it (getBundleUrl in
// the HMR setup) before the entry file's own imports run. Install base64 first.
const base64Polyfill = path.join(__dirname, "src/polyfills/base64.ts");
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
  base64Polyfill,
  textEncodingPolyfill,
  ...defaultGetModulesRunBeforeMainModule(...args),
];

// Worklets Bundle Mode is off by default (see workletsBundleMode.cjs): it made a
// second runtime evaluate the whole bundle during launch and blocked the JS
// thread on it. Opt in with NEMU_WORKLETS_BUNDLE_MODE=1 (non-development only).
if (workletsBundleModeEnabled) {
  getBundleModeMetroConfig(config);
}
// Keep inline requires on regardless of Bundle Mode (which used to be what
// supplied them): module bodies then run on first use instead of all at
// startup. Expo's own default is `inlineRequires: false`, so this must be
// explicit. Merge with the existing options so Expo's
// `experimentalImportSupport: true` (live-binding ESM transform) is preserved
// exactly as the previous release bundles had it.
const existingGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = existingGetTransformOptions
    ? await existingGetTransformOptions(...args)
    : {};
  return {
    ...options,
    transform: {
      ...options?.transform,
      inlineRequires: true,
    },
  };
};
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
    return bundleModeResolveRequest
      ? bundleModeResolveRequest(
          withBrowserCondition(context),
          moduleName,
          platform,
        )
      : context.resolveRequest(
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
