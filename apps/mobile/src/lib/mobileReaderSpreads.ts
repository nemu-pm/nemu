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

/** Align fitted pages at the book spine; spare width belongs at the outside. */
export function mobileReaderSpreadPageAlignment(
  visualSlotIndex: number,
  pageCount: number,
  hasReservedSlots: boolean,
): "center" | "flex-start" | "flex-end" {
  // A cover/unpaired page remains centered. Real fold regions keep their own
  // independently centered viewports instead of pulling content toward a hinge.
  if (pageCount !== 2 || hasReservedSlots) return "center";
  return visualSlotIndex === 0 ? "flex-end" : "flex-start";
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
