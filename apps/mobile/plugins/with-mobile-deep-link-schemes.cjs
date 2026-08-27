const { withAndroidManifest } = require("expo/config-plugins");

function hasAndroidName(entries, name) {
  return entries?.some((entry) => entry.$?.["android:name"] === name);
}

function hasScheme(entries, scheme) {
  return entries?.some((entry) => entry.$?.["android:scheme"] === scheme);
}

// The app's own scheme (`expo.scheme`), which Expo already wrote into the
// generated custom-scheme intent filter.
const PRIMARY_SCHEME = "nemu";

function ensureAndroidDeepLinkScheme(manifest, scheme, siblingScheme = PRIMARY_SCHEME) {
  const activities = manifest.manifest?.application?.flatMap(
    (application) => application.activity ?? [],
  ) ?? [];
  const mainActivity = activities.find(
    (activity) => activity.$?.["android:name"] === ".MainActivity",
  );
  // Match the filter that already carries the app's own custom scheme rather
  // than the first VIEW+BROWSABLE filter. Expo emits several, and a future
  // autoVerify App Links filter (http/https + a host) must not be turned into
  // a custom-scheme filter: mixing a scheme without a host silently breaks
  // verification for the whole filter.
  const deepLinkFilter = mainActivity?.["intent-filter"]?.find(
    (filter) =>
      hasAndroidName(filter.action, "android.intent.action.VIEW") &&
      hasAndroidName(filter.category, "android.intent.category.BROWSABLE") &&
      (hasScheme(filter.data, siblingScheme) || hasScheme(filter.data, scheme)),
  );

  if (!deepLinkFilter) {
    throw new Error(
      `Nemu's Android "${siblingScheme}" deep-link intent filter was not generated.`,
    );
  }
  deepLinkFilter.data ??= [];
  if (!hasScheme(deepLinkFilter.data, scheme)) {
    deepLinkFilter.data.push({ $: { "android:scheme": scheme } });
  }
  return manifest;
}

function withMobileDeepLinkSchemes(config) {
  const primaryScheme = Array.isArray(config.scheme)
    ? config.scheme[0]
    : config.scheme;
  return withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = ensureAndroidDeepLinkScheme(
      manifestConfig.modResults,
      "neko",
      primaryScheme,
    );
    return manifestConfig;
  });
}

module.exports = withMobileDeepLinkSchemes;
module.exports.ensureAndroidDeepLinkScheme = ensureAndroidDeepLinkScheme;
