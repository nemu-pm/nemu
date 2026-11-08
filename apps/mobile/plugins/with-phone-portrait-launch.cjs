const { withInfoPlist } = require("expo/config-plugins");

const PORTRAIT = "UIInterfaceOrientationPortrait";
// Every orientation an iPhone offers (Face ID iPhones have no upside down).
const PHONE_ORIENTATIONS = [
  PORTRAIT,
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];
const ALL_ORIENTATIONS = [
  PORTRAIT,
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];

/**
 * Launch orientations (owner decisions 2026-10-15, 2026-10-19). Info.plist
 * allows every iPhone orientation, so an iPhone Duo opened sideways on its
 * outer display launches in landscape; iPad keeps every orientation. An
 * ordinary iPhone stays portrait-only: `NemuOrientationGateAppDelegate`
 * (nemu-window-layout) narrows it to portrait the first time UIKit asks and
 * widens the mask once a hinge reports, and the launch screen is a plain
 * background colour (with-launch-screen-background), so an orientation
 * settle behind it shows nothing. expo-screen-orientation's default iPhone
 * mask is every orientation it accepts on a Face ID iPhone (all but upside
 * down) so it never narrows the Duo (the reader's lock still goes through
 * `lockAsync`). iPad keeps reading its own Info.plist list.
 */
function applyPhonePortraitLaunch(infoPlist) {
  infoPlist.UISupportedInterfaceOrientations = [...PHONE_ORIENTATIONS];
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
