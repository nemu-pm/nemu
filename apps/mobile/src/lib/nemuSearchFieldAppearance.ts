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
  /**
   * The settled system field fill (`resolveNemuSystemSearchFieldFill`), passed
   * when a vertical rail hosts the bar (iPhone Duo). There UIKit settles the
   * stacked field on its plain system fill, but draws it in clear glass while
   * the page is pushed, so it changed look as the push landed; pinning the
   * fill keeps the settled system look from the first frame.
   */
  verticalRailFieldFill?: string,
): {
  barTintColor?: string;
  headerIconColor?: string;
  hintTextColor?: string;
  textColor?: string;
  tintColor: string;
} {
  if (resolveNemuSearchFieldSurface(platformOS, platformVersion) === "liquid-glass") {
    return verticalRailFieldFill === undefined
      ? { tintColor: tokens.primary }
      : { barTintColor: verticalRailFieldFill, tintColor: tokens.primary };
  }
  return {
    barTintColor: tokens.card,
    headerIconColor: tokens.primary,
    hintTextColor: tokens.mutedForeground,
    textColor: tokens.foreground,
    tintColor: tokens.primary,
  };
}

/** UIKit's `tertiarySystemFillColor`, the plain stacked search field's fill. */
const SYSTEM_SEARCH_FIELD_FILL = { rgb: [118, 118, 128], alpha: { light: 0.12, dark: 0.24 } } as const;

/**
 * The system search field fill as UIKit settles it over `background`, made
 * opaque: UIKit keeps drawing its own translucent fill under a pinned
 * `searchTextField.backgroundColor`, so a translucent pin stacked twice and
 * read darker once the push landed. Null for a background that is not `#rrggbb`.
 */
export function resolveNemuSystemSearchFieldFill(background: string, scheme: "light" | "dark"): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!match) return null;
  const alpha = SYSTEM_SEARCH_FIELD_FILL.alpha[scheme];
  const base = parseInt(match[1]!, 16);
  return `#${[16, 8, 0]
    .map((shift, index) => {
      const under = (base >> shift) & 0xff;
      const mixed = Math.round(under * (1 - alpha) + SYSTEM_SEARCH_FIELD_FILL.rgb[index]! * alpha);
      return mixed.toString(16).padStart(2, "0");
    })
    .join("")}`;
}
