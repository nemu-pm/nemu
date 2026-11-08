/**
 * Sizing of `MobileNativeStackSheet` (iOS): a system sheet whose pages are
 * React Native content under the sheet's navigation bar.
 */

/**
 * The sheet's inline navigation bar above a page: the grabber's clearance,
 * the title and the close button (an iOS 26 compact sheet, as
 * `NemuSheetFitStore.defaultBarHeight`).
 */
export const MOBILE_NATIVE_STACK_SHEET_BAR = 74;

/**
 * Sheets at most this share of a window tall stay clear of the status items at
 * the top of the iPhone Duo outer display's vertical bar (with a Live Activity
 * in the Dynamic Island, they end about 36% down its height).
 */
export const MOBILE_NATIVE_STACK_SHEET_BELOW_BAR_STATUS = 0.6;

/**
 * Whether a page takes the sheet's full width beside a compact window's
 * vertical bar: only in a sheet whose top is below the bar's status items, so
 * nothing but the bar's own ✕ (above the page) shares the column.
 */
export function mobileNativeStackSheetFullWidthBesideBar({
  verticalBarSide,
  regularWidth,
  detent,
  windowHeight,
}: {
  verticalBarSide: "left" | "right" | null;
  regularWidth: boolean;
  detent: number;
  windowHeight: number;
}): boolean {
  return (
    verticalBarSide !== null &&
    !regularWidth &&
    detent > 0 &&
    detent <= windowHeight * MOBILE_NATIVE_STACK_SHEET_BELOW_BAR_STATUS
  );
}

/** Key of a page's measured height: the page at the width it was laid out at. */
export function mobileNativeStackSheetMeasureKey(page: string, width: number): string {
  return `${page}@${Math.round(width * 2) / 2}`;
}

/**
 * The detent that shows a page `contentHeight` tall under the bar (a height
 * detent excludes the home indicator's inset, which the system adds below);
 * the estimate until the page is measured. Never taller than the window: the
 * system caps it there and the page scrolls.
 */
export function mobileNativeStackSheetDetent({
  contentHeight,
  estimatedHeight,
  windowHeight,
}: {
  contentHeight: number | undefined;
  estimatedHeight: number;
  windowHeight: number;
}): number {
  const fitted =
    contentHeight !== undefined && contentHeight > 0
      ? Math.ceil(contentHeight + MOBILE_NATIVE_STACK_SHEET_BAR)
      : Math.round(estimatedHeight);
  return Math.max(0, Math.min(fitted, Math.floor(windowHeight)));
}
