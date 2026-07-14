import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  getNemuAppIconHaloMetrics,
  getNemuAppIconHaloRenderMode,
} from "./nemuAppIconHalo";

describe("nemu app icon halo", () => {
  test("keeps Android off SVG offscreen surfaces", () => {
    expect(getNemuAppIconHaloRenderMode("android")).toBe("raster-glow");
    expect(getNemuAppIconHaloRenderMode("ios")).toBe("gaussian-blur");
  });

  test("scales web-parity icon and halo geometry together", () => {
    expect(getNemuAppIconHaloMetrics(80)).toEqual({
      canvasSize: 360,
      glowBlurRadius: 40,
      iconRadius: 16,
      rectOffset: 140,
    });
    const welcomeMetrics = getNemuAppIconHaloMetrics(96);
    expect(welcomeMetrics.canvasSize).toBe(432);
    expect(welcomeMetrics.glowBlurRadius).toBe(48);
    expect(welcomeMetrics.iconRadius).toBeCloseTo(19.2);
    expect(welcomeMetrics.rectOffset).toBe(168);
  });

  test("ships density-matched Android rasters for the 360dp glow canvas", () => {
    for (const [filename, expectedSize] of [
      ["app-icon-glow.png", 360],
      ["app-icon-glow@2x.png", 720],
      ["app-icon-glow@3x.png", 1080],
    ] as const) {
      const png = readFileSync(
        path.join(import.meta.dir, "../../assets", filename),
      );
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(expectedSize);
      expect(png.readUInt32BE(20)).toBe(expectedSize);
    }
  });

  test("keeps every visible Android glow pixel in the web brand color", async () => {
    const brandRgb = [0x6b, 0x8c, 0xce];

    for (const filename of [
      "app-icon-glow.png",
      "app-icon-glow@2x.png",
      "app-icon-glow@3x.png",
    ]) {
      const { data, info } = await sharp(
        path.join(import.meta.dir, "../../assets", filename),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const visibleAlphas = new Set<number>();
      let invalidVisiblePixel: number[] | null = null;

      for (let offset = 0; offset < data.length; offset += info.channels) {
        const alpha = data[offset + 3];
        if (alpha === 0) continue;
        visibleAlphas.add(alpha);
        if (
          data[offset] !== brandRgb[0] ||
          data[offset + 1] !== brandRgb[1] ||
          data[offset + 2] !== brandRgb[2]
        ) {
          invalidVisiblePixel = Array.from(data.subarray(offset, offset + 4));
          break;
        }
      }

      expect(invalidVisiblePixel).toBeNull();
      // A real blur must retain a smooth, translucent falloff rather than a
      // flat tinted rectangle. Web uses 30% source opacity, so no raster pixel
      // should exceed that alpha ceiling.
      expect(visibleAlphas.size).toBeGreaterThan(8);
      expect(Math.max(...visibleAlphas)).toBeLessThanOrEqual(77);
    }
  });
});
