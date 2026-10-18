const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NOTICES_FILE = "THIRD_PARTY_NOTICES.txt";
// The committed notices (`bun run notices` regenerates them), at the app root.
const SOURCE = path.resolve(__dirname, "..", NOTICES_FILE);

function assertNoticesExist(source) {
  if (!fs.existsSync(source)) {
    throw new Error(`nemu: ${NOTICES_FILE} is missing; run \`bun run notices\` in apps/mobile.`);
  }
}

/**
 * iOS: a resource of the app target, so the file lands at the root of the
 * .app bundle. The Xcode reference points at the committed file, so a
 * regenerated file is what the next build copies.
 */
function addNoticesToProject(project, platformProjectRoot, source = SOURCE) {
  assertNoticesExist(source);
  IOSConfig.XcodeUtils.ensureGroupRecursively(project, "Resources");
  IOSConfig.XcodeUtils.addResourceFileToGroup({
    filepath: path.relative(platformProjectRoot, source),
    groupName: "Resources",
    project,
    isBuildFile: true,
    verbose: false,
  });
  return project;
}

/** Android: `android/app/src/main/assets/`, which Gradle packs into the APK. */
function copyNoticesToAndroidAssets(platformProjectRoot, source = SOURCE) {
  assertNoticesExist(source);
  const assets = path.join(platformProjectRoot, "app", "src", "main", "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.copyFileSync(source, path.join(assets, NOTICES_FILE));
}

function withThirdPartyNotices(config) {
  config = withXcodeProject(config, (xcodeConfig) => {
    addNoticesToProject(xcodeConfig.modResults, xcodeConfig.modRequest.platformProjectRoot);
    return xcodeConfig;
  });
  return withDangerousMod(config, [
    "android",
    (androidConfig) => {
      copyNoticesToAndroidAssets(androidConfig.modRequest.platformProjectRoot);
      return androidConfig;
    },
  ]);
}

module.exports = withThirdPartyNotices;
module.exports.addNoticesToProject = addNoticesToProject;
module.exports.copyNoticesToAndroidAssets = copyNoticesToAndroidAssets;
module.exports.NOTICES_FILE = NOTICES_FILE;
