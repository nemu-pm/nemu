import { describe, expect, test } from "bun:test";
import { readerChromeMotionVariant } from "./mobileReaderChromeMotion";

describe("reader chrome motion variant", () => {
  test("slides only once Reduce Motion is known to be off", () => {
    expect(readerChromeMotionVariant(false)).toBe("slide");
  });

  test("fades for Reduce Motion and for an unresolved setting", () => {
    expect(readerChromeMotionVariant(true)).toBe("fade");
    expect(readerChromeMotionVariant(null)).toBe("fade");
  });
});
