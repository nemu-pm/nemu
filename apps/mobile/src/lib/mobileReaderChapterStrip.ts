import {
  buildMobileReaderScrollLayout,
  type MobileReaderScrollLayout,
} from "./mobileReaderScrollLayout";

/**
 * Seamless chapter continuation (scroll reading): the vertical list holds up
 * to three chapters back to back, a divider between each pair. The reader
 * state (toolbar, counter, progress) follows the chapter that owns the
 * screen's centre; the list itself never remounts at a chapter boundary.
 *
 * Everything here is pure: rows, keys, the combined layout and the mapping
 * between list ("global") rows and a chapter's own ("local") page indexes.
 */

/**
 * Seamless continuation in scroll mode (the only mode it applies to: paged,
 * two-page and single long-strip chapters always turn chapters as before).
 * Off: a chapter's end shows the end-of-chapter prompt and the next chapter
 * opens with a route replace, exactly as before.
 */
export const readerSeamlessScroll = true;

/**
 * How the chapter above joins the list.
 * - `auto`: fetched as soon as the reader is in the open chapter's first
 *   pages, spliced at rest.
 * - `pull`: never fetched on its own; only a pull past the very top of p1
 *   (see mobileReaderStripPull) fetches it, and it is inserted above with
 *   the screen kept where it is.
 */
export type MobileReaderStripPrependMode = "auto" | "pull";
export const MOBILE_READER_STRIP_PREPEND_MODE: MobileReaderStripPrependMode = "auto";

/** The divider's own box (two centred lines). */
export const MOBILE_READER_STRIP_DIVIDER_HEIGHT = 64;
/** Space above and below the divider's box. */
export const MOBILE_READER_STRIP_DIVIDER_MARGIN = 24;
/** The divider's whole list cell: 24 + 64 + 24. */
export const MOBILE_READER_STRIP_DIVIDER_CELL =
  MOBILE_READER_STRIP_DIVIDER_MARGIN * 2 + MOBILE_READER_STRIP_DIVIDER_HEIGHT;
/** Chapters held in the list at once. */
export const MOBILE_READER_STRIP_MAX_SEGMENTS = 3;
/** The next chapter is fetched once the reader is within this many pages of the end. */
export const MOBILE_READER_STRIP_APPEND_LEAD_PAGES = 3;
/** The previous chapter is joined once the reader is within this many pages of the start. */
export const MOBILE_READER_STRIP_PREPEND_LEAD_PAGES = 3;
/** Images of a freshly joined chapter decoded ahead of the reader. */
export const MOBILE_READER_STRIP_WARM_PAGE_COUNT = 4;

const KEY_SEPARATOR = "\u0001";

export type MobileReaderStripChapter = { id: string };
export type MobileReaderStripPage = { id: string };

export type MobileReaderStripSegment<
  C extends MobileReaderStripChapter = MobileReaderStripChapter,
  P extends MobileReaderStripPage = MobileReaderStripPage,
> = {
  chapter: C;
  pages: readonly P[];
};

/**
 * What follows the last chapter in the list:
 * - `next`: the next chapter exists but is not in the list (yet). `loading`
 *   while its pages are fetched, `failed` / `locked` when they can't be.
 * - `end`: there is no next chapter; the divider says the reader is caught up.
 * - `null`: nothing (the chapter index is not known yet).
 */
export type MobileReaderStripTail<C extends MobileReaderStripChapter = MobileReaderStripChapter> =
  | { kind: "next"; chapter: C; status: "idle" | "loading" | "failed" | "locked" }
  | { kind: "end" }
  | null;

export type MobileReaderStrip<
  C extends MobileReaderStripChapter = MobileReaderStripChapter,
  P extends MobileReaderStripPage = MobileReaderStripPage,
> = {
  segments: readonly MobileReaderStripSegment<C, P>[];
  /** The segment the reader state belongs to. */
  currentIndex: number;
  tail: MobileReaderStripTail<C>;
};

export type MobileReaderStripRow<
  C extends MobileReaderStripChapter = MobileReaderStripChapter,
  P extends MobileReaderStripPage = MobileReaderStripPage,
> =
  | {
      kind: "page";
      key: string;
      segmentIndex: number;
      localIndex: number;
      page: P;
    }
  | {
      kind: "divider";
      key: string;
      /** The segment above the divider (it owns the divider's rows). */
      segmentIndex: number;
      /** `next`: the chapter below; `end`: caught up. */
      variant: "next" | "end";
      /** The chapter the divider announces (`next` only). */
      chapter: C | null;
      /** `next` dividers past the last segment: the announced chapter's state. */
      status: "ready" | "idle" | "loading" | "failed" | "locked";
    };

/** A page's list identity: unique across chapters (page ids are not). */
export function mobileReaderStripPageKey(chapterId: string, pageId: string): string {
  return `${chapterId}${KEY_SEPARATOR}${pageId}`;
}

/** The divider above `nextChapterId` (or the caught-up divider). */
export function mobileReaderStripDividerKey(nextChapterId: string | null): string {
  return `divider${KEY_SEPARATOR}${nextChapterId ?? "end"}`;
}

export function isMobileReaderStripDividerKey(key: string): boolean {
  return key.startsWith(`divider${KEY_SEPARATOR}`);
}

/**
 * The list's rows: each segment's pages, a divider between segments, and the
 * tail divider after the last one.
 */
export function mobileReaderStripRows<C extends MobileReaderStripChapter, P extends MobileReaderStripPage>(
  strip: MobileReaderStrip<C, P>,
): MobileReaderStripRow<C, P>[] {
  const rows: MobileReaderStripRow<C, P>[] = [];
  const { segments } = strip;
  segments.forEach((segment, segmentIndex) => {
    segment.pages.forEach((page, localIndex) => {
      rows.push({
        kind: "page",
        key: mobileReaderStripPageKey(segment.chapter.id, page.id),
        segmentIndex,
        localIndex,
        page,
      });
    });
    const following = segments[segmentIndex + 1];
    if (following) {
      rows.push({
        kind: "divider",
        key: mobileReaderStripDividerKey(following.chapter.id),
        segmentIndex,
        variant: "next",
        chapter: following.chapter,
        status: "ready",
      });
    }
  });
  const tail = strip.tail;
  if (segments.length > 0 && tail) {
    const last = segments.length - 1;
    rows.push(
      tail.kind === "end"
        ? {
            kind: "divider",
            key: mobileReaderStripDividerKey(null),
            segmentIndex: last,
            variant: "end",
            chapter: null,
            status: "ready",
          }
        : {
            kind: "divider",
            key: mobileReaderStripDividerKey(tail.chapter.id),
            segmentIndex: last,
            variant: "next",
            chapter: tail.chapter,
            status: tail.status,
          },
    );
  }
  return rows;
}

/** First row of each segment (and, last, the row count). */
export function mobileReaderStripSegmentStarts(
  rows: readonly MobileReaderStripRow[],
  segmentCount: number,
): number[] {
  const starts = new Array<number>(segmentCount + 1).fill(-1);
  rows.forEach((row, index) => {
    if (row.kind === "page" && starts[row.segmentIndex] === -1) {
      starts[row.segmentIndex] = index;
    }
  });
  starts[segmentCount] = rows.length;
  // An empty segment starts where the next one does.
  for (let index = segmentCount - 1; index >= 0; index -= 1) {
    if (starts[index] === -1) starts[index] = starts[index + 1]!;
  }
  return starts;
}

/** Global row of page `localIndex` in segment `segmentIndex`, or null. */
export function mobileReaderStripGlobalIndex(
  rows: readonly MobileReaderStripRow[],
  starts: readonly number[],
  segmentIndex: number,
  localIndex: number,
): number | null {
  const start = starts[segmentIndex];
  if (start == null || start < 0 || !Number.isFinite(localIndex)) return null;
  const row = rows[start + Math.floor(localIndex)];
  return row?.kind === "page" && row.segmentIndex === segmentIndex
    ? start + Math.floor(localIndex)
    : null;
}

/**
 * The chapter page a global row stands for. A divider belongs to the chapter
 * above it (its last page): the reader has not entered the next chapter until
 * the divider has passed the screen's centre.
 */
export function mobileReaderStripLocate(
  rows: readonly MobileReaderStripRow[],
  strip: Pick<MobileReaderStrip, "segments">,
  globalIndex: number,
): { segmentIndex: number; localIndex: number } | null {
  if (!Number.isFinite(globalIndex) || rows.length === 0) return null;
  const index = Math.max(0, Math.min(rows.length - 1, Math.floor(globalIndex)));
  const row = rows[index]!;
  if (row.kind === "page") {
    return { segmentIndex: row.segmentIndex, localIndex: row.localIndex };
  }
  const pages = strip.segments[row.segmentIndex]?.pages.length ?? 0;
  return { segmentIndex: row.segmentIndex, localIndex: Math.max(0, pages - 1) };
}

/** One segment's own page layout (heights + gaps, as the reader builds it). */
export type MobileReaderStripSegmentLayout = Pick<
  MobileReaderScrollLayout,
  "heights" | "gaps" | "known"
>;

/**
 * The list's layout: every segment's layout back to back, the divider cells
 * between them. Within a segment the gaps are the segment's own; the first
 * page after a divider meets it without a gap (the divider has its margins).
 */
export function combineMobileReaderStripLayouts(
  rows: readonly MobileReaderStripRow[],
  segmentLayouts: readonly (MobileReaderStripSegmentLayout | null | undefined)[],
  dividerCell = MOBILE_READER_STRIP_DIVIDER_CELL,
): MobileReaderScrollLayout {
  const heights: number[] = [];
  const gaps: number[] = [];
  const known: boolean[] = [];
  let previousKind: MobileReaderStripRow["kind"] | null = null;
  for (const row of rows) {
    if (row.kind === "divider") {
      heights.push(dividerCell);
      gaps.push(0);
      known.push(true);
    } else {
      const layout = segmentLayouts[row.segmentIndex];
      heights.push(layout?.heights[row.localIndex] ?? 0);
      gaps.push(
        previousKind === "divider" || heights.length === 1
          ? 0
          : (layout?.gaps[row.localIndex] ?? 0),
      );
      known.push(layout ? (layout.known ? layout.known[row.localIndex] === true : true) : false);
    }
    previousKind = row.kind;
  }
  return buildMobileReaderScrollLayout(heights, gaps, 0, known);
}

/**
 * Where segment `segmentIndex` starts in the combined layout (content
 * coordinates), i.e. what to subtract from a list offset to get the offset
 * inside that chapter's own layout.
 */
export function mobileReaderStripSegmentOffset(
  layout: MobileReaderScrollLayout,
  starts: readonly number[],
  segmentIndex: number,
): number {
  const start = starts[segmentIndex];
  if (start == null || start < 0) return 0;
  if (start >= layout.starts.length) return layout.length;
  return layout.starts[start]!;
}

/**
 * The chapter the screen's centre is in, as a crossing: null while the centre
 * stays in the current chapter.
 */
export function mobileReaderStripCrossing(
  rows: readonly MobileReaderStripRow[],
  strip: Pick<MobileReaderStrip, "segments" | "currentIndex">,
  centreGlobalIndex: number,
): { segmentIndex: number; localIndex: number; direction: "forward" | "backward" } | null {
  const located = mobileReaderStripLocate(rows, strip, centreGlobalIndex);
  if (!located || located.segmentIndex === strip.currentIndex) return null;
  return {
    ...located,
    direction: located.segmentIndex > strip.currentIndex ? "forward" : "backward",
  };
}

/** In the last pages of the last chapter in the list: fetch the next one. */
export function shouldAppendMobileReaderStripSegment(
  localIndex: number,
  pageCount: number,
  lead = MOBILE_READER_STRIP_APPEND_LEAD_PAGES,
): boolean {
  if (!(pageCount > 0) || !Number.isFinite(localIndex)) return false;
  return localIndex >= pageCount - lead;
}

/** In the first pages of the first chapter in the list: join the previous one. */
export function shouldPrependMobileReaderStripSegment(
  localIndex: number,
  hasPreviousChapter: boolean,
  lead = MOBILE_READER_STRIP_PREPEND_LEAD_PAGES,
): boolean {
  if (!hasPreviousChapter || !Number.isFinite(localIndex)) return false;
  return localIndex < lead;
}

/**
 * A fetched previous chapter is spliced in above the open one only when that
 * is safe: the list is at rest (no drag, no fling — rows inserted under a
 * moving list are measured against the wrong rows), the reader's gate still
 * allows a prepend (no seek, no landing) and the reading line is still in the
 * open chapter's first pages. Otherwise it waits (see `flushPrevious`).
 */
export function shouldSpliceMobileReaderStripPrevious(input: {
  /** No drag or momentum in progress. */
  atRest: boolean;
  /** The reader's prepend gate, checked now (not when the fetch started). */
  canPrepend: boolean;
  /** The reading line's open-chapter page; null when it is outside the open chapter. */
  localIndex: number | null;
  lead?: number;
}): boolean {
  const { atRest, canPrepend, localIndex, lead = MOBILE_READER_STRIP_PREPEND_LEAD_PAGES } = input;
  if (!atRest || !canPrepend || localIndex == null) return false;
  return shouldPrependMobileReaderStripSegment(localIndex, true, lead);
}

/** Pages of the first chapter to decode as soon as it joins the list. */
export function mobileReaderStripWarmIndexes(
  pageCount: number,
  count = MOBILE_READER_STRIP_WARM_PAGE_COUNT,
): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < Math.min(pageCount, count); index += 1) indexes.push(index);
  return indexes;
}

/** The chapter after the list's last one joins the list. */
export function appendMobileReaderStripSegment<C extends MobileReaderStripChapter, P extends MobileReaderStripPage>(
  strip: MobileReaderStrip<C, P>,
  segment: MobileReaderStripSegment<C, P>,
  tail: MobileReaderStripTail<C>,
): MobileReaderStrip<C, P> {
  if (strip.segments.some((existing) => existing.chapter.id === segment.chapter.id)) {
    return strip;
  }
  return {
    segments: [...strip.segments, segment],
    currentIndex: strip.currentIndex,
    tail,
  };
}

/** The chapter before the list's first one joins the list (above it). */
export function prependMobileReaderStripSegment<C extends MobileReaderStripChapter, P extends MobileReaderStripPage>(
  strip: MobileReaderStrip<C, P>,
  segment: MobileReaderStripSegment<C, P>,
): MobileReaderStrip<C, P> {
  if (strip.segments.some((existing) => existing.chapter.id === segment.chapter.id)) {
    return strip;
  }
  return {
    segments: [segment, ...strip.segments],
    currentIndex: strip.currentIndex + 1,
    tail: strip.tail,
  };
}

/**
 * Drops the segments more than one chapter away from the current one, keeping
 * at most `max`. Returns the dropped segments (their processors are the
 * caller's to dispose) and how many rows left above the current chapter, so a
 * caller can compensate the list offset if the platform does not.
 */
export function pruneMobileReaderStrip<C extends MobileReaderStripChapter, P extends MobileReaderStripPage>(
  strip: MobileReaderStrip<C, P>,
  max = MOBILE_READER_STRIP_MAX_SEGMENTS,
): {
  strip: MobileReaderStrip<C, P>;
  removedHead: MobileReaderStripSegment<C, P>[];
  removedTail: MobileReaderStripSegment<C, P>[];
} {
  const radius = 1;
  let from = Math.max(0, strip.currentIndex - radius);
  let to = Math.min(strip.segments.length - 1, strip.currentIndex + radius);
  // Never more than `max` (a smaller max trims the far side first).
  while (to - from + 1 > Math.max(1, max)) {
    if (strip.currentIndex - from >= to - strip.currentIndex) from += 1;
    else to -= 1;
  }
  if (from === 0 && to === strip.segments.length - 1) {
    return { strip, removedHead: [], removedTail: [] };
  }
  return {
    strip: {
      segments: strip.segments.slice(from, to + 1),
      currentIndex: strip.currentIndex - from,
      tail: to === strip.segments.length - 1 ? strip.tail : null,
    },
    removedHead: strip.segments.slice(0, from),
    removedTail: strip.segments.slice(to + 1),
  };
}

/**
 * Rows and content height a head prune removes from above the screen. The
 * removed rows are every row before the first kept segment (its pages and
 * the divider below them).
 */
export function mobileReaderStripHeadRemoval(
  layout: MobileReaderScrollLayout,
  starts: readonly number[],
  removedSegmentCount: number,
): { rows: number; height: number } {
  if (removedSegmentCount <= 0) return { rows: 0, height: 0 };
  const firstKept = starts[removedSegmentCount];
  if (firstKept == null || firstKept <= 0) return { rows: 0, height: 0 };
  return {
    rows: firstKept,
    height: firstKept >= layout.starts.length ? layout.length : layout.starts[firstKept]!,
  };
}

/**
 * Whether a head prune would touch anything on screen: every removed row must
 * end above the screen's top (content coordinates of the list's layout).
 */
export function isMobileReaderStripHeadRemovalOffscreen(
  removal: { rows: number; height: number },
  viewportTop: number,
): boolean {
  if (removal.rows <= 0) return true;
  return Number.isFinite(viewportTop) && removal.height <= viewportTop;
}

/** Make the segment at `segmentIndex` the current one (a crossing). */
export function rebaseMobileReaderStrip<C extends MobileReaderStripChapter, P extends MobileReaderStripPage>(
  strip: MobileReaderStrip<C, P>,
  segmentIndex: number,
): MobileReaderStrip<C, P> {
  if (
    segmentIndex === strip.currentIndex ||
    segmentIndex < 0 ||
    segmentIndex >= strip.segments.length
  ) {
    return strip;
  }
  return { ...strip, currentIndex: segmentIndex };
}
