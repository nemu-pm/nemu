export type NemuAppIconHaloRenderMode = "gaussian-blur" | "raster-glow";

const WEB_ICON_SIZE = 80;
const WEB_ICON_RADIUS = 16;
const WEB_GLOW_CANVAS_SIZE = 360;
const WEB_GLOW_BLUR_RADIUS = 40;

export function getNemuAppIconHaloRenderMode(
  platform: string,
): NemuAppIconHaloRenderMode {
  // Keep Android off both SVG filters and SVG gradient surfaces. On Vulkan
  // devices those offscreen surfaces can turn into opaque black rectangles
  // after several frames even when their first frame is correct.
  return platform === "android" ? "raster-glow" : "gaussian-blur";
}

/** Web `scale-125`: the blurred rect is 1.25× the icon. */
export const NEMU_APP_ICON_WEB_GLOW_SCALE = 1.25;
/**
 * A Gaussian's tail reaches under ~1% of the 30% fill (≈ 1/255 on screen) at
 * 2.3σ past the rect edge — beyond that the glow is invisible, so this is how
 * far it may still reach before an edge would cut it.
 */
export const NEMU_APP_ICON_GLOW_VISIBLE_SIGMAS = 2.3;
/** Bounded glow: a slightly tighter rect, sunk a little so it pools under the icon like its shadow. */
const BOUNDED_GLOW_SCALE = 1.1;
const BOUNDED_GLOW_DROP_RATIO = 0.075;
const MIN_BLUR_RATIO = 0.05;

export type NemuAppIconHaloMetrics = {
  canvasSize: number;
  glowBlurRadius: number;
  iconRadius: number;
  rectOffset: number;
  /** Scale of the blurred rect around the icon centre. */
  glowScale: number;
  /** Downward offset of the glow centre (pt). */
  glowOffsetY: number;
  /** Android: scale of the baked 360pt raster around the (offset) icon centre. */
  rasterScale: number;
};

/**
 * Web halo geometry (`bg-[#6b8cce]/30 blur-2xl scale-125`), bounded when the
 * icon sits closer than the glow's reach to an edge that clips it: a sheet's
 * top edge (About, onboarding) would otherwise cut the glow in a straight
 * line. `glowRoomTop` is the distance from the icon's top edge up to that
 * edge; the icon itself never changes, only the glow tightens until it fades
 * out just inside the edge.
 */
export function getNemuAppIconHaloMetrics(
  iconSize: number,
  glowRoomTop?: number | null,
): NemuAppIconHaloMetrics {
  const sizeScale = iconSize / WEB_ICON_SIZE;
  const canvasSize = WEB_GLOW_CANVAS_SIZE * sizeScale;
  const webBlur = WEB_GLOW_BLUR_RADIUS * sizeScale;
  const web: NemuAppIconHaloMetrics = {
    canvasSize,
    glowBlurRadius: webBlur,
    iconRadius: WEB_ICON_RADIUS * sizeScale,
    rectOffset: (canvasSize - iconSize) / 2,
    glowScale: NEMU_APP_ICON_WEB_GLOW_SCALE,
    glowOffsetY: 0,
    rasterScale: 1,
  };
  if (glowRoomTop == null || !Number.isFinite(glowRoomTop)) return web;
  const room = Math.max(0, glowRoomTop);
  if (getNemuAppIconGlowReachTop(iconSize, web) <= room) return web;

  const glowOffsetY = Math.round(iconSize * BOUNDED_GLOW_DROP_RATIO * 10) / 10;
  const overhang = ((BOUNDED_GLOW_SCALE - 1) * iconSize) / 2;
  const glowBlurRadius = Math.max(
    iconSize * MIN_BLUR_RATIO,
    Math.min(webBlur, (room + glowOffsetY - overhang) / NEMU_APP_ICON_GLOW_VISIBLE_SIGMAS),
  );
  // Android's raster bakes the web blur; shrink it about the icon centre until
  // its visible reach fits: half*k + 2.3σ*k - iconSize/2 - dy <= room.
  const webReachFromCentre =
    (iconSize * NEMU_APP_ICON_WEB_GLOW_SCALE) / 2 + NEMU_APP_ICON_GLOW_VISIBLE_SIGMAS * webBlur;
  const rasterScale = Math.min(1, (room + iconSize / 2 + glowOffsetY) / webReachFromCentre);
  return {
    ...web,
    glowBlurRadius: Math.round(glowBlurRadius * 10) / 10,
    glowScale: BOUNDED_GLOW_SCALE,
    glowOffsetY,
    rasterScale: Math.round(rasterScale * 1000) / 1000,
  };
}

/** Visible reach of the (SVG) glow above the icon's top edge, in pt. */
export function getNemuAppIconGlowReachTop(
  iconSize: number,
  metrics: Pick<NemuAppIconHaloMetrics, "glowBlurRadius" | "glowOffsetY" | "glowScale">,
): number {
  return (
    ((metrics.glowScale - 1) * iconSize) / 2 +
    NEMU_APP_ICON_GLOW_VISIBLE_SIGMAS * metrics.glowBlurRadius -
    metrics.glowOffsetY
  );
}
