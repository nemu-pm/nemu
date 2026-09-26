import { describe, expect, test } from "bun:test";
import {
  isReaderAdvancePastEndDrag,
  isReaderRetreatPastStartDrag,
} from "./readerEdgeDrag";

// Five 390pt pages: the scrollable range is 4 × 390 = 1560.
const pager = { displayCount: 5, viewportLength: 390 };
const pagedLtr = { mode: "ltr" as const, pagedMode: true, ...pager };
const pagedRtl = { mode: "rtl" as const, pagedMode: true, ...pager };
const lastPage = { displayIndex: 4 };
const firstPage = { displayIndex: 0 };
const middlePage = { displayIndex: 2 };
const scrolling = { mode: "scrolling" as const, pagedMode: false };

describe("reader end-of-chapter drag detection", () => {
  test("reports a wall hit when a drag at the trailing edge moves nothing", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...lastPage,
        startOffset: 1560,
        endOffset: 1560,
        maxOffset: 1560,
      }),
    ).toBe(true);
  });

  test("ignores drags that actually moved the list", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...lastPage,
        startOffset: 1560,
        endOffset: 1490,
        maxOffset: 1560,
      }),
    ).toBe(false);
  });

  test("ignores a pinned drag anywhere but the trailing edge", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...middlePage,
        startOffset: 390,
        endOffset: 390,
        maxOffset: 1560,
      }),
    ).toBe(false);
  });

  test("uses the origin as the advancing edge in right-to-left paged mode", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedRtl,
        ...lastPage,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 1560,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedRtl,
        ...lastPage,
        startOffset: 1560,
        endOffset: 1560,
        maxOffset: 1560,
      }),
    ).toBe(false);
  });

  test("treats the bottom of a vertical chapter as the advancing edge", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4200,
        maxOffset: 4200,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 4200,
      }),
    ).toBe(false);
  });

  test("accepts outward iOS bounce but rejects movement back from the bottom", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4260,
        maxOffset: 4200,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4160,
        maxOffset: 4200,
      }),
    ).toBe(false);
  });

  test("uses the vertical bottom for a paged RTL chapter presented as one long strip", () => {
    const verticalLongStrip = { mode: "rtl" as const, pagedMode: false };
    expect(
      isReaderAdvancePastEndDrag({
        ...verticalLongStrip,
        startOffset: 12_600,
        endOffset: 12_600,
        maxOffset: 12_600,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...verticalLongStrip,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 12_600,
      }),
    ).toBe(false);
  });

  test("keeps a plain tap at the bottom of a scrollable chapter off the advance path", () => {
    // The stage's touch handler samples one live offset for both ends, so a
    // chapter resting at the bottom reports no movement for every touch-up.
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4200,
        maxOffset: 4200,
        gestureDelta: 0,
      }),
    ).toBe(false);
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4200,
        maxOffset: 4200,
        gestureDelta: -6,
      }),
    ).toBe(false);
  });

  test("advances when a drag past the bottom moves the finger upward", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4200,
        maxOffset: 4200,
        gestureDelta: -64,
      }),
    ).toBe(true);
    // A downward drag at the bottom is a pull back toward readable content.
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4200,
        maxOffset: 4200,
        gestureDelta: 64,
      }),
    ).toBe(false);
  });

  test("keeps offset-only callers intact when the list bounces past the bottom", () => {
    // `handleScrollEndDrag` reports a real drag's start and end offsets and
    // supplies no finger delta; a pinned offset there is still a wall hit.
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4200,
        maxOffset: 4200,
      }),
    ).toBe(true);
    // Bounce moved the offset outward during the touch, which is directional
    // on its own, so the finger delta does not have to clear the threshold.
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 4200,
        endOffset: 4260,
        maxOffset: 4200,
        gestureDelta: -4,
      }),
    ).toBe(true);
  });

  test("requires a deliberate upward gesture on an unscrollable vertical stage", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 0,
        gestureDelta: -48,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 0,
        gestureDelta: -12,
      }),
    ).toBe(false);
    expect(
      isReaderAdvancePastEndDrag({
        ...scrolling,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 0,
        gestureDelta: 48,
      }),
    ).toBe(false);
  });

  test("tolerates sub-pixel jitter and rejects non-finite metrics", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...lastPage,
        startOffset: 1560,
        endOffset: 1559.4,
        maxOffset: 1560,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...lastPage,
        startOffset: Number.NaN,
        endOffset: 1560,
        maxOffset: 1560,
      }),
    ).toBe(false);
  });
});

/** Offsets of a pinned drag resting on physical page `page` of five. */
function pinnedAt(page: number) {
  const offset = page * 390;
  return { startOffset: offset, endOffset: offset, maxOffset: 1560 };
}

describe("paged chapter edges come from the displayed page, not the raw offset", () => {
  test("LTR: only the last page advances and only the first page retreats", () => {
    expect(
      isReaderAdvancePastEndDrag({ ...pagedLtr, ...lastPage, ...pinnedAt(4) }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({ ...pagedLtr, ...middlePage, ...pinnedAt(2) }),
    ).toBe(false);
    expect(
      isReaderAdvancePastEndDrag({ ...pagedLtr, ...firstPage, ...pinnedAt(0) }),
    ).toBe(false);

    expect(
      isReaderRetreatPastStartDrag({ ...pagedLtr, ...firstPage, ...pinnedAt(0) }),
    ).toBe(true);
    expect(
      isReaderRetreatPastStartDrag({ ...pagedLtr, ...middlePage, ...pinnedAt(2) }),
    ).toBe(false);
    expect(
      isReaderRetreatPastStartDrag({ ...pagedLtr, ...lastPage, ...pinnedAt(4) }),
    ).toBe(false);
  });

  test("RTL: the last page lives at the origin and the first page at the far end", () => {
    // Reading order is reversed on screen: page index 4 is physical slot 0.
    expect(
      isReaderAdvancePastEndDrag({ ...pagedRtl, ...lastPage, ...pinnedAt(0) }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({ ...pagedRtl, ...middlePage, ...pinnedAt(2) }),
    ).toBe(false);
    expect(
      isReaderAdvancePastEndDrag({ ...pagedRtl, ...firstPage, ...pinnedAt(4) }),
    ).toBe(false);

    expect(
      isReaderRetreatPastStartDrag({ ...pagedRtl, ...firstPage, ...pinnedAt(4) }),
    ).toBe(true);
    expect(
      isReaderRetreatPastStartDrag({ ...pagedRtl, ...middlePage, ...pinnedAt(2) }),
    ).toBe(false);
    expect(
      isReaderRetreatPastStartDrag({ ...pagedRtl, ...lastPage, ...pinnedAt(0) }),
    ).toBe(false);
  });

  test("RTL offset 0 on a mid-chapter page is not the end of the chapter", () => {
    // A pager that has not applied its restore offset yet reports 0, which is
    // the physical slot of the last page in RTL. The reader is on page 3.
    expect(
      isReaderAdvancePastEndDrag({ ...pagedRtl, ...middlePage, ...pinnedAt(0) }),
    ).toBe(false);
    expect(
      isReaderAdvancePastEndDrag({ ...pagedRtl, ...firstPage, ...pinnedAt(0) }),
    ).toBe(false);
  });

  test("an unmeasured pager never reports an edge", () => {
    for (const mode of [pagedLtr, pagedRtl]) {
      // No viewport yet.
      expect(
        isReaderAdvancePastEndDrag({
          ...mode,
          ...lastPage,
          viewportLength: 0,
          ...pinnedAt(0),
        }),
      ).toBe(false);
      // Viewport known but the content size is not.
      expect(
        isReaderAdvancePastEndDrag({
          ...mode,
          ...lastPage,
          startOffset: 0,
          endOffset: 0,
          maxOffset: 0,
        }),
      ).toBe(false);
      expect(
        isReaderRetreatPastStartDrag({
          ...mode,
          ...firstPage,
          startOffset: 0,
          endOffset: 0,
          maxOffset: 0,
        }),
      ).toBe(false);
      // Callers that do not know the displayed page cannot claim an edge.
      expect(
        isReaderAdvancePastEndDrag({
          mode: mode.mode,
          pagedMode: true,
          ...pinnedAt(mode.mode === "rtl" ? 0 : 4),
        }),
      ).toBe(false);
    }
  });

  test("a drag back toward the chapter is not an edge hit", () => {
    // LTR first page, finger dragged toward page 2 (offset grew).
    expect(
      isReaderRetreatPastStartDrag({
        ...pagedLtr,
        ...firstPage,
        startOffset: 0,
        endOffset: 80,
        maxOffset: 1560,
      }),
    ).toBe(false);
    // RTL first page sits at the far end; dragging toward page 2 lowers it.
    expect(
      isReaderRetreatPastStartDrag({
        ...pagedRtl,
        ...firstPage,
        startOffset: 1560,
        endOffset: 1480,
        maxOffset: 1560,
      }),
    ).toBe(false);
  });

  test("a single-page chapter needs a deliberate finger drag in the reading direction", () => {
    const single = { displayCount: 1, displayIndex: 0, viewportLength: 390 };
    const pinned = { startOffset: 0, endOffset: 0, maxOffset: 0 };
    // LTR advances with a leftward drag and retreats with a rightward one.
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...single,
        ...pinned,
        gestureDelta: -60,
      }),
    ).toBe(true);
    expect(
      isReaderRetreatPastStartDrag({
        ...pagedLtr,
        ...single,
        ...pinned,
        gestureDelta: -60,
      }),
    ).toBe(false);
    expect(
      isReaderRetreatPastStartDrag({
        ...pagedLtr,
        ...single,
        ...pinned,
        gestureDelta: 60,
      }),
    ).toBe(true);
    // RTL is mirrored.
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedRtl,
        ...single,
        ...pinned,
        gestureDelta: 60,
      }),
    ).toBe(true);
    expect(
      isReaderRetreatPastStartDrag({
        ...pagedRtl,
        ...single,
        ...pinned,
        gestureDelta: -60,
      }),
    ).toBe(true);
    // Jitter and missing finger evidence do nothing.
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        ...single,
        ...pinned,
        gestureDelta: -10,
      }),
    ).toBe(false);
    expect(
      isReaderAdvancePastEndDrag({ ...pagedLtr, ...single, ...pinned }),
    ).toBe(false);
  });

  test("vertical stages never retreat across chapters", () => {
    expect(
      isReaderRetreatPastStartDrag({
        ...scrolling,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 4200,
      }),
    ).toBe(false);
  });
});
