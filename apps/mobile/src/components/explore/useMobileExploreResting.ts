import { useCallback, useState, type RefObject } from "react";
import { PixelRatio, useWindowDimensions, type ViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMobileExploreRestingEdge, isMobileCompactHeight } from "@/lib/mobileExploreRestingFit";

/**
 * Where a tab page's content starts at rest below the top inset: the
 * navigation bar and the scaffold's top padding (measured on iOS 27: the
 * detail hero and the library's first heading both rest 67 pt below the
 * status bar inset). Only the first estimate uses it; pages measure their own.
 */
export const MOBILE_EXPLORE_REST_TOP_BELOW_INSET = 67;

/**
 * The resting frame of a tab page (design-explore): `edge` is the top of what
 * floats over the page's bottom — the tab bar, or the home indicator on a
 * page without one. UIKit extends a tab page's bottom safe area by that chrome, so it is the
 * window's height less the bottom inset (in a compact-height window the tab
 * bar is not in the inset, so its band is cleared instead:
 * `getMobileExploreRestingEdge`). `topEstimate` is where the page's
 * first content rests before it has measured itself.
 */
export function useMobileExploreRestingFrame() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return {
    edge: getMobileExploreRestingEdge(height, insets.bottom, isMobileCompactHeight(height)),
    topEstimate: insets.top + MOBILE_EXPLORE_REST_TOP_BELOW_INSET,
    windowKey: `${Math.round(width)}x${Math.round(height)}`,
    /** Text scale for estimates, capped like the text it stands for. */
    fontScale: (cap: number) => Math.min(cap, PixelRatio.getFontScale()),
  };
}

/**
 * Where `ref`'s top rests in the window, measured the first time it lays out
 * in each window size (the page is at rest then; later layouts can happen
 * while it is scrolled, so they are ignored). Null until measured.
 */
export function useMobileExploreRestingTop(ref: RefObject<ViewInstance | null>, windowKey: string) {
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      setMeasured((current) => (current[windowKey] !== undefined ? current : { ...current, [windowKey]: y }));
    });
  }, [ref, windowKey]);
  return { top: measured[windowKey] ?? null, onLayout };
}
