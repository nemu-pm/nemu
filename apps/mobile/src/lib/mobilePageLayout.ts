import { mobileFoldAwareGridLayout, type MobileFoldInterval } from "@/lib/mobileFoldAwareGrid";

/**
 * Title-to-content rhythm of the reference layout: a portrait iPhone's 44pt
 * inline navigation bar (title centered, 22pt above the bar's bottom) plus the
 * 18pt page top padding — 40pt from the title's center to the first content.
 */
const REFERENCE_TITLE_BAR_HEIGHT = 44;
/** Never collapse the content onto the bar. */
export const MOBILE_PAGE_MIN_TOP_PADDING = 8;

/**
 * UIKit owns the native bar's scroll inset; iOS keeps a stable page padding
 * while that inset is measured. Android and explicit custom headers derive
 * spacing from the title bar height, clamped to 8–18pt.
 */
export function getMobilePageTopPadding({
  nativeHeader,
  safeAreaTop,
  pageTop,
  headerHeight,
  headerBarHeight,
  insetAdjusted = false,
  platform,
}: {
  nativeHeader: boolean;
  safeAreaTop: number;
  pageTop: number;
  headerHeight?: number;
  headerBarHeight?: number;
  insetAdjusted?: boolean;
  platform: string;
}): number {
  if (!nativeHeader) return safeAreaTop + pageTop;
  // UIKit adjusts the scroll inset as its bars settle. Deriving a second JS
  // padding from the delayed header measurement shifts a newly visited tab.
  if (insetAdjusted || (platform === "ios" && headerBarHeight === undefined)) return pageTop;
  const measuredBar =
    typeof headerHeight === "number" && headerHeight > safeAreaTop ? headerHeight - safeAreaTop : undefined;
  const bar = headerBarHeight ?? measuredBar
    // Before the first native measurement: Android's Material bar is 64dp.
    ?? (platform === "android" ? 64 : REFERENCE_TITLE_BAR_HEIGHT);
  const target = pageTop + REFERENCE_TITLE_BAR_HEIGHT / 2;
  return Math.round(Math.min(pageTop, Math.max(MOBILE_PAGE_MIN_TOP_PADDING, target - bar / 2)));
}

export type MobilePageContentInsetAdjustment = "automatic" | "scrollableAxes" | "never" | "always";

/**
 * How a page scroll view adjusts its content for the bars around it. On iOS a
 * page under the native header defaults to `automatic`: the header is
 * see-through (soft scroll edge, `createNemuNativeStackScreenOptions`), so
 * the scroll view runs under it and UIKit insets the content by the bar above
 * and the tab bar / home indicator below — it starts below the bar, scrolls
 * softly under it, and ends just above the tab bar. Pages that draw their own
 * header, and Android (which has no inset adjustment), keep `never`.
 */
export function resolveMobilePageContentInsetAdjustment({
  platform,
  nativeHeader,
  requested,
}: {
  platform: string;
  nativeHeader: boolean;
  requested?: MobilePageContentInsetAdjustment;
}): MobilePageContentInsetAdjustment {
  if (requested) return requested;
  return platform === "ios" && nativeHeader ? "automatic" : "never";
}

export const MOBILE_SOURCE_GRID_GAP = 12;
/** Narrowest source card that fits the icon, name and installed-state label. */
export const MOBILE_SOURCE_GRID_MIN_ITEM_WIDTH = 290;

/**
 * Browse source cards: the web grid's card width, reserving room for enlarged
 * labels. Even column counts when a fold region is present; in book posture one column
 * group per pane with the gutter on the fold.
 */
export function getMobileSourceGridLayout(
  contentWidth: number,
  fontScale: number,
  { preferEven = false, fold = null }: { preferEven?: boolean; fold?: MobileFoldInterval | null } = {},
) {
  return mobileFoldAwareGridLayout({
    contentWidth,
    minItemWidth: MOBILE_SOURCE_GRID_MIN_ITEM_WIDTH * Math.max(1, fontScale),
    gap: MOBILE_SOURCE_GRID_GAP,
    maxColumns: 4,
    preferEven,
    fold,
  });
}
