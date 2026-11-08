/**
 * What shows around the page (and under a page still loading), in every
 * presentation: black (the default), white, or the colour of the page's own
 * border, so a page with white margins reads as one sheet.
 */
export type MobileReaderPageBackground = "black" | "white" | "page";

export const MOBILE_READER_PAGE_BACKGROUNDS: readonly MobileReaderPageBackground[] = ["black", "white", "page"];
/**
 * For a reader who never chose (nothing stored) or a stored value this build
 * does not know. A stored choice, "white" included, is never rewritten.
 */
export const DEFAULT_MOBILE_READER_PAGE_BACKGROUND: MobileReaderPageBackground = "black";

export function normalizeMobileReaderPageBackground(value: unknown): MobileReaderPageBackground {
  return typeof value === "string" && (MOBILE_READER_PAGE_BACKGROUNDS as readonly string[]).includes(value)
    ? (value as MobileReaderPageBackground)
    : DEFAULT_MOBILE_READER_PAGE_BACKGROUND;
}

/**
 * The background colour. "page" with the page's border colour not known yet
 * keeps `shownColor` (the colour on screen), so a page still being measured
 * never flashes another colour; black only before any page is known.
 */
export function mobileReaderPageBackgroundColor(
  background: MobileReaderPageBackground,
  pageEdgeColor?: string | null,
  shownColor?: string | null,
): string {
  if (background === "white") return "#ffffff";
  if (background === "page") {
    const known = mobileReaderHexColor(pageEdgeColor) ?? mobileReaderHexColor(shownColor);
    if (known) return known;
  }
  return "#000000";
}

/** `#rrggbb`, lower case, or null. */
export function mobileReaderHexColor(value: string | null | undefined): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/**
 * A light page background (white, or a light page border under "Match
 * Page"): the status bar shows dark glyphs over a light scrim while the
 * chrome is up. WCAG relative luminance, split where black and white text
 * contrast equally.
 */
export function mobileReaderPageBackgroundIsLight(color: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return false;
  const [r, g, b] = match.slice(1).map((hex) => {
    const channel = Number.parseInt(hex, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179;
}
