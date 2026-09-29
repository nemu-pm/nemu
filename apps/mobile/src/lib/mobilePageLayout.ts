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
 * Top padding of a page under a title bar, derived from the bar that is
 * actually on screen instead of a device or window-size guess.
 *
 * `headerHeight` is the native stack's measured header height (it includes
 * the top safe area), `safeAreaTop` the top inset. Their difference is the
 * title bar; its center is where the title sits. The padding tops the
 * distance from that center to the bar's bottom up to the reference 40pt:
 * - portrait iPhone (44pt bar): 18pt — unchanged;
 * - Android Material top app bar (64dp): 8pt — the title already sits 32pt
 *   above the content, the owner-reported "too much space";
 * - taller bars (Duo outer / inner landscape with trailing system bars, a
 *   screen's own title + search rows): clamped to 8pt;
 * - short bars (landscape iPhone 32pt): clamped to the 18pt page padding.
 *
 * `headerBarHeight` overrides the measurement for screens that draw their own
 * header. `insetAdjusted` means the reported height includes an iOS header
 * search field (`Stack.SearchBar`), not just the title bar, so the page keeps
 * its own padding there.
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
  if (insetAdjusted) return pageTop;
  const measuredBar =
    typeof headerHeight === "number" && headerHeight > safeAreaTop ? headerHeight - safeAreaTop : undefined;
  const bar = headerBarHeight ?? measuredBar
    // Before the first native measurement: Android's Material bar is 64dp.
    ?? (platform === "android" ? 64 : REFERENCE_TITLE_BAR_HEIGHT);
  const target = pageTop + REFERENCE_TITLE_BAR_HEIGHT / 2;
  return Math.round(Math.min(pageTop, Math.max(MOBILE_PAGE_MIN_TOP_PADDING, target - bar / 2)));
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
