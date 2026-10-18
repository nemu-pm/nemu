const { withInfoPlist } = require("expo/config-plugins");

const PORTRAIT = "UIInterfaceOrientationPortrait";
const ALL_ORIENTATIONS = [
  PORTRAIT,
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];

/**
 * An ordinary iPhone is portrait from the first frame (owner decision
 * 2026-10-15). The launch screen is drawn from Info.plist before any code
 * runs, so iPhone declares portrait only; a cold launch held sideways no
 * longer showed a landscape launch screen that turned upright once JS locked
 * it. iPad keeps every orientation. The iPhone Duo is an iPhone too:
 * `NemuOrientationGateAppDelegate` (nemu-window-layout) widens the mask once
 * its hinge reports, and expo-screen-orientation's default iPhone mask is
 * every orientation it accepts on a Face ID iPhone (all but upside down) so
 * it does not narrow the Duo back to the iPhone list (the reader's lock still
 * goes through `lockAsync`). iPad keeps reading its own Info.plist list.
 */
function applyPhonePortraitLaunch(infoPlist) {
  infoPlist.UISupportedInterfaceOrientations = [PORTRAIT];
  infoPlist["UISupportedInterfaceOrientations~ipad"] = [...ALL_ORIENTATIONS];
  delete infoPlist.EXDefaultScreenOrientationMask;
  infoPlist["EXDefaultScreenOrientationMask~iphone"] = "UIInterfaceOrientationMaskAllButUpsideDown";
  return infoPlist;
}

function withPhonePortraitLaunch(config) {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults = applyPhonePortraitLaunch(plistConfig.modResults);
    return plistConfig;
  });
}

module.exports = withPhonePortraitLaunch;
module.exports.applyPhonePortraitLaunch = applyPhonePortraitLaunch;
