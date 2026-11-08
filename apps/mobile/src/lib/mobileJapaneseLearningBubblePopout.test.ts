import { describe, expect, test } from "bun:test";
import {
  japaneseLearningBubbleBoxInNaturalPixels,
  japaneseLearningBubblePopoutFrame,
  japaneseLearningBubblePopoutMaxBottom,
  japaneseLearningBubblePopoutRegion,
  japaneseLearningBubblePopoutVerticalSpan,
  JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP,
} from "./mobileJapaneseLearningBubblePopout";
import {
  JAPANESE_LEARNING_POPOUT_SHEET_GAP,
  resolveJapaneseLearningDrawerDetent,
  resolveJapaneseLearningDrawerTop,
} from "./mobileJapaneseLearningSheetLayout";

describe("japaneseLearningBubblePopoutFrame", () => {
  test("is 20% of the window tall and centred at 15vh like web where that clears the safe area", () => {
    // iPhone SE-class window: the 20px status bar is well above 15vh.
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 200,
      cropHeight: 100,
      windowWidth: 375,
      windowHeight: 667,
      safeAreaTop: 20,
    });
    expect(frame).not.toBeNull();
    expect(frame!.height).toBeCloseTo(133.4);
    expect(frame!.width).toBeCloseTo(266.8);
    expect(frame!.x).toBeCloseTo((375 - 266.8) / 2);
    expect(frame!.y + frame!.height / 2).toBeCloseTo(667 * 0.15);
  });

  test("caps a wide crop to 90% of the window width", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 400,
      cropHeight: 100,
      windowWidth: 400,
      windowHeight: 800,
      safeAreaTop: 0,
    })!;
    expect(frame.width).toBeCloseTo(360);
    expect(frame.height).toBeCloseTo(90);
  });

  test("keeps the top edge below the safe area on short windows", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 100,
      cropHeight: 100,
      windowWidth: 800,
      windowHeight: 400,
      safeAreaTop: 60,
    })!;
    expect(frame.y).toBeCloseTo(60 + JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP);
  });

  test("never reaches below its maximum bottom edge", () => {
    for (const [cropWidth, cropHeight] of [[100, 400], [400, 100], [100, 100]]) {
      const frame = japaneseLearningBubblePopoutFrame({
        cropWidth, cropHeight, windowWidth: 951, windowHeight: 669, safeAreaTop: 24,
      })!;
      expect(frame.y + frame.height).toBeLessThanOrEqual(
        japaneseLearningBubblePopoutMaxBottom({ windowHeight: 669, safeAreaTop: 24 }) + 1e-9,
      );
    }
  });

  test("returns null for degenerate sizes", () => {
    expect(
      japaneseLearningBubblePopoutFrame({ cropWidth: 0, cropHeight: 10, windowWidth: 1, windowHeight: 1, safeAreaTop: 0 }),
    ).toBeNull();
  });

  test("maps an OCR box from the recognized image into the page's natural pixels", () => {
    // The on-device reader read a 1.25x copy of a 1134x1671 page.
    const box = japaneseLearningBubbleBoxInNaturalPixels({
      box: { x1: 1250, y1: 250, x2: 1375, y2: 500 },
      naturalSize: { width: 1134, height: 1671 },
      boxSpace: { width: 1417.5, height: 2088.75 },
    });
    expect(box).toEqual({ x1: 1000, y1: 200, x2: 1100, y2: 400 });
    const unchanged = { x1: 1, y1: 2, x2: 3, y2: 4 };
    expect(japaneseLearningBubbleBoxInNaturalPixels({ box: unchanged, naturalSize: { width: 10, height: 10 } })).toBe(unchanged);
  });
});

describe("bubble popout on a vertical fold (book posture)", () => {
  // iPhone Duo inner display, landscape: fold 455.5–495.5 of 951.
  const panels = [
    { x: 0, width: 455.5 },
    { x: 495.5, width: 455.5 },
  ];
  const fold = { start: 455.5, end: 495.5 };
  const wide = { cropWidth: 600, cropHeight: 120, windowWidth: 951, windowHeight: 669, safeAreaTop: 0 };

  test("iOS: the leading pane (where the system sheet sits); Android: the trailing pane", () => {
    expect(japaneseLearningBubblePopoutRegion({ platform: "ios", posture: "book", panels })).toEqual(panels[0]);
    expect(japaneseLearningBubblePopoutRegion({ platform: "android", posture: "book", panels })).toEqual(panels[1]);
    expect(japaneseLearningBubblePopoutRegion({ platform: "ios", posture: "book", panels, layoutDirection: "rtl" }))
      .toEqual(panels[1]);
    expect(japaneseLearningBubblePopoutRegion({ platform: "android", posture: "book", panels, layoutDirection: "rtl" }))
      .toEqual(panels[0]);
  });

  test("flat and notebook keep the whole window", () => {
    expect(japaneseLearningBubblePopoutRegion({ platform: "ios", posture: "flat", panels: [{ x: 0, width: 951 }] })).toBeNull();
    expect(japaneseLearningBubblePopoutRegion({ platform: "ios", posture: "notebook", panels })).toBeNull();
  });

  for (const platform of ["ios", "android"]) {
    test(`${platform}: a wide bubble never straddles the fold and is centred in its pane`, () => {
      const region = japaneseLearningBubblePopoutRegion({ platform, posture: "book", panels });
      const frame = japaneseLearningBubblePopoutFrame({ ...wide, region })!;
      const straddles = frame.x < fold.end && frame.x + frame.width > fold.start;
      expect(straddles).toBe(false);
      expect(frame.width).toBeCloseTo(455.5 * 0.9);
      expect(frame.x + frame.width / 2).toBeCloseTo(region!.x + region!.width / 2);
    });
  }

  test("without a region the frame is unchanged (centred on the window)", () => {
    const frame = japaneseLearningBubblePopoutFrame(wide)!;
    expect(frame.x + frame.width / 2).toBeCloseTo(951 / 2);
  });
});

describe("bubble popout under a Dynamic Island", () => {
  // Portrait iPhones with a Dynamic Island: [width, height, safe top, safe bottom].
  const phones = [
    ["iPhone 17 Pro", 402, 874, 62, 34],
    ["iPhone 17 Pro Max", 440, 956, 62, 34],
    ["iPhone 16e (notch)", 390, 844, 47, 34],
    ["iPhone Air", 420, 912, 68, 34],
  ] as const;
  const crops = [[100, 400], [200, 100], [400, 100], [100, 100], [60, 600]] as const;

  for (const [name, windowWidth, windowHeight, safeAreaTop, safeAreaBottom] of phones) {
    test(`${name}: clears the island and stays above the sentence sheet`, () => {
      const detent = resolveJapaneseLearningDrawerDetent({
        platform: "ios", isPad: false, windowWidth, windowHeight, safeAreaTop, safeAreaBottom,
      });
      const sheetTop = resolveJapaneseLearningDrawerTop({
        platform: "ios", isPad: false, windowWidth, windowHeight, safeAreaTop, safeAreaBottom, detent,
      })!;
      // The drawer opens at web's 70vh top.
      expect(sheetTop).toBeCloseTo(windowHeight * 0.3, 0);
      for (const [cropWidth, cropHeight] of crops) {
        const frame = japaneseLearningBubblePopoutFrame({
          cropWidth, cropHeight, windowWidth, windowHeight, safeAreaTop,
          maxBottom: sheetTop - JAPANESE_LEARNING_POPOUT_SHEET_GAP,
        })!;
        expect(frame.y).toBeGreaterThanOrEqual(safeAreaTop + JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP - 1e-9);
        expect(frame.y + frame.height).toBeLessThanOrEqual(sheetTop - JAPANESE_LEARNING_POPOUT_SHEET_GAP + 1e-9);
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(windowWidth);
      }
    });
  }

  test("iPhone 17 Pro: a tall bubble moves down to 70pt instead of 44pt, at its full size", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 100, cropHeight: 200, windowWidth: 402, windowHeight: 874, safeAreaTop: 62, maxBottom: 250,
    })!;
    expect(frame.y).toBeCloseTo(70);
    expect(frame.height).toBeCloseTo(174.8);
  });

  test("shrinks, keeping its aspect ratio, when the band above the sheet is short", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 100, cropHeight: 200, windowWidth: 402, windowHeight: 874, safeAreaTop: 62, maxBottom: 170,
    })!;
    expect(frame.y).toBeCloseTo(70);
    expect(frame.y + frame.height).toBeCloseTo(170);
    expect(frame.width / frame.height).toBeCloseTo(0.5);
    expect(frame.x + frame.width / 2).toBeCloseTo(201);
  });

  test("no room at all: no popout", () => {
    expect(japaneseLearningBubblePopoutFrame({
      cropWidth: 100, cropHeight: 100, windowWidth: 402, windowHeight: 874, safeAreaTop: 62, maxBottom: 60,
    })).toBeNull();
  });

  test("book pane on the Duo inner display: below the status bar and above its wide sheet", () => {
    const panels = [{ x: 0, width: 455.5 }, { x: 495.5, width: 455.5 }];
    const region = japaneseLearningBubblePopoutRegion({ platform: "ios", posture: "book", panels });
    const size = { windowWidth: 951, windowHeight: 669, safeAreaTop: 24, safeAreaBottom: 20 };
    const detent = resolveJapaneseLearningDrawerDetent({ platform: "ios", isPad: false, ...size });
    const sheetTop = resolveJapaneseLearningDrawerTop({ platform: "ios", isPad: false, ...size, detent })!;
    for (const [cropWidth, cropHeight] of crops) {
      const frame = japaneseLearningBubblePopoutFrame({
        cropWidth, cropHeight, ...size, region, maxBottom: sheetTop - JAPANESE_LEARNING_POPOUT_SHEET_GAP,
      })!;
      expect(frame.y).toBeGreaterThanOrEqual(24 + JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP - 1e-9);
      expect(frame.y + frame.height).toBeLessThanOrEqual(sheetTop - JAPANESE_LEARNING_POPOUT_SHEET_GAP + 1e-6);
      expect(frame.x).toBeGreaterThanOrEqual(region!.x);
      expect(frame.x + frame.width).toBeLessThanOrEqual(region!.x + region!.width);
    }
  });

  test("fold half on the Duo inner display in portrait: centred between the status bar and the fold", () => {
    const span = japaneseLearningBubblePopoutVerticalSpan({ horizontalFold: { top: 455, bottom: 495 }, safeAreaTop: 24 })!;
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 100, cropHeight: 300, windowWidth: 669, windowHeight: 951, safeAreaTop: 24, verticalSpan: span,
      // The fold drawer's top is the fold's lower edge; the band already stops above it.
      maxBottom: 495 - JAPANESE_LEARNING_POPOUT_SHEET_GAP,
    })!;
    expect(frame.y).toBeGreaterThanOrEqual(24 + JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP);
    expect(frame.y + frame.height).toBeLessThanOrEqual(455);
  });
});

describe("resolveJapaneseLearningDrawerTop", () => {
  test("full-screen and iPad sheets have nothing above them", () => {
    expect(resolveJapaneseLearningDrawerTop({
      platform: "ios", isPad: false, windowWidth: 874, windowHeight: 402, safeAreaTop: 0, safeAreaBottom: 21, detent: 381,
    })).toBeNull();
    expect(resolveJapaneseLearningDrawerTop({
      platform: "ios", isPad: true, windowWidth: 820, windowHeight: 1180, safeAreaTop: 24, safeAreaBottom: 20, detent: "70%",
    })).toBeNull();
  });

  test("Android percentage drawers start at 30% of the window", () => {
    expect(resolveJapaneseLearningDrawerTop({
      platform: "android", isPad: false, windowWidth: 412, windowHeight: 915, safeAreaTop: 24, safeAreaBottom: 24, detent: "70%",
    })).toBeCloseTo(915 * 0.3);
  });
});
