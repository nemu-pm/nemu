import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  isJapaneseLearningDrawerFullScreen,
  resolveJapaneseLearningDrawerContentBleed,
  resolveJapaneseLearningDrawerDetent,
  resolveJapaneseLearningDrawerTop,
  resolveJapaneseLearningSheetBarClearance,
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
  const { verticalBarEdge, verticalBarSide, safeAreaInsets, posture, regularWidth, compactHeight } = useMobileAdaptiveLayout();
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
    regularWidth,
  });
  const frameMaxHeight = resolveJapaneseLearningDrawerDetent({
    platform: Platform.OS,
    isPad,
    windowWidth: width,
    windowHeight: height,
    safeAreaTop: insets.top,
    safeAreaBottom: insets.bottom,
    horizontalFold,
    regularWidth,
    compactHeight,
  });
  const fullScreen = isJapaneseLearningDrawerFullScreen({
    platform: Platform.OS,
    isPad,
    windowWidth: width,
    windowHeight: height,
    compactHeight,
  });
  // Stable identity: the native sheet rebuilds its modifiers when it changes.
  const contentIgnoresSafeAreaEdges = useMemo(
    () => resolveJapaneseLearningSheetIgnoredSafeAreaEdges({ platform: Platform.OS, fullScreen, verticalBarEdge }),
    [fullScreen, verticalBarEdge],
  );
  const sheetTop = horizontalFold
    ? horizontalFold.bottom
    : resolveJapaneseLearningDrawerTop({
        platform: Platform.OS,
        isPad,
        windowWidth: width,
        windowHeight: height,
        safeAreaTop: insets.top,
        safeAreaBottom: insets.bottom,
        detent: frameMaxHeight,
        regularWidth,
        compactHeight,
      });
  return {
    frameMaxHeight,
    /** Window y of the drawer's top edge at rest; null when nothing shows above it. */
    sheetTop,
    /** Keeps a body's text clear of the vertical bar's status items. */
    barClearance: resolveJapaneseLearningSheetBarClearance({
      platform: Platform.OS,
      fullScreen,
      verticalBarSide,
      barInset: (verticalBarSide === "left" ? safeAreaInsets?.left : safeAreaInsets?.right) ?? 0,
      sheetTop,
      windowHeight: height,
    }),
    /** UIKit shows the sheet over the whole window (compact height): the bubble popout is hidden behind it. */
    fullScreen,
    /**
     * Book posture: the sheet takes the half beside the fold and the page in
     * the other stays live (undimmed, tappable), with no popout over it.
     */
    besideFold: posture === "book",
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
