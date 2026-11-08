import { describe, expect, test } from "bun:test";
import { MOBILE_READER_CHROME_GLYPHS } from "./mobileReaderBarIcons";
import { mobileReaderVerticalBarChapterListFits, READER_VERTICAL_BAR_MAX_ACTIONS } from "./mobileReaderVerticalBar";

const outer = { height: 678, bottomInset: 20, coverToggle: true };

describe("reader vertical bar: the chapter list's button", () => {
  test("the cap is the bottom bar's: four actions", () => {
    expect(READER_VERTICAL_BAR_MAX_ACTIONS).toBe(4);
  });

  test("outer display with Detect, Chat, Dual Read and the gear: a fifth goes to ⋯", () => {
    expect(mobileReaderVerticalBarChapterListFits(4, outer)).toBe(false);
  });

  test("room and under the cap: in the pill", () => {
    expect(mobileReaderVerticalBarChapterListFits(1, outer)).toBe(true);
    expect(mobileReaderVerticalBarChapterListFits(3, outer)).toBe(true);
    expect(mobileReaderVerticalBarChapterListFits(3, { ...outer, coverToggle: false })).toBe(true);
  });

  test("a short window sends it to ⋯ even under the cap", () => {
    expect(mobileReaderVerticalBarChapterListFits(3, { ...outer, height: 520 })).toBe(false);
    expect(mobileReaderVerticalBarChapterListFits(1, { ...outer, height: 476 })).toBe(true);
    expect(mobileReaderVerticalBarChapterListFits(1, { ...outer, height: 475 })).toBe(false);
  });

  test("the toggle takes a slot of height", () => {
    const h = 571;
    expect(mobileReaderVerticalBarChapterListFits(3, { height: h, bottomInset: 0, coverToggle: false })).toBe(true);
    expect(mobileReaderVerticalBarChapterListFits(3, { height: h, bottomInset: 0, coverToggle: true })).toBe(false);
  });

  test("only height grows the answer: a resize never bounces the button", () => {
    let previous = false;
    for (let height = 300; height <= 1000; height += 1) {
      const fits = mobileReaderVerticalBarChapterListFits(2, { height, bottomInset: 20, coverToggle: true });
      if (previous) expect(fits).toBe(true);
      previous = fits;
    }
  });

  test("⋯ is drawn like the gear: Ionicons at the gear's size", () => {
    expect(MOBILE_READER_CHROME_GLYPHS.more).toEqual({ name: "ellipsis-horizontal", size: MOBILE_READER_CHROME_GLYPHS.settings.size });
  });
});
