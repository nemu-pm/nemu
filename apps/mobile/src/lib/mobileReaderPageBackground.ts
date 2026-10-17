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
