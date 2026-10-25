/**
 * Which enter/exit treatment the reader chrome should use. Kept apart from
 * `mobileReaderChromeAnimations` so the policy can be unit-tested without
 * pulling Reanimated (and therefore React Native) into the test runtime.
 */
export type ReaderChromeMotionVariant = "slide" | "fade";

/**
 * Reduce Motion drops the 6pt translate and leaves a plain cross-fade. The
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
export const READER_CHROME_MATERIAL_MS = 200;
/**
 * The top and bottom rows move this far toward their screen edge as they
 * hide, and come in from there as they show (none under Reduce Motion). Only
 * opacity and this translate animate: no scale, no size change.
 */
export const READER_CHROME_MATERIAL_SLIDE = 6;
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

/** Duration and slide distance of the capsule chrome's show / hide (Reduce Motion: the same fade, no movement). */
export function readerChromeMaterialTiming(
  reduceMotion: boolean | null,
): ReaderChromeMaterialTiming {
  return reduceMotion === true
    ? { durationMs: READER_CHROME_MATERIAL_MS, slide: 0 }
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

/**
 * The reader mounts this long before its zoom's nominal landing (native zoom
 * start + duration), so its heavy JS render runs during the zoom's tail and
 * its commit — the main-thread mount, where the chrome's fade starts — lands
 * at the visible landing. Mounted at the landing event instead (nominal +
 * 0.1 s native margin), the render then put the fade's start 0.08–0.15 s
 * later still: N+0.20–0.27 s, done N+0.32–0.39 s (build 9 round 2).
 */
export const READER_OPENING_MOUNT_LEAD_MS = 160;
/**
 * The first reader of an app session mounts this long before the landing —
 * at once when the zoom's start reaches JS (the zoom lasts ~350 ms): its first
 * render on a cold JS thread took 0.3–0.45 s, so mounted 120 ms ahead its
 * chrome first showed at V+0.33–0.44 s (build 9 round 3). The chrome no
 * longer shows before the landing however early it mounts (its glass waits
 * for the landing natively), so mounting early only moves the render.
 */
export const READER_OPENING_COLD_MOUNT_LEAD_MS = 400;
/** The opening's chrome fade is done by the visible landing + this (acceptance: nothing moves after +250 ms). */
export const READER_OPENING_CHROME_DONE_BY_MS = 230;
/** A late opening fade is shortened to catch up, never below this. */
export const READER_OPENING_CHROME_MIN_MS = 120;

/** Delay from `nowMs` until the reader mounts: `READER_OPENING_MOUNT_LEAD_MS` before the landing, at once when past it. */
export function resolveReaderOpeningMountDelay(input: { landsAtMs: number; nowMs: number; leadMs?: number }): number {
  const lead = input.leadMs ?? READER_OPENING_MOUNT_LEAD_MS;
  const delay = input.landsAtMs - lead - input.nowMs;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

/**
 * Duration of the chrome's opening fade, decided as the reader mounts with
 * its chrome shown: the usual `durationMs` when it ends by the landing +
 * `READER_OPENING_CHROME_DONE_BY_MS`; a reader that mounts late shortens it
 * (down to `READER_OPENING_CHROME_MIN_MS`) so it still ends there. No landing
 * known (no zoom), or `durationMs` 0: unchanged.
 */
export function resolveReaderOpeningChromeMs(input: { landsAtMs: number | null; nowMs: number; durationMs: number }): number {
  const { landsAtMs, nowMs, durationMs } = input;
  if (landsAtMs == null || !Number.isFinite(landsAtMs) || !(durationMs > 0)) return durationMs;
  const left = landsAtMs + READER_OPENING_CHROME_DONE_BY_MS - nowMs;
  return Math.round(Math.min(durationMs, Math.max(Math.min(durationMs, READER_OPENING_CHROME_MIN_MS), left)));
}
