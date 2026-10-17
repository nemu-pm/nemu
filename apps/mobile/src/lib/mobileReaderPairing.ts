/**
 * Spread pairing for paged reading: which pages face each other.
 *
 * Pages are cut into segments of consecutive pages that can share a spread.
 * A wide page (a printed double page, a landscape insert) stands alone and
 * ends its segment, and so does a change of page shape; parity restarts at
 * every segment head, so one wide page never throws the rest of the chapter
 * off by a page.
 *
 * Within a segment the parity says whether the head stands alone (`1`, the
 * cover of a book) or starts a pair (`0`). The pairing setting gives the
 * chapter's first segment its parity (later segments pair from their head),
 * and "Shift by One Page" flips every segment.
 *
 * The table is in source order and independent of the pose: the same pairs
 * serve a flat spread, the book posture and the notebook top pane, so
 * folding never re-paginates.
 */

export type MobileReaderPageSize = { width: number; height: number };

/** A page wider than this (width / height) is a double page and stands alone. */
export const READER_WIDE_PAGE_ASPECT = 1.2;
/** Facing pages must agree in shape within this ratio (a 15% wider page is an insert). */
export const READER_PAIR_ASPECT_TOLERANCE = 0.15;

/**
 * How the chapter's pages pair:
 * - `auto`: decided from the pages' binding margins where they say enough,
 *   else the first page stands alone, as most books open;
 * - `cover-alone`: the first page stands alone, then (2,3)(4,5)…;
 * - `cover-paired`: pairs from the first page, (1,2)(3,4)….
 */
export type MobileReaderSpreadPairing = "auto" | "cover-alone" | "cover-paired";

export const MOBILE_READER_SPREAD_PAIRINGS: readonly MobileReaderSpreadPairing[] = [
  "auto",
  "cover-alone",
  "cover-paired",
];
export const DEFAULT_MOBILE_READER_SPREAD_PAIRING: MobileReaderSpreadPairing = "auto";

/**
 * The saved pairing. Builds before this setting stored `manga` (the first
 * page alone, the old default) or `book` (pairs from the first page); an
 * explicit `book` keeps pairing from the first page, everything else reads
 * as automatic.
 */
export function normalizeMobileReaderSpreadPairing(
  value: unknown,
  legacyPagePairingMode?: unknown,
): MobileReaderSpreadPairing {
  if (
    typeof value === "string" &&
    (MOBILE_READER_SPREAD_PAIRINGS as readonly string[]).includes(value)
  ) {
    return value as MobileReaderSpreadPairing;
  }
  return legacyPagePairingMode === "book" ? "cover-paired" : DEFAULT_MOBILE_READER_SPREAD_PAIRING;
}

function aspectOf(size: MobileReaderPageSize | null | undefined): number | null {
  if (!size) return null;
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

/** A double page or a landscape insert: it is shown by itself. */
export function isMobileReaderWidePage(size: MobileReaderPageSize | null | undefined): boolean {
  const aspect = aspectOf(size);
  return aspect !== null && aspect > READER_WIDE_PAGE_ASPECT;
}

/**
 * Whether two neighbouring pages may face each other. A page whose size is
 * not known yet counts as an ordinary page (it pairs), so a chapter reads in
 * spreads before its pages decode; a wide page found later re-pairs only the
 * pages ahead of the reader (`freezeMobileReaderSpreadsThrough`).
 */
export function mobileReaderPagesPairable(
  a: MobileReaderPageSize | null | undefined,
  b: MobileReaderPageSize | null | undefined,
): boolean {
  if (isMobileReaderWidePage(a) || isMobileReaderWidePage(b)) return false;
  const aspectA = aspectOf(a);
  const aspectB = aspectOf(b);
  if (aspectA === null || aspectB === null) return true;
  return Math.max(aspectA, aspectB) / Math.min(aspectA, aspectB) <= 1 + READER_PAIR_ASPECT_TOLERANCE + 1e-9;
}

export type MobileReaderPairingSegment = {
  /** First page index (inclusive). */
  start: number;
  /** End page index (exclusive). */
  end: number;
  /** A lone wide page: never paired, whatever the parity. */
  wide: boolean;
};

/** Runs of consecutive pages that can share spreads; each wide page is a run of its own. */
export function mobileReaderPairingSegments(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined,
): MobileReaderPairingSegment[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const segments: MobileReaderPairingSegment[] = [];
  let start = 0;
  for (let index = 0; index < pageCount; index += 1) {
    const size = sizeAt(index);
    if (isMobileReaderWidePage(size)) {
      if (start < index) segments.push({ start, end: index, wide: false });
      segments.push({ start: index, end: index + 1, wide: true });
      start = index + 1;
      continue;
    }
    const next = index + 1;
    if (next < pageCount && !isMobileReaderWidePage(sizeAt(next)) && !mobileReaderPagesPairable(size, sizeAt(next))) {
      segments.push({ start, end: next, wide: false });
      start = next;
    }
  }
  if (start < pageCount) segments.push({ start, end: pageCount, wide: false });
  return segments;
}

/**
 * Per-page parity inside a segment: `states[j]` is the parity in force at
 * the segment's j-th page. A constant array is the usual case; a change of
 * state mid-segment marks an inserted or missing page (automatic pairing).
 */
export type MobileReaderSegmentParity = 0 | 1 | ReadonlyArray<0 | 1>;

/** Pairs within one segment: page j starts a pair when j % 2 equals its state and the next page shares it. */
export function mobileReaderSegmentSpreads(
  segment: MobileReaderPairingSegment,
  parity: MobileReaderSegmentParity,
): number[][] {
  const length = segment.end - segment.start;
  if (segment.wide || length <= 1) {
    return Array.from({ length: Math.max(0, length) }, (_, j) => [segment.start + j]);
  }
  const stateAt = (j: number): 0 | 1 =>
    typeof parity === "number" ? parity : (parity[j] ?? parity[parity.length - 1] ?? 0);
  const spreads: number[][] = [];
  let j = 0;
  while (j < length) {
    if (j + 1 < length && j % 2 === stateAt(j) && stateAt(j + 1) === stateAt(j)) {
      spreads.push([segment.start + j, segment.start + j + 1]);
      j += 2;
    } else {
      spreads.push([segment.start + j]);
      j += 1;
    }
  }
  return spreads;
}

/** The fixed rules' parity: the chapter's first segment alone for `cover-alone`, every other segment pairs from its head. */
export function mobileReaderFixedSegmentParity(
  pairing: Exclude<MobileReaderSpreadPairing, "auto"> | "auto",
  segment: MobileReaderPairingSegment,
): 0 | 1 {
  return segment.start === 0 && pairing !== "cover-paired" ? 1 : 0;
}

function flipParity(parity: MobileReaderSegmentParity): MobileReaderSegmentParity {
  if (typeof parity === "number") return parity === 0 ? 1 : 0;
  return parity.map((state) => (state === 0 ? 1 : 0));
}

export type MobileReaderPairingInput = {
  pageCount: number;
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined;
  pairing: MobileReaderSpreadPairing;
  /** "Shift by One Page": flips the parity of every segment. */
  shift?: boolean;
  /**
   * The automatic parity for a segment, or null to fall back to the fixed
   * rule (the first page alone). Only consulted for `auto`.
   */
  inferParity?: (segment: MobileReaderPairingSegment) => MobileReaderSegmentParity | null;
};

/** The chapter's spread table, in source order. */
export function buildMobileReaderPairedSpreads(input: MobileReaderPairingInput): number[][] {
  const segments = mobileReaderPairingSegments(input.pageCount, input.sizeAt);
  const spreads: number[][] = [];
  for (const segment of segments) {
    let parity: MobileReaderSegmentParity =
      (input.pairing === "auto" ? input.inferParity?.(segment) : null)
      ?? mobileReaderFixedSegmentParity(input.pairing, segment);
    if (input.shift) parity = flipParity(parity);
    spreads.push(...mobileReaderSegmentSpreads(segment, parity));
  }
  return spreads;
}

/**
 * Keeps the spreads the reader has already seen. `previous` was on screen
 * up to and including `throughSpreadIndex`; those spreads stay exactly as
 * they were, and `next` supplies the rest. A pair of `next` that straddles
 * the kept prefix gives up its kept page, so the page after it stands alone.
 * The spread index of every kept spread is unchanged, so the gallery never
 * moves under the reader when pairing learns more about the pages ahead.
 */
export function freezeMobileReaderSpreadsThrough(
  previous: readonly number[][],
  next: readonly number[][],
  throughSpreadIndex: number,
): number[][] {
  if (throughSpreadIndex < 0 || previous.length === 0) return next.map((spread) => [...spread]);
  const kept = previous.slice(0, Math.min(previous.length, throughSpreadIndex + 1)).map((spread) => [...spread]);
  const lastKept = Math.max(-1, ...kept.flat());
  const out = kept;
  for (const spread of next) {
    const ahead = spread.filter((page) => page > lastKept);
    if (ahead.length === 0) continue;
    out.push(ahead);
  }
  return out;
}

/** Two tables pair the same pages the same way. */
export function sameMobileReaderSpreads(a: readonly number[][], b: readonly number[][]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((spread, index) => {
    const other = b[index];
    return other !== undefined && spread.length === other.length && spread.every((page, k) => page === other[k]);
  });
}

/**
 * The table to show after an update. A new chapter or a pairing the user
 * changed starts over (`reset`); otherwise what the reader has seen is kept:
 * every spread before the current one, and the current one too once all of
 * its pages have decoded (`settled`). A page still loading may yet turn out
 * wide, so the spread it sits in can still give way.
 */
export function nextMobileReaderSpreadTable(input: {
  previous: readonly number[][] | null;
  computed: number[][];
  reset: boolean;
  currentPageIndex: number;
  settled: (pageIndex: number) => boolean;
}): number[][] {
  const { previous, computed } = input;
  if (input.reset || !previous || previous.length === 0) return computed;
  if (sameMobileReaderSpreads(previous, computed)) return previous as number[][];
  const found = previous.findIndex((spread) => spread.includes(input.currentPageIndex));
  const current = found >= 0 ? found : previous.length - 1;
  const through = previous[current]?.every(input.settled) ? current : current - 1;
  const merged = freezeMobileReaderSpreadsThrough(previous, computed, through);
  return sameMobileReaderSpreads(previous, merged) ? (previous as number[][]) : merged;
}
