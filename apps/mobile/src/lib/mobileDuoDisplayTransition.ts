/**
 * Seamless handoff (close to peek) — detect when the reader moved between the
 * outer and inner display of a foldable, so a short glass toast can confirm
 * "Continued on outer display · p.12". Pure and stateful-by-value: the caller
 * keeps the returned `state` and feeds it back with the next snapshot.
 *
 * What counts as a display change (and what does not):
 * - Hinge reported (iOS 27.1 `UIHingeInteraction`, Android FoldingFeature
 *   state): `closed` ⇒ outer display, `partiallyOpen`/`fullyOpen` ⇒ inner.
 *   Book ↔ flat (fold angle) never changes the display.
 * - The hinge can flip a few frames before the window actually moves to the
 *   other display, so a hinge-derived change is only confirmed once the window
 *   geometry has also changed significantly (not a rotation). Until then it
 *   stays pending; flapping back cancels it.
 * - No hinge (Android reports no FoldingFeature on the outer screen, older
 *   natives): the short side crossing the 600pt regular-width boundary
 *   decides (Duo: 466×678 / 678×466 outer vs 669×951 / 951×669 inner — the
 *   compact → regular size-class jump). A change is only announced once the
 *   device has proven it folds this session — a hinge state or a fold
 *   division region (reported even while inactive) — so phones, tablets and
 *   freely resized windows (iPhone Mirroring, iPad, iOS 27 resizable scenes)
 *   never emit.
 * - Rotation (width/height swap) never emits.
 */
import { MOBILE_MEDIUM_WIDTH } from "@/lib/mobileAdaptiveLayout";
import type { WindowHingeStatus } from "@/lib/mobileWindowLayout";

export type MobileDuoDisplay = "outer" | "inner";

export type MobileDuoDisplaySnapshot = {
  width: number;
  height: number;
  hinge: WindowHingeStatus | null;
  /** The window reports a fold division region (active or not). */
  hasFold?: boolean;
};

export type MobileDuoDisplayState = {
  /** Last confirmed display; null until one can be classified. */
  display: MobileDuoDisplay | null;
  /** Geometry at the last confirmed display (or the first snapshot). */
  short: number;
  long: number;
  /** A hinge or fold region has been reported at least once — the device folds. */
  foldable: boolean;
};

export type MobileDuoDisplayTransitionResult = {
  state: MobileDuoDisplayState;
  /** Set only on the snapshot that confirms a display change. */
  handoff: MobileDuoDisplay | null;
};

/** Relative change of a side that counts as "the window moved", not a resize jitter. */
export const MOBILE_DUO_DISPLAY_GEOMETRY_CHANGE = 0.15;
export const MOBILE_DUO_HANDOFF_TOAST_MS = 1500;

function sides(snapshot: MobileDuoDisplaySnapshot): { short: number; long: number } | null {
  const { width, height } = snapshot;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { short: Math.min(width, height), long: Math.max(width, height) };
}

function classify(snapshot: MobileDuoDisplaySnapshot, geometry: { short: number }): MobileDuoDisplay {
  if (snapshot.hinge === "closed") return "outer";
  if (snapshot.hinge === "partiallyOpen" || snapshot.hinge === "fullyOpen") return "inner";
  return geometry.short < MOBILE_MEDIUM_WIDTH ? "outer" : "inner";
}

function geometryMoved(
  previous: { short: number; long: number },
  next: { short: number; long: number },
): boolean {
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, a);
  return rel(previous.short, next.short) >= MOBILE_DUO_DISPLAY_GEOMETRY_CHANGE
    || rel(previous.long, next.long) >= MOBILE_DUO_DISPLAY_GEOMETRY_CHANGE;
}

export function mobileDuoDisplayTransition(
  previous: MobileDuoDisplayState | null,
  next: MobileDuoDisplaySnapshot,
): MobileDuoDisplayTransitionResult {
  const geometry = sides(next);
  if (!geometry) {
    return {
      state: previous ?? { display: null, short: 0, long: 0, foldable: next.hinge != null || next.hasFold === true },
      handoff: null,
    };
  }
  const foldable = (previous?.foldable ?? false) || next.hinge != null || next.hasFold === true;
  const display = classify(next, geometry);

  if (!previous || previous.display === null) {
    return { state: { display, ...geometry, foldable }, handoff: null };
  }
  if (display === previous.display) {
    // Same display. Re-baseline only for rotation / jitter; a large move is
    // kept against the old baseline because the window can switch displays a
    // few frames before the hinge reports it (then the hinge flip confirms).
    const baseline = geometryMoved(previous, geometry) ? previous : { ...previous, ...geometry };
    return { state: { ...baseline, foldable }, handoff: null };
  }
  // A different display is suggested. Confirm with the window geometry so a
  // hinge flip that precedes the actual display switch stays pending.
  if (!geometryMoved(previous, geometry)) {
    return { state: { ...previous, foldable }, handoff: null };
  }
  return { state: { display, ...geometry, foldable }, handoff: foldable ? display : null };
}

/** From a raw window layout (`readerWindowLayout`) or `useMobileAdaptiveLayout()`. */
export function mobileDuoDisplaySnapshot(layout: {
  width: number;
  height: number;
  hinge?: WindowHingeStatus | null;
  divisions?: readonly unknown[];
}): MobileDuoDisplaySnapshot {
  return {
    width: layout.width,
    height: layout.height,
    hinge: layout.hinge ?? null,
    hasFold: (layout.divisions?.length ?? 0) > 0,
  };
}

/** "Continued on outer display · p.12" (localized), or without a page when unknown. */
export function mobileDuoHandoffMessage(
  strings: {
    handoffOuterDisplay: string;
    handoffInnerDisplay: string;
    handoffWithPage: string;
  },
  display: MobileDuoDisplay,
  pageNumber: number | null,
): string {
  const label = display === "outer" ? strings.handoffOuterDisplay : strings.handoffInnerDisplay;
  if (pageNumber == null || !Number.isFinite(pageNumber) || pageNumber < 1) return label;
  return strings.handoffWithPage
    .replace("{{display}}", label)
    .replace("{{page}}", String(Math.trunc(pageNumber)));
}
