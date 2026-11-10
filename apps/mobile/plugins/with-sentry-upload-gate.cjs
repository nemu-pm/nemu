const { withAppBuildGradle, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs/promises");
const path = require("path");

/**
 * Sentry's Xcode and Gradle steps upload source maps and debug symbols in
 * every release build and fail the build when that upload fails, which it
 * always does without credentials. Builds without SENTRY_AUTH_TOKEN (CI, forks,
 * a fresh machine) skip the upload instead; the owner's release builds set the
 * token in the environment and upload as usual.
 */
const MARKER = "# nemu: Sentry upload gate";

const XCODE_ENV_GATE = [
  MARKER,
  "# No SENTRY_AUTH_TOKEN: build without uploading source maps or dSYMs to Sentry.",
  'if [ -z "$SENTRY_AUTH_TOKEN" ]; then export SENTRY_DISABLE_AUTO_UPLOAD=true; fi',
  "",
].join("\n");

const GRADLE_GATE = [
  "// nemu: Sentry upload gate",
  "// No SENTRY_AUTH_TOKEN: build without uploading source maps to Sentry. Read",
  "// when the variants are configured, so it overrides sentry.gradle.kts's own.",
  "project.ext.shouldSentryAutoUploadGeneral = { ->",
  '  return System.getenv("SENTRY_AUTH_TOKEN") && System.getenv("SENTRY_DISABLE_AUTO_UPLOAD") != "true"',
  "}",
  "",
].join("\n");

/** `ios/.xcode.env` with the gate appended once (both Sentry phases source it). */
function applyXcodeEnvGate(contents) {
  if (contents.includes(MARKER)) return contents;
  const base = contents.length === 0 || contents.endsWith("\n") ? contents : `${contents}\n`;
  return `${base}\n${XCODE_ENV_GATE}`;
}

/** `android/app/build.gradle` with the gate appended once, after Sentry's `apply from`. */
function applyGradleGate(buildGradle) {
  if (buildGradle.includes("nemu: Sentry upload gate")) return buildGradle;
  const base = buildGradle.endsWith("\n") ? buildGradle : `${buildGradle}\n`;
  return `${base}\n${GRADLE_GATE}`;
}

function withSentryUploadGate(config) {
  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const file = path.join(modConfig.modRequest.platformProjectRoot, ".xcode.env");
      let contents = "";
      try {
        contents = await fs.readFile(file, "utf8");
      } catch {
        contents = "";
      }
      await fs.writeFile(file, applyXcodeEnvGate(contents));
      return modConfig;
    },
  ]);
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = applyGradleGate(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withSentryUploadGate;
module.exports.applyXcodeEnvGate = applyXcodeEnvGate;
module.exports.applyGradleGate = applyGradleGate;
