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
/**
 * Cover alone (the first page alone, as most books open) until automatic
 * pairing is validated beyond the one scanned series it was tuned on; a
 * confident wrong guess reads worse than the fixed rule.
 */
export const DEFAULT_MOBILE_READER_SPREAD_PAIRING: MobileReaderSpreadPairing = "cover-alone";

/**
 * The saved pairing. Builds before this setting stored `manga` (the first
 * page alone, the old default) or `book` (pairs from the first page); an
 * explicit `book` keeps pairing from the first page, everything else reads
 * as the default.
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

/** A page narrower than this (width / height) is a slice of a vertical strip; it never pairs. */
export const READER_STRIP_PAGE_ASPECT = 0.5;
/** The first pair head is looked for within this many opening pages (credits, colour pages, wide pages first). */
export const READER_FIRST_HEAD_WINDOW = 8;

/**
 * A chapter of vertical-strip slices (a webtoon): most pages are taller than
 * a strip page. Such a chapter shows one page at a time.
 */
export function isMobileReaderStripChapter(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined,
): boolean {
  const aspects: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const aspect = aspectOf(sizeAt(index));
    if (aspect !== null) aspects.push(aspect);
  }
  if (aspects.length < 3) return false;
  aspects.sort((a, b) => a - b);
  return aspects[Math.floor(aspects.length / 2)]! < READER_STRIP_PAGE_ASPECT;
}

export type MobileReaderPairingSegment = {
  /** First page index (inclusive). */
  start: number;
  /** End page index (exclusive). */
  end: number;
  /** A lone wide page: never paired, whatever the parity. */
  wide: boolean;
  /** A lone page unlike its neighbours (a colour page in a black-and-white chapter, a strip slice). */
  odd?: boolean;
};

/**
 * Runs of consecutive pages that can share spreads. Each wide page is a run
 * of its own, and so is each odd page (`oddAt`: a page unlike its
 * neighbours); a change of shape ends a run.
 */
export function mobileReaderPairingSegments(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined,
  oddAt?: (index: number) => boolean,
): MobileReaderPairingSegment[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const strip = isMobileReaderStripChapter(pageCount, sizeAt);
  const alone = (index: number): "wide" | "odd" | null => {
    const size = sizeAt(index);
    if (isMobileReaderWidePage(size)) return "wide";
    if (strip || oddAt?.(index)) return "odd";
    const aspect = aspectOf(size);
    return aspect !== null && aspect < READER_STRIP_PAGE_ASPECT ? "odd" : null;
  };
  const segments: MobileReaderPairingSegment[] = [];
  let start = 0;
  for (let index = 0; index < pageCount; index += 1) {
    const kind = alone(index);
    if (kind) {
      if (start < index) segments.push({ start, end: index, wide: false });
      segments.push(kind === "wide" ? { start: index, end: index + 1, wide: true } : { start: index, end: index + 1, wide: false, odd: true });
      start = index + 1;
      continue;
    }
    const next = index + 1;
    if (next < pageCount && !alone(next) && !mobileReaderPagesPairable(sizeAt(index), sizeAt(next))) {
      segments.push({ start, end: next, wide: false });
      start = next;
    }
  }
  if (start < pageCount) segments.push({ start, end: pageCount, wide: false });
  return segments;
}

/** A page whose colourfulness (`chroma`, the share of pixels off the page's own tint) is below this is black and white. */
export const READER_MONOCHROME_PAGE_CHROMA = 0.05;
/** A page at or above this is a colour page. */
export const READER_COLOUR_PAGE_CHROMA = 0.1;
/** A chapter is black and white when at least this share of its measured pages is (and enough are measured). */
export const READER_MONOCHROME_CHAPTER_SHARE = 0.6;
export const READER_MONOCHROME_CHAPTER_MIN_PAGES = 6;

/**
 * Colour pages inside a black-and-white chapter: a colour cover, a colour
 * insert or a scanlator's credits page. They don't belong to the printed
 * spreads around them, so each stands alone and pairing restarts after it.
 * In a colour chapter no page is odd for its colour. `chromaAt` is null for
 * a page not measured yet.
 */
export function mobileReaderColourOddPages(
  pageCount: number,
  chromaAt: (index: number) => number | null | undefined,
): (index: number) => boolean {
  let measured = 0;
  let monochrome = 0;
  for (let index = 0; index < pageCount; index += 1) {
    const chroma = chromaAt(index);
    if (typeof chroma !== "number" || !Number.isFinite(chroma)) continue;
    measured += 1;
    if (chroma < READER_MONOCHROME_PAGE_CHROMA) monochrome += 1;
  }
  if (measured < READER_MONOCHROME_CHAPTER_MIN_PAGES || monochrome / measured < READER_MONOCHROME_CHAPTER_SHARE) {
    return () => false;
  }
  return (index) => {
    const chroma = chromaAt(index);
    return typeof chroma === "number" && chroma >= READER_COLOUR_PAGE_CHROMA;
  };
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
  if (segment.wide || segment.odd || length <= 1) {
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

/**
 * The chapter's first pair head: the first run of two or more ordinary pages
 * that starts within the opening pages. Credits, colour pages and wide pages
 * before it stand alone, so "the first page alone" means the first page of
 * the chapter proper. -1 when the opening has none.
 */
export function mobileReaderFirstHeadSegment(segments: readonly MobileReaderPairingSegment[]): number {
  return segments.findIndex(
    (segment) => !segment.wide && !segment.odd && segment.end - segment.start >= 2 && segment.start < READER_FIRST_HEAD_WINDOW,
  );
}

function flipParity(parity: MobileReaderSegmentParity): MobileReaderSegmentParity {
  if (typeof parity === "number") return parity === 0 ? 1 : 0;
  return parity.map((state) => (state === 0 ? 1 : 0));
}

/**
 * Where a segment's parity came from, strongest first:
 * - `wide` / `odd`: a lone page;
 * - `anchor`: the opening run ends at a wide page (a printed double page sits
 *   on one opening, so the page before it ends a pair);
 * - `evidence`: binding margins and artwork across the inner edges;
 * - `fallback`: automatic pairing found nothing, the fixed rule stands;
 * - `fixed`: the user chose a fixed rule.
 */
export type MobileReaderSegmentSource = "wide" | "odd" | "anchor" | "evidence" | "fallback" | "fixed";

/** A segment whose parity is known without looking at its pages (inference calibrates on these). */
export type MobileReaderKnownSegmentParity = { segment: MobileReaderPairingSegment; parity: 0 | 1 };

export type MobileReaderPairingInput = {
  pageCount: number;
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined;
  pairing: MobileReaderSpreadPairing;
  /** Pages unlike their neighbours, which stand alone (see `mobileReaderColourOddPages`). */
  oddAt?: (index: number) => boolean;
  /** "Shift by One Page" for this chapter: flips every segment, whatever decided it. */
  shift?: boolean;
  /** The manga's learned shift: flips only the segments the fixed rule decided. */
  fallbackShift?: boolean;
  /**
   * The automatic parity for a segment, or null to fall back to the fixed
   * rule. `known` lists the segments whose parity is certain (after a wide
   * page, before one), to calibrate on. Only consulted for `auto`.
   */
  /**
   * Which segment the fixed rule's "first page alone" applies to: the first
   * run of ordinary pages within the opening (default), or only a run that
   * starts at the chapter's first page (the rule before odd pages existed).
   */
  fallbackHead?: "first-pairable" | "first-page";
  inferParity?: (
    segment: MobileReaderPairingSegment,
    known: readonly MobileReaderKnownSegmentParity[],
  ) => MobileReaderSegmentParity | null;
};

export type MobileReaderPairingResult = {
  spreads: number[][];
  segments: Array<MobileReaderPairingSegment & { source: MobileReaderSegmentSource }>;
};

/** The chapter's spread table, in source order, with where each segment's parity came from. */
export function describeMobileReaderPairing(input: MobileReaderPairingInput): MobileReaderPairingResult {
  const segments = mobileReaderPairingSegments(input.pageCount, input.sizeAt, input.oddAt);
  const head = input.fallbackHead === "first-page"
    ? segments.findIndex((segment) => segment.start === 0 && !segment.wide && !segment.odd)
    : mobileReaderFirstHeadSegment(segments);
  const auto = input.pairing === "auto";
  // Parity known by construction: a run right after a wide page starts a
  // pair (always); the opening run that ends at a wide page ends on a full
  // pair (automatic pairing).
  const anchored = new Map<number, { parity: 0 | 1; physical: boolean }>();
  segments.forEach((segment, index) => {
    if (segment.wide || segment.odd || segment.end - segment.start < 2) return;
    if (segments[index - 1]?.wide) anchored.set(index, { parity: 0, physical: true });
    else if (index === head && segments[index + 1]?.wide) {
      anchored.set(index, { parity: ((segment.end - segment.start) % 2) as 0 | 1, physical: false });
    }
  });
  const known = [...anchored].map(([index, { parity }]) => ({ segment: segments[index]!, parity }));
  const spreads: number[][] = [];
  const described: MobileReaderPairingResult["segments"] = [];
  segments.forEach((segment, index) => {
    if (segment.wide || segment.odd) {
      spreads.push(...mobileReaderSegmentSpreads(segment, 0));
      described.push({ ...segment, source: segment.wide ? "wide" : "odd" });
      return;
    }
    const anchor = anchored.get(index);
    let source: MobileReaderSegmentSource = auto ? "fallback" : "fixed";
    let parity: MobileReaderSegmentParity = index === head && input.pairing !== "cover-paired" ? 1 : 0;
    if (anchor?.physical) {
      // After a wide page the reader's rule and the book agree: pair from the head.
      parity = 0;
    } else if (auto && anchor) {
      parity = anchor.parity;
      source = "anchor";
    } else if (auto) {
      const inferred = input.inferParity?.(segment, known) ?? null;
      if (inferred !== null) {
        parity = inferred;
        source = "evidence";
      }
    }
    if (input.shift || (input.fallbackShift && (source === "fallback" || source === "fixed"))) {
      parity = flipParity(parity);
    }
    spreads.push(...mobileReaderSegmentSpreads(segment, parity));
    described.push({ ...segment, source });
  });
  return { spreads, segments: described };
}

/** The chapter's spread table, in source order. */
export function buildMobileReaderPairedSpreads(input: MobileReaderPairingInput): number[][] {
  return describeMobileReaderPairing(input).spreads;
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
 * `computed` with the `locked` spreads kept exactly as they are: a computed
 * spread that shares a page with a locked one gives that page up (its other
 * page stands alone), so a locked pairing is never split or re-paired. The
 * result is in page order and covers every page of `computed` once.
 */
export function lockMobileReaderSpreads(
  computed: readonly number[][],
  locked: readonly (readonly number[])[],
): number[][] {
  const valid = locked.filter((spread) => spread.length > 0);
  if (valid.length === 0) return computed.map((spread) => [...spread]);
  const lockedPages = new Map<number, readonly number[]>();
  for (const spread of valid) {
    for (const page of spread) lockedPages.set(page, spread);
  }
  const out: number[][] = [];
  const placed = new Set<readonly number[]>();
  for (const spread of computed) {
    let free: number[] = [];
    for (const page of spread) {
      const lock = lockedPages.get(page);
      if (!lock) {
        free.push(page);
        continue;
      }
      if (free.length > 0) {
        out.push(free);
        free = [];
      }
      if (!placed.has(lock)) {
        placed.add(lock);
        out.push([...lock]);
      }
    }
    if (free.length > 0) out.push(free);
  }
  return out;
}

/**
 * The table to show after an update. A new chapter or a pairing the user
 * changed starts over (`reset`). Otherwise a pairing that has been on screen
 * is never re-paired by a later image load:
 * - every spread up to and including the current one stays as it was (the
 *   current one whatever its pages' state: a page found wide later applies
 *   its new pairing from the next turn, never under the reader);
 * - `provisional` (the opening pages are still being measured): the table
 *   may re-pair around the reader, but the spread on screen (`locked`, the
 *   previous table's current spread unless given) is kept as shown;
 * - `locked`: further spreads that were shown (e.g. a backward landing in a
 *   chapter crossed into) and must stay as they are.
 * Sizes that arrive later only adjust the pages not reached yet.
 */
export function nextMobileReaderSpreadTable(input: {
  previous: readonly number[][] | null;
  computed: number[][];
  reset: boolean;
  currentPageIndex: number;
  /** Re-pair everything but the spreads on screen (`locked`). */
  provisional?: boolean;
  /** The previous table is on screen: its current spread is locked. Default true. */
  displayed?: boolean;
  locked?: readonly (readonly number[])[];
}): number[][] {
  const { previous, computed } = input;
  const extra = input.locked ?? [];
  if (input.reset || !previous || previous.length === 0) {
    return extra.length > 0 ? keepTable(computed, lockMobileReaderSpreads(computed, extra)) : computed;
  }
  if (sameMobileReaderSpreads(previous, computed)) return previous as number[][];
  const found = previous.findIndex((spread) => spread.includes(input.currentPageIndex));
  const current = found >= 0 ? found : previous.length - 1;
  const displayed = input.displayed !== false;
  if (input.provisional) {
    const onScreen = displayed && previous[current] ? [previous[current]!] : [];
    const merged = lockMobileReaderSpreads(computed, [...onScreen, ...extra]);
    return keepTable(previous, keepTable(computed, merged));
  }
  const frozen = freezeMobileReaderSpreadsThrough(previous, computed, displayed ? current : current - 1);
  const merged = extra.length > 0 ? lockMobileReaderSpreads(frozen, extra) : frozen;
  return keepTable(previous, merged);
}

/** `candidate`, or `table` itself when they pair the same (identity kept). */
function keepTable(table: readonly number[][], candidate: number[][]): number[][] {
  return sameMobileReaderSpreads(table, candidate) ? (table as number[][]) : candidate;
}
