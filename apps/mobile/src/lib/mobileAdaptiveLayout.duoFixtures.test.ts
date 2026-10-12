import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import {
  mobileAdaptiveGridColumns,
  mobileAdaptiveLayout,
  mobileFoldSplitForContainer,
  mobileGridPrefersEvenColumns,
} from "./mobileAdaptiveLayout";
import type { MobileWindowLayout } from "./mobileWindowLayout";

type Measurement = (typeof fixture.measurements)[number];

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

describe("iPhone Duo measured poses (safearea.info, Xcode 27.1)", () => {
  for (const m of fixture.measurements) {
    const expected = m.pose !== "partially-folded" ? "flat" : m.bounds.width > m.bounds.height ? "book" : "notebook";
    test(`${m.screen} ${m.pose} ${m.orientation} → ${expected}`, () => {
      const adaptive = mobileAdaptiveLayout(toLayout(m));
      expect(adaptive.posture).toBe(expected);
      expect(adaptive.regularWidth).toBe(m.bounds.width >= 600);
      if (expected === "book") {
        expect(adaptive.fold).toEqual({ x: 455.5, y: 0, width: 40, height: m.bounds.height });
        // A content box inset by the trailing 84pt bar column still splits on the fold.
        const split = mobileFoldSplitForContainer(adaptive, { x: 0, y: 0, width: m.bounds.width - 84, height: m.bounds.height });
        expect(split?.gutter).toEqual({ start: 455.5, end: 495.5 });
      }
      if (expected === "notebook") {
        expect(adaptive.fold).toEqual({ x: 0, y: 455.5, width: m.bounds.width, height: 40 });
      }
      if (expected === "flat") expect(adaptive.fold).toBeNull();
    });
  }
});

describe("vertical bar side follows the measured bar column", () => {
  test("closed landscape-right puts the column on the physical left even if the trait says trailing", () => {
    const m = fixture.measurements.find((x) => x.pose === "closed" && x.orientation === "landscape-right")!;
    const adaptive = mobileAdaptiveLayout({ ...toLayout(m), verticalBarEdge: "trailing", safeAreaInsets: m.insets });
    expect(adaptive.verticalBarSide).toBe("left");
  });
  test("closed portrait keeps it on the right", () => {
    const m = fixture.measurements.find((x) => x.pose === "closed" && x.orientation === "portrait")!;
    expect(mobileAdaptiveLayout({ ...toLayout(m), verticalBarEdge: "trailing", safeAreaInsets: m.insets }).verticalBarSide).toBe("right");
  });
});

describe("even grid columns follow the fold region, not the width (111463 [7:36])", () => {
  for (const m of fixture.measurements) {
    const hasDivision = m.regions.some((r) => r.kind === "division");
    test(`${m.screen} ${m.pose} ${m.orientation} → prefers even: ${hasDivision}`, () => {
      const adaptive = mobileAdaptiveLayout(toLayout(m));
      expect(adaptive.hasFoldRegion).toBe(hasDivision);
      expect(mobileGridPrefersEvenColumns(adaptive)).toBe(hasDivision);
    });
  }

  test("the inner display keeps the same even count flat and folded", () => {
    const flat = fixture.measurements.find((x) => x.screen.endsWith("inner") && x.pose !== "partially-folded" && x.bounds.width > x.bounds.height)!;
    const book = fixture.measurements.find((x) => x.pose === "partially-folded" && x.bounds.width > x.bounds.height)!;
    const columns = (m: Measurement) => mobileAdaptiveGridColumns({
      contentWidth: m.bounds.width - 84 - 32,
      minItemWidth: 150,
      gap: 12,
      preferEven: mobileGridPrefersEvenColumns(mobileAdaptiveLayout(toLayout(m))),
    }).columns;
    expect(columns(flat) % 2).toBe(0);
    expect(columns(flat)).toBe(columns(book));
  });

  test("the outer display (no division) is not forced even", () => {
    const closed = fixture.measurements.find((x) => x.pose === "closed" && x.orientation === "portrait")!;
    expect(mobileAdaptiveLayout(toLayout(closed)).hasFoldRegion).toBe(false);
  });
});
