/**
 * iOS 26+ scroll edge effects for every native stack screen
 * (react-native-screens `scrollEdgeEffects`, which sets
 * `UIScrollView.topEdgeEffect` / `bottomEdgeEffect` `.style` on the screen's
 * content scroll view). `soft` fades and blurs the content that scrolls under
 * the navigation bar (top) and the tab bar (bottom) — Apple's default look on
 * iPhone — instead of a `hard` cutoff with a dividing line.
 *
 * Soft needs a see-through bar: an opaque `headerStyle.backgroundColor` makes
 * UIKit draw a solid band and the content stops under it in a hard line, which
 * is what the pages looked like before this was the default. So on iOS the
 * header is transparent and the page scroll views adjust their content insets
 * automatically (`resolveMobilePageContentInsetAdjustment`): content starts
 * below the bar and scrolls softly under it. No `headerBlurEffect` with it
 * (react-native-screens warns the two effects overlap). Android keeps the
 * opaque Material top app bar.
 *
 * Which scroll view gets the style: stock react-native-screens only styled the
 * scroll view reached through `subviews[0]` from the screen, once, at push /
 * prop change. Pages whose ScrollView sits behind a sibling (settings, source
 * manga, library manga detail) or mounts later (skeleton → content) kept
 * UIKit's `automatic`, which under this bar renders as the hard band + line.
 * `patches/react-native-screens@4.28.0.patch` (RNSScreen.mm) applies the
 * screen's effects to every top-level React ScrollView of the screen (not
 * inside another ScrollView or a nested screen) and re-applies whenever a
 * mounting transaction inserts a ScrollView.
 */
export const NEMU_SOFT_SCROLL_EDGE_EFFECTS = {
  top: "soft",
  bottom: "soft",
  left: "automatic",
  right: "automatic",
} as const;

export type NemuNativeHeaderChrome =
  | {
      headerTransparent: true;
      headerStyle: { backgroundColor: "transparent" };
      scrollEdgeEffects: typeof NEMU_SOFT_SCROLL_EDGE_EFFECTS;
    }
  | {
      headerStyle: { backgroundColor: string };
    };

/** The header background half of the native stack options, per platform. */
export function resolveNemuNativeHeaderChrome(
  platform: string,
  background: string,
): NemuNativeHeaderChrome {
  if (platform !== "ios") return { headerStyle: { backgroundColor: background } };
  return {
    headerTransparent: true,
    headerStyle: { backgroundColor: "transparent" },
    scrollEdgeEffects: NEMU_SOFT_SCROLL_EDGE_EFFECTS,
  };
}
