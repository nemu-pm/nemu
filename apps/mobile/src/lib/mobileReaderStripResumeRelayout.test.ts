import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMobileReaderScrollLayout,
  mobileReaderScrollAnchorForOffset,
  mobileReaderScrollCentreAnchor,
  mobileReaderScrollCentrePageIndex,
  mobileReaderScrollOffsetForAnchor,
  mobileReaderScrollOffsetForCentreAnchor,
  type MobileReaderScrollPageAnchor,
} from "./mobileReaderScrollLayout";
import {
  isMobileReaderStripRowsSettleUnreported,
  MOBILE_READER_STRIP_UNREPORTED_MAX_MS,
  MOBILE_READER_STRIP_UNREPORTED_RETRY_MS,
  resolveMobileReaderRelayoutSeekAnchor,
  resolveMobileReaderStripRowsSettle,
  resolveMobileReaderStripUnreportedReport,
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

// v14 635: 216 pages of one size, 8pt apart. The list mounts at the flat
// width (720) and the book-posture strip width (454) lands a moment later:
// every row shrinks by 454/720 (log: start 50930->32220, jsTotal 282758->178925).
const PAGES = 216;
const RATIO = 1303 / 720;
const VIEWPORT = 660;
const TOP = 80;
const layoutAt = (width: number) =>
  buildMobileReaderScrollLayout(
    Array.from({ length: PAGES }, () => width * RATIO),
    Array.from({ length: PAGES }, (_, index) => (index === 0 ? 0 : 8)),
    8,
    Array.from({ length: PAGES }, () => true),
  );
const MOUNT = layoutAt(720);
const BOOK = layoutAt(454);

/** One reopen: mount at the saved spot, the width lands, where it rests. */
function reopen(saved: MobileReaderScrollPageAnchor, keep: "centre" | "spot") {
  const mountOffset = mobileReaderScrollOffsetForAnchor(MOUNT, saved.pageIndex, saved.fraction);
  const mountAnchor = mobileReaderScrollAnchorForOffset(MOUNT, mountOffset)!;
  // The opening seek landed at the mount width (exact offset).
  const heldSeek = { ...mountAnchor, landed: true };
  const centre = mobileReaderScrollCentreAnchor(MOUNT, mountOffset, VIEWPORT, TOP)!;
  const centreTarget = mobileReaderScrollAnchorForOffset(
    BOOK,
    mobileReaderScrollOffsetForCentreAnchor(BOOK, centre, VIEWPORT, TOP),
  );
  const anchor = resolveMobileReaderRelayoutSeekAnchor({
    restingSpot: keep === "spot" ? mountAnchor : null,
    heldSeek,
    centreTarget,
    anchor: mountAnchor,
  });
  // The seek lands there in the book layout; that is what the save reads.
  return mobileReaderScrollAnchorForOffset(
    BOOK,
    mobileReaderScrollOffsetForAnchor(BOOK, anchor.pageIndex, anchor.fraction),
  )!;
}

describe("resume: a reopen lands on the same spot when the width lands after the mount (v14 635 p40)", () => {
  test("the bug: re-derived from the screen's centre, every reopen creeps up ~0.1 page", () => {
    let saved: MobileReaderScrollPageAnchor = { pageIndex: 39, fraction: 0.89 };
    const fractions: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      saved = reopen(saved, "centre");
      fractions.push(saved.fraction);
    }
    expect(saved.pageIndex).toBe(39);
    expect(0.89 - fractions[0]!).toBeGreaterThan(0.05);
    expect(fractions[1]!).toBeLessThan(fractions[0]!);
    expect(fractions[2]!).toBeLessThan(fractions[1]!);
  });

  test("the fix: the resting spot (no scroll since the placement) is kept: ±0.02 on every reopen", () => {
    let saved: MobileReaderScrollPageAnchor = { pageIndex: 39, fraction: 0.89 };
    for (let run = 0; run < 3; run += 1) {
      saved = reopen(saved, "spot");
      expect(saved.pageIndex).toBe(39);
      expect(Math.abs(saved.fraction - 0.89)).toBeLessThanOrEqual(0.02);
    }
  });

  test("relayout anchor: the resting spot, else a seek on its way, else the centre, else the reading line", () => {
    const spot = { pageIndex: 39, fraction: 0.89 };
    const anchor = { pageIndex: 41, fraction: 0.2 };
    const centreTarget = { pageIndex: 40, fraction: 0.5 };
    expect(
      resolveMobileReaderRelayoutSeekAnchor({ restingSpot: spot, heldSeek: null, centreTarget, anchor }),
    ).toEqual(spot);
    expect(
      resolveMobileReaderRelayoutSeekAnchor({
        restingSpot: null,
        heldSeek: { pageIndex: 7, fraction: 0.3, landed: false },
        centreTarget,
        anchor,
      }),
    ).toEqual({ pageIndex: 7, fraction: 0.3 });
    expect(
      resolveMobileReaderRelayoutSeekAnchor({
        restingSpot: null,
        heldSeek: { pageIndex: 7, fraction: 0.3, landed: true },
        centreTarget,
        anchor,
      }),
    ).toEqual(centreTarget);
    expect(resolveMobileReaderRelayoutSeekAnchor({ restingSpot: null, heldSeek: null, centreTarget: null, anchor })).toEqual(
      anchor,
    );
  });

  test("a posture round trip after the reader scrolled still keeps the centre (no regression)", () => {
    const offset = mobileReaderScrollOffsetForAnchor(BOOK, 100, 0.3);
    const centre = mobileReaderScrollCentreAnchor(BOOK, offset, VIEWPORT, TOP)!;
    const wide = mobileReaderScrollOffsetForCentreAnchor(MOUNT, centre, VIEWPORT, TOP);
    const back = mobileReaderScrollOffsetForCentreAnchor(
      BOOK,
      mobileReaderScrollCentreAnchor(MOUNT, wide, VIEWPORT, TOP)!,
      VIEWPORT,
      TOP,
    );
    expect(Math.abs(back - offset)).toBeLessThanOrEqual(1);
  });

  test("gallery wiring: the mount and exact seeks leave the spot; a drag, progress jump or other scroll clears it", () => {
    const gallery = readSource("components/reader/MobileReaderGallery.tsx");
    expect(gallery).toContain("restingSpotRef.current = scrollAnchorRef.current;");
    expect(gallery).toContain(
      "restingSpotRef.current = animated ? null : { pageIndex: targetIndex, fraction: seekFraction };",
    );
    const drag = block(gallery, "const handleScrollBeginDrag = (", "const handleGalleryScroll = (");
    expect(drag).toContain("restingSpotRef.current = null;");
    const progress = block(gallery, "scrollToProgress(progress, animated = false) {", "scrollToProgressAfterContentChange");
    expect(progress).toContain("restingSpotRef.current = null;");
    const scrollTo = block(gallery, "scrollTo({ x = 0, y = 0, index, fraction, animated = true }) {", "pageAnchor() {");
    expect(scrollTo.indexOf("restingSpotRef.current = null;")).toBeLessThan(
      scrollTo.indexOf("restingSpotRef.current = animated ? null"),
    );
    expect(gallery).toContain(
      "restingSpotRef.current = shiftMobileReaderScrollAnchorRows(restingSpotRef.current, rows);",
    );
    const relayout = block(gallery, "const listGeometryRef = useRef", "if (!(metrics.contentLength > 0)) return;");
    expect(relayout).toContain("resolveMobileReaderRelayoutSeekAnchor({");
    expect(relayout).toContain("const centre = restingSpot || (heldSeek && !heldSeek.landed) ? null : scrollCentreAnchorRef.current;");
  });
});

describe("rows that change while the list never reports (v14: turning the device with the JL sheet open)", () => {
  // 631 at p3 under 155 rows of 630; book → laptop: the rows above grow
  // +60327, the seek re-places row156@0.46, the list sends nothing at all.
  const before = 129041;
  const settle = { kind: "above-resize" as const, before, jsDelta: 60327, rowsHeight: 60327, rows: 0 };

  test("the bug: judged from the old offset, the centre reads 630 p106 — a false crossing", () => {
    const rows = 155 + 202;
    const laptop = buildMobileReaderScrollLayout(
      Array.from({ length: rows }, (_, index) => (index < 155 ? 1203 : 1200)),
      null,
      0,
    );
    const judged = resolveMobileReaderStripRowsSettle(settle, before, false);
    expect(judged.ok).toBe(false);
    expect(judged.moved).toBe(0);
    // The stale offset read against the new rows: in 630, not 631.
    expect(mobileReaderScrollCentrePageIndex(laptop, before, VIEWPORT, TOP)!).toBeLessThan(155);
  });

  test("no event since the change at rest: unreported (placed on the target, still settling)", () => {
    expect(isMobileReaderStripRowsSettleUnreported(0, false)).toBe(true);
    expect(isMobileReaderStripRowsSettleUnreported(1, false)).toBe(false);
    // Mid-drag the finger's own events always come: never unreported.
    expect(isMobileReaderStripRowsSettleUnreported(0, true)).toBe(false);
  });

  test("the first report after: at rest off target is put back; on target or the reader's own scroll ends it", () => {
    const target = before + settle.jsDelta;
    expect(resolveMobileReaderStripUnreportedReport({ target, nativeOffset: before, userScrolling: false })).toEqual({
      fixTo: target,
    });
    expect(resolveMobileReaderStripUnreportedReport({ target, nativeOffset: target + 1, userScrolling: false })).toEqual({
      fixTo: target,
    });
    expect(resolveMobileReaderStripUnreportedReport({ target, nativeOffset: target, userScrolling: false })).toEqual({
      fixTo: null,
    });
    expect(resolveMobileReaderStripUnreportedReport({ target, nativeOffset: before, userScrolling: true })).toEqual({
      fixTo: null,
    });
    expect(MOBILE_READER_STRIP_UNREPORTED_RETRY_MS).toBeLessThanOrEqual(500);
    expect(MOBILE_READER_STRIP_UNREPORTED_MAX_MS).toBeGreaterThanOrEqual(60_000);
  });

  test("gallery wiring: unreported keeps the rows settling, places the list, retries, ends on a report", () => {
    const gallery = readSource("components/reader/MobileReaderGallery.tsx");
    const check = block(gallery, "const checkRowsSettle = (timedOut: boolean) => {", "/** The list reported (an event or its new size)");
    const unreported = check.indexOf("if (isMobileReaderStripRowsSettleUnreported(pending.events, scrolling)) {");
    expect(unreported).toBeGreaterThan(0);
    // Placed and returned before onRowsSettled (no centre read from the old offset).
    const branch = check.slice(unreported, check.indexOf("const result = seekHeld"));
    expect(branch).toContain("enterRowsUnreported(target);");
    expect(branch).toContain("return;");
    expect(branch).not.toContain("onRowsSettledRef");
    expect(gallery).toContain(
      "return !pagedMode && (rowsSettleRef.current != null || rowsUnreportedRef.current != null);",
    );
    const place = block(gallery, "const placeUnreportedRows = (target: number, probe: boolean) => {", "const retryRowsUnreported");
    // JS holds the target (anchors, page window), never the stale offset.
    expect(place).toContain("scrollAnchorRef.current = mobileReaderScrollAnchorForOffset(layout, target);");
    expect(place).toContain("setScrollRenderWindow(");
    expect(place).toContain("listRef.current?.scrollToOffset({ offset: target, animated: false });");
    const retry = block(gallery, "const retryRowsUnreported = () => {", "const enterRowsUnreported");
    expect(retry).toContain("setTimeout(retryRowsUnreported, MOBILE_READER_STRIP_UNREPORTED_RETRY_MS)");
    expect(retry).toContain("onRowsSettledRef.current?.(true);");
    const scroll = block(gallery, "const handleGalleryScroll = (", "const handleGalleryContentSizeChange");
    expect(scroll).toContain("noteRowsUnreportedEvent(rawOffset);");
    // The report is read once the handler recorded the event's metrics.
    expect(scroll.indexOf("noteRowsUnreportedEvent(rawOffset);")).toBeGreaterThan(
      scroll.indexOf("recordContinuousScrollMetrics(metrics, logicalLongStripMode);"),
    );
    // The reader: no crossing, no page, no head prune while settling.
    const reader = readSource("screens/ReaderScreen.tsx");
    const report = block(reader, "const onGalleryScrollingVisiblePageChange = useCallback(", "const onGalleryScrollingPageLayout");
    expect(report).toContain("if (strip && readerGalleryScrollRef.current?.rowsSettling() === true) return;");
  });
});
