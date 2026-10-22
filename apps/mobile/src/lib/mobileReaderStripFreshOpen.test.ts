import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  appendMobileReaderStripSegment,
  combineMobileReaderStripLayouts,
  freezeMobileReaderStripRowsAbove,
  isMobileReaderStripHeadRemovalOffscreen,
  mobileReaderStripCrossing,
  mobileReaderStripHeadRemoval,
  mobileReaderStripRows,
  mobileReaderStripSegmentOffset,
  mobileReaderStripSegmentStarts,
  prependMobileReaderStripSegment,
  pruneMobileReaderStrip,
  rebaseMobileReaderStrip,
  shouldPrependMobileReaderStripSegment,
  shouldSpliceMobileReaderStripPrevious,
  type MobileReaderStrip,
  type MobileReaderStripRowHeights,
} from "./mobileReaderChapterStrip";
import { chooseMobileReaderResumePosition } from "./mobileReaderResumePosition";
import {
  buildMobileReaderScrollLayout,
  mobileReaderScrollAnchorForOffset,
  mobileReaderScrollCentrePageIndex,
  mobileReaderScrollKnownMedianRatio,
  mobileReaderScrollOffsetForAnchor,
  mobileReaderScrollPageRatios,
  MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
  type MobileReaderScrollLayout,
} from "./mobileReaderScrollLayout";
import {
  isMobileReaderStripPlacementOff,
  mobileReaderStripBridgeLocalAnchor,
  mobileReaderStripBridgeOpenAnchor,
  mobileReaderStripHeadRowShift,
  mobileReaderStripHeadShiftOffset,
  mergeMobileReaderStripRowsSettle,
  resolveMobileReaderScrollEventOffset,
  resolveMobileReaderStripRowsSettle,
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
    expect(cross).toContain("if (readerStripRowsSettling()) return false;");
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

// The r10 jump: the rows of a chapter just joined above stand in at 1:1.45
// until one of its pages decodes; then the median of its known pages
// (ToG ≈ 1:1.8) moved every unknown row at once, ~25% taller above the
// screen, and the reading line landed at ~0.8 of the chapter above.
const WIDTH = 200;
const TOG_RATIO = 1.8;
const TOG_SLICE = WIDTH * TOG_RATIO; // 360

type Sizes = Map<string, { width: number; height: number }>;

/** A chapter's layout as the reader builds it (ReaderScreen readerStripLayout). */
function sizedLayout(chapterId: string, count: number, sizes: Sizes, fallbackRatio: number | null) {
  const sizeAt = (index: number) => sizes.get(`${chapterId}:${index}`) ?? null;
  const ratios = mobileReaderScrollPageRatios(count, sizeAt, fallbackRatio);
  return buildMobileReaderScrollLayout(
    ratios.map((ratio) => WIDTH * ratio),
    new Array(count).fill(0),
    0,
    Array.from({ length: count }, (_, index) => sizes.has(`${chapterId}:${index}`)),
  );
}

function decodedAll(chapterId: string, count: number, sizes: Sizes) {
  for (let index = 0; index < count; index += 1) {
    sizes.set(`${chapterId}:${index}`, { width: WIDTH, height: TOG_SLICE });
  }
}

/**
 * The strip's combined layout with the reader's rules: the open chapter's
 * own layout, neighbours seeded from its median (`seed`), rows above frozen
 * (`freeze`, carrying `kept` between commits).
 */
function readerStripList(
  strip: MobileReaderStrip<Chapter, Page>,
  sizes: Sizes,
  options: {
    seed: boolean;
    freeze: boolean;
    /** Carried between commits as the reader's refs (frozen heights, the session's typical page). */
    kept: { heights: MobileReaderStripRowHeights | null; typical?: number | null };
  },
) {
  const rows = mobileReaderStripRows(strip);
  const starts = mobileReaderStripSegmentStarts(rows, strip.segments.length);
  const open = strip.segments[strip.currentIndex]!;
  const openLayout = sizedLayout(open.chapter.id, open.pages.length, sizes, options.seed ? (options.kept.typical ?? null) : null);
  if (options.seed) options.kept.typical = mobileReaderScrollKnownMedianRatio(openLayout, WIDTH) ?? options.kept.typical ?? null;
  const openRatio = options.seed ? mobileReaderScrollKnownMedianRatio(openLayout, WIDTH) : null;
  const combined = combineMobileReaderStripLayouts(
    rows,
    strip.segments.map((segment, index) =>
      index === strip.currentIndex ? openLayout : sizedLayout(segment.chapter.id, segment.pages.length, sizes, openRatio),
    ),
  );
  let layout = combined;
  if (options.freeze) {
    const frozen = freezeMobileReaderStripRowsAbove(rows, strip.currentIndex, combined, options.kept.heights);
    options.kept.heights = frozen.heights;
    layout = frozen.layout;
  }
  const bridge: MobileReaderStripBridge = {
    indexBase: starts[strip.currentIndex] ?? 0,
    offsetBase: mobileReaderStripSegmentOffset(layout, starts, strip.currentIndex),
    localCount: open.pages.length,
  };
  return { strip, rows, keys: rows.map((row) => row.key), layout, bridge, starts };
}

describe("seamless scroll: rows above never rescale when a page of their chapter decodes (r10 ToG jump)", () => {
  /**
   * Fresh open at p1, the previous chapter spliced at rest, then one of its
   * pages (one MVCP keeps on screen via the initial region) decodes.
   * Returns the native offset after each commit (MVCP moving it by exactly
   * the anchor row's JS start delta — what the settle check enforces) and
   * what an un-moved native offset would read.
   */
  function run(options: { seed: boolean; freeze: boolean; openDecoded: number }) {
    const sizes: Sizes = new Map();
    // The open chapter: its first pages decoded (the screen at p1).
    for (let index = 0; index < options.openDecoded; index += 1) {
      sizes.set(`${OPEN.id}:${index}`, { width: WIDTH, height: TOG_SLICE });
    }
    const kept = { heights: null as MobileReaderStripRowHeights | null };
    const before = readerStripList(
      { segments: [{ chapter: OPEN, pages: pagesOf(OPEN_PAGES) }], currentIndex: 0, tail: null },
      sizes,
      { ...options, kept },
    );
    // At rest on p2.
    const offset = TOG_SLICE + 40;
    const restAnchor = measure(before, offset).anchor!;
    const inserted = readerStripList(
      prependMobileReaderStripSegment(before.strip, { chapter: PREVIOUS, pages: pagesOf(PREVIOUS_PAGES) }) as MobileReaderStrip<
        Chapter,
        Page
      >,
      sizes,
      { ...options, kept },
    );
    const rows = mobileReaderStripHeadRowShift(before.keys, inserted.keys)!;
    const jsInserted = mobileReaderStripHeadShiftOffset(before.layout.starts, inserted.layout.starts, rows);
    let insertedHeight = 0;
    for (let row = 0; row < rows; row += 1) insertedHeight += inserted.layout.heights[row]! + inserted.layout.gaps[row]!;
    // The invariant on device: offset_after − offset_before == inserted rows' real height.
    expect(jsInserted).toBeCloseTo(insertedHeight, 6);
    const afterInsert = offset + jsInserted;
    const anchorRow = shiftMobileReaderScrollAnchorRows(restAnchor, rows)!.pageIndex;
    expect(mobileReaderStripCrossing(inserted.rows, inserted.strip, measure(inserted, afterInsert).centre!)).toBeNull();

    // One page of the previous chapter decodes (its last: the row right
    // above the divider, mounted by the behind range).
    sizes.set(`${PREVIOUS.id}:${PREVIOUS_PAGES - 1}`, { width: WIDTH, height: TOG_SLICE });
    const decoded = readerStripList(inserted.strip, sizes, { ...options, kept });
    const delta = decoded.layout.starts[anchorRow]! - inserted.layout.starts[anchorRow]!;
    let rowsResized = 0;
    for (let row = 0; row < anchorRow; row += 1) {
      if (Math.abs(decoded.layout.heights[row]! - inserted.layout.heights[row]!) > 0.5) rowsResized += 1;
    }
    return { inserted, decoded, afterInsert, delta, rowsResized, anchorRow, jsInserted, insertedHeight };
  }

  test("the bug: 1:1.45 rows rescaled by one decode put the reading line deep in the previous chapter", () => {
    const { decoded, afterInsert, delta, rowsResized } = run({ seed: false, freeze: false, openDecoded: 0 });
    // Every row of the chapter above moved at once (~+25%).
    expect(rowsResized).toBe(PREVIOUS_PAGES);
    expect(delta).toBeCloseTo(PREVIOUS_PAGES * WIDTH * (TOG_RATIO - MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO), 6);
    // An offset that does not follow reads ~0.8 of the chapter above: the crossing.
    const crossing = mobileReaderStripCrossing(decoded.rows, decoded.strip, measure(decoded, afterInsert).centre!);
    expect(crossing?.direction).toBe("backward");
    expect(crossing!.localIndex / PREVIOUS_PAGES).toBeGreaterThan(0.75);
    expect(crossing!.localIndex / PREVIOUS_PAGES).toBeLessThan(0.85);
    // The settle check sees the offset did not follow and puts it back.
    const settle = resolveMobileReaderStripRowsSettle(
      { kind: "above-resize", before: afterInsert, jsDelta: delta, rowsHeight: delta, rows: 0 },
      afterInsert,
      false,
    );
    expect(settle.ok).toBe(false);
    expect(settle.fixTo).toBe(afterInsert + delta);
    expect(mobileReaderStripCrossing(decoded.rows, decoded.strip, measure(decoded, settle.fixTo!).centre!)).toBeNull();
  });

  test("frozen rows above: only the decoded row changes (its own real size); no crossing", () => {
    const { inserted, decoded, afterInsert, delta, rowsResized, anchorRow } = run({ seed: false, freeze: true, openDecoded: 0 });
    expect(rowsResized).toBe(1);
    // The other rows above keep the height they joined with.
    for (let row = 0; row < PREVIOUS_PAGES - 1; row += 1) {
      expect(decoded.layout.heights[row]).toBe(inserted.layout.heights[row]);
    }
    expect(delta).toBeCloseTo(WIDTH * (TOG_RATIO - MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO), 6);
    expect(Math.abs(delta)).toBeLessThan(VIEWPORT / 2);
    // Native follows (MVCP) or not at all: either way the open chapter's p2.
    for (const native of [afterInsert + delta, afterInsert]) {
      const seen = measure(decoded, native);
      expect(mobileReaderStripCrossing(decoded.rows, decoded.strip, seen.centre!)).toBeNull();
      expect(resumeSave(decoded, seen.anchor)?.chapterId).toBe(OPEN.id);
      expect(resumeSave(decoded, seen.anchor)?.pageIndex).toBe(1);
    }
    expect(decoded.layout.starts[anchorRow]! - delta).toBeCloseTo(inserted.layout.starts[anchorRow]!, 6);
  });

  test("seeded from the open chapter's median: the rows join at their real height; a decode moves nothing", () => {
    const { inserted, decoded, afterInsert, delta, rowsResized, jsInserted, insertedHeight } = run({
      seed: true,
      freeze: true,
      openDecoded: 3,
    });
    expect(inserted.layout.heights[0]).toBeCloseTo(TOG_SLICE, 6);
    expect(jsInserted).toBeCloseTo(insertedHeight, 6);
    expect(rowsResized).toBe(0);
    expect(delta).toBeCloseTo(0, 6);
    const seen = measure(decoded, afterInsert);
    expect(mobileReaderStripCrossing(decoded.rows, decoded.strip, seen.centre!)).toBeNull();
    expect(resumeSave(decoded, seen.anchor)).toEqual({ chapterId: OPEN.id, pageIndex: 1, fraction: expect.any(Number) });
  });

  test("the settle check: an offset that followed is left alone; a moving list is never fought", () => {
    const settle = mergeMobileReaderStripRowsSettle(
      { kind: "head-shift", before: 400, jsDelta: 54_000, rowsHeight: 54_000, rows: 151 },
      { kind: "above-resize", before: 54_400, jsDelta: 70, rowsHeight: 70, rows: 0 },
    );
    expect(settle).toEqual({ kind: "head-shift", before: 400, jsDelta: 54_070, rowsHeight: 54_070, rows: 151 });
    expect(resolveMobileReaderStripRowsSettle(settle, 54_470, false)).toEqual({
      expected: 54_470,
      moved: 54_070,
      ok: true,
      fixTo: null,
    });
    expect(resolveMobileReaderStripRowsSettle(settle, 400, false).fixTo).toBe(54_470);
    expect(resolveMobileReaderStripRowsSettle(settle, 400, true).fixTo).toBeNull();
  });

  test("forward crossing then head prune: the next chapter seeded at the open one's ratio, the prune keeps the screen", () => {
    const NEXT = { id: "ch642" };
    const NEXT_PAGES = 260;
    const sizes: Sizes = new Map();
    decodedAll(PREVIOUS.id, PREVIOUS_PAGES, sizes);
    decodedAll(OPEN.id, OPEN_PAGES, sizes);
    const kept = { heights: null as MobileReaderStripRowHeights | null };
    const options = { seed: true, freeze: true, kept };
    const three = appendMobileReaderStripSegment(
      { segments: [{ chapter: PREVIOUS, pages: pagesOf(PREVIOUS_PAGES) }, { chapter: OPEN, pages: pagesOf(OPEN_PAGES) }], currentIndex: 1, tail: null },
      { chapter: NEXT, pages: pagesOf(NEXT_PAGES) },
      null,
    ) as MobileReaderStrip<Chapter, Page>;
    const appended = readerStripList(three, sizes, options);
    // The chapter below joined at its real height (no 1:1.45 rows) and
    // keeps it once it is the open chapter (the session's typical page).
    const nextFirst = appended.starts[2]!;
    expect(appended.layout.heights[nextFirst]).toBeCloseTo(TOG_SLICE, 6);

    // Reading on past the divider: the centre in the next chapter's p1.
    const offset = appended.layout.starts[nextFirst]! + 20 - VIEWPORT / 2 + TOG_SLICE / 2;
    const centre = measure(appended, offset).centre!;
    const crossing = mobileReaderStripCrossing(appended.rows, appended.strip, centre);
    expect(crossing).toEqual({ segmentIndex: 2, localIndex: 0, direction: "forward" });
    const crossed = readerStripList(rebaseMobileReaderStrip(three, 2), sizes, options);
    expect(crossed.layout.length).toBeCloseTo(appended.layout.length, 6);

    // The next chapter's first pages decode: its rows were already right.
    sizes.set(`${NEXT.id}:0`, { width: WIDTH, height: TOG_SLICE });
    sizes.set(`${NEXT.id}:1`, { width: WIDTH, height: TOG_SLICE });
    const decoded = readerStripList(crossed.strip, sizes, options);
    expect(decoded.layout.starts[nextFirst]).toBeCloseTo(crossed.layout.starts[nextFirst]!, 6);
    expect(decoded.layout.length).toBeCloseTo(crossed.layout.length, 6);

    // Head prune: the chapter two above is dropped once off screen.
    const pruned = pruneMobileReaderStrip(decoded.strip);
    expect(pruned.removedHead.map((segment) => segment.chapter.id)).toEqual([PREVIOUS.id]);
    const removal = mobileReaderStripHeadRemoval(decoded.layout, decoded.starts, 1);
    expect(isMobileReaderStripHeadRemovalOffscreen(removal, offset)).toBe(true);
    const after = readerStripList(pruned.strip, sizes, options);
    const rows = mobileReaderStripHeadRowShift(decoded.keys, after.keys)!;
    expect(rows).toBe(-removal.rows);
    const jsDelta = mobileReaderStripHeadShiftOffset(decoded.layout.starts, after.layout.starts, rows);
    let removedHeight = 0;
    for (let row = 0; row < -rows; row += 1) removedHeight += decoded.layout.heights[row]! + decoded.layout.gaps[row]!;
    // offset_after − offset_before == −(removed rows' real height)
    expect(jsDelta).toBeCloseTo(-removedHeight, 6);
    expect(jsDelta).toBeCloseTo(-removal.height, 6);
    const native = offset + jsDelta;
    const seen = measure(after, native);
    expect(mobileReaderStripCrossing(after.rows, after.strip, seen.centre!)).toBeNull();
    // The centre still on the next chapter's p1 (the screen's top above its divider).
    expect(mobileReaderStripBridgeOpenAnchor(after.bridge, { pageIndex: seen.centre!, fraction: 0 })?.pageIndex).toBe(0);
    expect(seen.centre).toBe(centre + rows);
    // The settle check agrees with MVCP's move; an offset that did not
    // follow (the p211/260 landing) is put back.
    const settle = { kind: "head-shift" as const, before: offset, jsDelta, rowsHeight: -removedHeight, rows };
    expect(resolveMobileReaderStripRowsSettle(settle, native, false).ok).toBe(true);
    const stuck = measure(after, offset);
    expect(mobileReaderStripBridgeOpenAnchor(after.bridge, { pageIndex: stuck.centre!, fraction: 0 })?.pageIndex ?? 0).toBeGreaterThan(100);
    expect(resolveMobileReaderStripRowsSettle(settle, offset, false).fixTo).toBeCloseTo(native, 6);
  });
});

describe("seamless scroll: settle gating and prepend mode wiring", () => {
  const reader = readSource("screens/ReaderScreen.tsx");
  const strip = readSource("components/reader/useReaderChapterStrip.ts");
  const gallery = readSource("components/reader/MobileReaderGallery.tsx");

  test("neighbours are seeded from the open chapter and rows above are frozen", () => {
    const layout = block(reader, "const readerStripLayout = useMemo(() => {", "const readerStripBridge = useMemo");
    expect(layout).toContain("mobileReaderScrollKnownMedianRatio(readerScrollLayout, readerImageWidth)");
    expect(layout).toContain("mobileReaderScrollPageRatios(count, sizeAt, openRatio)");
    expect(layout).toContain("freezeMobileReaderStripRowsAbove(");
    expect(layout).toContain("kept && kept.width === readerImageWidth ? kept.heights : null");
  });

  test("no crossing and no head prune while the rows settle", () => {
    expect(reader).toContain(
      "readerStripBridgeMovingRef.current || readerGalleryScrollRef.current?.rowsSettling() === true;",
    );
    const head = block(reader, "readerStripHeadOffscreenRef.current = (_strip, count) => {", "const crossIntoReaderStripSegment");
    expect(head).toContain("if (readerStripRowsSettling()) return false;");
    expect(reader).toContain("onRowsSettled={onGalleryRowsSettled}");
    expect(strip).toMatch(/pruneWaitingRef\.current = true;\s*return;/);
    const prune = block(gallery, "const checkRowsSettle = (timedOut: boolean) => {", "const armRowsSettle");
    expect(prune).toContain("[reader-strip-diag] settle kind=");
    expect(prune).toContain("listRef.current?.scrollToOffset({ offset: result.fixTo, animated: false });");
    expect(prune).toContain("onRowsSettledRef.current?.();");
    const shift = block(gallery, "const scrollHeadShiftRef = useRef", "const scrollIndexViewOffset");
    expect(shift).toContain('kind: "head-shift",');
    expect(shift).toContain('kind: "above-resize",');
    expect(shift).toContain("[reader-strip-diag] head-shift rows=");
    expect(shift).toContain("[reader-strip-diag] above-resize");
    const content = block(gallery, "const handleGalleryContentSizeChange", "const handleGalleryLayout");
    expect(content).toContain('noteRowsSettleReport("content");');
    const scroll = block(gallery, "const handleGalleryScroll = (", "const handleGalleryContentSizeChange");
    expect(scroll).toContain('noteRowsSettleReport("event");');
  });

  test("pull mode: rechecks never fetch the chapter above; only requestPrevious does", () => {
    const recheck = block(strip, "const recheckPrevious = useCallback(", "// Append: in the last pages");
    expect(recheck).toMatch(/if \(heldPreviousRef\.current\) \{\s*flushPrevious\(\);\s*return;\s*\}\s*\/\/ Pull mode[^\n]*\n\s*if \(prependModeRef\.current === "pull"\) return;/);
    expect(reader).toContain("prependMode: MOBILE_READER_STRIP_PREPEND_MODE,");
    expect(reader).toContain("scrollPullHeader={readerStripPullHeader}");
    const release = block(gallery, "const handleScrollEndDrag = (", "// iOS reports where the fling will rest");
    expect(release).toContain("mobileReaderStripPullReleases(pullStateRef.current) && scrollPullActiveRef.current");
    expect(release).toContain("onRequestRetreatPastStartRef.current?.();");
  });
});
