/**
 * The motion a content-sized native sheet resizes with (`NemuSheetFitState`:
 * SwiftUI `.smooth(duration: 0.35)`, a critically damped spring with a 0.35 s
 * response), reproduced for React Native content that moves with it — the
 * reader Plugins sheet's page push / pop — so the page and the sheet's edge
 * travel on one curve.
 */
export const MOBILE_SHEET_SPRING_RESPONSE_SECONDS = 0.35;

/** Long enough for the spring to settle (< 0.2% left), so the timing ends where the spring does. */
export const MOBILE_SHEET_PAGE_TRANSITION_MS = 500;

const OMEGA = (2 * Math.PI) / MOBILE_SHEET_SPRING_RESPONSE_SECONDS;
const SPAN = (OMEGA * MOBILE_SHEET_PAGE_TRANSITION_MS) / 1000;
const END = 1 - (1 + SPAN) * Math.exp(-SPAN);

/**
 * Easing for a `MOBILE_SHEET_PAGE_TRANSITION_MS` timing: the critically damped
 * spring x(t) = 1 − (1 + ωt)·e^(−ωt), normalised to end exactly at 1.
 */
export function mobileSheetSmoothEasing(progress: number): number {
  "worklet";
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const s = SPAN * progress;
  return (1 - (1 + s) * Math.exp(-s)) / END;
}
