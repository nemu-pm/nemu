export type ExploreLibraryGlyphProps = {
  /** In the library: the checkmark; otherwise the plus. */
  added: boolean;
  color: string;
};

/**
 * The library toggle's glyph on iOS: the system's own `checkmark` / `plus`
 * at the size and weight a Liquid Glass bar button draws a symbol (17 pt,
 * large scale, measured against the native Back on the same screen), centred
 * in a fixed square so it sits at the same spot in every layout.
 */
export const EXPLORE_LIBRARY_SYMBOL = {
  added: "checkmark",
  add: "plus",
  pointSize: 17,
  weight: "regular",
  scale: "large",
  /** The square the glyph is drawn in, centred in the circle. */
  box: 28,
} as const;
