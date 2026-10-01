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
