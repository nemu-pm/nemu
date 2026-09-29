import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  isJapaneseLearningDrawerFullScreen,
  resolveJapaneseLearningDrawerContentBleed,
  resolveJapaneseLearningDrawerDetent,
} from "@/lib/mobileJapaneseLearningSheetLayout";
import { useMobileWindowLayout } from "@/lib/MobileWindowLayoutContext";
import { mobileHorizontalFoldBand, mobileRestingFoldMinGutter } from "@/lib/mobileRestingFold";

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
  const frameMaxHeight = resolveJapaneseLearningDrawerDetent({
    platform: Platform.OS,
    isPad: Platform.OS === "ios" && Platform.isPad,
    windowWidth: width,
    windowHeight: height,
    safeAreaTop: insets.top,
    safeAreaBottom: insets.bottom,
    horizontalFold,
  });
  return {
    frameMaxHeight,
    /** UIKit shows the sheet over the whole window (compact height): the bubble popout is hidden behind it. */
    fullScreen: isJapaneseLearningDrawerFullScreen({
      platform: Platform.OS,
      isPad: Platform.OS === "ios" && Platform.isPad,
      windowWidth: width,
      windowHeight: height,
    }),
    contentBleed: resolveJapaneseLearningDrawerContentBleed(frameMaxHeight, { width, height }, horizontalFold),
    /** The fold the drawer's top edge meets, in window y; null without a horizontal fold. */
    horizontalFold,
  };
}
