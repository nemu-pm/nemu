import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  generateMobilePortraitAssets,
  getMobilePortraitGlowFilenames,
  getMobilePortraitImageFilenames,
  NEMU_MOBILE_PORTRAIT_RASTER,
} from "../../../../scripts/generate-mobile-portrait-glow";
import {
  getNemuAndroidStaticGlowState,
  getNemuWebLoopStart,
  getNemuPortraitGlowRasterLayout,
  getNemuPortraitGlowStageWidth,
  getNemuPortraitHaloRenderMode,
  getNemuPortraitStageHeight,
  NEMU_PORTRAIT_GLOW_STAGE_WIDTHS,
  NEMU_WEB_PORTRAIT_GLOW,
  shouldAnimateNemuPortraitGlow,
  shouldAnimateNemuPortraitHalo,
} from "./nemuPortraitHalo";
import { getMobileEmptyLibraryLayout } from "./mobileEmptyLibraryLayout";

describe("Nemu portrait halo motion", () => {
  test("stays contract-linked to production web portrait layers and motion", () => {
    const webEmpty = readFileSync(
      path.join(import.meta.dir, "../../../../src/components/library-empty.tsx"),
      "utf8",
    );
    const generator = readFileSync(
      path.join(
        import.meta.dir,
        "../../../../scripts/generate-mobile-portrait-glow.ts",
      ),
      "utf8",
    );

    expect(webEmpty).toContain("from-[#7b9ad0]/50 via-[#c4a6d6]/30");
    expect(webEmpty).toContain("from-[#d4b8e8]/25 via-[#9bb5e0]/15");
    expect(webEmpty).toContain('className="w-[100vw] object-contain');
    expect(webEmpty).toContain("animation: ethereal-float 5s ease-in-out infinite");
    expect(webEmpty).toContain("animation: gentle-sway 7s ease-in-out infinite");
    expect(webEmpty).toContain("animation: soft-breathe 4s ease-in-out infinite");
    expect(webEmpty).toContain("animation: gentle-rotate 9s ease-in-out infinite");
    expect(webEmpty).toContain("animation: glow-drift 6s ease-in-out infinite");
    expect(webEmpty).toContain("animation-delay: -3s");
    expect(webEmpty).toContain(
      "drop-shadow(0 20px 40px rgba(123, 154, 208, 0.15))",
    );
    for (const marker of ["#7b9ad0", "#c4a6d6", "#d4b8e8", "#9bb5e0"]) {
      expect(generator).toContain(marker);
    }
    expect(generator).toContain("NEMU_WEB_PORTRAIT_GLOW.primary.blurRadius");
    expect(generator).toContain("NEMU_WEB_PORTRAIT_GLOW.secondary.blurRadius");
    expect(NEMU_WEB_PORTRAIT_GLOW.primary.blurRadius).toBe(64);
    expect(NEMU_WEB_PORTRAIT_GLOW.secondary.blurRadius).toBe(40);
    expect(NEMU_WEB_PORTRAIT_GLOW.shadow).toEqual({
      blurRadius: 40,
      color: "#7b9ad0",
      opacity: 0.15,
      translateY: 20,
    });
  });

  test("animates while active unless reduce-motion is explicit", () => {
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        reduceMotion: null,
      }),
    ).toBe(true);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        reduceMotion: false,
      }),
    ).toBe(true);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        reduceMotion: true,
      }),
    ).toBe(false);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: false,
        focused: true,
        reduceMotion: false,
      }),
    ).toBe(false);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: false,
        reduceMotion: false,
      }),
    ).toBe(true);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        platform: "android",
        reduceMotion: false,
      }),
    ).toBe(true);
  });

  test("keeps Android off animated filtered surfaces without freezing the portrait", () => {
    expect(getNemuPortraitHaloRenderMode("android")).toBe(
      "static-composite-raster",
    );
    expect(getNemuPortraitHaloRenderMode("ios")).toBe(
      "animated-raster-layers",
    );
    expect(shouldAnimateNemuPortraitGlow("android")).toBe(false);
    expect(shouldAnimateNemuPortraitGlow("ios")).toBe(true);
  });

  test("keeps iOS off retina-sized SVG filter render targets", () => {
    const component = readFileSync(
      path.join(import.meta.dir, "../components/NemuPortraitHalo.tsx"),
      "utf8",
    );
    expect(component).toContain("getNemuPortraitGlowAssets");
    expect(component).toContain("source={glowAssets.primary}");
    expect(component).toContain("source={glowAssets.secondary}");
    expect(component).toContain("source={glowAssets.shadow}");
    expect(component).toContain("<Reanimated.Image");
    expect(component).not.toContain("react-native-svg");
    expect(component).not.toContain("FeGaussianBlur");
    expect(component).not.toContain("shadowColor:");
    expect(component).not.toContain("boxShadow:");
    expect(component).not.toContain("dropShadow:");
  });

  test("platform-resolves only the glow layers each native renderer uses", () => {
    const androidAssets = readFileSync(
      path.join(import.meta.dir, "nemuPortraitGlowAssets.android.ts"),
      "utf8",
    );
    const iosAssets = readFileSync(
      path.join(import.meta.dir, "nemuPortraitGlowAssets.ios.ts"),
      "utf8",
    );
    const sharedAssets = readFileSync(
      path.join(import.meta.dir, "nemuPortraitGlowAssets.shared.ts"),
      "utf8",
    );
    const fallbackAssets = readFileSync(
      path.join(import.meta.dir, "nemuPortraitGlowAssets.ts"),
      "utf8",
    );

    expect(androidAssets.match(/from "\.\.\/\.\.\/assets\/portrait-glow(?:-|\.png)/g)).toHaveLength(
      NEMU_PORTRAIT_GLOW_STAGE_WIDTHS.length,
    );
    expect(androidAssets).not.toContain("portrait-glow-primary");
    expect(androidAssets).not.toContain("portrait-glow-secondary");
    expect(iosAssets.match(/portrait-glow-primary/g)).toHaveLength(
      NEMU_PORTRAIT_GLOW_STAGE_WIDTHS.length,
    );
    expect(iosAssets.match(/portrait-glow-secondary/g)).toHaveLength(
      NEMU_PORTRAIT_GLOW_STAGE_WIDTHS.length,
    );
    expect(iosAssets).not.toMatch(
      /assets\/portrait-glow(?:-\d+)?\.png/,
    );
    expect(sharedAssets.match(/portrait-shadow/g)).toHaveLength(
      NEMU_PORTRAIT_GLOW_STAGE_WIDTHS.length,
    );
    expect(sharedAssets).not.toContain("portrait-glow");
    expect(fallbackAssets).toContain(
      'from "./nemuPortraitGlowAssets.ios"',
    );
  });

  test("starts staggered loops at the exact CSS negative-delay phase", () => {
    expect(getNemuWebLoopStart(5_000)).toEqual({
      direction: "ascending",
      progress: 0,
      remainingDuration: 2_500,
    });
    expect(getNemuWebLoopStart(7_000, -2_500)).toEqual({
      direction: "ascending",
      progress: 5 / 7,
      remainingDuration: 1_000,
    });
    expect(getNemuWebLoopStart(6_000, -3_000)).toEqual({
      direction: "descending",
      progress: 0,
      remainingDuration: 3_000,
    });
    expect(getNemuWebLoopStart(9_000, -4_000)).toEqual({
      direction: "ascending",
      progress: 8 / 9,
      remainingDuration: 500,
    });
    expect(getNemuAndroidStaticGlowState()).toEqual({
      primary: { opacity: 0.25, scale: 1, translateY: 8 },
      secondary: { opacity: 0.25, translateX: 4, translateY: 18 },
    });

    const component = readFileSync(
      path.join(import.meta.dir, "../components/NemuPortraitHalo.tsx"),
      "utf8",
    );
    expect(component).toContain("function startPingPong(");
    expect(component).toContain("withRepeat");
    expect(component).toContain("withSequence");
    expect(component).toContain("Easing.bezier(0.42, 0, 0.58, 1)");
  });

  test("matches responsive mask geometry while keeping blur pixels fixed", () => {
    expect(getNemuPortraitGlowStageWidth(320)).toBe(320);
    expect(getNemuPortraitGlowStageWidth(340)).toBe(320);
    expect(getNemuPortraitGlowStageWidth(360)).toBe(360);
    expect(getNemuPortraitGlowStageWidth(375)).toBe(360);
    expect(getNemuPortraitGlowStageWidth(390)).toBe(390);
    expect(getNemuPortraitGlowStageWidth(402)).toBe(411);
    expect(getNemuPortraitGlowStageWidth(411)).toBe(411);
    expect(getNemuPortraitGlowStageWidth(448)).toBe(430);
    expect(getNemuPortraitGlowStageWidth(480)).toBe(512);
    expect(getNemuPortraitGlowStageWidth(512)).toBe(512);
    expect(getNemuPortraitGlowStageWidth(639)).toBe(639);
    expect(getNemuPortraitGlowStageWidth(Number.NaN)).toBe(320);

    expect(
      getMobileEmptyLibraryLayout({ height: 568, width: 320 }).portraitMaxWidth,
    ).toBe(320);
    expect(
      getMobileEmptyLibraryLayout({ height: 844, width: 390 }).portraitMaxWidth,
    ).toBe(390);
    expect(
      getMobileEmptyLibraryLayout({ height: 874, width: 402 }).portraitMaxWidth,
    ).toBe(402);
    expect(
      getMobileEmptyLibraryLayout({ height: 891, width: 411 }).portraitMaxWidth,
    ).toBe(411);
    expect(
      getMobileEmptyLibraryLayout({ height: 402, width: 874 }).portraitMaxWidth,
    ).toBe(512);

    let maximumPhoneMaskError = 0;
    let maximumWideMaskError = 0;
    for (let requestedWidth = 320; requestedWidth <= 639; requestedWidth += 1) {
      const selectedWidth = getNemuPortraitGlowStageWidth(requestedWidth);
      const error = Math.abs(requestedWidth - selectedWidth);
      if (requestedWidth <= 448) {
        maximumPhoneMaskError = Math.max(maximumPhoneMaskError, error);
      } else {
        maximumWideMaskError = Math.max(maximumWideMaskError, error);
      }
    }
    expect(maximumPhoneMaskError).toBeLessThanOrEqual(20);
    expect(maximumWideMaskError).toBeLessThanOrEqual(63);

    for (const [stageWidth, expectedLayout] of [
      [320, { height: 822, left: -224, top: -224, width: 768 }],
      [360, { height: 869, left: -224, top: -224, width: 808 }],
      [390, { height: 904, left: -224, top: -224, width: 838 }],
      [512, { height: 1047, left: -224, top: -224, width: 960 }],
      [639, { height: 1195, left: -224, top: -224, width: 1087 }],
    ] as const) {
      const stageHeight = getNemuPortraitStageHeight(stageWidth);
      const layout = getNemuPortraitGlowRasterLayout({ stageHeight, stageWidth });
      expect(layout).toEqual(expectedLayout);
      expect(layout.width - NEMU_WEB_PORTRAIT_GLOW.artboardPadding * 2).toBe(
        stageWidth,
      );
      expect(layout.height - NEMU_WEB_PORTRAIT_GLOW.artboardPadding * 2).toBe(
        stageHeight,
      );
    }

    expect(
      getNemuPortraitGlowRasterLayout({
        containerStageHeight: getNemuPortraitStageHeight(512),
        containerStageWidth: 512,
        stageHeight: getNemuPortraitStageHeight(448),
        stageWidth: 448,
      }),
    ).toEqual({ height: 1111, left: -256, top: -256, width: 1024 });
  });

  test("ships unclipped, memory-bounded native rasters for both web glow layers", async () => {
    let compressedAssetBytes = 0;
    for (const stageWidth of NEMU_PORTRAIT_GLOW_STAGE_WIDTHS) {
      const suffix = stageWidth === 390 ? "" : `-${stageWidth}`;
      const width = stageWidth + NEMU_WEB_PORTRAIT_GLOW.artboardPadding * 2;
      const height =
        getNemuPortraitStageHeight(stageWidth) +
        NEMU_WEB_PORTRAIT_GLOW.artboardPadding * 2;
      for (const filename of [
        `portrait-glow${suffix}.png`,
        `portrait-glow-primary${suffix}.png`,
        `portrait-glow-secondary${suffix}.png`,
        `portrait-shadow${suffix}.png`,
      ]) {
        const assetPath = path.join(import.meta.dir, "../../assets", filename);
        const png = readFileSync(assetPath);
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        expect(png.readUInt32BE(16)).toBe(width);
        expect(png.readUInt32BE(20)).toBe(height);
        expect(width * height * 4).toBeLessThan(5_300_000);
        compressedAssetBytes += statSync(assetPath).size;
      }
    }
    expect(compressedAssetBytes).toBeLessThan(1_700_000);
    expect(1087 * 1195 * 4).toBeLessThan(5_300_000);
    expect(1087 * 1195 * 4 * 3).toBeLessThan(15_700_000);
    // Keep one logical-pixel raster per mask. Density siblings would either
    // duplicate the same decode or scale the 64/40px CSS blur away from dp.
    for (const filename of [
      "portrait-glow@2x.png",
      "portrait-glow@3x.png",
      "portrait-glow-primary@2x.png",
      "portrait-glow-primary@3x.png",
      "portrait-glow-secondary@2x.png",
      "portrait-glow-secondary@3x.png",
      "portrait-blur.png",
      "portrait-blur@2x.png",
      "portrait-blur@3x.png",
    ]) {
      expect(existsSync(path.join(import.meta.dir, "../../assets", filename))).toBe(
        false,
      );
    }

    const { data, info } = await sharp(
      path.join(import.meta.dir, "../../assets/portrait-glow.png"),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphas = new Set<number>();
    let bluePixels = 0;
    let purplePixels = 0;

    for (let offset = 0; offset < data.length; offset += info.channels) {
      const alpha = data[offset + 3];
      if (!alpha) continue;
      alphas.add(alpha);
      if (data[offset + 2] > data[offset]) bluePixels += 1;
      if (data[offset] > data[offset + 1]) purplePixels += 1;
    }

    expect(alphas.size).toBeGreaterThan(12);
    expect(bluePixels).toBeGreaterThan(100_000);
    expect(purplePixels).toBeGreaterThan(25_000);
    // The 224px padding is beyond 3σ for the 64px blur. All four raster
    // edges remain transparent, proving the aura is not canvas-clipped.
    for (let x = 0; x < info.width; x += 1) {
      expect(data[x * info.channels + 3]).toBe(0);
      expect(
        data[((info.height - 1) * info.width + x) * info.channels + 3],
      ).toBe(0);
    }
    for (let y = 0; y < info.height; y += 1) {
      expect(data[(y * info.width) * info.channels + 3]).toBe(0);
      expect(data[(y * info.width + info.width - 1) * info.channels + 3]).toBe(0);
    }

    const shadow = await sharp(
      path.join(import.meta.dir, "../../assets/portrait-shadow.png"),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const shadowAlphas = new Set<number>();
    let opaqueBrandPixels = 0;
    for (let offset = 0; offset < shadow.data.length; offset += 4) {
      const alpha = shadow.data[offset + 3];
      if (!alpha) continue;
      shadowAlphas.add(alpha);
      if (
        shadow.data[offset] === 123 &&
        shadow.data[offset + 1] === 154 &&
        shadow.data[offset + 2] === 208
      ) {
        opaqueBrandPixels += 1;
      }
    }
    expect(shadowAlphas.size).toBeGreaterThan(100);
    expect(opaqueBrandPixels).toBeGreaterThan(10_000);
    // The portrait's transparent upper corner stays empty while its opaque
    // center casts a shadow: this is an alpha silhouette, not a view rectangle.
    expect(shadow.data[(224 * shadow.info.width + 224) * 4 + 3]).toBe(0);
    expect(
      shadow.data[
        (Math.floor(shadow.info.height / 2) * shadow.info.width +
          Math.floor(shadow.info.width / 2)) *
          4 +
          3
      ],
    ).toBeGreaterThan(0);
  });

  test("ships deterministic high-density portrait derivatives of the live web art", async () => {
    const sourcePath = path.join(import.meta.dir, "../../../../public/portrait.png");
    const sourceMetadata = await sharp(sourcePath).metadata();
    expect(sourceMetadata.width).toBe(3000);
    expect(sourceMetadata.height).toBe(3508);

    let compressedBytes = 0;
    const digests: string[] = [];
    for (const [index, filename] of getMobilePortraitImageFilenames().entries()) {
      const scale = NEMU_MOBILE_PORTRAIT_RASTER.scales[index];
      const assetPath = path.join(import.meta.dir, "../../assets", filename);
      const png = readFileSync(assetPath);
      expect(png.readUInt32BE(16)).toBe(NEMU_MOBILE_PORTRAIT_RASTER.width * scale);
      expect(png.readUInt32BE(20)).toBe(NEMU_MOBILE_PORTRAIT_RASTER.height * scale);
      expect(png[25]).toBe(6);
      compressedBytes += png.length;
      digests.push(createHash("sha256").update(png).digest("hex"));
    }

    expect(compressedBytes).toBeLessThan(3_700_000);
    expect(1917 * 2241 * 4).toBeLessThan(17_300_000);
    expect(digests).toEqual([
      "289ecd26613b6312b6894090eadbd90687f04d01ba3911f3b772c58ee0f36786",
      "0aef366b62f9fe76cee19d68dbb80dd201def0d0e53c04a461994e99882d9cd3",
      "5c609a2934c7aa4cce4fb1278c3264da3e254d9d660341a3c3d95ec2bcfd0567",
    ]);
  });

  test(
    "reproduces every checked-in native raster pixel-for-pixel",
    async () => {
      const outputDirectory = mkdtempSync(
        path.join(tmpdir(), "nemu-portrait-glow-"),
      );
      try {
        await generateMobilePortraitAssets(outputDirectory);
        for (const filename of [
          ...getMobilePortraitGlowFilenames(),
          ...getMobilePortraitImageFilenames(),
        ]) {
          const generated = await sharp(
            path.join(outputDirectory, filename),
          )
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          const checkedIn = await sharp(
            path.join(import.meta.dir, "../../assets", filename),
          )
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          // PNG compression is deliberately not part of the contract. Sharp
          // uses platform-specific libvips/libpng builds whose deflate streams
          // can differ while decoding to the exact same raster. Pin the native
          // result that users see instead: geometry, RGBA channels, and every
          // decoded pixel byte.
          expect(generated.info).toEqual(checkedIn.info);
          expect(generated.data).toEqual(checkedIn.data);
        }
      } finally {
        rmSync(outputDirectory, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
