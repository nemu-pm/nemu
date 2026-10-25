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
  READER_OPENING_CHROME_DONE_BY_MS,
  READER_OPENING_CHROME_MIN_MS,
  READER_OPENING_MOUNT_LEAD_MS,
  resolveReaderOpeningChromeMs,
  resolveReaderOpeningMountDelay,
} from "./mobileReaderChromeMotion";

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

  test("fades over 200ms and moves 6pt toward the edge; Reduce Motion fades only, no movement", () => {
    expect(readerChromeMaterialTiming(false)).toEqual({
      durationMs: READER_CHROME_MATERIAL_MS,
      slide: READER_CHROME_MATERIAL_SLIDE,
    });
    expect(READER_CHROME_MATERIAL_MS).toBe(200);
    expect(READER_CHROME_MATERIAL_SLIDE).toBe(6);
    expect(readerChromeMaterialTiming(true)).toEqual({
      durationMs: READER_CHROME_MATERIAL_MS,
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

describe("reader opening: the chrome's fade is done by the visible landing + 0.25 s (build 9 round 2)", () => {
  const landsAt = 10_000;
  test("the reader mounts READER_OPENING_MOUNT_LEAD_MS before the nominal landing, at once past it", () => {
    expect(READER_OPENING_MOUNT_LEAD_MS).toBe(120);
    expect(resolveReaderOpeningMountDelay({ landsAtMs: landsAt, nowMs: landsAt - 350 })).toBe(230);
    expect(resolveReaderOpeningMountDelay({ landsAtMs: landsAt, nowMs: landsAt - 50 })).toBe(0);
    expect(resolveReaderOpeningMountDelay({ landsAtMs: landsAt, nowMs: landsAt + 100 })).toBe(0);
    expect(resolveReaderOpeningMountDelay({ landsAtMs: Number.NaN, nowMs: 0 })).toBe(0);
  });

  test("a reader that mounts by the landing fades in the usual 200 ms, done by +230", () => {
    for (const mountedAt of [landsAt - 120, landsAt - 20, landsAt, landsAt + 30]) {
      const ms = resolveReaderOpeningChromeMs({ landsAtMs: landsAt, nowMs: mountedAt, durationMs: READER_CHROME_MATERIAL_MS });
      expect(ms).toBe(READER_CHROME_MATERIAL_MS);
      expect(mountedAt + ms).toBeLessThanOrEqual(landsAt + READER_OPENING_CHROME_DONE_BY_MS);
    }
  });

  test("a late reader shortens the fade to end by +230 (never below the minimum)", () => {
    // Round 2's fade starts: N+0.20–0.27 s with the mount at the landing event.
    expect(resolveReaderOpeningChromeMs({ landsAtMs: landsAt, nowMs: landsAt + 80, durationMs: 200 })).toBe(150);
    expect(resolveReaderOpeningChromeMs({ landsAtMs: landsAt, nowMs: landsAt + 100, durationMs: 200 })).toBe(130);
    expect(resolveReaderOpeningChromeMs({ landsAtMs: landsAt, nowMs: landsAt + 200, durationMs: 200 })).toBe(READER_OPENING_CHROME_MIN_MS);
  });

  test("no zoom (no landing known) or no animation: unchanged", () => {
    expect(resolveReaderOpeningChromeMs({ landsAtMs: null, nowMs: 5, durationMs: 200 })).toBe(200);
    expect(resolveReaderOpeningChromeMs({ landsAtMs: landsAt, nowMs: landsAt + 500, durationMs: 0 })).toBe(0);
  });
});
