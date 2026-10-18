import { MOBILE_READER_REDUCE_MOTION_FADE_MS } from "./mobileReaderStageMotion";

/**
 * Which enter/exit treatment the reader chrome should use. Kept apart from
 * `mobileReaderChromeAnimations` so the policy can be unit-tested without
 * pulling Reanimated (and therefore React Native) into the test runtime.
 */
export type ReaderChromeMotionVariant = "slide" | "fade";

/**
 * Reduce Motion drops the 8px translate and leaves a plain cross-fade. The
 * unknown (`null`) read is treated as "reduce", matching the theme provider's
 * motion-safe default, so chrome never slides before the setting resolves.
 */
export function readerChromeMotionVariant(
  reduceMotion: boolean | null,
): ReaderChromeMotionVariant {
  return reduceMotion === false ? "slide" : "fade";
}

/**
 * Capsule chrome show / hide: every glass piece (de)materializes its effect
 * and content in one UIKit animation (`NemuGlassView.animateMaterial`:
 * `UIView.animate(…, options: .curveEaseOut)`), and the non-glass parts — the
 * top scrim's fade, the rows' slide — run in Reanimated. They only read as
 * one motion if both use the same duration and curve, so these are the one
 * source for both.
 */
export const READER_CHROME_MATERIAL_MS = 300;
/** Rows slide this far toward their edge as they appear (none under Reduce Motion). */
export const READER_CHROME_MATERIAL_SLIDE = 8;
/**
 * UIKit's `.curveEaseOut` timing function, cubic-bezier(0, 0, 0.58, 1) (Core
 * Animation's `easeOut`). The glass animates on it natively, so Reanimated
 * drives the scrim and slide with `Easing.bezier(...this)` — not
 * `Easing.out(Easing.cubic)`, which front-loads the change (87% done at half
 * time against UIKit's ~68%) and leaves the glass visibly trailing.
 */
export const READER_CHROME_MATERIAL_CURVE = [0, 0, 0.58, 1] as const;

export type ReaderChromeMaterialTiming = {
  durationMs: number;
  slide: number;
};

/** Duration and slide distance of the capsule chrome's show / hide (Reduce Motion: the reader's short cross-fade, no slide). */
export function readerChromeMaterialTiming(
  reduceMotion: boolean | null,
): ReaderChromeMaterialTiming {
  return reduceMotion === true
    ? { durationMs: MOBILE_READER_REDUCE_MOTION_FADE_MS, slide: 0 }
    : { durationMs: READER_CHROME_MATERIAL_MS, slide: READER_CHROME_MATERIAL_SLIDE };
}

/**
 * Whether the capsule chrome carries the scrubber: whenever the chapter has
 * (or is fetching) pages — not gated on the chrome being shown, because the
 * capsule stays mounted through its dismiss and dematerializes with the other
 * pieces. Unmounting it with the show flag popped it out on the first frame
 * while the Back, title and action pieces took the full animation to go.
 */
export function readerChromeHasScrubber({
  pagesStatus,
  pageCount,
}: {
  pagesStatus: string;
  pageCount: number;
}): boolean {
  return (pagesStatus === "ready" && pageCount > 0) || pagesStatus === "loading";
}
