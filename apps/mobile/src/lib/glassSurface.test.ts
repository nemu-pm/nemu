import { describe, expect, test } from "bun:test";
import {
  GLASS_SURFACE_LIQUID_TINT_ALPHA,
  getGlassSurfaceRenderMode,
  glassSurfaceLiquidTint,
  resolveGlassSurfaceShape,
} from "./glassSurface";

describe("GlassSurface platform rendering", () => {
  test("avoids Android offscreen blur surfaces", () => {
    expect(getGlassSurfaceRenderMode("android")).toBe("native-view");
  });

  test("preserves blur on iOS and web", () => {
    expect(getGlassSurfaceRenderMode("ios")).toBe("blur-view");
    expect(getGlassSurfaceRenderMode("web")).toBe("blur-view");
  });
});

describe("resolveGlassSurfaceShape", () => {
  test("uses a capsule once the radius reaches half the height", () => {
    expect(resolveGlassSurfaceShape({ cornerRadius: 24, height: 48 })).toBe(
      "capsule",
    );
    expect(resolveGlassSurfaceShape({ cornerRadius: 999, height: 44 })).toBe(
      "capsule",
    );
  });

  test("keeps the toast pill on its own 22pt rounded rectangle", () => {
    expect(resolveGlassSurfaceShape({ cornerRadius: 22, height: 48 })).toBe(
      "roundedRectangle",
    );
  });

  test("falls back to a rounded rectangle without a usable height", () => {
    expect(resolveGlassSurfaceShape({ cornerRadius: 22 })).toBe(
      "roundedRectangle",
    );
    expect(resolveGlassSurfaceShape({ cornerRadius: 22, height: null })).toBe(
      "roundedRectangle",
    );
    expect(resolveGlassSurfaceShape({ cornerRadius: 22, height: 0 })).toBe(
      "roundedRectangle",
    );
    expect(
      resolveGlassSurfaceShape({ cornerRadius: Number.NaN, height: 48 }),
    ).toBe("roundedRectangle");
  });
});

describe("glassSurfaceLiquidTint", () => {
  test("keeps the material readable with a light token-derived tint", () => {
    expect(GLASS_SURFACE_LIQUID_TINT_ALPHA).toBe(0.35);
    expect(glassSurfaceLiquidTint("#f8fafe")).toBe("rgba(248, 250, 254, 0.35)");
    expect(glassSurfaceLiquidTint("#090a0d")).toBe("rgba(9, 10, 13, 0.35)");
  });

  test("expands shorthand hex and honors an explicit alpha", () => {
    expect(glassSurfaceLiquidTint("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });

  test("passes through colors that already carry their own alpha", () => {
    expect(glassSurfaceLiquidTint("rgba(20,22,26,0.8)")).toBe(
      "rgba(20,22,26,0.8)",
    );
  });
});
