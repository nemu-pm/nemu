/**
 * Seamless scroll, `pull` prepend mode: the chapter above is fetched only
 * when the reader pulls the list down past the very top of the open
 * chapter's first page by more than the threshold, and lets go there.
 *
 * Pure: the gallery feeds every scroll event of a drag (and of the bounce
 * after it) and acts on `haptic` (a selection tick when the pull first
 * reaches the threshold) and on `releases` at the end of the drag.
 */

/** How far (pt) past the top of p1 a pull must reach to fetch the chapter above. */
export const MOBILE_READER_STRIP_PULL_THRESHOLD = 72;

export type MobileReaderStripPullState = Readonly<{
  /** How far the list is pulled past its top (pt, 0 when not). */
  pull: number;
  /** The pull reached the threshold and the finger is still down. */
  armed: boolean;
}>;

export const MOBILE_READER_STRIP_PULL_IDLE: MobileReaderStripPullState = Object.freeze({
  pull: 0,
  armed: false,
});

/**
 * The pull after a scroll event. `offset` is the list's content offset: at
 * the very top of p1 it is 0, a pull makes it negative (iOS bounce).
 * `enabled`: pull mode, the open chapter heads the list and a chapter above
 * exists. Only a finger on the list arms (the bounce back never does); the
 * haptic fires once per arming, not again until the pull drops under the
 * threshold and comes back.
 */
export function nextMobileReaderStripPull(
  state: MobileReaderStripPullState,
  input: { offset: number; dragging: boolean; enabled: boolean },
  threshold = MOBILE_READER_STRIP_PULL_THRESHOLD,
): { state: MobileReaderStripPullState; haptic: boolean } {
  if (!input.enabled || !Number.isFinite(input.offset)) {
    return { state: MOBILE_READER_STRIP_PULL_IDLE, haptic: false };
  }
  const pull = Math.max(0, -input.offset);
  if (!input.dragging) {
    // Released: the bounce brings the header back up; nothing re-arms.
    return { state: pull === state.pull && !state.armed ? state : { pull, armed: false }, haptic: false };
  }
  const armed = pull >= threshold;
  return {
    state: pull === state.pull && armed === state.armed ? state : { pull, armed },
    haptic: armed && !state.armed,
  };
}

/** The finger lifted: fetch the chapter above when the pull was armed. */
export function mobileReaderStripPullReleases(state: MobileReaderStripPullState): boolean {
  return state.armed;
}

/** The pull header's opacity: fades in over the threshold's distance. */
export function mobileReaderStripPullHeaderOpacity(
  pull: number,
  threshold = MOBILE_READER_STRIP_PULL_THRESHOLD,
): number {
  if (!(pull > 0) || !(threshold > 0)) return 0;
  return Math.min(1, pull / threshold);
}
