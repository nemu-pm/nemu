export type NemuAppIconHaloRenderMode = "gaussian-blur" | "raster-glow";

const WEB_ICON_SIZE = 80;
const WEB_ICON_RADIUS = 16;
const WEB_GLOW_CANVAS_SIZE = 360;
const WEB_GLOW_BLUR_RADIUS = 40;

export const NEMU_APP_ICON_PRESS_MOTION = {
  duration: 300,
  rotateDegrees: -4,
  scale: 0.82,
} as const;

export function shouldAnimateNemuAppIconPress(
  reduceMotion: boolean | null,
): boolean {
  return reduceMotion === false;
}

export function getNemuAppIconHaloRenderMode(
  platform: string,
): NemuAppIconHaloRenderMode {
  // Keep Android off both SVG filters and SVG gradient surfaces. On Vulkan
  // devices those offscreen surfaces can turn into opaque black rectangles
  // after several frames even when their first frame is correct.
  return platform === "android" ? "raster-glow" : "gaussian-blur";
}

export function getNemuAppIconHaloMetrics(iconSize: number) {
  const sizeScale = iconSize / WEB_ICON_SIZE;
  const canvasSize = WEB_GLOW_CANVAS_SIZE * sizeScale;
  return {
    canvasSize,
    glowBlurRadius: WEB_GLOW_BLUR_RADIUS * sizeScale,
    iconRadius: WEB_ICON_RADIUS * sizeScale,
    rectOffset: (canvasSize - iconSize) / 2,
  };
}
