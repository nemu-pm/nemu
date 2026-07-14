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

export function shouldAutoCompleteMobileReaderChapter(
  displayIndex: number,
  pageCount: number,
  mode: ReadingMode,
  completed: boolean,
): boolean {
  if (completed || pageCount <= 0) return false;
  return readerSourceIndexForDisplayIndex(displayIndex, pageCount, mode) >= pageCount - 1;
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
