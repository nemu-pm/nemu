import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  READER_CHROME_MATERIAL_CURVE,
  READER_CHROME_MATERIAL_MS,
  READER_CHROME_MATERIAL_SLIDE,
  readerChromeHasScrubber,
  readerChromeMaterialTiming,
  readerChromeMotionVariant,
} from "./mobileReaderChromeMotion";
import { MOBILE_READER_REDUCE_MOTION_FADE_MS } from "./mobileReaderStageMotion";

/** Progress of a cubic-bezier(x1, y1, x2, y2) timing function at time t. */
function cubicBezierProgress([x1, y1, x2, y2]: readonly number[], t: number): number {
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < t) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

describe("reader chrome motion variant", () => {
  test("slides only once Reduce Motion is known to be off", () => {
    expect(readerChromeMotionVariant(false)).toBe("slide");
  });

  test("fades for Reduce Motion and for an unresolved setting", () => {
    expect(readerChromeMotionVariant(true)).toBe("fade");
    expect(readerChromeMotionVariant(null)).toBe("fade");
  });
});

describe("reader chrome material timing", () => {
  test("the scrim / slide curve is UIKit's ease-out, the curve the glass animates on", () => {
    // UIView.AnimationOptions.curveEaseOut = CAMediaTimingFunction(.easeOut).
    expect([...READER_CHROME_MATERIAL_CURVE]).toEqual([0, 0, 0.58, 1]);
    const swift = readFileSync(
      path.join(import.meta.dir, "../../modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift"),
      "utf8",
    );
    const animateMaterial = swift.slice(swift.indexOf("private func animateMaterial"));
    const body = animateMaterial.slice(0, animateMaterial.indexOf("\n  }\n"));
    expect(body).toContain(".curveEaseOut");
    expect(body).not.toMatch(/curveEaseIn\b|curveEaseInOut|curveLinear|usingSpringWithDamping/);
  });

  test("matches UIKit's progress, not the front-loaded cubic ease-out it replaced", () => {
    // Core Animation easeOut at half time.
    expect(cubicBezierProgress(READER_CHROME_MATERIAL_CURVE, 0.5)).toBeCloseTo(0.685, 2);
    const outCubic = 1 - (1 - 0.5) ** 3;
    expect(outCubic - cubicBezierProgress(READER_CHROME_MATERIAL_CURVE, 0.5)).toBeGreaterThan(0.15);
    expect(cubicBezierProgress(READER_CHROME_MATERIAL_CURVE, 0)).toBeCloseTo(0, 6);
    expect(cubicBezierProgress(READER_CHROME_MATERIAL_CURVE, 1)).toBeCloseTo(1, 6);
  });

  test("slides 8pt over 300ms; Reduce Motion cross-fades at the reader's short fade", () => {
    expect(readerChromeMaterialTiming(false)).toEqual({
      durationMs: READER_CHROME_MATERIAL_MS,
      slide: READER_CHROME_MATERIAL_SLIDE,
    });
    expect(READER_CHROME_MATERIAL_MS).toBe(300);
    expect(READER_CHROME_MATERIAL_SLIDE).toBe(8);
    expect(readerChromeMaterialTiming(true)).toEqual({
      durationMs: MOBILE_READER_REDUCE_MOTION_FADE_MS,
      slide: 0,
    });
    // Unresolved setting: the full material motion (the glass animates either way).
    expect(readerChromeMaterialTiming(null)).toEqual(readerChromeMaterialTiming(false));
  });
});

describe("reader chrome scrubber", () => {
  test("stays in the capsule chrome while the chapter has or is fetching pages", () => {
    expect(readerChromeHasScrubber({ pagesStatus: "ready", pageCount: 53 })).toBe(true);
    expect(readerChromeHasScrubber({ pagesStatus: "loading", pageCount: 0 })).toBe(true);
  });

  test("is absent without pages", () => {
    expect(readerChromeHasScrubber({ pagesStatus: "ready", pageCount: 0 })).toBe(false);
    expect(readerChromeHasScrubber({ pagesStatus: "error", pageCount: 0 })).toBe(false);
    expect(readerChromeHasScrubber({ pagesStatus: "idle", pageCount: 12 })).toBe(false);
  });
});
