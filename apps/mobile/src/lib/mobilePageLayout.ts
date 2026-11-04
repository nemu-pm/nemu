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

/**
 * The part of a page scroll view the content can occupy without becoming
 * scrollable: its frame minus the insets UIKit adds when it adjusts content
 * insets (the see-through bar above, the tab bar / home indicator below).
 * A content container with `flexGrow: 1` fills the whole frame, so under
 * automatic insets it would be taller than this by both bars and the page
 * could be dragged and left resting part-way; capping it here keeps an empty
 * page exactly as tall as its viewport, so it only rubber-bands.
 *
 * `observedInsets` is the scroll view's own safe area (a native observer
 * sharing its frame) and wins; otherwise the measured header and bottom bar
 * stand in. Pages without inset adjustment pad for their bars themselves, so
 * the frame is the viewport. Null until the frame is measured.
 */
export function resolveMobilePageViewportHeight({
  frameHeight,
  systemAdjustsInsets,
  observedInsets,
  fallbackTopInset,
  fallbackBottomInset,
}: {
  frameHeight: number | null;
  systemAdjustsInsets: boolean;
  observedInsets: { top: number; bottom: number } | null;
  fallbackTopInset: number;
  fallbackBottomInset: number;
}): number | null {
  if (frameHeight === null || !Number.isFinite(frameHeight) || frameHeight <= 0) return null;
  if (!systemAdjustsInsets) return Math.floor(frameHeight);
  const top = observedInsets ? observedInsets.top : fallbackTopInset;
  const bottom = observedInsets ? observedInsets.bottom : fallbackBottomInset;
  const safeTop = Number.isFinite(top) ? Math.max(0, top) : 0;
  const safeBottom = Number.isFinite(bottom) ? Math.max(0, bottom) : 0;
  return Math.max(1, Math.floor(frameHeight - safeTop - safeBottom));
}

/** A page scroll view's frame height and the insets UIKit adjusted it by. */
export type MobilePageViewportObservation = { top: number; bottom: number; height: number };

/**
 * Pages that share this key share a viewport: the same window under the same
 * bars (a root tab's native header over the tab bar, or beside the vertical
 * bars).
 */
export function getMobilePageViewportKey({
  windowWidth,
  windowHeight,
  bottomBar,
  verticalBarSide,
}: {
  windowWidth: number;
  windowHeight: number;
  bottomBar: boolean;
  verticalBarSide: "left" | "right" | null;
}): string {
  return `${Math.round(windowWidth)}x${Math.round(windowHeight)}:${bottomBar ? "tabs" : "no-tabs"}:${verticalBarSide ?? "none"}`;
}

/**
 * A safe area that is all zero comes from a page not yet laid out in its
 * window (a tab shown for the first time reports one just before its bars'
 * insets); it says nothing about the viewport.
 */
export function isMobilePageViewportObservationUsable(observation: MobilePageViewportObservation): boolean {
  return (
    Number.isFinite(observation.height) &&
    observation.height > 0 &&
    (observation.top > 0 || observation.bottom > 0)
  );
}

const rememberedPageViewports = new Map<string, MobilePageViewportObservation>();

/**
 * The last viewport a page observed under this key. A tab mounts hidden at
 * launch: its header height is the stack's default estimate and its observer
 * has no window, so it reports only after the tab's first frame is on screen
 * and an empty page centred in the estimate moved once (Browse / Search, first
 * visit per launch). Another page with the same key already observed it.
 */
export function recallMobilePageViewport(key: string): MobilePageViewportObservation | null {
  return rememberedPageViewports.get(key) ?? null;
}

export function rememberMobilePageViewport(key: string, observation: MobilePageViewportObservation): void {
  if (!isMobilePageViewportObservationUsable(observation)) return;
  rememberedPageViewports.set(key, observation);
}

/**
 * Whether a viewport-filling page is in its final layout: its own observer
 * has reported the bar insets (the remembered or estimated viewport only
 * stands in until then) and its content has laid out at the resulting
 * height, so whatever sizes itself from that height (the empty Library's
 * hero) has measured it too.
 */
export function isMobilePageViewportFillSettled({
  observed,
  viewportHeight,
  contentHeight,
}: {
  observed: MobilePageViewportObservation | null;
  viewportHeight: number | null;
  contentHeight: number | null;
}): boolean {
  if (observed === null || viewportHeight === null || contentHeight === null) return false;
  return Math.abs(contentHeight - viewportHeight) < 1;
}

/** Tests only. */
export function resetRememberedMobilePageViewports(): void {
  rememberedPageViewports.clear();
}
