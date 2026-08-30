import { resolve } from "node:path";
import sharp from "sharp";

const assetsDirectory = resolve(import.meta.dir, "../apps/mobile/assets");
const canvasSize = 360;
const iconSize = 80;
const iconRadius = 16;
const glowScale = 1.25;
const blurRadius = 40;
const rectOffset = (canvasSize - iconSize) / 2;
const center = canvasSize / 2;

const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <defs>
    <filter id="glow" x="-200%" y="-200%" width="500%" height="500%">
      <feGaussianBlur stdDeviation="${blurRadius}" />
    </filter>
  </defs>
  <rect
    x="${rectOffset}"
    y="${rectOffset}"
    width="${iconSize}"
    height="${iconSize}"
    rx="${iconRadius}"
    fill="#6b8cce"
    fill-opacity="0.3"
    filter="url(#glow)"
    transform="translate(${center} ${center}) scale(${glowScale}) translate(${-center} ${-center})"
  />
</svg>
`);

const glowRgb = [0x6b, 0x8c, 0xce] as const;

async function renderGlow(scale: number) {
  const { data, info } = await sharp(svg, { density: 72 * scale })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // librsvg renders filtered, low-alpha pixels in premultiplied color space.
  // Unpremultiplying those 8-bit channels can turn the intended brand blue
  // into visible cyan/royal-blue rings on Android. The alpha channel already
  // contains the correct Gaussian falloff, so keep it and normalize every
  // visible pixel to the same straight-alpha RGB used by web and iOS.
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] === 0) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      continue;
    }
    data[offset] = glowRgb[0];
    data[offset + 1] = glowRgb[1];
    data[offset + 2] = glowRgb[2];
  }

  return sharp(data, {
    raw: {
      channels: info.channels,
      height: info.height,
      width: info.width,
    },
  }).png({ compressionLevel: 9 });
}

for (const scale of [1, 2, 3]) {
  const suffix = scale === 1 ? "" : `@${scale}x`;
  const glow = await renderGlow(scale);
  await glow.toFile(resolve(assetsDirectory, `app-icon-glow${suffix}.png`));
}
