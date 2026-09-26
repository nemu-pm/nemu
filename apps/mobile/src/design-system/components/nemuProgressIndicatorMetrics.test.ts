import { describe, expect, test } from "bun:test";
import {
  NEMU_PROGRESS_DEFAULT_SIZE,
  resolveNemuProgressIndicatorMetrics,
} from "./nemuProgressIndicatorMetrics";

describe("resolveNemuProgressIndicatorMetrics", () => {
  test("the requested size is the exact indicator box", () => {
    expect(resolveNemuProgressIndicatorMetrics(20)).toEqual({ size: 20, strokeWidth: 2 });
    expect(resolveNemuProgressIndicatorMetrics(40)).toEqual({ size: 40, strokeWidth: 4 });
    expect(resolveNemuProgressIndicatorMetrics(28)).toEqual({ size: 28, strokeWidth: 3 });
  });

  test("keeps the stroke readable on tiny spinners", () => {
    expect(resolveNemuProgressIndicatorMetrics(12).strokeWidth).toBe(2);
  });

  test("falls back to the historic host size", () => {
    for (const size of [undefined, 0, -4, Number.NaN]) {
      expect(resolveNemuProgressIndicatorMetrics(size).size).toBe(NEMU_PROGRESS_DEFAULT_SIZE);
    }
  });
});
