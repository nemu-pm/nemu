const { withAndroidManifest } = require("expo/config-plugins");

function hasAndroidName(entries, name) {
  return entries?.some((entry) => entry.$?.["android:name"] === name);
}

function ensureAndroidDeepLinkScheme(manifest, scheme) {
  const activities = manifest.manifest?.application?.flatMap(
    (application) => application.activity ?? [],
  ) ?? [];
  const mainActivity = activities.find(
    (activity) => activity.$?.["android:name"] === ".MainActivity",
  );
  const deepLinkFilter = mainActivity?.["intent-filter"]?.find(
    (filter) =>
      hasAndroidName(filter.action, "android.intent.action.VIEW") &&
      hasAndroidName(filter.category, "android.intent.category.BROWSABLE"),
  );

  if (!deepLinkFilter) {
    throw new Error("Nemu's Android deep-link intent filter was not generated.");
  }
  deepLinkFilter.data ??= [];
  if (
    !deepLinkFilter.data.some(
      (entry) => entry.$?.["android:scheme"] === scheme,
    )
  ) {
    deepLinkFilter.data.push({ $: { "android:scheme": scheme } });
  }
  return manifest;
}

function withMobileDeepLinkSchemes(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = ensureAndroidDeepLinkScheme(
      manifestConfig.modResults,
      "neko",
    );
    return manifestConfig;
  });
}

module.exports = withMobileDeepLinkSchemes;
module.exports.ensureAndroidDeepLinkScheme = ensureAndroidDeepLinkScheme;
