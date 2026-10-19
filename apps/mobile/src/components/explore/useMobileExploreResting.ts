import { useCallback, useEffect, useState, type RefObject } from "react";
import { useIsFocused } from "expo-router";
import { PixelRatio, useWindowDimensions, type ViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getMobileExploreRestingEdge,
  isMobileCompactHeight,
  keepMobileExploreRestingTop,
} from "@/lib/mobileExploreRestingFit";

/**
 * Where a tab page's content starts at rest below the top inset: the
 * navigation bar and the scaffold's top padding (measured on iOS 27: the
 * detail hero and the library's first heading both rest 67 pt below the
 * status bar inset). Only the first estimate uses it; pages measure their own.
 */
const MOBILE_EXPLORE_REST_TOP_BELOW_INSET = 67;

/** Re-measures of a resting top after it starts measuring (ms). */
const RESTING_TOP_REMEASURE_MS = [120, 400, 1000] as const;

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
  const { width, height, fontScale } = useWindowDimensions();
  return {
    edge: getMobileExploreRestingEdge(height, insets.bottom, isMobileCompactHeight(height)),
    topEstimate: insets.top + MOBILE_EXPLORE_REST_TOP_BELOW_INSET,
    // The text size too: headings above a section grow with it, so a top
    // measured at another size (before a rotation and back) is stale.
    windowKey: `${Math.round(width)}x${Math.round(height)}@${fontScale}`,
    /** Text scale for estimates, capped like the text it stands for. */
    fontScale: (cap: number) => Math.min(cap, PixelRatio.getFontScale()),
  };
}

/**
 * Where `ref`'s top rests in the window, measured when it lays out in each
 * window and text size. Only while its screen is focused and `enabled`: an
 * unfocused screen is out of the window (its scroll view loses the bars'
 * inset) and a zoom in flight scales the page to the cover it left, so
 * neither is the rest. It is measured again when either turns on.
 *
 * Of the measurements for one size the lowest is kept: the page at rest is
 * scrolled to its top, so a later layout while it is scrolled (higher up) is
 * ignored, and one taken too high (a transition the gates missed) gives way
 * to the rest. Null until measured.
 */
export function useMobileExploreRestingTop(
  ref: RefObject<ViewInstance | null>,
  windowKey: string,
  enabled = true,
) {
  const focused = useIsFocused();
  const active = focused && enabled;
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const onLayout = useCallback(() => {
    if (!active) return;
    ref.current?.measureInWindow((_x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      setMeasured((current) => keepMobileExploreRestingTop(current, windowKey, y));
    });
  }, [active, ref, windowKey]);
  // Focus regained, the zoom landed, a new size: no layout may follow. A
  // page remounted by a text-size change (PageScaffold keys its list on the
  // font scale) lays out before UIKit applies the bar's content inset, and the
  // inset moves it down without a layout event: measure again once it has
  // settled (the lowest is kept, so a later scroll changes nothing).
  useEffect(() => {
    onLayout();
    if (!active) return undefined;
    const timers = RESTING_TOP_REMEASURE_MS.map((ms) => setTimeout(onLayout, ms));
    return () => timers.forEach(clearTimeout);
  }, [active, onLayout]);
  return { top: measured[windowKey] ?? null, onLayout };
}
