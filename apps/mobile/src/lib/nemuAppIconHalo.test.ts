import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  NEMU_APP_ICON_PRESS_MOTION,
  getNemuAppIconHaloMetrics,
  getNemuAppIconHaloRenderMode,
  shouldAnimateNemuAppIconPress,
} from "./nemuAppIconHalo";

describe("nemu app icon halo", () => {
  test("stays contract-linked to the production web icon treatment", () => {
    const webAbout = readFileSync(
      path.join(import.meta.dir, "../../../../src/components/about-dialog.tsx"),
      "utf8",
    );
    const webWelcome = readFileSync(
      path.join(import.meta.dir, "../../../../src/components/welcome-wizard.tsx"),
      "utf8",
    );
    const mobileAbout = readFileSync(
      path.join(import.meta.dir, "../components/MobileAboutSheet.tsx"),
      "utf8",
    );
    const mobileWelcome = readFileSync(
      path.join(import.meta.dir, "../components/MobileWelcomeWizard.tsx"),
      "utf8",
    );

    for (const source of [webAbout, webWelcome]) {
      expect(source).toContain('src="/icon.jpg"');
      expect(source).toContain("size-20 rounded-2xl");
      expect(source).toContain("ring-1 ring-white/10");
      expect(source).toContain("duration-300");
      expect(source).toContain("cubic-bezier(0.34,1.56,0.64,1)");
      expect(source).toContain("active:scale-[0.82]");
      expect(source).toContain("active:rotate-[-4deg]");
    }
    for (const source of [mobileAbout, mobileWelcome]) {
      expect(source).toContain('appIcon from "../../assets/icon.jpg"');
      expect(source).not.toContain('appIcon from "../../assets/icon.png"');
    }
  });

  test("uses the compact mobile derivative of the live web icon", async () => {
    const webIconPath = path.join(import.meta.dir, "../../../../public/icon.jpg");
    const mobileIconPath = path.join(import.meta.dir, "../../assets/icon.jpg");
    const webMetadata = await sharp(webIconPath).metadata();
    const mobileMetadata = await sharp(mobileIconPath).metadata();
    expect(webMetadata.width).toBe(1_500);
    expect(webMetadata.height).toBe(1_500);
    expect(mobileMetadata.width).toBe(512);
    expect(mobileMetadata.height).toBe(512);

    const webPixels = await sharp(webIconPath).resize(512, 512).removeAlpha().raw().toBuffer();
    const mobilePixels = await sharp(mobileIconPath).removeAlpha().raw().toBuffer();
    let absoluteDelta = 0;
    for (let index = 0; index < webPixels.length; index += 1) {
      absoluteDelta += Math.abs(webPixels[index] - mobilePixels[index]);
    }
    expect(absoluteDelta / webPixels.length).toBeLessThan(4);
  });

  test("keeps Android off SVG offscreen surfaces", () => {
    expect(getNemuAppIconHaloRenderMode("android")).toBe("raster-glow");
    expect(getNemuAppIconHaloRenderMode("ios")).toBe("gaussian-blur");
  });

  test("exposes one reachable image semantic and hides decorative layers", () => {
    const component = readFileSync(
      path.join(import.meta.dir, "../components/NemuAppIconHalo.tsx"),
      "utf8",
    );

    expect(component).toMatch(
      /<Pressable\s+accessible\s+accessibilityLabel=\{accessibilityLabel\}\s+accessibilityRole="image"/,
    );
    expect(component).not.toContain("<Pressable\n      accessible={false}");
    expect(component).toContain("accessibilityElementsHidden");
    expect(component).toContain('importantForAccessibility="no-hide-descendants"');
    expect(component.match(/accessibilityLabel=\{accessibilityLabel\}/g)).toHaveLength(1);
    expect(component.match(/accessibilityRole="image"/g)).toHaveLength(1);
  });

  test("scales web-parity icon and halo geometry together", () => {
    expect(getNemuAppIconHaloMetrics(80)).toEqual({
      canvasSize: 360,
      glowBlurRadius: 40,
      iconRadius: 16,
      rectOffset: 140,
    });
  });

  test("matches the web icon's playful active interaction unless motion is reduced", () => {
    expect(NEMU_APP_ICON_PRESS_MOTION).toEqual({
      duration: 300,
      rotateDegrees: -4,
      scale: 0.82,
    });
    expect(shouldAnimateNemuAppIconPress(false)).toBe(true);
    expect(shouldAnimateNemuAppIconPress(true)).toBe(false);
    expect(shouldAnimateNemuAppIconPress(null)).toBe(false);
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
