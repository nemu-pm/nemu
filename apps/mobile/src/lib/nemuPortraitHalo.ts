export const NEMU_WEB_PORTRAIT_GLOW = {
  artboardPadding: 224,
  portraitHeight: 456,
  portraitWidth: 390,
  primary: {
    blurRadius: 64,
    delay: 0,
    duration: 4_000,
    opacity: [0.25, 0.4] as const,
    scale: [1, 1.06] as const,
    translateY: [8, 14] as const,
  },
  secondary: {
    blurRadius: 40,
    delay: -3_000,
    duration: 6_000,
    opacity: [0.15, 0.25] as const,
    translateX: [-4, 4] as const,
    translateY: [12, 18] as const,
  },
  shadow: {
    blurRadius: 40,
    color: "#7b9ad0",
    opacity: 0.15,
    translateY: 20,
  },
} as const;

// Keep exact masks for the QA phones and the small/large responsive endpoints,
// with a bounded set of intermediate buckets. Every imported static raster is
// packaged, so duplicating nearly identical masks for every common viewport
// would add megabytes to the binary for an empty-state effect.
export const NEMU_PORTRAIT_GLOW_STAGE_WIDTHS = [
  320,
  360,
  390,
  411,
  430,
  512,
  639,
] as const;

export type NemuPortraitGlowStageWidth =
  (typeof NEMU_PORTRAIT_GLOW_STAGE_WIDTHS)[number];

export function getNemuPortraitGlowStageWidth(
  requestedWidth: number,
): NemuPortraitGlowStageWidth {
  const safeWidth = Number.isFinite(requestedWidth) ? requestedWidth : 320;
  let nearest: NemuPortraitGlowStageWidth = NEMU_PORTRAIT_GLOW_STAGE_WIDTHS[0];
  let nearestDistance = Math.abs(safeWidth - nearest);
  for (const width of NEMU_PORTRAIT_GLOW_STAGE_WIDTHS.slice(1)) {
    const distance = Math.abs(safeWidth - width);
    if (distance < nearestDistance) {
      nearest = width;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function getNemuPortraitStageHeight(stageWidth: number): number {
  return Math.round(
    stageWidth *
      (NEMU_WEB_PORTRAIT_GLOW.portraitHeight /
        NEMU_WEB_PORTRAIT_GLOW.portraitWidth),
  );
}

export function getNemuPortraitGlowRasterLayout({
  stageHeight,
  stageWidth,
  containerStageHeight = stageHeight,
  containerStageWidth = stageWidth,
}: {
  containerStageHeight?: number;
  containerStageWidth?: number;
  stageHeight: number;
  stageWidth: number;
}) {
  // Glow/shadow rasters are authored for a bucketed stage. Scale them onto the
  // displayed portrait box so the baked 20px drop-shadow stays under the
  // character instead of drifting when the nearest bucket differs.
  const padding = NEMU_WEB_PORTRAIT_GLOW.artboardPadding;
  const scale = stageWidth > 0 ? containerStageWidth / stageWidth : 1;
  const scaledPadding = padding * scale;
  return {
    height: Math.round((stageHeight + padding * 2) * scale),
    left: Math.round((containerStageWidth - stageWidth * scale) / 2 - scaledPadding),
    top: Math.round((containerStageHeight - stageHeight * scale) / 2 - scaledPadding),
    width: Math.round((stageWidth + padding * 2) * scale),
  } as const;
}

/**
 * How far each glow family visibly reaches past the portrait stage, in
 * bucket-raster pixels (alpha >= 3/255, i.e. under ~1%, measured from the
 * shipped rasters; `nemuPortraitHalo.test.ts` re-measures every bucket).
 * - `animated`: the iOS primary layer (the secondary drifts inside it).
 * - `composite`: Android's single static raster.
 */
export const NEMU_PORTRAIT_GLOW_VISIBLE_REACH = {
  animated: { top: 116, bottom: 50 },
  composite: { top: 74, bottom: 47 },
} as const;

/** Glow fade band limits (pt): long enough to read as falloff, never a stripe. */
const GLOW_FADE_MIN = 40;
const GLOW_FADE_MAX = 120;

export type NemuPortraitGlowFade = {
  /** Clip line, relative to the displayed stage's top edge (negative = above it). */
  clipTop: number;
  /** Height of the backdrop-coloured fade that brings the glow to zero at the clip line. */
  fadeHeight: number;
};

/**
 * The glow bleeds ~120pt past the art. Where the halo sits closer than that
 * to an edge that clips it (the opaque navigation bar, a scroll view's top),
 * the glow would end in a hard horizontal line. This returns a clip line at
 * that edge plus a fade band under it so the glow reaches zero exactly there:
 * the glow only is bounded — the art keeps its size and position — and
 * nothing changes when the glow already fits (null).
 */
export function getNemuPortraitGlowFade({
  containerStageHeight,
  containerStageWidth,
  renderMode,
  roomTop,
  stageWidth,
}: {
  /** Displayed portrait box. */
  containerStageHeight: number;
  containerStageWidth: number;
  /** Bucket raster the glow was authored for. */
  stageWidth: number;
  renderMode: "animated-raster-layers" | "static-composite-raster";
  /** Distance from the displayed stage's top edge up to the clipping edge; undefined = unbounded. */
  roomTop?: number | null;
}): NemuPortraitGlowFade | null {
  if (roomTop == null || !Number.isFinite(roomTop)) return null;
  const room = Math.max(0, roomTop);
  const scale = stageWidth > 0 ? containerStageWidth / stageWidth : 1;
  const half = containerStageHeight / 2;
  const reach = getNemuPortraitGlowReachTop({ half, renderMode, scale });
  if (room >= reach) return null;
  return {
    clipTop: -room,
    fadeHeight: Math.round(Math.min(GLOW_FADE_MAX, Math.max(GLOW_FADE_MIN, reach - room))),
  };
}

/** Worst-case visible reach above the displayed stage top, including the glow's own motion. */
export function getNemuPortraitGlowReachTop({
  half,
  renderMode,
  scale,
}: {
  half: number;
  renderMode: "animated-raster-layers" | "static-composite-raster";
  scale: number;
}): number {
  if (renderMode === "static-composite-raster") {
    return NEMU_PORTRAIT_GLOW_VISIBLE_REACH.composite.top * scale;
  }
  const { scale: pulseScale, translateY } = NEMU_WEB_PORTRAIT_GLOW.primary;
  // The pulse scales the raster about the stage centre and moves it down.
  return (
    pulseScale[1] * (half + NEMU_PORTRAIT_GLOW_VISIBLE_REACH.animated.top * scale) -
    half -
    translateY[0]
  );
}

export function shouldAnimateNemuPortraitHalo({
  appActive,
  focused,
  reduceMotion,
}: {
  appActive: boolean;
  focused: boolean;
  platform?: string;
  reduceMotion: boolean | null;
}): boolean {
  // Unknown reduce-motion is optimistic: waiting for the accessibility probe
  // used to leave the portrait frozen at rest, then snap into the CSS
  // timeline. Focus is not required to keep a loop alive — overlay sheets
  // blur the library without unmounting it, and restarting from rest made
  // iOS skip mid-cycle. Pause only for background or explicit reduce-motion.
  void focused;
  return appActive && reduceMotion !== true;
}

export function shouldAnimateNemuPortraitGlow(platform: string): boolean {
  // Android's Vulkan path has shown delayed black offscreen surfaces while
  // continuously transforming filtered transparent images. It receives the
  // same broad aura as a pre-rasterized layer while the portrait still moves.
  return platform !== "android";
}

export function getNemuPortraitHaloRenderMode(
  platform: string,
): "animated-raster-layers" | "static-composite-raster" {
  return platform === "android"
    ? "static-composite-raster"
    : "animated-raster-layers";
}

export type NemuWebLoopStart = {
  direction: "ascending" | "descending";
  progress: number;
  remainingDuration: number;
};

/**
 * Resolves a CSS animation's negative delay into the active keyframe leg.
 * CSS advances into the timeline immediately; it does not merely seed the
 * value and then replay a complete half-cycle from that seed.
 */
export function getNemuWebLoopStart(
  duration: number,
  negativeDelay = 0,
): NemuWebLoopStart {
  const legDuration = duration / 2;
  const elapsed = negativeDelay < 0
    ? ((-negativeDelay % duration) + duration) % duration
    : 0;

  if (elapsed < legDuration) {
    return {
      direction: "ascending",
      progress: elapsed / legDuration,
      remainingDuration: legDuration - elapsed,
    };
  }

  const elapsedInDescendingLeg = elapsed - legDuration;
  return {
    direction: "descending",
    progress: elapsedInDescendingLeg / legDuration,
    remainingDuration: legDuration - elapsedInDescendingLeg,
  };
}

export function getNemuAndroidStaticGlowState() {
  const primaryStart = getNemuWebLoopStart(
    NEMU_WEB_PORTRAIT_GLOW.primary.duration,
    NEMU_WEB_PORTRAIT_GLOW.primary.delay,
  );
  const secondaryStart = getNemuWebLoopStart(
    NEMU_WEB_PORTRAIT_GLOW.secondary.duration,
    NEMU_WEB_PORTRAIT_GLOW.secondary.delay,
  );
  if (primaryStart.progress !== 0 || secondaryStart.progress !== 0) {
    throw new Error("Android static glow requires keyframe-aligned web delays");
  }
  const primaryIndex = primaryStart.direction === "ascending" ? 0 : 1;
  const secondaryIndex = secondaryStart.direction === "ascending" ? 0 : 1;

  return {
    primary: {
      opacity: NEMU_WEB_PORTRAIT_GLOW.primary.opacity[primaryIndex],
      scale: NEMU_WEB_PORTRAIT_GLOW.primary.scale[primaryIndex],
      translateY: NEMU_WEB_PORTRAIT_GLOW.primary.translateY[primaryIndex],
    },
    secondary: {
      opacity: NEMU_WEB_PORTRAIT_GLOW.secondary.opacity[secondaryIndex],
      translateX: NEMU_WEB_PORTRAIT_GLOW.secondary.translateX[secondaryIndex],
      translateY: NEMU_WEB_PORTRAIT_GLOW.secondary.translateY[secondaryIndex],
    },
  } as const;
}
