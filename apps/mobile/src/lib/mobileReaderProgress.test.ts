import { describe, expect, test } from "bun:test";
import {
  clampReaderPageIndex,
  formatReaderPageActionAccessibilityLabel,
  formatReaderPageValue,
  readerDisplayIndexForRoutePage,
  readerDisplayIndexForScrollOffset,
  readerDisplayIndexForViewableItems,
  readerDisplayIndexForSourceIndex,
  readerDisplayIndexForVisualProgressRatio,
  readerDisplayIndexFromOffset,
  readerProgressDisplayIndexForVisiblePages,
  readerProgressRatio,
  readerRoutePageForDisplayIndex,
  readerLogicalFrameIndexForVisualFrame,
  readerPageArrivalForStep,
  readerScrollOffsetForLogicalFrame,
  readerSourceIndexForDisplayIndex,
  readerSourceStepTargetForDisplayIndex,
  readerVisualFrameIndexForLogicalFrame,
  readerVisualProgressRatio,
  shouldAutoCompleteMobileReaderChapter,
  shouldRunReaderMenuPageSwitchHaptic,
} from "./mobileReaderProgress";
import { getMobileStrings } from "./mobileI18n";

const strings = getMobileStrings("en");

describe("mobile reader progress helpers", () => {
  test("clamps page indices into the available page range", () => {
    expect(clampReaderPageIndex(-4, 6)).toBe(0);
    expect(clampReaderPageIndex(2.4, 6)).toBe(2);
    expect(clampReaderPageIndex(2.6, 6)).toBe(3);
    expect(clampReaderPageIndex(99, 6)).toBe(5);
    expect(clampReaderPageIndex(2, 0)).toBe(0);
  });

  test("derives display index from scroll offset", () => {
    expect(readerDisplayIndexFromOffset(0, 390, 5)).toBe(0);
    expect(readerDisplayIndexFromOffset(389, 390, 5)).toBe(1);
    expect(readerDisplayIndexFromOffset(390 * 3.2, 390, 5)).toBe(3);
    expect(readerDisplayIndexFromOffset(390 * 9, 390, 5)).toBe(4);
    expect(readerDisplayIndexFromOffset(100, 0, 5)).toBe(0);
  });

  test("derives scrolling page index from measured page layouts", () => {
    const pages = [
      { y: 0, height: 400 },
      { y: 410, height: 500 },
      { y: 920, height: 300 },
    ];
    expect(
      readerDisplayIndexForScrollOffset(0, 800, pages, 3),
    ).toBe(0);
    expect(
      readerDisplayIndexForScrollOffset(250, 800, pages, 3),
    ).toBe(1);
    expect(
      readerDisplayIndexForScrollOffset(1000, 800, pages, 3),
    ).toBe(2);
  });

  test("tracks sparse measurements from a virtualized long chapter", () => {
    const pages = new Array<{ y: number; height: number } | undefined>(100);
    pages[47] = { y: 48_000, height: 1_000 };
    pages[48] = { y: 49_010, height: 900 };

    expect(
      readerDisplayIndexForScrollOffset(48_100, 800, pages, 100, 5),
    ).toBe(47);
    expect(
      readerDisplayIndexForScrollOffset(30_000, 800, pages, 100, 38),
    ).toBe(38);
  });

  test("selects the center page from a FlatList visible window", () => {
    expect(readerDisplayIndexForViewableItems([46, 47, 48], 100)).toBe(47);
    expect(readerDisplayIndexForViewableItems([47, 48], 100)).toBe(48);
    expect(readerDisplayIndexForViewableItems([], 100)).toBeNull();
  });

  test("maps paged frames to visual RTL order without changing source order", () => {
    expect(readerVisualFrameIndexForLogicalFrame(0, 5, "ltr")).toBe(0);
    expect(readerVisualFrameIndexForLogicalFrame(0, 5, "scrolling")).toBe(0);
    expect(readerVisualFrameIndexForLogicalFrame(0, 5, "rtl")).toBe(4);
    expect(readerVisualFrameIndexForLogicalFrame(4, 5, "rtl")).toBe(0);
    expect(readerLogicalFrameIndexForVisualFrame(0, 5, "rtl")).toBe(4);
    expect(readerLogicalFrameIndexForVisualFrame(4, 5, "rtl")).toBe(0);
    expect(readerLogicalFrameIndexForVisualFrame(99, 5, "rtl")).toBe(0);
  });

  test("maps initial paged offsets to the RTL visual frame", () => {
    expect(readerScrollOffsetForLogicalFrame(0, 5, 320, "ltr")).toBe(0);
    expect(readerScrollOffsetForLogicalFrame(0, 5, 320, "scrolling")).toBe(0);
    expect(readerScrollOffsetForLogicalFrame(0, 5, 320, "rtl")).toBe(1280);
    expect(readerScrollOffsetForLogicalFrame(4, 5, 320, "rtl")).toBe(0);
    expect(readerScrollOffsetForLogicalFrame(0, 5, 0, "rtl")).toBe(0);
  });

  test("keeps displayed pages in source order for every reading mode", () => {
    expect(readerSourceIndexForDisplayIndex(0, 5, "ltr")).toBe(0);
    expect(readerSourceIndexForDisplayIndex(0, 5, "scrolling")).toBe(0);
    expect(readerSourceIndexForDisplayIndex(0, 5, "rtl")).toBe(0);
    expect(readerSourceIndexForDisplayIndex(4, 5, "rtl")).toBe(4);
  });

  test("restores displayed pages from saved source-order progress", () => {
    expect(readerDisplayIndexForSourceIndex(2, 5, "ltr")).toBe(2);
    expect(readerDisplayIndexForSourceIndex(2, 5, "scrolling")).toBe(2);
    expect(readerDisplayIndexForSourceIndex(0, 5, "rtl")).toBe(0);
    expect(readerDisplayIndexForSourceIndex(4, 5, "rtl")).toBe(4);
  });

  test("restores displayed pages from route page numbers", () => {
    expect(readerDisplayIndexForRoutePage("3", 5, "ltr")).toBe(2);
    expect(readerDisplayIndexForRoutePage("3", 5, "scrolling")).toBe(2);
    expect(readerDisplayIndexForRoutePage("1", 5, "rtl")).toBe(0);
    expect(readerDisplayIndexForRoutePage("3.9", 5, "ltr")).toBe(2);
    expect(readerDisplayIndexForRoutePage("3px", 5, "ltr")).toBe(2);
    expect(readerDisplayIndexForRoutePage("1e2", 5, "ltr")).toBe(0);
    expect(readerDisplayIndexForRoutePage("99", 5, "ltr")).toBe(4);
    expect(readerDisplayIndexForRoutePage("0", 5, "ltr")).toBeNull();
    expect(readerDisplayIndexForRoutePage("0x10", 5, "ltr")).toBeNull();
    expect(readerDisplayIndexForRoutePage("not-a-page", 5, "ltr")).toBeNull();
    expect(readerDisplayIndexForRoutePage("1", 0, "ltr")).toBeNull();
  });

  test("maps displayed pages to source-order route page numbers", () => {
    expect(readerRoutePageForDisplayIndex(0, 5, "ltr")).toBe(1);
    expect(readerRoutePageForDisplayIndex(0, 5, "scrolling")).toBe(1);
    expect(readerRoutePageForDisplayIndex(0, 5, "rtl")).toBe(1);
    expect(readerRoutePageForDisplayIndex(4, 5, "rtl")).toBe(5);
  });

  test("steps page buttons in source order for every reading direction", () => {
    expect(readerSourceStepTargetForDisplayIndex(2, 5, "ltr", "previous")).toBe(1);
    expect(readerSourceStepTargetForDisplayIndex(2, 5, "ltr", "next")).toBe(3);
    expect(readerSourceStepTargetForDisplayIndex(2, 5, "scrolling", "previous")).toBe(1);
    expect(readerSourceStepTargetForDisplayIndex(2, 5, "scrolling", "next")).toBe(3);
    expect(readerSourceStepTargetForDisplayIndex(4, 5, "rtl", "previous")).toBe(3);
    expect(readerSourceStepTargetForDisplayIndex(4, 5, "rtl", "next")).toBeNull();
    expect(readerSourceStepTargetForDisplayIndex(0, 5, "rtl", "previous")).toBeNull();
    expect(readerSourceStepTargetForDisplayIndex(0, 5, "rtl", "next")).toBe(1);
    expect(readerSourceStepTargetForDisplayIndex(0, 0, "ltr", "next")).toBeNull();
  });

  test("uses the highest visible source page for spread progress", () => {
    expect(readerProgressDisplayIndexForVisiblePages([3, 4], 5, "ltr")).toBe(4);
    expect(readerProgressDisplayIndexForVisiblePages([1, 0], 5, "rtl")).toBe(1);
    expect(readerProgressDisplayIndexForVisiblePages([2], 5, "scrolling")).toBe(2);
    expect(readerProgressDisplayIndexForVisiblePages([], 5, "ltr")).toBe(0);
    expect(readerProgressDisplayIndexForVisiblePages([99], 5, "ltr")).toBe(4);
  });

  test("formats progress as a bounded ratio", () => {
    expect(readerProgressRatio(0, 0)).toBe(0);
    expect(readerProgressRatio(0, 1)).toBe(1);
    expect(readerProgressRatio(2, 5)).toBe(0.5);
    expect(readerProgressRatio(99, 5)).toBe(1);
  });

  test("gates menu page switch haptics to actual page changes", () => {
    expect(shouldRunReaderMenuPageSwitchHaptic(1, 2, 5)).toBe(true);
    expect(shouldRunReaderMenuPageSwitchHaptic(1, 1, 5)).toBe(false);
    expect(shouldRunReaderMenuPageSwitchHaptic(4, 99, 5)).toBe(false);
    expect(shouldRunReaderMenuPageSwitchHaptic(0, 1, 1)).toBe(false);
    expect(shouldRunReaderMenuPageSwitchHaptic(0, 1, 0)).toBe(false);
  });

  test("maps reader progress to RTL visual slider direction", () => {
    expect(readerVisualProgressRatio(0, 5, "ltr")).toBe(0);
    expect(readerVisualProgressRatio(0, 5, "scrolling")).toBe(0);
    expect(readerVisualProgressRatio(0, 5, "rtl")).toBe(1);
    expect(readerVisualProgressRatio(4, 5, "rtl")).toBe(0);
    expect(readerDisplayIndexForVisualProgressRatio(1, 5, "rtl")).toBe(0);
    expect(readerDisplayIndexForVisualProgressRatio(0, 5, "rtl")).toBe(4);
    expect(readerDisplayIndexForVisualProgressRatio(0.5, 5, "rtl")).toBe(2);
    expect(readerDisplayIndexForVisualProgressRatio(0.25, 5, "ltr")).toBe(1);
  });

  test("classifies page changes as forward, backward, or neither", () => {
    expect(readerPageArrivalForStep(3, 4, 5, "ltr")).toBe("forward");
    expect(readerPageArrivalForStep(4, 3, 5, "ltr")).toBe("backward");
    expect(readerPageArrivalForStep(3, 3, 5, "ltr")).toBe("initial");
    // Reading mode changes visual direction, not the persisted source order.
    expect(readerPageArrivalForStep(3, 4, 5, "rtl")).toBe("forward");
    expect(readerPageArrivalForStep(4, 3, 5, "rtl")).toBe("backward");
    expect(readerPageArrivalForStep(0, 4, 5, "scrolling")).toBe("forward");
    // Out-of-range indices clamp before comparison.
    expect(readerPageArrivalForStep(-3, 0, 5, "ltr")).toBe("initial");
    expect(readerPageArrivalForStep(4, 99, 5, "ltr")).toBe("initial");
    expect(readerPageArrivalForStep(1, 2, 0, "ltr")).toBe("initial");
  });

  test("auto-completes only after a forward turn onto the last page", () => {
    const base = { pageCount: 5, mode: "ltr" as const, completed: false };

    // Reading forward onto the final page completes the chapter.
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        displayIndex: 4,
        arrival: "forward",
      }),
    ).toBe(true);
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        mode: "scrolling",
        displayIndex: 4,
        arrival: "forward",
      }),
    ).toBe(true);
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        mode: "rtl",
        displayIndex: 4,
        arrival: "forward",
      }),
    ).toBe(true);

    // Opening the chapter at its last page via "previous chapter"
    // (startAt: "end") must never complete it.
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        displayIndex: 4,
        arrival: "initial",
      }),
    ).toBe(false);
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        mode: "rtl",
        displayIndex: 4,
        arrival: "initial",
      }),
    ).toBe(false);

    // Resuming saved progress on the last page, then paging backward, also
    // must not complete.
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        displayIndex: 4,
        arrival: "backward",
      }),
    ).toBe(false);

    // Not on the last page at all.
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        displayIndex: 3,
        arrival: "forward",
      }),
    ).toBe(false);
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        mode: "rtl",
        displayIndex: 0,
        arrival: "forward",
      }),
    ).toBe(false);

    // Already completed, or no pages loaded.
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        completed: true,
        displayIndex: 4,
        arrival: "forward",
      }),
    ).toBe(false);
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        pageCount: 0,
        displayIndex: 0,
        arrival: "forward",
      }),
    ).toBe(false);

    // Single-page chapters have no forward turn available, so viewing the one
    // page is what completes them.
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        pageCount: 1,
        displayIndex: 0,
        arrival: "initial",
      }),
    ).toBe(true);
    expect(
      shouldAutoCompleteMobileReaderChapter({
        ...base,
        pageCount: 1,
        completed: true,
        displayIndex: 0,
        arrival: "initial",
      }),
    ).toBe(false);
  });

  test("formats reader page values using source-order page numbers", () => {
    expect(formatReaderPageValue(1, 5, "ltr", strings)).toBe("Page 2 of 5");
    expect(formatReaderPageValue(1, 5, "scrolling", strings)).toBe("Page 2 of 5");
    expect(formatReaderPageValue(1, 5, "rtl", strings)).toBe("Page 2 of 5");
  });

  test("formats reader page action labels with target page context", () => {
    expect(
      formatReaderPageActionAccessibilityLabel(
        strings.reader.nextPage,
        2,
        5,
        "ltr",
        strings,
      ),
    ).toBe("Next page, Page 3 of 5");
    expect(
      formatReaderPageActionAccessibilityLabel(
        strings.reader.previousPage,
        2,
        5,
        "rtl",
        strings,
      ),
    ).toBe("Previous page, Page 3 of 5");
    expect(
      formatReaderPageActionAccessibilityLabel(
        strings.reader.nextSpread,
        99,
        5,
        "ltr",
        strings,
      ),
    ).toBe("Next spread, Page 5 of 5");
  });
});
