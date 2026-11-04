import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileAdaptiveLayout, useMobileWindowLayout } from "@/lib/MobileWindowLayoutContext";
import {
  getMobilePageBleedStyles,
  getMobilePageGutters,
  getMobileRailRowContentInsets,
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
  const { minimumLayoutMargins, safeAreaInsets: windowInsets } = useMobileWindowLayout();
  const left = windowInsets?.left ?? insets.left;
  const right = windowInsets?.right ?? insets.right;
  // Use one native geometry snapshot. Taking the maximum of two providers
  // combines old/new rail sides during a fold or Split View change and
  // briefly reserves both edges. The screen provider is the fallback only.
  return useMemo(
    () => getMobilePageGutters({ left, right }, undefined, minimumLayoutMargins),
    [left, right, minimumLayoutMargins],
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

/**
 * The rail-side content inset for a horizontal row beside the system bar
 * column (`getMobileRailRowContentInsets`), from the same safe-area snapshot
 * as the gutters; null when there is no rail.
 */
export function useMobileRailRowContentInsets(): ReturnType<typeof getMobileRailRowContentInsets> {
  const insets = useSafeAreaInsets();
  const { safeAreaInsets: windowInsets } = useMobileWindowLayout();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const gutters = useMobilePageGutters();
  const left = windowInsets?.left ?? insets.left;
  const right = windowInsets?.right ?? insets.right;
  return useMemo(
    () => getMobileRailRowContentInsets({ gutters, safeAreaInsets: { left, right }, verticalBarSide }),
    [gutters, left, right, verticalBarSide],
  );
}
