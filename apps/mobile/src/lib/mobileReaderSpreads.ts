import type { PagePairingMode, ReadingMode } from "@/data/schema";

export function buildMobileReaderSpreads(
  pageCount: number,
  pagePairingMode: PagePairingMode
): number[][] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const spreads: number[][] = [];
  let index = 0;
  let segmentStart = true;

  while (index < pageCount) {
    if (pagePairingMode === "manga" && segmentStart) {
      spreads.push([index]);
      index += 1;
      segmentStart = false;
      continue;
    }

    const next = index + 1;
    if (next < pageCount) {
      spreads.push([index, next]);
      index += 2;
    } else {
      spreads.push([index]);
      index += 1;
    }
    segmentStart = false;
  }

  return spreads;
}

export function buildMobileReaderDisplaySpreads(
  pageCount: number,
  pagePairingMode: PagePairingMode,
  mode: ReadingMode,
): number[][] {
  void mode;
  return buildMobileReaderSpreads(pageCount, pagePairingMode);
}

export function findMobileReaderSpreadIndex(spreads: number[][], pageIndex: number): number {
  if (!spreads.length) return 0;
  const found = spreads.findIndex((spread) => spread.includes(pageIndex));
  if (found >= 0) return found;
  return pageIndex <= 0 ? 0 : spreads.length - 1;
}

export function firstPageIndexForMobileReaderSpread(
  spreads: number[][],
  spreadIndex: number
): number {
  const clamped = Math.max(0, Math.min(spreads.length - 1, Math.round(spreadIndex)));
  return spreads[clamped]?.[0] ?? 0;
}

/**
 * The page the reader is on once a spread settles: the page it was already on
 * when that spread shows it (a single page that became a spread by rotating
 * or unfolding, so turning back to single pages lands on the same page), else
 * the spread's first page.
 */
export function mobileReaderPageIndexForSettledSpread(
  spreads: number[][],
  spreadIndex: number,
  currentPageIndex: number,
): number {
  const clamped = Math.max(0, Math.min(spreads.length - 1, Math.round(spreadIndex)));
  return spreads[clamped]?.includes(currentPageIndex)
    ? currentPageIndex
    : firstPageIndexForMobileReaderSpread(spreads, spreadIndex);
}

/** Steps one visual spread in source reading order and returns its anchor page. */
export function pageIndexForMobileReaderSpreadStep(
  spreads: number[][],
  pageIndex: number,
  direction: "previous" | "next",
): number | null {
  if (spreads.length === 0) return null;
  const currentSpreadIndex = findMobileReaderSpreadIndex(spreads, pageIndex);
  const nextSpreadIndex =
    currentSpreadIndex + (direction === "next" ? 1 : -1);
  if (nextSpreadIndex < 0 || nextSpreadIndex >= spreads.length) return null;
  return firstPageIndexForMobileReaderSpread(spreads, nextSpreadIndex);
}

export function visualPageIndexesForMobileReaderSpread(
  spread: number[],
  mode: ReadingMode
): number[] {
  if (spread.length !== 2) return spread;
  // The returned order is rendered left→right in a plain RN row (rows never
  // direction-flip like CSS `dir`), so RTL must place the first-read page on
  // the right by returning it last.
  return mode === "rtl" ? [spread[1], spread[0]] : spread;
}

/**
 * Facing pages lean on the spine: the left page against its slot's right
 * edge, the right page against its slot's left edge, spare width outside.
 * In the book posture each slot is a pane beside the fold, so the pages sit
 * against the fold without crossing it. A page alone is centred.
 */
export function mobileReaderSpreadPageAlignment(
  visualSlotIndex: number,
  pageCount: number,
): "center" | "flex-start" | "flex-end" {
  if (pageCount !== 2) return "center";
  return visualSlotIndex === 0 ? "flex-end" : "flex-start";
}

/** Width / height of a page; the usual manga page shape when unknown. */
export function mobileReaderPageRatio(size?: { width: number; height: number } | null): number {
  return size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
    ? size.width / size.height
    : 1 / 1.45;
}

/**
 * Two facing pages fitted as one sheet: the same height, each inside its
 * own slot (the stage halves, or the panes beside a fold), never cropped.
 * The height is the tallest both pages fit at.
 */
export function getMobileReaderSpreadSheetFrames({
  slots,
  sizes,
}: {
  slots: [{ width: number; height: number }, { width: number; height: number }];
  sizes: [{ width: number; height: number } | null | undefined, { width: number; height: number } | null | undefined];
}): [{ width: number; height: number }, { width: number; height: number }] {
  const ratios = [mobileReaderPageRatio(sizes[0]), mobileReaderPageRatio(sizes[1])] as const;
  const fit = (slot: { width: number; height: number }, ratio: number) => {
    const width = Number.isFinite(slot.width) && slot.width > 0 ? slot.width : 1;
    const height = Number.isFinite(slot.height) && slot.height > 0 ? slot.height : 1;
    return Math.min(height, width / ratio);
  };
  const height = Math.max(1, Math.min(fit(slots[0], ratios[0]), fit(slots[1], ratios[1])));
  return [
    { width: height * ratios[0], height },
    { width: height * ratios[1], height },
  ];
}

/** The frame itself fits the page, so Image's contain mode adds no inner gutter. */
export function getMobileReaderSpreadImageFrameSize({
  availableWidth,
  availableHeight,
  naturalSize,
}: {
  availableWidth: number;
  availableHeight: number;
  naturalSize?: { width: number; height: number } | null;
}): { width: number; height: number } {
  const width = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 1;
  const height = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 1;
  const ratio = naturalSize && Number.isFinite(naturalSize.width) &&
    Number.isFinite(naturalSize.height) && naturalSize.width > 0 && naturalSize.height > 0
    ? naturalSize.height / naturalSize.width : 1.45;
  const fittedWidth = Math.min(width, height / ratio);
  return { width: fittedWidth, height: fittedWidth * ratio };
}
