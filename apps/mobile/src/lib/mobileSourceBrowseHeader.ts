/**
 * Android draws the source browse title, actions and search field itself so
 * their geometry is measured together (the Material top app bar plus a
 * search action view left an oversized gap above the filter chips).
 *
 * iOS always keeps the native navigation bar: on iPhone Duo's outer display
 * and inner landscape the system moves it — Back, then the search action — to
 * the trailing edge, in the same place as every other screen's controls. A
 * custom horizontal header there would break that consistency (HIG: vertical
 * controls, consistent control positions across poses). No window-size or
 * device checks.
 */
export function shouldUseCompactSourceBrowseHeader(platform: string) {
  return platform === "android";
}

/** Title row of the compact header, and the search row below it while searching. */
export const MOBILE_COMPACT_SOURCE_HEADER_ROW_HEIGHT = 44;
export const MOBILE_COMPACT_SOURCE_HEADER_SEARCH_ROW_HEIGHT = 48;

/** Bar height the page padding is derived from (see getMobilePageTopPadding). */
export function getCompactSourceBrowseHeaderBarHeight(searching: boolean) {
  return MOBILE_COMPACT_SOURCE_HEADER_ROW_HEIGHT
    + (searching ? MOBILE_COMPACT_SOURCE_HEADER_SEARCH_ROW_HEIGHT : 0);
}
