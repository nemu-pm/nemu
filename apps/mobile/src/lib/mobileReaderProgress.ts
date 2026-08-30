import type { ReadingMode } from "@/data/schema";
import {
  formatMobileString,
  type MobileStrings,
} from "./mobileI18n";

export function clampReaderPageIndex(index: number, pageCount: number): number {
  if (!Number.isFinite(index) || pageCount <= 0) return 0;
  return Math.max(0, Math.min(pageCount - 1, Math.round(index)));
}

export function readerDisplayIndexFromOffset(
  offset: number,
  pageExtent: number,
  pageCount: number
): number {
  if (!Number.isFinite(offset) || !Number.isFinite(pageExtent) || pageExtent <= 0) {
    return 0;
  }
  return clampReaderPageIndex(offset / pageExtent, pageCount);
}

export type ReaderScrollPageMetric = {
  y: number;
  height: number;
};

export type ReaderContinuousScrollMetrics = {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
  maximumOffset: number;
  progress: number;
  scrollable: boolean;
};

/**
 * Normalizes native vertical scroll measurements into the exact progress used
 * by the reader scrubber. Page count is deliberately absent: a single tall
 * image can still have a substantial scroll range.
 */
export function getReaderContinuousScrollMetrics(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
}): ReaderContinuousScrollMetrics {
  const contentLength = Number.isFinite(input.contentLength)
    ? Math.max(0, input.contentLength)
    : 0;
  const viewportLength = Number.isFinite(input.viewportLength)
    ? Math.max(0, input.viewportLength)
    : 0;
  const maximumOffset = Math.max(0, contentLength - viewportLength);
  const contentOffset = Number.isFinite(input.contentOffset)
    ? Math.max(0, Math.min(maximumOffset, input.contentOffset))
    : 0;
  const scrollable = maximumOffset > 0;

  return {
    contentOffset,
    contentLength,
    viewportLength,
    maximumOffset,
    progress: scrollable ? contentOffset / maximumOffset : 0,
    scrollable,
  };
}

export function readerContinuousScrollOffsetForProgress(
  progress: number,
  metrics: Pick<ReaderContinuousScrollMetrics, "maximumOffset">,
): number {
  if (!Number.isFinite(progress) || metrics.maximumOffset <= 0) return 0;
  return Math.max(0, Math.min(1, progress)) * metrics.maximumOffset;
}

/**
 * A physical-offset scrubber is reliable only when the continuous gallery has
 * one logical page (including a segmented long strip). Multi-page FlatLists
 * virtualize unmeasured pages, so their native content length grows while the
 * reader moves; mapping the whole thumb to that temporary length makes the
 * far end stop after only the currently rendered pages. Multi-page scrolling
 * therefore keeps the chapter-wide, page-index scrubber while touch scrolling
 * itself remains fully continuous.
 */
export function shouldUseReaderPhysicalScrollScrubber({
  pagedMode,
  pageCount,
}: {
  pagedMode: boolean;
  pageCount: number;
}): boolean {
  return !pagedMode && pageCount <= 1;
}

export type ReaderContinuousAccessibilityAction =
  | { kind: "scroll"; offset: number }
  | { kind: "end" };

/**
 * Moves a continuous reader by most of one viewport so adjacent context stays
 * visible. Reaching the bottom is a separate action from advancing past it.
 */
export function readerContinuousAccessibilityAction(
  input: Pick<
    ReaderContinuousScrollMetrics,
    "contentOffset" | "contentLength" | "viewportLength"
  >,
  direction: "previous" | "next",
): ReaderContinuousAccessibilityAction {
  if (
    !Number.isFinite(input.contentOffset) ||
    !Number.isFinite(input.contentLength) ||
    !Number.isFinite(input.viewportLength) ||
    input.contentLength <= 0 ||
    input.viewportLength <= 0
  ) {
    return { kind: "scroll", offset: 0 };
  }

  const maximumOffset = Math.max(0, input.contentLength - input.viewportLength);
  const contentOffset = Math.max(
    0,
    Math.min(maximumOffset, input.contentOffset),
  );
  if (direction === "next" && contentOffset >= maximumOffset - 2) {
    return { kind: "end" };
  }

  const delta = Math.max(1, input.viewportLength * 0.85);
  return {
    kind: "scroll",
    offset: Math.max(
      0,
      Math.min(
        maximumOffset,
        contentOffset + (direction === "next" ? delta : -delta),
      ),
    ),
  };
}

function normalizedReaderProgress(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/** Chooses the anchor carried through a same-content continuous relayout. */
export function readerContinuousRelayoutProgress(input: {
  sameContent: boolean;
  currentProgress?: number | null;
  pendingProgress?: number | null;
  initialProgress?: number | null;
}): number | null {
  if (input.sameContent) {
    return (
      normalizedReaderProgress(input.pendingProgress) ??
      normalizedReaderProgress(input.currentProgress) ??
      normalizedReaderProgress(input.initialProgress)
    );
  }
  return normalizedReaderProgress(input.initialProgress);
}

/**
 * Keeps live continuous metrics scoped to content, not presentation geometry.
 * A width preview or rotation remounts the native list, but clearing the outer
 * metrics during that gap lets a second rapid relayout overwrite the gallery's
 * pending anchor with zero.
 */
export function readerScrollMetricsResetKey(input: {
  continuousContentIdentity?: string;
  pagedMode: boolean;
  scrollMountKey: string;
}): string {
  return !input.pagedMode && input.continuousContentIdentity
    ? `continuous:${input.continuousContentIdentity}`
    : `mount:${input.scrollMountKey}`;
}

/**
 * Scopes transient scrub gestures to the exact reader presentation that
 * created them. In particular, a pending continuous-scroll acknowledgement
 * must never leak into a subsequently paged reader with the same page count.
 */
export function readerScrubberInteractionScopeKey(input: {
  continuousScroll: boolean;
  contentIdentity?: string;
  disabled: boolean;
  mode: ReadingMode;
  scrubCount: number;
}): string {
  const scrubCount = Number.isFinite(input.scrubCount)
    ? Math.max(0, Math.round(input.scrubCount))
    : 0;
  return JSON.stringify([
    input.continuousScroll ? "continuous" : "paged",
    input.contentIdentity ?? "",
    input.disabled ? "disabled" : "enabled",
    input.mode,
    scrubCount,
  ]);
}

/**
 * Continuous content always progresses from the top toward the bottom, even
 * when the saved paged-reading mode is right-to-left. RTL only reverses the
 * visual order of discrete pages/spreads.
 */
export function readerScrubberDirection(input: {
  continuousScroll: boolean;
  mode: ReadingMode;
}): "ltr" | "rtl" {
  return !input.continuousScroll && input.mode === "rtl" ? "rtl" : "ltr";
}

export function shouldScheduleReaderChromeAutoHide(input: {
  hasReaderKey: boolean;
  ready: boolean;
  pageCount: number;
  showControls: boolean;
  scrubActive: boolean;
  reduceMotion: boolean | null;
}): boolean {
  return (
    input.hasReaderKey &&
    input.ready &&
    input.pageCount > 0 &&
    input.showControls &&
    !input.scrubActive &&
    input.reduceMotion === false
  );
}

/**
 * Variable-height scrolling mode: pick the page whose vertical center is
 * closest to the viewport center (matches web ScrollingGallery semantics).
 */
export function readerDisplayIndexForScrollOffset(
  scrollOffsetY: number,
  viewportHeight: number,
  pages: readonly (ReaderScrollPageMetric | undefined)[],
  pageCount: number,
  fallbackIndex = 0,
): number {
  if (pageCount <= 0) return 0;

  const centerY = scrollOffsetY + viewportHeight / 2;
  // A virtualized list only measures its mounted window. Keep the current
  // page when that window has not laid out yet instead of snapping to page 1.
  let bestIndex = clampReaderPageIndex(fallbackIndex, pageCount);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestOverlap = -1;

  for (let index = 0; index < pageCount; index += 1) {
    const metric = pages[index];
    if (!metric || metric.height <= 0) continue;

    const pageTop = metric.y;
    const pageBottom = metric.y + metric.height;
    const overlap = Math.min(pageBottom, scrollOffsetY + viewportHeight) - Math.max(pageTop, scrollOffsetY);
    if (overlap <= 0) continue;

    const containsCenter = pageTop <= centerY && pageBottom >= centerY;
    const distance = containsCenter
      ? 0
      : Math.min(Math.abs(pageTop - centerY), Math.abs(pageBottom - centerY));

    if (
      distance < bestDistance ||
      (distance === bestDistance && overlap > bestOverlap) ||
      (distance === bestDistance &&
        overlap === bestOverlap &&
        index > bestIndex)
    ) {
      bestIndex = index;
      bestDistance = distance;
      bestOverlap = overlap;
    }
  }

  return clampReaderPageIndex(bestIndex, pageCount);
}

/** Selects the page nearest the center from FlatList's sparse visible window. */
export function readerDisplayIndexForViewableItems(
  viewableIndexes: readonly number[],
  pageCount: number,
): number | null {
  if (pageCount <= 0) return null;
  const indexes = [
    ...new Set(
      viewableIndexes
        .filter((index) => Number.isFinite(index))
        .map((index) => clampReaderPageIndex(index, pageCount)),
    ),
  ].sort((left, right) => left - right);
  if (indexes.length === 0) return null;
  // For an even pair, prefer the later source page, matching the existing
  // center-distance tie break in readerDisplayIndexForScrollOffset.
  return indexes[Math.floor(indexes.length / 2)] ?? null;
}

export function readerVisualFrameIndexForLogicalFrame(
  logicalFrameIndex: number,
  frameCount: number,
  mode: ReadingMode,
): number {
  const clamped = clampReaderPageIndex(logicalFrameIndex, frameCount);
  return mode === "rtl" ? Math.max(0, frameCount - 1 - clamped) : clamped;
}

export function readerLogicalFrameIndexForVisualFrame(
  visualFrameIndex: number,
  frameCount: number,
  mode: ReadingMode,
): number {
  const clamped = clampReaderPageIndex(visualFrameIndex, frameCount);
  return mode === "rtl" ? Math.max(0, frameCount - 1 - clamped) : clamped;
}

export function readerScrollOffsetForLogicalFrame(
  logicalFrameIndex: number,
  frameCount: number,
  frameExtent: number,
  mode: ReadingMode,
): number {
  if (
    !Number.isFinite(frameExtent) ||
    frameExtent <= 0 ||
    frameCount <= 0
  ) {
    return 0;
  }
  return (
    readerVisualFrameIndexForLogicalFrame(logicalFrameIndex, frameCount, mode) *
    frameExtent
  );
}

/**
 * A virtualized continuous reader can only advance by roughly one render
 * batch after an unmeasured `scrollToIndex` fallback. Give long chapters
 * enough bounded retries to reach the requested page instead of accepting an
 * intermediate render-window position as the user's new reading progress.
 */
export function readerScrollToIndexRetryLimit(
  itemCount: number,
  renderBatchSize = 5,
): number {
  const safeItemCount = Number.isFinite(itemCount)
    ? Math.max(0, Math.trunc(itemCount))
    : 0;
  const safeBatchSize = Number.isFinite(renderBatchSize)
    ? Math.max(1, Math.trunc(renderBatchSize))
    : 5;
  // Android can expose only about half of a requested render batch after a
  // far fallback seek, especially after a portrait/landscape relayout.
  const conservativeMeasuredBatch = Math.max(1, Math.floor(safeBatchSize / 2));
  return Math.min(
    30,
    Math.max(4, Math.ceil(safeItemCount / conservativeMeasuredBatch) + 4),
  );
}

export function readerSourceIndexForDisplayIndex(
  displayIndex: number,
  pageCount: number,
  mode: ReadingMode
): number {
  const clamped = clampReaderPageIndex(displayIndex, pageCount);
  // Match web: reading mode changes navigation/visual direction, not the
  // persisted source-order page index.
  void mode;
  return clamped;
}

export function readerDisplayIndexForSourceIndex(
  sourceIndex: number,
  pageCount: number,
  mode: ReadingMode
): number {
  const clamped = clampReaderPageIndex(sourceIndex, pageCount);
  void mode;
  return clamped;
}

export function readerDisplayIndexForRoutePage(
  routePage: string | number | null | undefined,
  pageCount: number,
  mode: ReadingMode
): number | null {
  if (pageCount <= 0 || routePage == null || routePage === "") return null;
  const pageNumber =
    typeof routePage === "number" ? routePage : Number.parseInt(routePage, 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return null;
  return readerDisplayIndexForSourceIndex(Math.trunc(pageNumber) - 1, pageCount, mode);
}

export function readerRoutePageForDisplayIndex(
  displayIndex: number,
  pageCount: number,
  mode: ReadingMode
): number {
  return readerSourceIndexForDisplayIndex(displayIndex, pageCount, mode) + 1;
}

export function readerSourceStepTargetForDisplayIndex(
  displayIndex: number,
  pageCount: number,
  mode: ReadingMode,
  direction: "previous" | "next",
): number | null {
  if (pageCount <= 0) return null;

  const sourceIndex = readerSourceIndexForDisplayIndex(
    displayIndex,
    pageCount,
    mode,
  );
  const nextSourceIndex = sourceIndex + (direction === "next" ? 1 : -1);
  if (nextSourceIndex < 0 || nextSourceIndex >= pageCount) return null;

  return readerDisplayIndexForSourceIndex(nextSourceIndex, pageCount, mode);
}

export function readerProgressDisplayIndexForVisiblePages(
  visibleDisplayIndexes: number[],
  pageCount: number,
  mode: ReadingMode,
): number {
  if (pageCount <= 0) return 0;

  let bestDisplayIndex = clampReaderPageIndex(visibleDisplayIndexes[0] ?? 0, pageCount);
  let bestSourceIndex = readerSourceIndexForDisplayIndex(bestDisplayIndex, pageCount, mode);

  for (const displayIndex of visibleDisplayIndexes) {
    const clampedDisplayIndex = clampReaderPageIndex(displayIndex, pageCount);
    const sourceIndex = readerSourceIndexForDisplayIndex(
      clampedDisplayIndex,
      pageCount,
      mode,
    );
    if (sourceIndex > bestSourceIndex) {
      bestDisplayIndex = clampedDisplayIndex;
      bestSourceIndex = sourceIndex;
    }
  }

  return bestDisplayIndex;
}

export function readerProgressRatio(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  if (pageCount === 1) return 1;
  return clampReaderPageIndex(pageIndex, pageCount) / (pageCount - 1);
}

export function shouldRunReaderMenuPageSwitchHaptic(
  currentPageIndex: number,
  nextPageIndex: number,
  pageCount: number,
): boolean {
  if (pageCount <= 1) return false;
  return (
    clampReaderPageIndex(currentPageIndex, pageCount) !==
    clampReaderPageIndex(nextPageIndex, pageCount)
  );
}

export function readerVisualProgressRatio(
  pageIndex: number,
  pageCount: number,
  mode: ReadingMode,
): number {
  const sourceRatio = readerProgressRatio(pageIndex, pageCount);
  if (pageCount <= 1) return sourceRatio;
  return mode === "rtl" ? 1 - sourceRatio : sourceRatio;
}

export function readerDisplayIndexForVisualProgressRatio(
  ratio: number,
  pageCount: number,
  mode: ReadingMode,
): number {
  if (pageCount <= 1) return 0;
  const clampedRatio = Number.isFinite(ratio)
    ? Math.max(0, Math.min(1, ratio))
    : 0;
  const sourceRatio = mode === "rtl" ? 1 - clampedRatio : clampedRatio;
  return clampReaderPageIndex(sourceRatio * (pageCount - 1), pageCount);
}

/**
 * How the reader arrived at the page it is currently showing.
 *
 * - `initial`  — placed there by chapter entry, route restore, saved progress,
 *                a scrubber seek, or any other jump that is not a page turn.
 * - `forward`  — the reader advanced one step in source order during this
 *                session (tap zone, swipe, accessibility action).
 * - `backward` — the reader stepped back one page during this session.
 */
export type MobileReaderPageArrival = "initial" | "forward" | "backward";

/**
 * Classifies a page change as a forward/backward turn. Jumps that keep the
 * page (or that are not steps at all) stay `initial` so they can never satisfy
 * the auto-complete rule below.
 */
export function readerPageArrivalForStep(
  previousDisplayIndex: number,
  nextDisplayIndex: number,
  pageCount: number,
  mode: ReadingMode,
): MobileReaderPageArrival {
  if (pageCount <= 0) return "initial";
  const previousSourceIndex = readerSourceIndexForDisplayIndex(
    previousDisplayIndex,
    pageCount,
    mode,
  );
  const nextSourceIndex = readerSourceIndexForDisplayIndex(
    nextDisplayIndex,
    pageCount,
    mode,
  );
  if (nextSourceIndex > previousSourceIndex) return "forward";
  if (nextSourceIndex < previousSourceIndex) return "backward";
  return "initial";
}

/**
 * A chapter is only auto-completed when the reader actually *paged onto* its
 * last page during this session.
 *
 * Opening a chapter at its final page — which is exactly what "previous
 * chapter" navigation does (`startAt: "end"`) — must not mark it read, and
 * neither must resuming a chapter whose saved progress already sits on the
 * final page. Requiring a fresh forward turn is the safe rule: the only cost is
 * that a resumed last page needs one more (impossible) turn, which is why the
 * reader keeps an explicit "Mark complete" action and why a chapter that ends
 * while already flagged completed short-circuits at the top.
 *
 * Single-page chapters are the one exception: no forward turn exists inside
 * them, so viewing the page *is* reading the chapter.
 */
export function shouldAutoCompleteMobileReaderChapter({
  displayIndex,
  pageCount,
  mode,
  completed,
  arrival,
}: {
  displayIndex: number;
  pageCount: number;
  mode: ReadingMode;
  completed: boolean;
  arrival: MobileReaderPageArrival;
}): boolean {
  if (completed || pageCount <= 0) return false;
  if (
    readerSourceIndexForDisplayIndex(displayIndex, pageCount, mode) <
    pageCount - 1
  ) {
    return false;
  }
  if (pageCount === 1) return true;
  return arrival === "forward";
}

export function formatReaderPageValue(
  pageIndex: number,
  pageCount: number,
  mode: ReadingMode,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.reader.pageValue, {
    page: readerRoutePageForDisplayIndex(pageIndex, pageCount, mode),
    total: Math.max(1, pageCount),
  });
}

export function formatReaderSpreadValue(
  spreadIndex: number,
  spreadCount: number,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.reader.spreadValue, {
    spread: clampReaderPageIndex(spreadIndex, spreadCount) + 1,
    total: Math.max(1, spreadCount),
  });
}

export function formatReaderPageActionAccessibilityLabel(
  action: string,
  targetPageIndex: number,
  pageCount: number,
  mode: ReadingMode,
  strings: MobileStrings,
): string {
  if (pageCount <= 0) return action;
  return [
    action,
    formatReaderPageValue(
      clampReaderPageIndex(targetPageIndex, pageCount),
      pageCount,
      mode,
      strings,
    ),
  ].join(", ");
}
