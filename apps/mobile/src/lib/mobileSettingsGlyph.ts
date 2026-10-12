/**
 * Settings icons in the new design are the original design's outline glyphs
 * (book, database, palette, folder, info-circle, …) drawn bare in the accent:
 * no tinted or coloured tile behind them, no filled variants.
 */
export const MOBILE_SETTINGS_GLYPH = {
  /** Glyph size: the original settings rows' (19–20 pt). */
  size: 20,
  /** The box the glyph is centred in, so titles and separators line up. */
  box: 28,
} as const;

/** The outline form of an Ionicons name (`book` → `book-outline`); outline names pass through. */
export function getMobileSettingsOutlineGlyph(name: string): string {
  return name.endsWith("-outline") || name.endsWith("-sharp") ? name : `${name}-outline`;
}
