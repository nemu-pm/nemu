/**
 * What shows around the page: black (the default), white, or the colour of
 * the page's own border, so a page with white margins reads as one sheet.
 */
export type MobileReaderPageBackground = "black" | "white" | "page";

export const MOBILE_READER_PAGE_BACKGROUNDS: readonly MobileReaderPageBackground[] = ["black", "white", "page"];
export const DEFAULT_MOBILE_READER_PAGE_BACKGROUND: MobileReaderPageBackground = "black";

export function normalizeMobileReaderPageBackground(value: unknown): MobileReaderPageBackground {
  return typeof value === "string" && (MOBILE_READER_PAGE_BACKGROUNDS as readonly string[]).includes(value)
    ? (value as MobileReaderPageBackground)
    : DEFAULT_MOBILE_READER_PAGE_BACKGROUND;
}

/** The background colour; "page" falls back to black until the page's border colour is known. */
export function mobileReaderPageBackgroundColor(
  background: MobileReaderPageBackground,
  pageEdgeColor?: string | null,
): string {
  if (background === "white") return "#ffffff";
  if (background === "page" && pageEdgeColor && /^#[0-9a-f]{6}$/i.test(pageEdgeColor)) return pageEdgeColor.toLowerCase();
  return "#000000";
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
