import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import {
  japaneseLearningBubblePopoutFrame,
  japaneseLearningBubblePopoutMaxBottom,
  japaneseLearningBubblePopoutVerticalSpan,
} from "./mobileJapaneseLearningBubblePopout";
import {
  IOS_FLOATING_SHEET_INSET,
  resolveJapaneseLearningDrawerContentBleed,
  resolveJapaneseLearningDrawerDetent,
  resolveJapaneseLearningSentenceLayout,
} from "./mobileJapaneseLearningSheetLayout";
import { MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT, resolveMobileNativeSheetAndroidFrame } from "./mobileNativeSheet";
import { mobileHorizontalFoldBand, mobileRestingFoldMinGutter } from "./mobileRestingFold";
import type { MobileWindowLayout } from "./mobileWindowLayout";

type Measurement = (typeof fixture.measurements)[number];

function duo(pose: string, orientation: string) {
  const m = fixture.measurements.find(
    (x) => x.screen.startsWith("iphone-duo") && x.pose === pose && x.orientation === orientation,
  );
  if (!m) throw new Error(`missing Duo fixture ${pose} ${orientation}`);
  return m;
}

function toLayout(m: Measurement): MobileWindowLayout {
  const regions = m.regions.map((r, index) => ({ id: `${r.kind}-${index}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width,
    height: m.bounds.height,
    supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
  };
}

function iosInputs(m: Measurement, platform = "ios") {
  const layout = toLayout(m);
  return {
    platform,
    isPad: false,
    windowWidth: m.bounds.width,
    windowHeight: m.bounds.height,
    safeAreaTop: m.insets.top,
    safeAreaBottom: m.insets.bottom,
    horizontalFold: mobileHorizontalFoldBand(layout, mobileRestingFoldMinGutter(platform)),
  };
}

/**
 * Where iOS draws the floating sheet's top edge for a height detent on a
 * regular-width window (inset at its real size; measured on the Duo
 * simulator: detent 424 → top 485, bottom 943 on the 951pt inner display).
 */
function iosShownTop(detent: number, input: ReturnType<typeof iosInputs>) {
  return input.windowHeight - IOS_FLOATING_SHEET_INSET - (detent + input.safeAreaBottom);
}

test("the measured Duo sheet geometry (regular width: inset, not scaled)", () => {
  const input = iosInputs(duo("open", "portrait"));
  expect(iosShownTop(424, input)).toBe(485);
});

/** A crop of a tall vertical speech bubble (the Hanako-kun demo's shape). */
const BUBBLE = { cropWidth: 300, cropHeight: 400 };

describe("mobileHorizontalFoldBand", () => {
  test("iPhone Duo inner portrait, fully open: the inactive division with Apple's 40pt margins", () => {
    expect(mobileHorizontalFoldBand(toLayout(duo("open", "portrait")), 40)).toEqual({
      top: 455.5,
      bottom: 495.5,
      active: false,
    });
  });

  test("iPhone Duo inner portrait, half open: the active division", () => {
    expect(mobileHorizontalFoldBand(toLayout(duo("partially-folded", "portrait")))).toEqual({
      top: 455.5,
      bottom: 495.5,
      active: true,
    });
  });

  test("a zero-height flat division (Apple's inactive frame) still gets the platform gutter", () => {
    const layout: MobileWindowLayout = {
      width: 669,
      height: 951,
      supported: true,
      divisions: [{ id: "d", active: false, x: 0, y: 475.5, width: 669, height: 0 }],
      occlusions: [],
    };
    expect(mobileHorizontalFoldBand(layout, 40)).toEqual({ top: 455.5, bottom: 495.5, active: false });
  });

  test("Android tabletop: a zero-height hinge line widened to the 20dp fold gutter", () => {
    const layout: MobileWindowLayout = {
      width: 673,
      height: 841,
      supported: true,
      divisions: [{ id: "hinge", active: true, x: 0, y: 420, width: 673, height: 0 }],
      occlusions: [],
    };
    expect(mobileHorizontalFoldBand(layout, mobileRestingFoldMinGutter("android"))).toEqual({
      top: 410,
      bottom: 430,
      active: true,
    });
  });

  test("vertical folds (inner landscape, book), the outer display and phones have none", () => {
    expect(mobileHorizontalFoldBand(toLayout(duo("open", "landscape-left")), 40)).toBeNull();
    expect(mobileHorizontalFoldBand(toLayout(duo("partially-folded", "landscape-left")), 40)).toBeNull();
    expect(mobileHorizontalFoldBand(toLayout(duo("closed", "portrait")), 40)).toBeNull();
    expect(
      mobileHorizontalFoldBand({ width: 402, height: 874, supported: false, divisions: [], occlusions: [] }),
    ).toBeNull();
  });

  test("a region that does not span the width (a camera cut-out) is not a fold", () => {
    const layout: MobileWindowLayout = {
      width: 669,
      height: 951,
      supported: true,
      divisions: [{ id: "d", active: true, x: 100, y: 455.5, width: 200, height: 40 }],
      occlusions: [],
    };
    expect(mobileHorizontalFoldBand(layout)).toBeNull();
  });
});

describe("learning drawers on a horizontal fold take exactly the bottom half", () => {
  for (const pose of ["open", "partially-folded"]) {
    test(`iPhone Duo inner portrait (${pose}): the sheet's top edge meets the fold's lower edge`, () => {
      const input = iosInputs(duo(pose, "portrait"));
      const detent = resolveJapaneseLearningDrawerDetent(input);
      expect(typeof detent).toBe("number");
      const top = iosShownTop(detent as number, input);
      // Exactly on the fold's lower edge: no sliver above or below it.
      expect(top).toBe(495.5);
      // Never a sliver into the fold region, never taller than the window allows.
      expect(detent as number).toBeLessThan(input.windowHeight - input.safeAreaTop - input.safeAreaBottom);
      // The half-window sheet keeps its own gutters.
      expect(resolveJapaneseLearningDrawerContentBleed(detent, { width: 669, height: 951 }, input.horizontalFold)).toBe(0);
    });
  }

  test("Android tabletop: the visible sheet height is the window below the fold", () => {
    const layout: MobileWindowLayout = {
      width: 673,
      height: 841,
      supported: true,
      divisions: [{ id: "hinge", active: true, x: 0, y: 420, width: 673, height: 0 }],
      occlusions: [],
    };
    const horizontalFold = mobileHorizontalFoldBand(layout, mobileRestingFoldMinGutter("android"));
    const input = {
      platform: "android",
      isPad: false,
      windowWidth: 673,
      windowHeight: 841,
      safeAreaTop: 24,
      safeAreaBottom: 24,
      horizontalFold,
    };
    const detent = resolveJapaneseLearningDrawerDetent(input);
    expect(detent).toBe(841 - 430);
    const frame = resolveMobileNativeSheetAndroidFrame({
      snapPoints: [detent],
      windowHeight: 841,
      safeAreaTop: 24,
      safeAreaBottom: 24,
    });
    expect(frame.kind).toBe("fixed");
    // Handle + content + navigation bar = the sheet, from the window bottom to the fold.
    const content = frame.kind === "fixed" ? frame.height : 0;
    expect(content + MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT + 24).toBe(841 - 430);
  });

  test("no fold: phones, the outer display and the unfolded Duo keep their detents", () => {
    const phone = {
      platform: "ios",
      isPad: false,
      windowWidth: 402,
      windowHeight: 874,
      safeAreaTop: 62,
      safeAreaBottom: 34,
    };
    expect(resolveJapaneseLearningDrawerDetent({ ...phone, horizontalFold: null })).toBe(
      resolveJapaneseLearningDrawerDetent(phone),
    );
    const outer = iosInputs(duo("closed", "portrait"));
    expect(outer.horizontalFold).toBeNull();
    expect(resolveJapaneseLearningDrawerDetent(outer)).toBe(
      resolveJapaneseLearningDrawerDetent({ ...outer, horizontalFold: undefined }),
    );
  });

  test("vertical folds (inner landscape flat, book) are unchanged", () => {
    for (const pose of ["open", "partially-folded"]) {
      const input = iosInputs(duo(pose, "landscape-left"));
      expect(input.horizontalFold).toBeNull();
      expect(resolveJapaneseLearningDrawerDetent(input)).toBe(
        resolveJapaneseLearningDrawerDetent({ ...input, horizontalFold: undefined }),
      );
    }
  });

  test("the half-height body on the inner display splits into columns", () => {
    // 669pt sheet × (951 - 495.5 - 8 - 34 - footer 70 - grabber 12) of body.
    expect(resolveJapaneseLearningSentenceLayout({ width: 653, height: 331 })).toBe("columns");
  });
});

describe("the bubble popout on a horizontal fold stays in the top half", () => {
  for (const pose of ["open", "partially-folded"]) {
    test(`iPhone Duo inner portrait (${pose}): centred in the half above the fold`, () => {
      const input = iosInputs(duo(pose, "portrait"));
      const verticalSpan = japaneseLearningBubblePopoutVerticalSpan({
        horizontalFold: input.horizontalFold,
        safeAreaTop: input.safeAreaTop,
      });
      expect(verticalSpan).toEqual({ y: 82 + 16, height: 455.5 - 16 - (82 + 16) });
      const frame = japaneseLearningBubblePopoutFrame({
        ...BUBBLE,
        windowWidth: input.windowWidth,
        windowHeight: input.windowHeight,
        safeAreaTop: input.safeAreaTop,
        verticalSpan,
      })!;
      // Never crosses the fold, clear of the status bar and reader chrome.
      expect(frame.y).toBeGreaterThanOrEqual(82 + 16);
      expect(frame.y + frame.height).toBeLessThanOrEqual(455.5 - 16);
      // Centred in that half, horizontally in the window.
      expect(frame.y + frame.height / 2).toBeCloseTo((98 + 439.5) / 2, 5);
      expect(frame.x + frame.width / 2).toBeCloseTo(669 / 2, 5);
      // Still web's 20% of the window tall.
      expect(frame.height).toBeCloseTo(951 * 0.2, 5);
    });
  }

  test("a short top half shrinks the popout instead of crossing the fold", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      ...BUBBLE,
      windowWidth: 700,
      windowHeight: 900,
      safeAreaTop: 24,
      verticalSpan: japaneseLearningBubblePopoutVerticalSpan({
        horizontalFold: { top: 200, bottom: 220 },
        safeAreaTop: 24,
      }),
    })!;
    expect(frame.y).toBeGreaterThanOrEqual(40);
    expect(frame.y + frame.height).toBeLessThanOrEqual(184);
  });

  test("no fold keeps web's placement", () => {
    const base = { ...BUBBLE, windowWidth: 402, windowHeight: 874, safeAreaTop: 62 };
    expect(japaneseLearningBubblePopoutVerticalSpan({ horizontalFold: null, safeAreaTop: 62 })).toBeNull();
    expect(japaneseLearningBubblePopoutFrame({ ...base, verticalSpan: null })).toEqual(
      japaneseLearningBubblePopoutFrame(base),
    );
    const frame = japaneseLearningBubblePopoutFrame(base)!;
    expect(frame.y + frame.height).toBeCloseTo(japaneseLearningBubblePopoutMaxBottom({ windowHeight: 874, safeAreaTop: 62 }), 5);
  });
});
