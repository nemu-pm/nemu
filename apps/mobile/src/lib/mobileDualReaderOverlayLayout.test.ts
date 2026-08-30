import { describe, expect, test } from "bun:test";
import type { SecondaryAlignment } from "@nemu/core/dual-reader";
import {
  alignmentLayoutToDestRect,
  computeAlignmentLayout,
  computeContainRect,
} from "./mobileDualReaderOverlayLayout";

const identity: SecondaryAlignment = {
  dx: 0,
  dy: 0,
  scale: 1,
  confidence: 1,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
};

describe("mobileDualReaderOverlayLayout", () => {
  test("returns null for non-positive container", () => {
    const layout = computeAlignmentLayout({
      container: { width: 0, height: 100 },
      primaryNatural: { width: 10, height: 10 },
      secondaryNatural: { width: 10, height: 10 },
      alignment: identity,
    });
    expect(layout).toBeNull();
  });

  test("aligned layout centers secondary over primary's render frame", () => {
    // Container 200x200, primary 100x100 (fills container exactly: frame = 200x200),
    // secondary 100x100, identity alignment → secondaryDisplay = 200x200, centered at
    // (0,0), translate 0, scale 1.
    const layout = computeAlignmentLayout({
      container: { width: 200, height: 200 },
      primaryNatural: { width: 100, height: 100 },
      secondaryNatural: { width: 100, height: 100 },
      alignment: identity,
    });
    expect(layout).not.toBeNull();
    expect(layout!.left).toBeCloseTo(0, 5);
    expect(layout!.top).toBeCloseTo(0, 5);
    expect(layout!.width).toBeCloseTo(200, 5);
    expect(layout!.height).toBeCloseTo(200, 5);
    expect(layout!.scale).toBeCloseTo(1, 5);
    expect(layout!.translateX).toBeCloseTo(0, 5);
    expect(layout!.translateY).toBeCloseTo(0, 5);
  });

  test("alignment dx/dy shift the dest rect proportionally", () => {
    // primary fills container 200x200, scale 1, so dx=0.1 → translateX = 0.1*200 = 20.
    const layout = computeAlignmentLayout({
      container: { width: 200, height: 200 },
      primaryNatural: { width: 100, height: 100 },
      secondaryNatural: { width: 100, height: 100 },
      alignment: {
        dx: 0.1,
        dy: -0.2,
        scale: 1,
        confidence: 1,
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    });
    expect(layout).not.toBeNull();
    expect(layout!.translateX).toBeCloseTo(20, 5);
    expect(layout!.translateY).toBeCloseTo(-40, 5);
  });

  test("alignment scale multiplies the dest size", () => {
    const layout = computeAlignmentLayout({
      container: { width: 200, height: 200 },
      primaryNatural: { width: 100, height: 100 },
      secondaryNatural: { width: 100, height: 100 },
      alignment: {
        dx: 0,
        dy: 0,
        scale: 0.5,
        confidence: 1,
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    });
    expect(layout).not.toBeNull();
    const dest = alignmentLayoutToDestRect(layout!);
    // width=200, scale=0.5 → dest width 100.
    expect(dest.width).toBeCloseTo(100, 5);
    expect(dest.height).toBeCloseTo(100, 5);
  });

  test("alignmentLayoutToDestRect sums left+translateX and scales", () => {
    const layout: NonNullable<ReturnType<typeof computeAlignmentLayout>> = {
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      translateX: 5,
      translateY: -3,
      scale: 2,
    };
    const dest = alignmentLayoutToDestRect(layout);
    expect(dest.x).toBeCloseTo(15, 5);
    expect(dest.y).toBeCloseTo(17, 5);
    expect(dest.width).toBeCloseTo(200, 5);
    expect(dest.height).toBeCloseTo(100, 5);
  });

  test("computeContainRect centers a smaller image in the container", () => {
    // 100x100 container, 50x100 image → renderWidth=50, centered: x=25, y=0.
    const rect = computeContainRect({
      container: { width: 100, height: 100 },
      natural: { width: 50, height: 100 },
    });
    expect(rect.width).toBeCloseTo(50, 5);
    expect(rect.height).toBeCloseTo(100, 5);
    expect(rect.x).toBeCloseTo(25, 5);
    expect(rect.y).toBeCloseTo(0, 5);
  });

  test("non-finite scale (zero primary natural) is guarded", () => {
    const layout = computeAlignmentLayout({
      container: { width: 200, height: 200 },
      primaryNatural: { width: 0, height: 0 },
      secondaryNatural: { width: 100, height: 100 },
      alignment: identity,
    });
    // computeRenderBounds clamps natural to 1, so this still resolves; the guard
    // is for non-finite secondaryScale. Verify it doesn't throw.
    expect(typeof layout).toBe("object");
  });
});