import { describe, expect, test } from "bun:test";
import { isReaderAdvancePastEndDrag } from "./readerEdgeDrag";

const pagedLtr = { mode: "ltr" as const, pagedMode: true };
const pagedRtl = { mode: "rtl" as const, pagedMode: true };
const scrolling = { mode: "scrolling" as const, pagedMode: false };

describe("reader end-of-chapter drag detection", () => {
  test("reports a wall hit when a drag at the trailing edge moves nothing", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
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
        startOffset: 0,
        endOffset: 0,
        maxOffset: 1560,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedRtl,
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

  test("requires a deliberate upward gesture on an unscrollable vertical stage", () => {
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        startOffset: 0,
        endOffset: 0,
        maxOffset: 0,
      }),
    ).toBe(true);
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
        startOffset: 1560,
        endOffset: 1559.4,
        maxOffset: 1560,
      }),
    ).toBe(true);
    expect(
      isReaderAdvancePastEndDrag({
        ...pagedLtr,
        startOffset: Number.NaN,
        endOffset: 1560,
        maxOffset: 1560,
      }),
    ).toBe(false);
  });
});
