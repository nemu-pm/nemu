/**
 * Seamless chapter crossing in paged reading (slide and curl, single pages
 * and spreads): the pager holds the chapters around the open one back to
 * back, with no divider, no end page and no remount at a chapter boundary.
 *
 * The open chapter keeps its own (local) page and spread indexes; the pager
 * speaks in frames of the joined list ("global"). Everything here is pure:
 * the joined frames, the mapping between them and a chapter's own frames,
 * crossings and keeping the pager on the same frame when chapters join or
 * leave around it.
 *
 * A neighbour that is still loading (or not fetched yet) stands in as one
 * placeholder frame, so a turn past the open chapter's edge always happens:
 * the reader lands on the placeholder and the chapter replaces it in place.
 *
 * Spreads never pair pages of two chapters: each chapter's spread table is
 * its own, offset into the joined list.
 */

export type MobileReaderPagedStripSegment = {
  chapterId: string;
  /** `placeholder`: a neighbour still loading, one frame of one page. */
  kind: "chapter" | "placeholder";
  /** Pages of the chapter (a placeholder counts as one). */
  pageCount: number;
  /** Two-page reading: the chapter's own spread table (local page indexes). */
  spreads?: readonly (readonly number[])[] | null;
};

export type MobileReaderPagedStrip = {
  segments: readonly MobileReaderPagedStripSegment[];
  /** The open chapter's segment. */
  currentIndex: number;
  twoPage: boolean;
  /** First joined page of each segment, then the page count. */
  pageStarts: readonly number[];
  /** First joined frame of each segment, then the frame count. */
  frameStarts: readonly number[];
  /** Two-page: every spread in joined page indexes; single pages: one page a frame. */
  spreads: readonly (readonly number[])[];
  frameCount: number;
  pageCount: number;
};

export type MobileReaderPagedStripLocation = {
  segmentIndex: number;
  chapterId: string;
  placeholder: boolean;
  /** The frame within its chapter (spread index, or page index). */
  localFrame: number;
  /** The chapter's own pages on that frame (the first one leads). */
  localPages: readonly number[];
};

function segmentPageCount(segment: MobileReaderPagedStripSegment): number {
  return segment.kind === "placeholder" ? 1 : Math.max(0, Math.floor(segment.pageCount));
}

/** One chapter's spreads, checked: every page once, in order; else one page a frame. */
function segmentSpreads(segment: MobileReaderPagedStripSegment, twoPage: boolean): number[][] {
  const count = segmentPageCount(segment);
  const singles = Array.from({ length: count }, (_, index) => [index]);
  if (!twoPage || segment.kind === "placeholder" || !segment.spreads) return singles;
  const flat = segment.spreads.flat();
  if (flat.length !== count || flat.some((page, index) => page !== index)) return singles;
  return segment.spreads.map((spread) => [...spread]);
}

export function buildMobileReaderPagedStrip(input: {
  segments: readonly MobileReaderPagedStripSegment[];
  currentIndex: number;
  twoPage: boolean;
}): MobileReaderPagedStrip {
  const { segments, twoPage } = input;
  const currentIndex = Math.max(0, Math.min(segments.length - 1, Math.floor(input.currentIndex)));
  const pageStarts: number[] = [];
  const frameStarts: number[] = [];
  const spreads: number[][] = [];
  let pages = 0;
  for (const segment of segments) {
    pageStarts.push(pages);
    frameStarts.push(spreads.length);
    const base = pages;
    for (const spread of segmentSpreads(segment, twoPage)) {
      spreads.push(spread.map((page) => page + base));
    }
    pages += segmentPageCount(segment);
  }
  pageStarts.push(pages);
  frameStarts.push(spreads.length);
  return {
    segments,
    currentIndex,
    twoPage,
    pageStarts,
    frameStarts,
    spreads,
    frameCount: spreads.length,
    pageCount: pages,
  };
}

/** The open chapter's first joined frame (add to a local frame). */
export function mobileReaderPagedStripFrameBase(strip: MobileReaderPagedStrip): number {
  return strip.frameStarts[strip.currentIndex] ?? 0;
}

/** The open chapter's first joined page (add to a local page). */
export function mobileReaderPagedStripPageBase(strip: MobileReaderPagedStrip): number {
  return strip.pageStarts[strip.currentIndex] ?? 0;
}

/** Joined frame of a chapter's own frame, or null outside it. */
export function mobileReaderPagedStripGlobalFrame(
  strip: MobileReaderPagedStrip,
  segmentIndex: number,
  localFrame: number,
): number | null {
  const start = strip.frameStarts[segmentIndex];
  const end = strip.frameStarts[segmentIndex + 1];
  if (start == null || end == null || !Number.isFinite(localFrame)) return null;
  const frame = start + Math.floor(localFrame);
  return frame >= start && frame < end ? frame : null;
}

/** What a joined frame shows: its chapter and that chapter's own frame and pages. */
export function mobileReaderPagedStripLocate(
  strip: MobileReaderPagedStrip,
  frame: number,
): MobileReaderPagedStripLocation | null {
  if (strip.frameCount === 0 || !Number.isFinite(frame)) return null;
  const index = Math.max(0, Math.min(strip.frameCount - 1, Math.floor(frame)));
  for (let segmentIndex = 0; segmentIndex < strip.segments.length; segmentIndex += 1) {
    const start = strip.frameStarts[segmentIndex]!;
    const end = strip.frameStarts[segmentIndex + 1]!;
    if (index < start || index >= end) continue;
    const segment = strip.segments[segmentIndex]!;
    const pageBase = strip.pageStarts[segmentIndex]!;
    return {
      segmentIndex,
      chapterId: segment.chapterId,
      placeholder: segment.kind === "placeholder",
      localFrame: index - start,
      localPages: (strip.spreads[index] ?? []).map((page) => page - pageBase),
    };
  }
  return null;
}

/** The chapter (and its own page) a joined page belongs to. */
export function mobileReaderPagedStripLocatePage(
  strip: MobileReaderPagedStrip,
  page: number,
): { segmentIndex: number; localPage: number } | null {
  if (!Number.isFinite(page) || page < 0 || page >= strip.pageCount) return null;
  for (let segmentIndex = 0; segmentIndex < strip.segments.length; segmentIndex += 1) {
    const start = strip.pageStarts[segmentIndex]!;
    const end = strip.pageStarts[segmentIndex + 1]!;
    if (page >= start && page < end) return { segmentIndex, localPage: Math.floor(page) - start };
  }
  return null;
}

/**
 * A settled frame outside the open chapter: the chapter it belongs to and
 * the direction of the crossing (null while it stays in the open chapter).
 */
export function mobileReaderPagedStripCrossing(
  strip: MobileReaderPagedStrip,
  frame: number,
): (MobileReaderPagedStripLocation & { direction: "forward" | "backward" }) | null {
  const located = mobileReaderPagedStripLocate(strip, frame);
  if (!located || located.segmentIndex === strip.currentIndex) return null;
  return {
    ...located,
    direction: located.segmentIndex > strip.currentIndex ? "forward" : "backward",
  };
}

/**
 * The frame to keep the pager on after the joined list changed around it
 * (a chapter joined, a placeholder became its chapter, a chapter was dropped,
 * a crossing re-based the list): the same chapter's same frame. A
 * placeholder that became its chapter lands on that chapter's edge next to
 * the chapter the reader came from (its last frame before, its first after).
 * A frame whose chapter left the list lands on the nearest frame of the
 * chapter next to it on the reader's side.
 */
export function mobileReaderPagedStripReanchor(
  before: MobileReaderPagedStrip,
  after: MobileReaderPagedStrip,
  frame: number,
): number {
  if (after.frameCount === 0) return 0;
  const located = mobileReaderPagedStripLocate(before, frame);
  if (!located) return Math.max(0, Math.min(after.frameCount - 1, Math.floor(frame)));
  const at = after.segments.findIndex((segment) => segment.chapterId === located.chapterId);
  if (at >= 0) {
    const start = after.frameStarts[at]!;
    const end = after.frameStarts[at + 1]!;
    const size = end - start;
    if (size <= 0) return Math.max(0, Math.min(after.frameCount - 1, start));
    const target = after.segments[at]!;
    if (located.placeholder && target.kind === "chapter") {
      // The neighbour arrived: its edge facing the open chapter.
      return located.segmentIndex < before.currentIndex ? end - 1 : start;
    }
    if (!located.placeholder && target.kind === "chapter" && before.twoPage === after.twoPage) {
      // Same chapter, its own frame (its table may have grown or re-paired
      // ahead: the spread holding the frame's leading page).
      const leading = located.localPages[0];
      if (leading != null && after.twoPage) {
        const pageBase = after.pageStarts[at]!;
        for (let index = start; index < end; index += 1) {
          if (after.spreads[index]!.includes(leading + pageBase)) return index;
        }
      }
    }
    return start + Math.min(size - 1, located.localFrame);
  }
  // The chapter left the list: the nearest frame on the reader's side.
  const anchorChapter = before.segments[before.currentIndex]?.chapterId;
  const open = after.segments.findIndex((segment) => segment.chapterId === anchorChapter);
  if (open >= 0) {
    return located.segmentIndex < before.currentIndex
      ? after.frameStarts[open]!
      : after.frameStarts[open + 1]! - 1;
  }
  return Math.max(0, Math.min(after.frameCount - 1, Math.floor(frame)));
}

/** Same frames, same pages per frame, same chapters: nothing for the pager to do. */
export function sameMobileReaderPagedStripFrames(
  a: MobileReaderPagedStrip | null,
  b: MobileReaderPagedStrip | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.frameCount !== b.frameCount || a.segments.length !== b.segments.length) return false;
  for (let index = 0; index < a.segments.length; index += 1) {
    const x = a.segments[index]!;
    const y = b.segments[index]!;
    if (x.chapterId !== y.chapterId || x.kind !== y.kind) return false;
    if (a.frameStarts[index] !== b.frameStarts[index]) return false;
  }
  return a.spreads.every((spread, index) => {
    const other = b.spreads[index];
    return other != null && other.length === spread.length && spread.every((page, k) => page === other[k]);
  });
}

/** A placeholder page's id in the joined list (one per loading neighbour). */
export function mobileReaderPagedStripPlaceholderKey(chapterId: string): string {
  return `strip:${chapterId}:loading`;
}

export function isMobileReaderPagedStripPlaceholderKey(key: string): boolean {
  return key.startsWith("strip:") && key.endsWith(":loading");
}

/**
 * In the open chapter's first pages (and nothing joined before it yet): warm
 * the previous chapter (its page list and last images), so a turn back from
 * p1 lands on a drawn page.
 */
export const MOBILE_READER_PAGED_STRIP_PREVIOUS_WARM_PAGES = 2;

export function shouldWarmMobileReaderPagedStripPrevious(
  localPageIndex: number,
  lead = MOBILE_READER_PAGED_STRIP_PREVIOUS_WARM_PAGES,
): boolean {
  return Number.isFinite(localPageIndex) && localPageIndex >= 0 && localPageIndex < lead;
}
