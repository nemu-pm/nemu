import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  combineMobileReaderStripLayouts,
  mobileReaderStripCrossing,
  mobileReaderStripRows,
  mobileReaderStripSegmentOffset,
  mobileReaderStripSegmentStarts,
  prependMobileReaderStripSegment,
  shouldPrependMobileReaderStripSegment,
  shouldSpliceMobileReaderStripPrevious,
  type MobileReaderStrip,
} from "./mobileReaderChapterStrip";
import { chooseMobileReaderResumePosition } from "./mobileReaderResumePosition";
import {
  buildMobileReaderScrollLayout,
  mobileReaderScrollAnchorForOffset,
  mobileReaderScrollCentrePageIndex,
  mobileReaderScrollOffsetForAnchor,
  type MobileReaderScrollLayout,
} from "./mobileReaderScrollLayout";
import {
  isMobileReaderStripPlacementOff,
  mobileReaderStripBridgeLocalAnchor,
  mobileReaderStripBridgeOpenAnchor,
  mobileReaderStripHeadRowShift,
  mobileReaderStripHeadShiftOffset,
  resolveMobileReaderScrollEventOffset,
  shiftMobileReaderRowIndex,
  shiftMobileReaderScrollAnchorRows,
  type MobileReaderStripBridge,
} from "./mobileReaderStripBridge";

function readSource(relativePath: string) {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

// Tower of God: many short slices. A slice is 300pt tall, the screen 900pt:
// the first three pages (the prepend lead) are less than one screen.
type Chapter = { id: string };
type Page = { id: string };
const SLICE = 300;
const VIEWPORT = 900;
const CHROME = 0;
const OPEN = { id: "ch641" };
const PREVIOUS = { id: "ch640" };
const OPEN_PAGES = 200;
const PREVIOUS_PAGES = 150;

function pagesOf(count: number): Page[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${index}:p` }));
}

function chapterLayout(count: number): MobileReaderScrollLayout {
  return buildMobileReaderScrollLayout(new Array(count).fill(SLICE), new Array(count).fill(0), 0);
}

/** The list as the reader renders it: rows, combined layout, the bridge. */
function listOf(strip: MobileReaderStrip<Chapter, Page>) {
  const rows = mobileReaderStripRows(strip);
  const starts = mobileReaderStripSegmentStarts(rows, strip.segments.length);
  const layout = combineMobileReaderStripLayouts(
    rows,
    strip.segments.map((segment) => chapterLayout(segment.pages.length)),
  );
  const bridge: MobileReaderStripBridge = {
    indexBase: starts[strip.currentIndex] ?? 0,
    offsetBase: mobileReaderStripSegmentOffset(layout, starts, strip.currentIndex),
    localCount: strip.segments[strip.currentIndex]!.pages.length,
  };
  return { strip, rows, keys: rows.map((row) => row.key), layout, bridge };
}

/** What the gallery keeps from a scroll event (row terms). */
function measure(list: ReturnType<typeof listOf>, offset: number) {
  return {
    anchor: mobileReaderScrollAnchorForOffset(list.layout, offset),
    centre: mobileReaderScrollCentrePageIndex(list.layout, offset, VIEWPORT, CHROME),
  };
}

/** The resume save: the open chapter's spot, or nothing (never clamped). */
function resumeSave(list: ReturnType<typeof listOf>, galleryAnchor: ReturnType<typeof measure>["anchor"]) {
  const local = mobileReaderStripBridgeOpenAnchor(list.bridge, galleryAnchor);
  return local ? { chapterId: list.strip.segments[list.strip.currentIndex]!.chapter.id, ...local } : null;
}

describe("seamless scroll: fresh open of an unread chapter (ToG) and a prepend mid-fling", () => {
  test("open at p1, drag, the previous chapter resolves mid-fling: no crossing, no wrong-chapter save", () => {
    // Unread, nothing saved: the chapter opens at the top of p1.
    expect(chooseMobileReaderResumePosition({ local: null, progress: null, pageCount: OPEN_PAGES })).toBeNull();
    let list = listOf({ segments: [{ chapter: OPEN, pages: pagesOf(OPEN_PAGES) }], currentIndex: 0, tail: null });
    let offset = 0;
    expect(measure(list, offset).anchor).toEqual({ pageIndex: 0, fraction: 0 });

    // Drag 1: the reading line on p3 — the previous chapter is fetched.
    let scrolling = true;
    offset = 2 * SLICE + 30;
    let seen = measure(list, offset);
    expect(shouldPrependMobileReaderStripSegment(seen.anchor!.pageIndex, true)).toBe(true);

    // The fetch resolves mid-fling (the list is still moving): held.
    offset = 2 * SLICE + 90;
    seen = measure(list, offset);
    const atResolve = shouldSpliceMobileReaderStripPrevious({
      atRest: !scrolling,
      canPrepend: true,
      localIndex: mobileReaderStripBridgeOpenAnchor(list.bridge, seen.anchor)?.pageIndex ?? null,
    });
    expect(atResolve).toBe(false);

    // The fling goes on over the held chapter: the rows never moved, so
    // every report is the open chapter's own page.
    for (offset = 2 * SLICE + 90; offset <= 40 * SLICE; offset += 137) {
      seen = measure(list, offset);
      expect(mobileReaderStripCrossing(list.rows, list.strip, seen.centre!)).toBeNull();
      expect(resumeSave(list, seen.anchor)?.chapterId).toBe(OPEN.id);
    }
    // It rests past the lead pages: still held (never spliced far down).
    scrolling = false;
    expect(
      shouldSpliceMobileReaderStripPrevious({
        atRest: !scrolling,
        canPrepend: true,
        localIndex: mobileReaderStripBridgeOpenAnchor(list.bridge, measure(list, offset).anchor)?.pageIndex ?? null,
      }),
    ).toBe(false);

    // Drag 2 back to p2, the list rests there: the held chapter is spliced.
    scrolling = true;
    offset = SLICE + 40;
    scrolling = false;
    const restAnchor = measure(list, offset).anchor!;
    const local = mobileReaderStripBridgeOpenAnchor(list.bridge, restAnchor)!;
    expect(local.pageIndex).toBe(1);
    expect(
      shouldSpliceMobileReaderStripPrevious({ atRest: !scrolling, canPrepend: true, localIndex: local.pageIndex }),
    ).toBe(true);
    const before = list;
    list = listOf(
      prependMobileReaderStripSegment(before.strip, { chapter: PREVIOUS, pages: pagesOf(PREVIOUS_PAGES) }) as MobileReaderStrip<
        Chapter,
        Page
      >,
    );

    // The gallery moves its anchors with the inserted head rows (same commit).
    const rows = mobileReaderStripHeadRowShift(before.keys, list.keys)!;
    expect(rows).toBe(PREVIOUS_PAGES + 1);
    const shiftedAnchor = shiftMobileReaderScrollAnchorRows(restAnchor, rows);
    const shiftedCentre = shiftMobileReaderRowIndex(measure(before, offset).centre, rows)!;
    expect(mobileReaderStripBridgeOpenAnchor(list.bridge, shiftedAnchor)).toEqual(local);
    expect(mobileReaderStripCrossing(list.rows, list.strip, shiftedCentre)).toBeNull();

    // A scroll event still on its way carries the old offset. Measured as it
    // comes against the new rows it would be deep in the previous chapter...
    const staleOld = measure(list, offset + 12);
    expect(mobileReaderStripCrossing(list.rows, list.strip, staleOld.centre!)?.direction).toBe("backward");
    // ... and the clamped anchor would be saved as the previous chapter's
    // last page — the bug. The open-chapter anchor refuses it instead.
    expect(mobileReaderStripBridgeLocalAnchor({ ...list.bridge, indexBase: 0, localCount: PREVIOUS_PAGES }, { pageIndex: 400, fraction: 0.2 }))
      .toEqual({ pageIndex: PREVIOUS_PAGES - 1, fraction: 1 });
    expect(resumeSave(list, staleOld.anchor)).toBeNull();

    // With the head shift the event is measured where those rows are now.
    const shiftOffset = mobileReaderStripHeadShiftOffset(before.layout.starts, list.layout.starts, rows);
    expect(shiftOffset).toBe(list.bridge.offsetBase);
    let shift: Parameters<typeof resolveMobileReaderScrollEventOffset>[0] = {
      offset: shiftOffset,
      lastOffset: offset,
      until: 1_000,
    };
    const stale = resolveMobileReaderScrollEventOffset(shift, offset + 12, 10);
    expect(stale.offset).toBe(offset + 12 + shiftOffset);
    shift = stale.shift;
    const staleSeen = measure(list, stale.offset);
    expect(mobileReaderStripCrossing(list.rows, list.strip, staleSeen.centre!)).toBeNull();
    expect(resumeSave(list, staleSeen.anchor)).toEqual({ chapterId: OPEN.id, pageIndex: 1, fraction: expect.any(Number) });

    // The native correction arrives: taken as it comes, the window ends.
    const corrected = resolveMobileReaderScrollEventOffset(shift, offset + 14 + shiftOffset, 20);
    expect(corrected).toEqual({ offset: offset + 14 + shiftOffset, shift: null });
    const settled = measure(list, corrected.offset);
    expect(mobileReaderStripCrossing(list.rows, list.strip, settled.centre!)).toBeNull();
    expect(resumeSave(list, settled.anchor)?.chapterId).toBe(OPEN.id);
    expect(resumeSave(list, settled.anchor)?.pageIndex).toBe(1);

    // The placement check: on the expected spot, nothing to put back.
    const expectedOffset = mobileReaderScrollOffsetForAnchor(list.layout, list.bridge.indexBase + local.pageIndex, local.fraction);
    expect(
      isMobileReaderStripPlacementOff({ currentOffset: corrected.offset, expectedOffset, viewportHeight: VIEWPORT }),
    ).toBe(false);
    // The list not corrected natively at all (the old offset): put back.
    expect(isMobileReaderStripPlacementOff({ currentOffset: offset, expectedOffset, viewportHeight: VIEWPORT })).toBe(true);
  });

  test("a stale anchor is never saved, never read as a same-chapter page further on", () => {
    const before = listOf({ segments: [{ chapter: OPEN, pages: pagesOf(OPEN_PAGES) }], currentIndex: 0, tail: null });
    const after = listOf(
      prependMobileReaderStripSegment(before.strip, { chapter: PREVIOUS, pages: pagesOf(95) }) as MobileReaderStrip<Chapter, Page>,
    );
    const rows = mobileReaderStripHeadRowShift(before.keys, after.keys)!;
    // An anchor already in the new rows read through the old bridge would be
    // ~p97 of the same chapter (the forward jump); shifted rows keep p2.
    const oldAnchor = { pageIndex: 1, fraction: 0.3 };
    expect(mobileReaderStripBridgeOpenAnchor(before.bridge, { pageIndex: 1 + rows, fraction: 0.3 })?.pageIndex).toBe(97);
    expect(mobileReaderStripBridgeOpenAnchor(after.bridge, shiftMobileReaderScrollAnchorRows(oldAnchor, rows))).toEqual(
      oldAnchor,
    );
    // A held seek / index scroll in old rows moves with them; a row removed
    // with the head drops it.
    expect(shiftMobileReaderRowIndex(1, rows)).toBe(1 + rows);
    expect(shiftMobileReaderRowIndex(10, -rows)).toBeNull();
    expect(mobileReaderStripHeadRowShift(after.keys, before.keys)).toBe(-rows);
    expect(mobileReaderStripHeadRowShift(before.keys, before.keys)).toBe(0);
    expect(mobileReaderStripHeadRowShift(["x"], before.keys)).toBeNull();
  });

  test("the splice waits for rest, the gate and the lead pages", () => {
    expect(shouldSpliceMobileReaderStripPrevious({ atRest: true, canPrepend: true, localIndex: 0 })).toBe(true);
    expect(shouldSpliceMobileReaderStripPrevious({ atRest: false, canPrepend: true, localIndex: 0 })).toBe(false);
    expect(shouldSpliceMobileReaderStripPrevious({ atRest: true, canPrepend: false, localIndex: 0 })).toBe(false);
    expect(shouldSpliceMobileReaderStripPrevious({ atRest: true, canPrepend: true, localIndex: 3 })).toBe(false);
    expect(shouldSpliceMobileReaderStripPrevious({ atRest: true, canPrepend: true, localIndex: null })).toBe(false);
  });
});

describe("seamless scroll: the prepend wiring", () => {
  const reader = readSource("screens/ReaderScreen.tsx");
  const strip = readSource("components/reader/useReaderChapterStrip.ts");
  const gallery = readSource("components/reader/MobileReaderGallery.tsx");

  test("a fetched previous chapter is held and spliced only through the safe check", () => {
    const fetch = block(strip, "const fetchSegment = useCallback(", "// Prepend: in the first pages");
    expect(fetch).toMatch(/if \(side === "previous"\) \{[\s\S]*?heldPreviousRef\.current = \{ run, segment \};\s*flushPrevious\(\);\s*return;/);
    const flush = block(strip, "const flushPrevious = useCallback(", "const fetchSegment = useCallback(");
    expect(flush).toContain("if (!canSplicePreviousRef.current()) {");
    expect(flush).toContain('spliceSegment(held.segment.chapter, held.segment, "previous");');
    expect(flush).toContain('logPrepend(held.logged ? "applied (flushed)" : "applied", held.segment);');
    expect(flush).toContain('logPrepend("deferred", held.segment);');
    expect(strip).toContain("`[reader-strip] prepend ${event} chapter=");
    // Rechecks (a drag, a landed seek) flush a held chapter, never fetch it again.
    expect(strip).toMatch(/if \(heldPreviousRef\.current\) \{\s*flushPrevious\(\);\s*return;\s*\}/);
  });

  test("the reader's splice gate: at rest, the prepend gate now, the open chapter's lead pages", () => {
    expect(reader).toContain("canSplicePrevious: readerStripCanSplicePrevious,");
    const gate = block(reader, "readerStripCanSplicePreviousRef.current = () =>", "readerStripHeadOffscreenRef.current");
    expect(gate).toContain("atRest: !readerUserScrollingRef.current,");
    expect(gate).toContain("canPrepend: readerStripCanPrependRef.current(),");
    expect(gate).toContain("mobileReaderStripBridgeOpenAnchor(");
    const settle = block(reader, "const settleReaderUserScroll = useCallback(() => {", "const beginReaderUserScroll");
    expect(settle).toContain("flushReaderStripPrevious();");
    expect(settle.indexOf("publishScrollingVisiblePage();")).toBeLessThan(settle.indexOf("flushReaderStripPrevious();"));
  });

  test("no crossing while the bridge moves; the fix-up compares pixels and skips a user scroll", () => {
    const cross = block(reader, "const crossIntoReaderStripSegment = (crossing: {", "const crossIntoReaderStripSegmentRef");
    expect(cross).toContain("if (readerStripBridgeMovingRef.current) return false;");
    const placement = block(reader, "const readerStripPlacementRef = useRef", "const readerStripSourceName");
    expect(placement).toContain("readerStripBridgeMovingRef.current = true;");
    expect(placement).toContain("if (readerUserScrollingRef.current) return;");
    expect(placement).toContain("isMobileReaderStripPlacementOff({");
    expect(placement).not.toContain("<= 2");
  });

  test("the resume save never takes a clamped anchor", () => {
    const save = block(reader, "const saveReaderLocalResume = useCallback(() => {", "useEffect(() => {\n    saveReaderLocalResumeRef.current = saveReaderLocalResume;");
    expect(save).toContain("anchor = mobileReaderStripBridgeOpenAnchor(readerStripBridgeRef.current, listAnchor);");
    expect(save).toContain("if (!anchor) return;");
    expect(save).not.toContain("readerScrollRef.current?.pageAnchor()");
  });

  test("the gallery moves its row anchors, held seek and render window with inserted head rows", () => {
    const shift = block(gallery, "const scrollHeadShiftRef = useRef", "const scrollIndexViewOffset");
    expect(shift).toContain("mobileReaderStripHeadRowShift(previous.keys, keys)");
    expect(shift).toContain("scrollAnchorRef.current = shiftMobileReaderScrollAnchorRows(scrollAnchorRef.current, rows);");
    expect(shift).toContain("scrollCentreAnchorRef.current = shiftMobileReaderScrollAnchorRows(");
    expect(shift).toContain("lastCentrePageRef.current = shiftMobileReaderRowIndex(lastCentrePageRef.current, rows);");
    expect(shift).toContain("seek.pageIndex = shifted;");
    expect(shift).toContain("setScrollRenderWindow(");
    expect(shift).toContain("[reader-strip] head shift rows=");
    const scroll = block(gallery, "const handleGalleryScroll = (", "const handleGalleryContentSizeChange");
    expect(scroll).toContain("resolveMobileReaderScrollEventOffset(");
    // The padding re-placement (declared after) reads the shifted anchor.
    expect(gallery.indexOf("const scrollHeadShiftRef = useRef")).toBeLessThan(
      gallery.indexOf("const chromeTopPaddingTrackRef = useRef"),
    );
  });
});
