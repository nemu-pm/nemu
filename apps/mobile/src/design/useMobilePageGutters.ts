import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileAdaptiveLayout, useMobileWindowLayout } from "@/lib/MobileWindowLayoutContext";
import {
  getMobilePageBleedStyles,
  getMobilePageGutters,
  type MobilePageBleedStyles,
  type MobilePageGutters,
} from "@/lib/mobilePageGutters";

/**
 * Safe-area-aware horizontal page gutters (see `getMobilePageGutters`). Every
 * page scaffold pads its content with these, and anything that sizes itself
 * from the window width (adaptive grids, edge-bleeding chip rows, carousels)
 * must subtract the same values so it lines up with the scaffold.
 */
export function useMobilePageGutters(): MobilePageGutters {
  const insets = useSafeAreaInsets();
  const { minimumLayoutMargins } = useMobileWindowLayout();
  return useMemo(
    () => getMobilePageGutters({ left: insets.left, right: insets.right }, undefined, minimumLayoutMargins),
    [insets.left, insets.right, minimumLayoutMargins],
  );
}

/** Edge-bleed styles for a horizontal row inside a page scaffold. */
export function useMobilePageBleedStyles(overscan = 0): MobilePageBleedStyles {
  const { left, right } = useMobilePageGutters();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  return useMemo(
    () => getMobilePageBleedStyles({ left, right }, overscan, verticalBarSide),
    [left, overscan, right, verticalBarSide],
  );
}
