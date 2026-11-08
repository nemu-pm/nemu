const { withMod } = require("expo/config-plugins");

// expo-splash-screen's storyboard mod (registered by that plugin).
const STORYBOARD_MOD = "splashScreenStoryboard";
const NAMED_COLOR = "SplashScreenBackground";

/**
 * The iOS launch screen in the page colour. expo-splash-screen writes the
 * light/dark `backgroundColor` into the `SplashScreenBackground` colour set,
 * but with no iOS image it only strips the logo from the storyboard and leaves
 * the template's `systemBackgroundColor` (white / black) on the view: the
 * cold-launch reveal then stepped from white to the page colour, and the
 * scaled-down window's edges showed against the white. Point the view at the
 * colour set instead.
 */
function applyLaunchScreenBackground(xml) {
  const view = xml?.document?.scenes?.[0]?.scene?.[0]?.objects?.[0]?.viewController?.[0]?.view?.[0];
  if (!view) throw new Error("nemu: the launch screen storyboard has no view to colour.");
  view.color = [{ $: { key: "backgroundColor", name: NAMED_COLOR } }];
  return xml;
}

function withLaunchScreenBackground(config) {
  return withMod(config, {
    platform: "ios",
    mod: STORYBOARD_MOD,
    action: (storyboardConfig) => {
      storyboardConfig.modResults = applyLaunchScreenBackground(storyboardConfig.modResults);
      return storyboardConfig;
    },
  });
}

module.exports = withLaunchScreenBackground;
module.exports.applyLaunchScreenBackground = applyLaunchScreenBackground;
