import { describe, expect, test } from "bun:test";
import { classifyReaderWindowShape } from "./mobileReaderWindowShape";

describe("reader window shape", () => {
  test("phones: portrait is narrow, landscape is wide", () => {
    expect(classifyReaderWindowShape({ width: 402, height: 874 })).toBe("narrow");
    expect(classifyReaderWindowShape({ width: 874, height: 402 })).toBe("wide");
    expect(classifyReaderWindowShape({ width: 440, height: 956 })).toBe("narrow");
    expect(classifyReaderWindowShape({ width: 956, height: 440 })).toBe("wide");
  });

  test("iPhone Duo outer display follows its aspect, whichever way it is held", () => {
    expect(classifyReaderWindowShape({ width: 466, height: 678 })).toBe("narrow");
    expect(classifyReaderWindowShape({ width: 678, height: 466 })).toBe("wide");
    // Beside the vertical bar (84pt) the closed landscape stage is still short and wide.
    expect(classifyReaderWindowShape({ width: 594, height: 466 })).toBe("wide");
  });

  test("iPhone Duo inner display and iPad are large in both orientations", () => {
    expect(classifyReaderWindowShape({ width: 669, height: 951 })).toBe("large");
    expect(classifyReaderWindowShape({ width: 951, height: 669 })).toBe("large");
    expect(classifyReaderWindowShape({ width: 820, height: 1180 })).toBe("large");
    expect(classifyReaderWindowShape({ width: 1180, height: 820 })).toBe("large");
  });

  test("the half-folded Duo reads its top pane as a wide window", () => {
    expect(classifyReaderWindowShape({ width: 669, height: 455.5 })).toBe("wide");
  });

  test("a narrow Split View pane is narrow even on an iPad", () => {
    expect(classifyReaderWindowShape({ width: 507, height: 1180 })).toBe("narrow");
    expect(classifyReaderWindowShape({ width: 334, height: 951 })).toBe("narrow");
  });

  test("a square window is narrow and bad input is safe", () => {
    expect(classifyReaderWindowShape({ width: 500, height: 500 })).toBe("narrow");
    expect(classifyReaderWindowShape({ width: Number.NaN, height: 800 })).toBe("narrow");
    expect(classifyReaderWindowShape({ width: 0, height: 0 })).toBe("narrow");
  });
});
