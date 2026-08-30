import { resolve } from "node:path";
import sharp from "sharp";
import {
  getNemuAndroidStaticGlowState,
  getNemuPortraitStageHeight,
  NEMU_PORTRAIT_GLOW_STAGE_WIDTHS,
  NEMU_WEB_PORTRAIT_GLOW,
  type NemuPortraitGlowStageWidth,
} from "../apps/mobile/src/lib/nemuPortraitHalo";

export const NEMU_MOBILE_PORTRAIT_RASTER = {
  height: 747,
  scales: [1, 2, 3] as const,
  width: 639,
} as const;

// The responsive raster set keeps each gradient mask matched to its portrait
// stage while retaining web's fixed 64/40px blurs. At runtime only one Android
// composite or two iOS layers are decoded; no filtered retina surface is built.
const androidStaticState = getNemuAndroidStaticGlowState();

function assetSuffix(stageWidth: NemuPortraitGlowStageWidth): string {
  return stageWidth === NEMU_WEB_PORTRAIT_GLOW.portraitWidth
    ? ""
    : `-${stageWidth}`;
}

function filenamesForStage(stageWidth: NemuPortraitGlowStageWidth) {
  const suffix = assetSuffix(stageWidth);
  return {
    composite: `portrait-glow${suffix}.png`,
    primary: `portrait-glow-primary${suffix}.png`,
    secondary: `portrait-glow-secondary${suffix}.png`,
    shadow: `portrait-shadow${suffix}.png`,
  } as const;
}

export function getMobilePortraitGlowFilenames(): string[] {
  return NEMU_PORTRAIT_GLOW_STAGE_WIDTHS.flatMap((stageWidth) =>
    Object.values(filenamesForStage(stageWidth)),
  );
}

export function getMobilePortraitImageFilenames(): string[] {
  return NEMU_MOBILE_PORTRAIT_RASTER.scales.map((scale) =>
    scale === 1 ? "portrait.png" : `portrait@${scale}x.png`,
  );
}

function svgDefinitions() {
  return `
    <linearGradient id="primary-gradient" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#7b9ad0" stop-opacity="0.5" />
      <stop offset="0.5" stop-color="#c4a6d6" stop-opacity="0.3" />
      <stop offset="1" stop-color="#c4a6d6" stop-opacity="0" />
    </linearGradient>
    <radialGradient id="secondary-gradient" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#d4b8e8" stop-opacity="0.25" />
      <stop offset="0.5" stop-color="#9bb5e0" stop-opacity="0.15" />
      <stop offset="1" stop-color="#9bb5e0" stop-opacity="0" />
    </radialGradient>
    <filter id="primary-blur" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="${NEMU_WEB_PORTRAIT_GLOW.primary.blurRadius}" />
    </filter>
    <filter id="secondary-blur" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="${NEMU_WEB_PORTRAIT_GLOW.secondary.blurRadius}" />
    </filter>`;
}

function rasterSvg(
  stageWidth: NemuPortraitGlowStageWidth,
  layer: "composite" | "primary" | "secondary",
): Buffer {
  const stageHeight = getNemuPortraitStageHeight(stageWidth);
  const padding = NEMU_WEB_PORTRAIT_GLOW.artboardPadding;
  const canvasWidth = stageWidth + padding * 2;
  const canvasHeight = stageHeight + padding * 2;
  const cx = padding + stageWidth / 2;
  const cy = padding + stageHeight / 2;
  const rx = stageWidth / 2;
  const ry = stageHeight / 2;
  const primaryRect = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#primary-gradient)" filter="url(#primary-blur)" />`;
  const secondaryRect = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#secondary-gradient)" filter="url(#secondary-blur)" />`;

  const content = layer === "primary"
    ? primaryRect
    : layer === "secondary"
      ? secondaryRect
      : `<g opacity="${androidStaticState.primary.opacity}" transform="translate(0 ${androidStaticState.primary.translateY}) scale(${androidStaticState.primary.scale})">
          ${primaryRect}
        </g>
        <g opacity="${androidStaticState.secondary.opacity}" transform="translate(${androidStaticState.secondary.translateX} ${androidStaticState.secondary.translateY})">
          ${secondaryRect}
        </g>`;

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <defs>${svgDefinitions()}
  </defs>
  ${content}
</svg>
`);
}

async function writeLogicalRaster(
  svg: Buffer,
  filename: string,
  assetsDirectory: string,
) {
  await sharp(svg, { density: 72 })
    // Keep full truecolor RGBA. Palette quantization introduces visible color
    // rings once native composites the broad, low-alpha gradients.
    .png({ compressionLevel: 9 })
    .toFile(resolve(assetsDirectory, filename));
}

async function writePortraitShadowRaster(
  stageWidth: NemuPortraitGlowStageWidth,
  filename: string,
  assetsDirectory: string,
) {
  const stageHeight = getNemuPortraitStageHeight(stageWidth);
  const padding = NEMU_WEB_PORTRAIT_GLOW.artboardPadding;
  const source = resolve(import.meta.dir, "../public/portrait.png");
  const alpha = await sharp(source)
    .resize(stageWidth, stageHeight, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .extractChannel("alpha")
    .png({ compressionLevel: 9 })
    .toBuffer();
  const silhouette = await sharp({
    create: {
      background: NEMU_WEB_PORTRAIT_GLOW.shadow.color,
      channels: 3,
      height: stageHeight,
      width: stageWidth,
    },
  })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp({
    create: {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: stageHeight + padding * 2,
      width: stageWidth + padding * 2,
    },
  })
    .composite([
      {
        input: silhouette,
        left: padding,
        top: padding + NEMU_WEB_PORTRAIT_GLOW.shadow.translateY,
      },
    ])
    .blur(NEMU_WEB_PORTRAIT_GLOW.shadow.blurRadius)
    .png({ adaptiveFiltering: true, compressionLevel: 9, effort: 10 })
    .toFile(resolve(assetsDirectory, filename));
}

export async function generateMobilePortraitGlow(
  assetsDirectory = resolve(import.meta.dir, "../apps/mobile/assets"),
) {
  for (const stageWidth of NEMU_PORTRAIT_GLOW_STAGE_WIDTHS) {
    const filenames = filenamesForStage(stageWidth);
    await writeLogicalRaster(
      rasterSvg(stageWidth, "composite"),
      filenames.composite,
      assetsDirectory,
    );
    await writeLogicalRaster(
      rasterSvg(stageWidth, "primary"),
      filenames.primary,
      assetsDirectory,
    );
    await writeLogicalRaster(
      rasterSvg(stageWidth, "secondary"),
      filenames.secondary,
      assetsDirectory,
    );
    await writePortraitShadowRaster(
      stageWidth,
      filenames.shadow,
      assetsDirectory,
    );
  }
}

export async function generateMobilePortraitImage(
  assetsDirectory = resolve(import.meta.dir, "../apps/mobile/assets"),
) {
  const source = resolve(import.meta.dir, "../public/portrait.png");
  for (const scale of NEMU_MOBILE_PORTRAIT_RASTER.scales) {
    await sharp(source)
      .resize(
        NEMU_MOBILE_PORTRAIT_RASTER.width * scale,
        NEMU_MOBILE_PORTRAIT_RASTER.height * scale,
        { fit: "fill", kernel: "lanczos3" },
      )
      // Truecolor preserves the web illustration's translucent gradients;
      // explicit effort/filters keep every checked-in derivative reproducible.
      .png({
        adaptiveFiltering: true,
        compressionLevel: 9,
        effort: 10,
        palette: false,
      })
      .toFile(
        resolve(
          assetsDirectory,
          scale === 1 ? "portrait.png" : `portrait@${scale}x.png`,
        ),
      );
  }
}

export async function generateMobilePortraitAssets(
  assetsDirectory = resolve(import.meta.dir, "../apps/mobile/assets"),
) {
  await generateMobilePortraitGlow(assetsDirectory);
  await generateMobilePortraitImage(assetsDirectory);
}

function resolveCliOutputDirectory(argv: string[]): string {
  const outputDirectoryArgument = argv.indexOf("--output-dir");
  if (outputDirectoryArgument < 0) {
    return resolve(import.meta.dir, "../apps/mobile/assets");
  }
  const outputDirectory = argv[outputDirectoryArgument + 1];
  if (!outputDirectory) throw new Error("--output-dir requires a path");
  return resolve(outputDirectory);
}

if (import.meta.main) {
  await generateMobilePortraitAssets(resolveCliOutputDirectory(process.argv));
}
