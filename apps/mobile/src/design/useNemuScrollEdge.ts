import { useContext } from "react";
import { usePathname } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "./tokens";
import { isMobileReaderRoute } from "@/lib/mobileRootTabs";
import {
  resolveMobileRailBottomScrollEdge,
  resolveMobileRailTopScrollEdge,
  resolveMobileScrollEdgeBarExtent,
  type MobileRailTopScrollEdge,
} from "@/lib/mobileScrollEdgeEffect";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";

export type NemuScrollEdgeOptions = {
  nativeHeader: boolean;
  /**
   * The native bar's row shows something (a title, a search field). False
   * for a title page before its compact title fades in.
   */
  barContentVisible?: boolean;
  /** Height of a bar the page draws itself (below the safe area). */
  headerBarHeight?: number;
  /**
   * A column of a multi-pane page scrolling on its own: its top band is the
   * full one whatever the bar shows (`resolveMobileRailTopScrollEdge`), over
   * the column's own top padding (below the safe area).
   */
  pane?: { topPadding: number };
};

export type NemuScrollEdgeBands = {
  top: MobileRailTopScrollEdge;
  bottom: MobileRailTopScrollEdge;
};

/**
 * The soft scroll edge every page scroll container gets: `PageScaffold` and
 * `PageListScaffold` draw it through `NemuScrollEdgeSurface`, as does any
 * other vertical scroll view of a screen, so a new screen has it by default
 * (`nemuScrollEdgeCoverage.test.ts` fails a listed screen that skips it).
 *
 * Why it is pinned to `soft` and never left to the system: apps built with
 * the iOS 27 SDK resolve UIKit's `automatic` scroll edge style to `hard` (a
 * cutoff with a dividing line under the bar; the iOS 26 SDK resolved it to
 * `soft`), and the design is the soft edge on every scrolling surface — under
 * the bars and floating glass controls, under the tab bar / rail / toolbars,
 * and under whatever is pinned at the top, covering it whole so content fades
 * out beneath it. The reader's page canvas is the only exclusion. The pieces:
 *
 * - native bars: every stack screen's `scrollEdgeEffects` are `soft`
 *   (`nativeHeaderChrome.ts`), applied to every top-level ScrollView of the
 *   screen (`patches/react-native-screens@*.patch`);
 * - SwiftUI forms and sheets: `nemuSoftScrollEdge()` (`nemuScrollEdge.ts`);
 * - where no native effect exists (beside the Duo's vertical bar, under a bar
 *   the page draws itself): the bands this returns, sized to what the page
 *   has pinned at the top (`mobileScrollEdgeEffect.ts`).
 */
export function useNemuScrollEdge({
  nativeHeader,
  barContentVisible = true,
  headerBarHeight,
  pane,
}: NemuScrollEdgeOptions): NemuScrollEdgeBands {
  const headerHeight = useContext(HeaderHeightContext);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const reader = isMobileReaderRoute(pathname);
  const bar = resolveMobileScrollEdgeBarExtent({
    platform: Platform.OS,
    nativeHeader,
    barContentVisible,
    headerHeight,
    headerBarHeight,
    safeAreaTop: insets.top,
  });
  return {
    top: resolveMobileRailTopScrollEdge({
      platform: Platform.OS,
      verticalBarSide,
      safeAreaTop: insets.top,
      pageTop: pane?.topPadding ?? spacing.pageTop,
      reader,
      bar,
      pane: Boolean(pane),
    }),
    bottom: resolveMobileRailBottomScrollEdge({
      platform: Platform.OS,
      verticalBarSide,
      safeAreaBottom: insets.bottom,
      reader,
    }),
  };
}
