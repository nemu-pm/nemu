import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
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
