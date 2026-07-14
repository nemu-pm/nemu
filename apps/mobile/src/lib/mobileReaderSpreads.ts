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
