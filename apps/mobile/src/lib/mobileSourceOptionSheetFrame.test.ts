import { describe, expect, test } from "bun:test";
import {
  MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT,
  resolveMobileSourceOptionSheetFrame,
} from "./mobileSourceOptionSheetFrame";

describe("resolveMobileSourceOptionSheetFrame", () => {
  test("short lists hug their content", () => {
    expect(resolveMobileSourceOptionSheetFrame(0)).toEqual({
      frameMaxHeight: undefined,
      scroll: false,
    });
    expect(
      resolveMobileSourceOptionSheetFrame(MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT),
    ).toEqual({ frameMaxHeight: undefined, scroll: false });
  });

  test("long lists (Pepper&Carrot's 10 languages) scroll inside a bounded detent", () => {
    expect(resolveMobileSourceOptionSheetFrame(10)).toEqual({
      frameMaxHeight: "80%",
      scroll: true,
    });
    expect(
      resolveMobileSourceOptionSheetFrame(MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT + 1),
    ).toEqual({ frameMaxHeight: "80%", scroll: true });
  });

  test("a bounded detent always scrolls", () => {
    for (let count = 0; count <= 40; count += 1) {
      const frame = resolveMobileSourceOptionSheetFrame(count);
      expect(frame.scroll).toBe(frame.frameMaxHeight !== undefined);
    }
  });
});
