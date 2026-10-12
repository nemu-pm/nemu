import { describe, expect, test } from "bun:test";
import {
  DEFAULT_READER_SPREAD_MODE,
  normalizeReaderSpreadMode,
  readerAutoSpreadFits,
  resolveReaderSpreadWanted,
} from "./mobileReaderSpreadMode";

describe("reader spread mode", () => {
  test("a saved three-way choice wins over the older boolean", () => {
    expect(normalizeReaderSpreadMode("single", true)).toBe("single");
    expect(normalizeReaderSpreadMode("double", false)).toBe("double");
    expect(normalizeReaderSpreadMode("auto", false)).toBe("auto");
  });

  test("profiles saved before the choice keep what they had", () => {
    expect(normalizeReaderSpreadMode(undefined, true)).toBe("double");
    expect(normalizeReaderSpreadMode(undefined, false)).toBe("single");
    expect(normalizeReaderSpreadMode(undefined, undefined)).toBe(DEFAULT_READER_SPREAD_MODE);
    expect(normalizeReaderSpreadMode("spread", null)).toBe(DEFAULT_READER_SPREAD_MODE);
  });

  test("auto shows spreads where both pages stay as large as one: iPad landscape, Duo inner landscape", () => {
    expect(readerAutoSpreadFits({ width: 1180, height: 820 })).toBe(true);
    expect(readerAutoSpreadFits({ width: 951, height: 669 })).toBe(true);
    // The half-folded Duo: the top pane is landscape-shaped.
    expect(readerAutoSpreadFits({ width: 669, height: 455.5 })).toBe(true);
  });

  test("auto keeps portrait windows and phones single", () => {
    expect(readerAutoSpreadFits({ width: 820, height: 1180 })).toBe(false);
    expect(readerAutoSpreadFits({ width: 669, height: 951 })).toBe(false);
    expect(readerAutoSpreadFits({ width: 402, height: 874 })).toBe(false);
    // Phone landscape and the closed Duo in landscape beside its bar are short.
    expect(readerAutoSpreadFits({ width: 874, height: 402 })).toBe(false);
    expect(readerAutoSpreadFits({ width: 956, height: 440 })).toBe(false);
    expect(readerAutoSpreadFits({ width: 594, height: 466 })).toBe(false);
  });

  test("auto follows the real window size as it changes (rotation, fold, resize)", () => {
    const sizes = [
      { width: 820, height: 1180, expected: false },
      { width: 1180, height: 820, expected: true },
      { width: 700, height: 820, expected: false },
      { width: 1000, height: 700, expected: true },
    ];
    for (const { expected, ...size } of sizes) expect(resolveReaderSpreadWanted("auto", size)).toBe(expected);
  });

  test("single and double ignore the size", () => {
    expect(resolveReaderSpreadWanted("single", { width: 1180, height: 820 })).toBe(false);
    expect(resolveReaderSpreadWanted("double", { width: 402, height: 874 })).toBe(true);
  });

  test("bad sizes are never wide enough", () => {
    expect(readerAutoSpreadFits({ width: Number.NaN, height: 600 })).toBe(false);
    expect(readerAutoSpreadFits({ width: 900, height: 0 })).toBe(false);
  });
});
