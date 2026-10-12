/**
 * Placeholder density for a cover that cannot load, by its rendered width:
 * a hero-sized book with a display title (a tall card's cover, the detail
 * hero), a full cloth-bound book with the title, a compact one with a shorter
 * title, or (thumbnails too small for legible text) the bare book with its rule.
 */
type MobileExploreCoverPlaceholderSize = "large" | "regular" | "compact" | "mini";

export function getMobileExploreCoverPlaceholderSize(width: number): MobileExploreCoverPlaceholderSize {
  if (!Number.isFinite(width) || width < 48) return "mini";
  if (width < 96) return "compact";
  return width < 180 ? "regular" : "large";
}
