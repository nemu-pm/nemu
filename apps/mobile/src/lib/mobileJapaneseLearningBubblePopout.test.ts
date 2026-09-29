import { describe, expect, test } from "bun:test";
import {
  japaneseLearningBubbleBoxInNaturalPixels,
  japaneseLearningBubblePopoutFrame,
  japaneseLearningBubblePopoutMaxBottom,
  japaneseLearningBubblePopoutRegion,
} from "./mobileJapaneseLearningBubblePopout";

describe("japaneseLearningBubblePopoutFrame", () => {
  test("is 20% of the window tall and centred at 15vh like web", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 200,
      cropHeight: 100,
      windowWidth: 402,
      windowHeight: 874,
      safeAreaTop: 62,
    });
    expect(frame).not.toBeNull();
    expect(frame!.height).toBeCloseTo(174.8);
    expect(frame!.width).toBeCloseTo(349.6);
    expect(frame!.x).toBeCloseTo((402 - 349.6) / 2);
    expect(frame!.y + frame!.height / 2).toBeCloseTo(874 * 0.15);
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

  test("keeps the centre below the safe area on short windows", () => {
    const frame = japaneseLearningBubblePopoutFrame({
      cropWidth: 100,
      cropHeight: 100,
      windowWidth: 800,
      windowHeight: 400,
      safeAreaTop: 60,
    })!;
    expect(frame.y + frame.height / 2).toBeCloseTo(76);
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
