/** Option lists beyond this many rows scroll inside a bounded detent. */
export const MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT = 6;

export type MobileSourceOptionSheetFrame =
  | { frameMaxHeight: "80%"; scroll: true }
  | { frameMaxHeight: undefined; scroll: false };

/**
 * How a source settings sub-sheet (multi-select options, string list) is
 * framed. Short lists hug their content. Long ones (Pepper&Carrot's ten
 * languages, MangaDex's excluded tags) cannot fit a content-sized detent, so
 * they present in a bounded 80% detent whose body scrolls: a bounded detent
 * without `scroll` lays the body out in a fixed-height plain View, where the
 * option group collapsed and the sheet showed only its title and Done.
 */
export function resolveMobileSourceOptionSheetFrame(
  itemCount: number,
): MobileSourceOptionSheetFrame {
  return itemCount > MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT
    ? { frameMaxHeight: "80%", scroll: true }
    : { frameMaxHeight: undefined, scroll: false };
}
