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
  // The selected raster's mask and stage have identical dimensions. One source
  // pixel maps to one native layout unit, so the 64/40px blur remains 64/40dp.
  const padding = NEMU_WEB_PORTRAIT_GLOW.artboardPadding;
  return {
    height: stageHeight + padding * 2,
    left: Math.round((containerStageWidth - stageWidth) / 2) - padding,
    top: Math.round((containerStageHeight - stageHeight) / 2) - padding,
    width: stageWidth + padding * 2,
  } as const;
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
