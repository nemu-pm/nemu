import { describe, expect, test } from "bun:test";
import { getGlassSurfaceRenderMode } from "./glassSurface";

describe("GlassSurface platform rendering", () => {
  test("avoids Android offscreen blur surfaces", () => {
    expect(getGlassSurfaceRenderMode("android")).toBe("native-view");
  });

  test("preserves blur on iOS and web", () => {
    expect(getGlassSurfaceRenderMode("ios")).toBe("blur-view");
    expect(getGlassSurfaceRenderMode("web")).toBe("blur-view");
  });
});
