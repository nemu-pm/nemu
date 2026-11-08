/**
 * Real-book spine — iPhone Duo / foldable signature feature (pure geometry).
 *
 * 1. Inner-gutter shading: in a two-page spread (book posture, or a flat
 *    spread whose pages meet at the centre) each page gets a subtle gradient
 *    at the edge that faces the spine, like paper curving into a binding.
 *    A few percent opacity, ~8% of the page width, neutral (paper is not
 *    brand-tinted), a touch stronger in dark appearance where a dim display
 *    flattens the same alpha. Drawn only on pages whose inner edge actually
 *    reaches the spine — a narrow page floating in the middle of its pane gets
 *    no fake binding.
 * 2. Half-page flip: on a page turn the outgoing page lifts off around the
 *    spine (0° → ±90°) and the incoming facing page lands (∓90° → 0°) on the
 *    other side. The frame function is a worklet so Reanimated evaluates it on
 *    the UI thread — no per-frame JS; only transform + opacity change, which
 *    the compositor handles without re-layout.
 *
 * Reduce Motion disables the flip entirely (`shouldAnimateMobileDuoPageFlip`);
 * the static shading stays because it is not motion.
 */
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { computeContainRect, type OverlayNaturalSize } from "@/lib/mobileDualReaderOverlayLayout";

export type MobileDuoSpineTone = "light" | "dark";
export type MobileDuoSpineSide = "left" | "right";

export const MOBILE_DUO_SPINE_WIDTH_RATIO = 0.08;
export const MOBILE_DUO_SPINE_MIN_WIDTH_RATIO = 0.06;
export const MOBILE_DUO_SPINE_MAX_WIDTH_RATIO = 0.1;

/** Peak alpha at the spine; falls off to 0 across the band. */
export const MOBILE_DUO_SPINE_PEAK_ALPHA: Record<MobileDuoSpineTone, number> = {
  light: 0.08,
  dark: 0.12,
};

export type MobileDuoSpineGradient = {
  colors: [string, string, string];
  locations: [number, number, number];
  /** expo-linear-gradient start/end, unit coordinates; darkest at `start`. */
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type MobileDuoSpineShadeRect = {
  side: MobileDuoSpineSide;
  rect: WindowLayoutRect;
  gradient: MobileDuoSpineGradient;
};

export function mobileDuoSpineShadeWidth(pageWidth: number, ratio = MOBILE_DUO_SPINE_WIDTH_RATIO): number {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return 0;
  const clamped = Math.min(MOBILE_DUO_SPINE_MAX_WIDTH_RATIO, Math.max(MOBILE_DUO_SPINE_MIN_WIDTH_RATIO, ratio));
  return Math.round(pageWidth * clamped * 10) / 10;
}

export function mobileDuoSpineGradient(side: MobileDuoSpineSide, tone: MobileDuoSpineTone): MobileDuoSpineGradient {
  const peak = MOBILE_DUO_SPINE_PEAK_ALPHA[tone];
  const mid = Math.round(peak * 0.35 * 1000) / 1000;
  // The left page's spine edge is its right edge, and vice versa.
  const atSpine = side === "left" ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
  const away = side === "left" ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
  return {
    colors: [`rgba(0,0,0,${peak})`, `rgba(0,0,0,${mid})`, "rgba(0,0,0,0)"],
    locations: [0, 0.4, 1],
    start: atSpine,
    end: away,
  };
}

/**
 * Where the fitted page images sit inside their panes. `align: "center"` is
 * the book-posture rule (each pane centres its page); `"spine"` is the flat
 * spread rule (pages meet at the centre seam, spare width goes outside) —
 * see `mobileReaderSpreadPageAlignment`.
 */
export function mobileDuoSpreadPageRects(input: {
  panes: [WindowLayoutRect, WindowLayoutRect];
  naturalSizes: [OverlayNaturalSize | null, OverlayNaturalSize | null];
  align: "center" | "spine";
}): [WindowLayoutRect | null, WindowLayoutRect | null] {
  return input.panes.map((pane, index) => {
    const natural = input.naturalSizes[index];
    if (!natural || !(natural.width > 0) || !(natural.height > 0)) return null;
    const fitted = computeContainRect({ container: pane, natural });
    let x = pane.x + fitted.x;
    if (input.align === "spine") {
      x = index === 0 ? pane.x + pane.width - fitted.width : pane.x;
    }
    return { x, y: pane.y + fitted.y, width: fitted.width, height: fitted.height };
  }) as [WindowLayoutRect | null, WindowLayoutRect | null];
}

/**
 * Shade bands for the visible spread pages. `spine` is the physical spine
 * interval along x (fold region, or a zero-width seam). A page gets a band
 * only when its inner edge is within `maxGap` of the spine.
 */
export function mobileDuoSpineShadeRects(input: {
  leftPage: WindowLayoutRect | null;
  rightPage: WindowLayoutRect | null;
  spine: { start: number; end: number };
  tone: MobileDuoSpineTone;
  widthRatio?: number;
  maxGap?: number;
}): MobileDuoSpineShadeRect[] {
  const { leftPage, rightPage, spine, tone, widthRatio } = input;
  const out: MobileDuoSpineShadeRect[] = [];
  const gapLimit = (page: WindowLayoutRect) => input.maxGap ?? Math.max(12, page.width * 0.04);
  if (leftPage && leftPage.width > 0 && leftPage.height > 0) {
    const gap = spine.start - (leftPage.x + leftPage.width);
    if (gap >= -1 && gap <= gapLimit(leftPage)) {
      const width = mobileDuoSpineShadeWidth(leftPage.width, widthRatio);
      out.push({
        side: "left",
        rect: { x: leftPage.x + leftPage.width - width, y: leftPage.y, width, height: leftPage.height },
        gradient: mobileDuoSpineGradient("left", tone),
      });
    }
  }
  if (rightPage && rightPage.width > 0 && rightPage.height > 0) {
    const gap = rightPage.x - spine.end;
    if (gap >= -1 && gap <= gapLimit(rightPage)) {
      const width = mobileDuoSpineShadeWidth(rightPage.width, widthRatio);
      out.push({
        side: "right",
        rect: { x: rightPage.x, y: rightPage.y, width, height: rightPage.height },
        gradient: mobileDuoSpineGradient("right", tone),
      });
    }
  }
  return out;
}

// --- Half-page flip ---------------------------------------------------------

export type MobileDuoPageTurn = "forward" | "backward";

export type MobileDuoPageFlipPlan = {
  /** Pane whose page lifts off (it shows the page being left). */
  outgoingSide: MobileDuoSpineSide;
  /** Pane where the new facing page lands. */
  incomingSide: MobileDuoSpineSide;
  /** Pivot edge of each leaf (always its spine edge), as a `transformOrigin` keyword. */
  outgoingOrigin: MobileDuoSpineSide;
  incomingOrigin: MobileDuoSpineSide;
  /** rotateY at the half-way point for the outgoing leaf (0 → this). */
  outgoingEndDeg: number;
  /** rotateY at the half-way point for the incoming leaf (this → 0). */
  incomingStartDeg: number;
};

/**
 * Turning forward in an LTR book lifts the right page over the spine to the
 * left; RTL (manga) lifts the left page to the right. Backward mirrors both.
 *
 * Sign convention (React Native follows CSS: +rotateY moves the right edge
 * away from the viewer): a leaf's free edge comes toward the reader as it
 * lifts, so a right-pane leaf pivoting on its left edge goes negative and a
 * left-pane leaf pivoting on its right edge goes positive.
 */
export function mobileDuoPageFlipPlan(input: { turn: MobileDuoPageTurn; rtl: boolean }): MobileDuoPageFlipPlan {
  const outgoingSide: MobileDuoSpineSide = (input.turn === "forward") !== input.rtl ? "right" : "left";
  const incomingSide: MobileDuoSpineSide = outgoingSide === "right" ? "left" : "right";
  return {
    outgoingSide,
    incomingSide,
    outgoingOrigin: outgoingSide === "right" ? "left" : "right",
    incomingOrigin: incomingSide === "right" ? "left" : "right",
    outgoingEndDeg: outgoingSide === "right" ? -90 : 90,
    incomingStartDeg: incomingSide === "left" ? 90 : -90,
  };
}

export type MobileDuoPageFlipFrame = {
  outgoingDeg: number;
  outgoingOpacity: number;
  incomingDeg: number;
  incomingOpacity: number;
  /** The previous page still visible under the incoming side until the leaf covers it. */
  underOpacity: number;
  /** Extra shade on the moving leaf as it turns away from the light. */
  leafShade: number;
};

export const MOBILE_DUO_PAGE_FLIP_DURATION_MS = 460;
export const MOBILE_DUO_PAGE_FLIP_MAX_SHADE = 0.22;

/**
 * Frame at `progress` ∈ [0, 1] (already eased by the caller's timing curve).
 * First half: the outgoing leaf rotates to edge-on. Second half: the incoming
 * leaf rotates from edge-on to flat. Runs on the UI thread.
 */
export function mobileDuoPageFlipFrame(progress: number, plan: MobileDuoPageFlipPlan): MobileDuoPageFlipFrame {
  "worklet";
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  if (p < 0.5) {
    const t = p / 0.5;
    return {
      outgoingDeg: plan.outgoingEndDeg * t,
      outgoingOpacity: 1,
      incomingDeg: plan.incomingStartDeg,
      incomingOpacity: 0,
      underOpacity: 1,
      leafShade: MOBILE_DUO_PAGE_FLIP_MAX_SHADE * t,
    };
  }
  const t = (p - 0.5) / 0.5;
  return {
    outgoingDeg: plan.outgoingEndDeg,
    outgoingOpacity: 0,
    incomingDeg: plan.incomingStartDeg * (1 - t),
    incomingOpacity: p >= 1 ? 0 : 1,
    underOpacity: 0,
    leafShade: MOBILE_DUO_PAGE_FLIP_MAX_SHADE * (1 - t),
  };
}

/**
 * The flip is a book gesture: only for a two-page spread whose pages face each
 * other across a real spine (book posture, or a flat spread), never while
 * zoomed, never with Reduce Motion, and never for a jump (scrubber, chapter
 * change) — only a single step in reading order.
 */
export function shouldAnimateMobileDuoPageFlip(input: {
  reduceMotion: boolean | null;
  spread: boolean;
  zoomed: boolean;
  step: number;
}): boolean {
  if (input.reduceMotion !== false) return false;
  if (!input.spread || input.zoomed) return false;
  return Math.abs(input.step) === 1;
}
