import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout } from "./mobileAdaptiveLayout";
import {
  classifyMobilePoseChange,
  mergeMobilePoseVeilPlans,
  MOBILE_MOTION,
  mobilePoseSignature,
  mobilePoseVeilPlan,
  mobilePoseVeilRevealAt,
  mobileSpringOvershoot,
  mobileSpringSettleMs,
  type MobilePoseSignature,
} from "./mobileMotion";
import type { MobileWindowLayout } from "./mobileWindowLayout";

// Measured iPhone Duo geometry (tests/fixtures/iphone-duo).
const OUTER_PORTRAIT: MobileWindowLayout = {
  width: 466,
  height: 678,
  supported: true,
  divisions: [],
  occlusions: [],
  verticalBarEdge: "trailing",
  safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 84 },
  hinge: "closed",
};
const INNER_LANDSCAPE_FLAT: MobileWindowLayout = {
  width: 951,
  height: 669,
  supported: true,
  divisions: [
    { id: "division-0", x: 455.5, y: 0, width: 40, height: 669, active: false },
  ] as MobileWindowLayout["divisions"],
  occlusions: [],
  verticalBarEdge: "trailing",
  safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 84 },
  hinge: "fullyOpen",
};
const INNER_LANDSCAPE_BOOK: MobileWindowLayout = {
  ...INNER_LANDSCAPE_FLAT,
  divisions: [
    { id: "division-0", x: 455.5, y: 0, width: 40, height: 669, active: true },
  ] as MobileWindowLayout["divisions"],
  hinge: "partiallyOpen",
};
const INNER_PORTRAIT: MobileWindowLayout = {
  width: 669,
  height: 951,
  supported: true,
  divisions: [],
  occlusions: [],
  safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
  hinge: "fullyOpen",
};

function sig(layout: MobileWindowLayout): MobilePoseSignature {
  return mobilePoseSignature(mobileAdaptiveLayout(layout));
}

describe("settle spring", () => {
  test("overshoots at most 2% and settles inside the ~350 ms budget", () => {
    expect(mobileSpringOvershoot(MOBILE_MOTION.settleSpring)).toBeLessThanOrEqual(0.02);
    expect(mobileSpringOvershoot(MOBILE_MOTION.settleSpring)).toBeGreaterThan(0);
    expect(mobileSpringSettleMs(MOBILE_MOTION.settleSpring)).toBeLessThanOrEqual(350);
  });

  test("the spec's damping 22 would overshoot more than 2%", () => {
    expect(mobileSpringOvershoot({ damping: 22, stiffness: 220, mass: 1 })).toBeGreaterThan(0.02);
  });

  test("critically damped springs do not overshoot", () => {
    expect(mobileSpringOvershoot({ damping: 40, stiffness: 400, mass: 1 })).toBe(0);
  });

  test("timings stay inside the spec ranges", () => {
    expect(MOBILE_MOTION.fadeInMs).toBeGreaterThanOrEqual(180);
    expect(MOBILE_MOTION.fadeInMs).toBeLessThanOrEqual(240);
    expect(MOBILE_MOTION.fadeOutMs).toBeGreaterThanOrEqual(180);
    expect(MOBILE_MOTION.fadeOutMs).toBeLessThanOrEqual(240);
    expect(MOBILE_MOTION.blurInMs).toBe(120);
    expect(MOBILE_MOTION.blurOutMs).toBe(260);
    expect(MOBILE_MOTION.reduceMotionFadeMs).toBe(150);
  });
});

describe("classifyMobilePoseChange", () => {
  test("the first snapshot is not a change", () => {
    expect(classifyMobilePoseChange(null, sig(OUTER_PORTRAIT)).kind).toBe("none");
  });

  test("identical geometry is not a change", () => {
    expect(classifyMobilePoseChange(sig(INNER_PORTRAIT), sig({ ...INNER_PORTRAIT })).kind).toBe("none");
  });

  test("outer → inner display is a resize", () => {
    expect(classifyMobilePoseChange(sig(OUTER_PORTRAIT), sig(INNER_PORTRAIT))).toEqual({
      kind: "resize",
      anticipated: false,
    });
  });

  test("rotation (width/height swap) is a resize", () => {
    expect(classifyMobilePoseChange(sig(INNER_PORTRAIT), sig(INNER_LANDSCAPE_FLAT)).kind).toBe("resize");
    expect(
      classifyMobilePoseChange(sig(OUTER_PORTRAIT), sig({ ...OUTER_PORTRAIT, width: 678, height: 466 })).kind,
    ).toBe("resize");
  });

  test("flat ↔ book at the same window size is a layout change, never a resize", () => {
    expect(classifyMobilePoseChange(sig(INNER_LANDSCAPE_FLAT), sig(INNER_LANDSCAPE_BOOK)).kind).toBe("layout");
    expect(classifyMobilePoseChange(sig(INNER_LANDSCAPE_BOOK), sig(INNER_LANDSCAPE_FLAT)).kind).toBe("layout");
  });

  test("closing the hinge before the window moves is an anticipated resize", () => {
    expect(
      classifyMobilePoseChange(sig(INNER_PORTRAIT), sig({ ...INNER_PORTRAIT, hinge: "closed" })),
    ).toEqual({ kind: "resize", anticipated: true });
  });

  test("partiallyOpen ↔ fullyOpen alone is not a display change", () => {
    expect(
      classifyMobilePoseChange(sig(INNER_PORTRAIT), sig({ ...INNER_PORTRAIT, hinge: "partiallyOpen" })).kind,
    ).toBe("none");
  });

  test("a small live-resize step stays a layout change (no veil per drag event)", () => {
    const tablet = { ...INNER_PORTRAIT, width: 700, height: 900, hinge: null };
    expect(classifyMobilePoseChange(sig(tablet), sig({ ...tablet, width: 720 })).kind).toBe("layout");
  });

  test("crossing a width class is a resize even in small steps", () => {
    const window = { ...INNER_PORTRAIT, width: 590, height: 900, hinge: null };
    expect(classifyMobilePoseChange(sig(window), sig({ ...window, width: 610 })).kind).toBe("resize");
  });

  test("a 180° rotation (bar column changes sides at the same size) is veiled like a rotation", () => {
    const right = { ...OUTER_PORTRAIT, width: 678, height: 466 };
    const left = { ...right, safeAreaInsets: { top: 0, left: 84, bottom: 34, right: 0 } };
    expect(classifyMobilePoseChange(sig(right), sig(left)).kind).toBe("resize");
  });

  test("the bar column appearing at the same size is a layout change", () => {
    const bars = { ...INNER_PORTRAIT, verticalBarEdge: "trailing" as const, safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 84 } };
    expect(classifyMobilePoseChange(sig(INNER_PORTRAIT), sig(bars)).kind).toBe("layout");
  });
});

describe("mobilePoseVeilPlan", () => {
  test("layout changes animate in place: no veil", () => {
    expect(mobilePoseVeilPlan({ reason: "layout", reduceMotion: false, blurAvailable: true })).toBeNull();
  });

  test("resize on iOS: frosted blur + 60% tint, instant in, 260 ms out", () => {
    expect(mobilePoseVeilPlan({ reason: "resize", reduceMotion: false, blurAvailable: true })).toEqual({
      blurIntensity: MOBILE_MOTION.veilBlurIntensity,
      tintOpacity: 0.6,
      fadeInMs: 0,
      holdMs: MOBILE_MOTION.veilHoldMs,
      fadeOutMs: 260,
    });
  });

  test("anticipated resize ramps the blur in over 120 ms", () => {
    expect(
      mobilePoseVeilPlan({ reason: "resize", anticipated: true, reduceMotion: false, blurAvailable: true })?.fadeInMs,
    ).toBe(120);
  });

  test("no blur (Android): a denser colour wash instead", () => {
    const plan = mobilePoseVeilPlan({ reason: "remount", reduceMotion: false, blurAvailable: false });
    expect(plan?.blurIntensity).toBe(0);
    expect(plan?.tintOpacity).toBeGreaterThan(0.6);
  });

  test("Reduce Motion: no blur, a 150 ms fade for every change including layout ones", () => {
    for (const reason of ["layout", "resize", "remount"] as const) {
      const plan = mobilePoseVeilPlan({ reason, reduceMotion: true, blurAvailable: true });
      expect(plan?.blurIntensity).toBe(0);
      expect(plan?.fadeInMs).toBe(0);
      expect(plan?.fadeOutMs).toBe(150);
      expect(plan?.tintOpacity).toBeLessThanOrEqual(0.5);
    }
  });

  test("merging keeps the strongest peak and never re-ramps", () => {
    const resize = mobilePoseVeilPlan({ reason: "resize", reduceMotion: false, blurAvailable: true })!;
    const anticipated = mobilePoseVeilPlan({ reason: "resize", anticipated: true, reduceMotion: false, blurAvailable: true })!;
    expect(mergeMobilePoseVeilPlans(anticipated, resize)).toEqual({ ...resize, fadeInMs: 0 });
    expect(mergeMobilePoseVeilPlans(null, resize)).toBe(resize);
  });
});

describe("mobilePoseVeilRevealAt", () => {
  test("reveals a hold after the change settles", () => {
    expect(mobilePoseVeilRevealAt({ sessionStart: 1000, settledAt: 1050, holdMs: 120 })).toBe(1170);
  });

  test("a stream of changes cannot keep the app veiled past the cap", () => {
    expect(
      mobilePoseVeilRevealAt({ sessionStart: 1000, settledAt: 1900, holdMs: 120 }),
    ).toBe(1000 + MOBILE_MOTION.veilMaxHoldMs);
  });
});
