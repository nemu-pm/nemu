import { supportsNemuLiquidGlass } from "@/lib/nemuLiquidGlass";

/**
 * How a search field paints its capsule.
 *
 * - `liquid-glass`: iOS 26+. The system Liquid Glass material — the same
 *   surface UIKit's own `UISearchTextField` and SwiftUI `.searchable` fields
 *   use (Music, App Store, Files). Text and glyphs use the material's
 *   hierarchical styles so they stay legible whatever the glass refracts.
 * - `filled`: Android, web and iOS 25 or older. The secondary-filled capsule.
 */
export type NemuSearchFieldSurface = "liquid-glass" | "filled";

export function resolveNemuSearchFieldSurface(
  platformOS: string,
  platformVersion: string | number | null | undefined,
): NemuSearchFieldSurface {
  return supportsNemuLiquidGlass(platformOS, platformVersion)
    ? "liquid-glass"
    : "filled";
}

type NemuHeaderSearchBarTokens = {
  card: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
};

/**
 * Color props for a native header search bar (`Stack.SearchBar`).
 *
 * react-native-screens maps `barTintColor` to
 * `searchBar.searchTextField.backgroundColor`, which on iOS 26 paints an
 * opaque fill over the field's Liquid Glass. `textColor`, `hintTextColor` and
 * `headerIconColor` pin static colors that cannot follow the glass when it
 * flips light/dark over the content beneath it. On iOS 26+ only the brand
 * `tintColor` (caret, selection, cancel) is kept and the system draws the
 * rest; everywhere else the themed field is unchanged.
 */
export function resolveNemuHeaderSearchBarColors(
  platformOS: string,
  platformVersion: string | number | null | undefined,
  tokens: NemuHeaderSearchBarTokens,
): {
  barTintColor?: string;
  headerIconColor?: string;
  hintTextColor?: string;
  textColor?: string;
  tintColor: string;
} {
  if (resolveNemuSearchFieldSurface(platformOS, platformVersion) === "liquid-glass") {
    return { tintColor: tokens.primary };
  }
  return {
    barTintColor: tokens.card,
    headerIconColor: tokens.primary,
    hintTextColor: tokens.mutedForeground,
    textColor: tokens.foreground,
    tintColor: tokens.primary,
  };
}
