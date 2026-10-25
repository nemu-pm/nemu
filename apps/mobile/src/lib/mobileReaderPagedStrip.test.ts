import { describe, expect, test } from "bun:test";
import {
  buildMobileReaderPagedStrip,
  mobileReaderPagedStripCrossing,
  mobileReaderPagedStripFrameBase,
  mobileReaderPagedStripGlobalFrame,
  mobileReaderPagedStripLocate,
  mobileReaderPagedStripLocatePage,
  mobileReaderPagedStripPageBase,
  mobileReaderPagedStripReanchor,
  sameMobileReaderPagedStripFrames,
  shouldWarmMobileReaderPagedStripPrevious,
  type MobileReaderPagedStripSegment,
} from "./mobileReaderPagedStrip";
import { readerScrollOffsetForLogicalFrame } from "./mobileReaderProgress";

const chapter = (
  chapterId: string,
  pageCount: number,
  spreads?: number[][],
): MobileReaderPagedStripSegment => ({ chapterId, kind: "chapter", pageCount, spreads });
const placeholder = (chapterId: string): MobileReaderPagedStripSegment => ({
  chapterId,
  kind: "placeholder",
  pageCount: 1,
});

describe("mobile reader paged strip", () => {
  test("single pages: chapters back to back, no divider frame", () => {
    const strip = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 3), chapter("c2", 4), chapter("c3", 2)],
      currentIndex: 1,
      twoPage: false,
    });
    expect(strip.frameCount).toBe(9);
    expect(strip.pageCount).toBe(9);
    expect(mobileReaderPagedStripFrameBase(strip)).toBe(3);
    expect(mobileReaderPagedStripPageBase(strip)).toBe(3);
    expect(mobileReaderPagedStripGlobalFrame(strip, 1, 0)).toBe(3);
    expect(mobileReaderPagedStripGlobalFrame(strip, 1, 4)).toBeNull();
    expect(mobileReaderPagedStripLocate(strip, 2)).toMatchObject({ chapterId: "c1", localFrame: 2, localPages: [2] });
    expect(mobileReaderPagedStripLocate(strip, 7)).toMatchObject({ chapterId: "c3", localFrame: 0, localPages: [0] });
    expect(mobileReaderPagedStripLocatePage(strip, 6)).toEqual({ segmentIndex: 1, localPage: 3 });
  });

  test("two pages: each chapter pairs its own pages, no spread mixes two chapters", () => {
    const strip = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 3, [[0], [1, 2]]), chapter("c2", 5, [[0], [1, 2], [3, 4]])],
      currentIndex: 1,
      twoPage: true,
    });
    expect(strip.spreads).toEqual([[0], [1, 2], [3], [4, 5], [6, 7]]);
    expect(mobileReaderPagedStripFrameBase(strip)).toBe(2);
    expect(mobileReaderPagedStripPageBase(strip)).toBe(3);
    for (const spread of strip.spreads) {
      const owners = new Set(spread.map((page) => mobileReaderPagedStripLocatePage(strip, page)!.segmentIndex));
      expect(owners.size).toBe(1);
    }
    // A table that does not cover the chapter (stale) falls back to single pages.
    const stale = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 3, [[0], [1, 2], [3]])],
      currentIndex: 0,
      twoPage: true,
    });
    expect(stale.spreads).toEqual([[0], [1], [2]]);
  });

  test("a settled frame in another chapter is a crossing; the open chapter's frames are not", () => {
    const strip = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 3), chapter("c2", 4), placeholder("c3")],
      currentIndex: 1,
      twoPage: false,
    });
    expect(mobileReaderPagedStripCrossing(strip, 4)).toBeNull();
    expect(mobileReaderPagedStripCrossing(strip, 2)).toMatchObject({
      chapterId: "c1",
      direction: "backward",
      localFrame: 2,
      placeholder: false,
    });
    expect(mobileReaderPagedStripCrossing(strip, 7)).toMatchObject({
      chapterId: "c3",
      direction: "forward",
      placeholder: true,
    });
  });

  test("a backward crossing from p1 lands on the previous chapter's last page or spread", () => {
    const strip = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 5, [[0], [1, 2], [3, 4]]), chapter("c2", 4, [[0], [1, 2], [3]])],
      currentIndex: 1,
      twoPage: true,
    });
    // p1 of c2 is frame 3; one turn back is frame 2: c1's last spread.
    const back = mobileReaderPagedStripCrossing(strip, mobileReaderPagedStripFrameBase(strip) - 1);
    expect(back).toMatchObject({ chapterId: "c1", localFrame: 2, localPages: [3, 4] });
  });

  test("the pager stays on its frame when the previous chapter joins (LTR and RTL)", () => {
    const before = buildMobileReaderPagedStrip({
      segments: [chapter("c2", 4)],
      currentIndex: 0,
      twoPage: false,
    });
    const after = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 3), chapter("c2", 4)],
      currentIndex: 1,
      twoPage: false,
    });
    // On c2 p2 (frame 1): after the prepend it is frame 4.
    const frame = mobileReaderPagedStripReanchor(before, after, 1);
    expect(frame).toBe(4);
    // LTR: the visual offset moves by the prepended frames.
    expect(readerScrollOffsetForLogicalFrame(frame, after.frameCount, 100, "ltr")).toBe(400);
    // RTL: frames are laid out reversed, so the prepend lands at the far
    // (right) end and the visual offset of the same page does not move.
    expect(readerScrollOffsetForLogicalFrame(1, before.frameCount, 100, "rtl")).toBe(200);
    expect(readerScrollOffsetForLogicalFrame(frame, after.frameCount, 100, "rtl")).toBe(200);
  });

  test("the next chapter joining moves the RTL offset, never the LTR one", () => {
    const before = buildMobileReaderPagedStrip({ segments: [chapter("c1", 3)], currentIndex: 0, twoPage: false });
    const after = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 3), chapter("c2", 5)],
      currentIndex: 0,
      twoPage: false,
    });
    const frame = mobileReaderPagedStripReanchor(before, after, 2);
    expect(frame).toBe(2);
    expect(readerScrollOffsetForLogicalFrame(2, 3, 100, "ltr")).toBe(
      readerScrollOffsetForLogicalFrame(frame, 8, 100, "ltr"),
    );
    expect(readerScrollOffsetForLogicalFrame(2, 3, 100, "rtl")).toBe(0);
    expect(readerScrollOffsetForLogicalFrame(frame, 8, 100, "rtl")).toBe(500);
  });

  test("a placeholder the reader landed on becomes its chapter's edge next to the open one", () => {
    const loadingPrevious = buildMobileReaderPagedStrip({
      segments: [placeholder("c1"), chapter("c2", 4)],
      currentIndex: 1,
      twoPage: false,
    });
    const previousArrived = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 6), chapter("c2", 4)],
      currentIndex: 1,
      twoPage: false,
    });
    // On the placeholder (frame 0): the previous chapter's last page.
    expect(mobileReaderPagedStripReanchor(loadingPrevious, previousArrived, 0)).toBe(5);
    // On c2 p1 (frame 1): still c2 p1.
    expect(mobileReaderPagedStripReanchor(loadingPrevious, previousArrived, 1)).toBe(6);

    const loadingNext = buildMobileReaderPagedStrip({
      segments: [chapter("c2", 4), placeholder("c3")],
      currentIndex: 0,
      twoPage: true,
    });
    const nextArrived = buildMobileReaderPagedStrip({
      segments: [chapter("c2", 4), chapter("c3", 5, [[0], [1, 2], [3, 4]])],
      currentIndex: 0,
      twoPage: true,
    });
    // On the placeholder (frame 4): the next chapter's first spread.
    expect(mobileReaderPagedStripReanchor(loadingNext, nextArrived, 4)).toBe(4);
    expect(mobileReaderPagedStripLocate(nextArrived, 4)).toMatchObject({ chapterId: "c3", localFrame: 0 });
  });

  test("a placeholder whose chapter failed leaves; the reader goes back to the open chapter's edge", () => {
    const loading = buildMobileReaderPagedStrip({
      segments: [chapter("c2", 4), placeholder("c3")],
      currentIndex: 0,
      twoPage: false,
    });
    const failed = buildMobileReaderPagedStrip({ segments: [chapter("c2", 4)], currentIndex: 0, twoPage: false });
    expect(mobileReaderPagedStripReanchor(loading, failed, 4)).toBe(3);
  });

  test("a crossing re-bases the list without moving the pager", () => {
    const segments = [chapter("c1", 3), chapter("c2", 4), chapter("c3", 2)];
    const before = buildMobileReaderPagedStrip({ segments, currentIndex: 1, twoPage: false });
    const after = buildMobileReaderPagedStrip({ segments, currentIndex: 2, twoPage: false });
    expect(mobileReaderPagedStripReanchor(before, after, 7)).toBe(7);
    expect(sameMobileReaderPagedStripFrames(before, after)).toBe(true);
    // The chapter two behind is dropped: everything moves back by its frames.
    const pruned = buildMobileReaderPagedStrip({ segments: segments.slice(1), currentIndex: 1, twoPage: false });
    expect(sameMobileReaderPagedStripFrames(after, pruned)).toBe(false);
    expect(mobileReaderPagedStripReanchor(after, pruned, 7)).toBe(4);
  });

  test("a chapter's table re-pairing ahead keeps the spread holding the frame's leading page", () => {
    const before = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 5, [[0], [1, 2], [3, 4]]), chapter("c2", 5, [[0], [1, 2], [3, 4]])],
      currentIndex: 1,
      twoPage: true,
    });
    // c1 (behind the reader) re-pairs: one more frame before c2.
    const after = buildMobileReaderPagedStrip({
      segments: [chapter("c1", 5, [[0], [1], [2], [3, 4]]), chapter("c2", 5, [[0], [1, 2], [3, 4]])],
      currentIndex: 1,
      twoPage: true,
    });
    expect(mobileReaderPagedStripReanchor(before, after, 4)).toBe(5);
    expect(mobileReaderPagedStripLocate(after, 5)).toMatchObject({ chapterId: "c2", localPages: [1, 2] });
  });

  test("the previous chapter warms while the reader is in the first two pages", () => {
    expect(shouldWarmMobileReaderPagedStripPrevious(0)).toBe(true);
    expect(shouldWarmMobileReaderPagedStripPrevious(1)).toBe(true);
    expect(shouldWarmMobileReaderPagedStripPrevious(2)).toBe(false);
  });
});
