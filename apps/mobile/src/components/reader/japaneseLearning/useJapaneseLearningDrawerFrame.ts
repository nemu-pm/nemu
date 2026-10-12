import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  isJapaneseLearningDrawerFullScreen,
  resolveJapaneseLearningDrawerContentBleed,
  resolveJapaneseLearningDrawerDetent,
  resolveJapaneseLearningDrawerTop,
  resolveJapaneseLearningSheetBottomInset,
  resolveJapaneseLearningSheetIgnoredSafeAreaEdges,
} from "@/lib/mobileJapaneseLearningSheetLayout";
import { useMobileAdaptiveLayout, useMobileWindowLayout } from "@/lib/MobileWindowLayoutContext";
import { mobileHorizontalFoldBand, mobileRestingFoldMinGutter } from "@/lib/mobileRestingFold";
import { japaneseLearningDrawerIsFormSheet } from "@/lib/mobileJapaneseLearningSheetLayout";

/**
 * Sheet frame for the learning drawers web shows at `70vh` (sentence sheet,
 * Nemu chat): `frameMaxHeight` opens them with their top edge where web's is,
 * `contentBleed` (for `japaneseLearningEdgeToEdgeContentStyle`) keeps
 * their text column where web's is inside the floating iPhone sheet, and
 * `fullScreen` says the sheet covers the window (no room for the popout).
 * On a window crossed by a horizontal fold (`horizontalFold`) the drawers
 * take exactly the half below the fold and the popout the half above it.
 */
export function useJapaneseLearningDrawerFrame() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const windowLayout = useMobileWindowLayout();
  const horizontalFold = useMemo(
    () => mobileHorizontalFoldBand(windowLayout, mobileRestingFoldMinGutter(Platform.OS)),
    [windowLayout],
  );
  // Not a device check: only a regular-width iPad window gets a centred form
  // sheet; the same iPad in a compact Split View column, and every iPhone
  // window (the Duo's open display included), gets the bottom drawer.
  const isPad = japaneseLearningDrawerIsFormSheet({
    platform: Platform.OS,
    idiomIsPad: Platform.OS === "ios" && Platform.isPad,
    windowWidth: width,
  });
  const frameMaxHeight = resolveJapaneseLearningDrawerDetent({
    platform: Platform.OS,
    isPad,
    windowWidth: width,
    windowHeight: height,
    safeAreaTop: insets.top,
    safeAreaBottom: insets.bottom,
    horizontalFold,
  });
  const { verticalBarEdge } = useMobileAdaptiveLayout();
  const fullScreen = isJapaneseLearningDrawerFullScreen({
    platform: Platform.OS,
    isPad,
    windowWidth: width,
    windowHeight: height,
  });
  // Stable identity: the native sheet rebuilds its modifiers when it changes.
  const contentIgnoresSafeAreaEdges = useMemo(
    () => resolveJapaneseLearningSheetIgnoredSafeAreaEdges({ platform: Platform.OS, fullScreen, verticalBarEdge }),
    [fullScreen, verticalBarEdge],
  );
  return {
    frameMaxHeight,
    /** Window y of the drawer's top edge at rest; null when nothing shows above it. */
    sheetTop: horizontalFold
      ? horizontalFold.bottom
      : resolveJapaneseLearningDrawerTop({
          platform: Platform.OS,
          isPad,
          windowWidth: width,
          windowHeight: height,
          safeAreaTop: insets.top,
          safeAreaBottom: insets.bottom,
          detent: frameMaxHeight,
        }),
    /** UIKit shows the sheet over the whole window (compact height): the bubble popout is hidden behind it. */
    fullScreen,
    /**
     * Safe-area edges the drawer's content extends into
     * (`resolveJapaneseLearningSheetIgnoredSafeAreaEdges`): with them, the
     * space under a composer or footer is just its own gutter on a floating
     * sheet, and the content spans the sheet on the Duo outer display.
     */
    contentIgnoresSafeAreaEdges,
    /**
     * Added under a body's last row besides its own gutter: the home
     * indicator's inset where the sheet reaches it, else nothing.
     */
    bottomInset: resolveJapaneseLearningSheetBottomInset({
      platform: Platform.OS,
      fullScreen,
      safeAreaBottom: insets.bottom,
    }),
    contentBleed: resolveJapaneseLearningDrawerContentBleed(frameMaxHeight, { width, height }, horizontalFold),
    /** The fold the drawer's top edge meets, in window y; null without a horizontal fold. */
    horizontalFold,
  };
}
