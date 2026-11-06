/**
 * The reader's opening loading screen: the title's cover, small and centred,
 * with a system spinner below it, on the reader background (no HUD). It only
 * shows when the first page is slow: a page ready within
 * `READER_OPENING_LOADING_DELAY_MS` of the opening goes straight in. Once
 * shown it stays at least `READER_OPENING_LOADING_MIN_VISIBLE_MS`, so it
 * never flashes.
 *
 * Pure (no React Native), so the timing rules are testable.
 */

/** A first page ready this soon after the opening never shows the loading screen. */
export const READER_OPENING_LOADING_DELAY_MS = 300;
/** Once shown, the loading screen stays at least this long (counted from its fade-in). */
export const READER_OPENING_LOADING_MIN_VISIBLE_MS = 400;
/** The cover and spinner fade in. */
export const READER_OPENING_LOADING_FADE_IN_MS = 200;
/** The loading screen fades out over the first page. */
export const READER_OPENING_LOADING_FADE_OUT_MS = 250;
/** Reduce Motion: the same fades, shorter. */
export const READER_OPENING_LOADING_REDUCED_FADE_MS = 150;
/**
 * A first page that never reports (a stalled image request): the loading
 * screen leaves anyway this long after the opening, onto the reader's own
 * loading state and its HUD.
 */
export const READER_OPENING_LOADING_BACKSTOP_MS = 10_000;

export function readerOpeningLoadingFades(reduceMotion: boolean | null): { inMs: number; outMs: number } {
  return reduceMotion === true
    ? { inMs: READER_OPENING_LOADING_REDUCED_FADE_MS, outMs: READER_OPENING_LOADING_REDUCED_FADE_MS }
    : { inMs: READER_OPENING_LOADING_FADE_IN_MS, outMs: READER_OPENING_LOADING_FADE_OUT_MS };
}

export type ReaderOpeningLoadingState =
  /** Not ready, the delay still running: the reader background only. */
  | { phase: "waiting"; showInMs: number }
  /** The cover and spinner are up; `leaveInMs` null: the page is not ready yet. */
  | { phase: "shown"; shownAt: number; leaveInMs: number | null }
  /** Done: into the reader. `skipped`: the loading screen never showed. */
  | { phase: "leave"; skipped: boolean };

/**
 * Where the opening stands at `now`. `openedAt`: when the opening started
 * (the zoom's landing, or the reader route's mount); `readyAt`: when the
 * first page was ready, null until it is.
 */
export function resolveReaderOpeningLoading(input: {
  openedAt: number;
  readyAt: number | null;
  now: number;
  delayMs?: number;
  minVisibleMs?: number;
}): ReaderOpeningLoadingState {
  const delayMs = input.delayMs ?? READER_OPENING_LOADING_DELAY_MS;
  const minVisibleMs = input.minVisibleMs ?? READER_OPENING_LOADING_MIN_VISIBLE_MS;
  const shownAt = input.openedAt + delayMs;
  const { readyAt, now } = input;
  if (readyAt != null && readyAt < shownAt) return { phase: "leave", skipped: true };
  if (readyAt == null) {
    return now < shownAt ? { phase: "waiting", showInMs: shownAt - now } : { phase: "shown", shownAt, leaveInMs: null };
  }
  const leaveAt = Math.max(readyAt, shownAt + minVisibleMs);
  return now < leaveAt ? { phase: "shown", shownAt, leaveInMs: leaveAt - now } : { phase: "leave", skipped: false };
}

/**
 * Where the loading screen's cover and spinner sit: the cover (2:3) centred
 * on the window, the spinner below it. The window alone decides, on every
 * display: no safe area, side bar, camera or HUD, so the cover is on the
 * screen's centre and stays there when those come and go. The cover is at
 * most half the window's width and `MAX_COVER_WIDTH` wide, and with the
 * spinner at most about half its height.
 */
const COVER_ASPECT = 2 / 3;
const MAX_COVER_WIDTH = 220;
/** The system spinner's height (UIActivityIndicatorView `.medium`). */
export const READER_OPENING_LOADING_SPINNER_SIZE = 20;
export const READER_OPENING_LOADING_SPINNER_GAP = 24;

export type ReaderOpeningLoadingLayout = {
  cover: { x: number; y: number; width: number; height: number };
  spinner: { x: number; y: number; width: number; height: number };
};

export function getReaderOpeningLoadingLayout({
  width,
  height,
}: {
  width: number;
  height: number;
}): ReaderOpeningLoadingLayout {
  const below = READER_OPENING_LOADING_SPINNER_GAP + READER_OPENING_LOADING_SPINNER_SIZE;
  const coverWidth = Math.max(
    0,
    Math.min(width / 2, MAX_COVER_WIDTH, ((height - below) / 2) * COVER_ASPECT),
  );
  const coverHeight = coverWidth / COVER_ASPECT;
  const top = (height - coverHeight) / 2;
  const centreX = width / 2;
  return {
    cover: {
      x: Math.round(centreX - coverWidth / 2),
      y: Math.round(top),
      width: Math.round(coverWidth),
      height: Math.round(coverHeight),
    },
    spinner: {
      x: Math.round(centreX - READER_OPENING_LOADING_SPINNER_SIZE / 2),
      y: Math.round(top + coverHeight + READER_OPENING_LOADING_SPINNER_GAP),
      width: READER_OPENING_LOADING_SPINNER_SIZE,
      height: READER_OPENING_LOADING_SPINNER_SIZE,
    },
  };
}

/**
 * A reader route that mounts while another is mounted is a chapter switch
 * (`router.replace` mounts the next reader before the previous one leaves):
 * only a first open shows the loading screen and holds the HUD.
 */
let mountedReaderRoutes = 0;

export function isReaderChapterSwitchMount(): boolean {
  return mountedReaderRoutes > 0;
}

/** Counts a mounted reader route; returns its release (idempotent). */
export function retainReaderRouteMount(): () => void {
  mountedReaderRoutes += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mountedReaderRoutes = Math.max(0, mountedReaderRoutes - 1);
  };
}
