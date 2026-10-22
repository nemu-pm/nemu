/**
 * How a zoom opening treats a chapter of a source that processes its page
 * images (Jump+ / SPY descrambling — the source's `hasImageProcessor`,
 * recorded with the page list): its pages are plates until the processor
 * has run. Ordinary remote pages (ToG) are "pending" too until their request
 * is resolved, but show at once after: they never hold.
 *
 * - `hold` (default, Colo's call: r15 measured 0.6–1.5 s of plates under
 *   `defer`): the source calls (the tap-time prefetch included) run at once
 *   and the cover stays until the first screen's images have painted, then
 *   fades — at most `READER_OPENING_IMAGE_HOLD_MAX_MS` after the landing
 *   (then it fades onto the plates anyway).
 * - `defer` (override): the cover fades on time (the scroll cap), the source
 *   calls wait for the fade (`readerOpeningGate`); plates show, then the
 *   images.
 *
 * Plus the first-screen measure every open logs (all sources): when every
 * page in the first viewport has painted its real image.
 *
 * Pure (no React Native), so the rules are testable.
 */

export type ReaderProcessedSourceOpening = "defer" | "hold";

/**
 * The switch's name: an iOS user default / launch argument
 * (`-NEMU_READER_PROCESSED_SOURCE_OPENING hold`), read at each open, over the
 * build's `EXPO_PUBLIC_NEMU_READER_PROCESSED_SOURCE_OPENING`.
 */
export const READER_PROCESSED_SOURCE_OPENING_KEY = "NEMU_READER_PROCESSED_SOURCE_OPENING";

/** `hold`: the cover fades this long after the landing at the latest. */
export const READER_OPENING_IMAGE_HOLD_MAX_MS = 2500;

/**
 * `hold` re-arms the cover's pending fade; a fade due sooner than this is
 * left to run (re-arming it as it starts would jump its opacity).
 */
export const READER_OPENING_HOLD_REARM_MARGIN_MS = 50;

/** The first valid value wins (`hold` / `defer`, any case); else `hold`. */
export function resolveReaderProcessedSourceOpening(
  ...candidates: unknown[]
): ReaderProcessedSourceOpening {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim().toLowerCase();
    if (value === "hold" || value === "defer") return value;
  }
  return "hold";
}

export type ReaderImageProcessorReason =
  /** Recorded with the cached page list. */
  | "page-list"
  /** Remembered for the source (a page list saved before it was recorded). */
  | "source-record"
  /** The source's own answer (no cache, or the refresh). */
  | "source"
  | "unknown";

/** What is known about the source processing its images, and from where. */
export function resolveReaderImageProcessor(input: {
  listed?: boolean | null;
  sourceRecord?: boolean | null;
}): { imageProcessor: boolean | null; reason: ReaderImageProcessorReason } {
  if (typeof input.listed === "boolean") return { imageProcessor: input.listed, reason: "page-list" };
  if (typeof input.sourceRecord === "boolean") {
    return { imageProcessor: input.sourceRecord, reason: "source-record" };
  }
  return { imageProcessor: null, reason: "unknown" };
}

/** Some page shows a plate until the source's processor has run. */
export function readerPagesNeedProcessing(
  pages: readonly { imageUri?: string; imageProcessing?: string }[],
): boolean {
  return pages.some((page) => Boolean(page.imageUri) && page.imageProcessing === "pending");
}

/**
 * Whether this open holds its cover for the first screen's images: `hold`, a
 * source known to process its images (unknown never holds: an ordinary
 * source must not be slowed), pages still waiting for it, and the cover
 * still up (an open without a fade, or one whose fade has ended, has nothing
 * to hold).
 */
export function shouldHoldReaderOpeningForImages(input: {
  opening: ReaderProcessedSourceOpening;
  imageProcessor: boolean | null;
  pagesNeedProcessing: boolean;
  openingSettled: boolean;
}): boolean {
  return (
    input.opening === "hold" &&
    input.imageProcessor === true &&
    input.pagesNeedProcessing &&
    !input.openingSettled
  );
}

/** The hold can still be taken: no fade is running or about to start. */
export function canHoldReaderOpening(input: {
  fadeStartsAt: number | null;
  now: number;
  marginMs?: number;
}): boolean {
  if (input.fadeStartsAt == null) return true;
  return input.fadeStartsAt - input.now >= (input.marginMs ?? READER_OPENING_HOLD_REARM_MARGIN_MS);
}

/** The hold's cap, as a delay from now (counted from the landing). */
export function resolveReaderOpeningHoldDelay(input: {
  landedAt: number;
  now: number;
  holdMaxMs?: number;
}): number {
  return Math.max(0, (input.holdMaxMs ?? READER_OPENING_IMAGE_HOLD_MAX_MS) - (input.now - input.landedAt));
}

export type ReaderCoverRevealReason =
  | "reader-ready"
  | "first-screen-images"
  | "scroll-cap"
  | "hold-cap"
  | "hold-max";

/**
 * Whether a reveal request starts the cover's fade now. A running fade is
 * left be; a delayed (UI-thread) cap is replaced only by the reader being
 * ready — or, while holding, by its first screen's images (holding, "ready"
 * alone no longer reveals).
 */
export function shouldRevealReaderCover(input: {
  reason: ReaderCoverRevealReason;
  holding: boolean;
  fadeStartsAt: number | null;
  now: number;
}): boolean {
  const { reason, holding, fadeStartsAt, now } = input;
  if (fadeStartsAt != null && fadeStartsAt <= now) return false;
  if (holding && reason === "reader-ready") return false;
  if (fadeStartsAt != null && reason !== "reader-ready" && reason !== "first-screen-images") return false;
  return true;
}

export type ReaderFirstScreenPage = {
  /** The page has an image at all (a text-only page has nothing to paint). */
  hasImage: boolean;
  /** Still a plate: its processing has not run. */
  processingPending: boolean;
  /** Processing or loading failed: nothing more will paint. */
  failed: boolean;
  /** Its real image has loaded (natural size known). */
  painted: boolean;
};

export type ReaderFirstScreenImages = {
  ready: boolean;
  pages: number;
  painted: number;
  failed: number;
};

/**
 * The first viewport's pages are done once each has painted its image or
 * failed (an empty viewport is not ready: nothing was measured).
 */
export function resolveReaderFirstScreenImages(
  pages: readonly ReaderFirstScreenPage[],
): ReaderFirstScreenImages {
  let painted = 0;
  let failed = 0;
  let waiting = 0;
  for (const page of pages) {
    if (!page.hasImage) continue;
    if (page.failed) failed += 1;
    else if (!page.processingPending && page.painted) painted += 1;
    else waiting += 1;
  }
  return { ready: pages.length > 0 && waiting === 0, pages: pages.length, painted, failed };
}

export type ReaderOpeningTimes = {
  /** The Continue / tile tap that started the zoom (wall clock). */
  tapAt: number | null;
  landedAt: number | null;
  fadeEndAt: number | null;
};

export const NO_READER_OPENING_TIMES: ReaderOpeningTimes = {
  tapAt: null,
  landedAt: null,
  fadeEndAt: null,
};

/** The opening's `since…Ms` fields (null: that moment has not happened). */
export function readerOpeningSince(
  times: ReaderOpeningTimes,
  now: number,
): { sinceTapMs: number | null; sinceLandedMs: number | null; sinceFadeEndMs: number | null } {
  const since = (at: number | null) => (at == null ? null : Math.round(now - at));
  return {
    sinceTapMs: since(times.tapAt),
    sinceLandedMs: since(times.landedAt),
    sinceFadeEndMs: since(times.fadeEndAt),
  };
}

/** The first screen still not painted this long after it was placed: one diagnostic line. */
export const READER_FIRST_SCREEN_PENDING_LOG_MS = 4000;

/** A first screen never counts more pages than this. */
export const READER_FIRST_SCREEN_MAX_PAGES = 4;

/**
 * The first viewport's pages (scroll reading): the viewport's own range when
 * it holds the page the opening placed; otherwise (viewport not reported yet,
 * or measured in another coordinate space — r15 never logged the first
 * screen) that page and the ones below it until a screen is filled.
 */
export function resolveReaderFirstScreenIndexes(input: {
  pageCount: number;
  currentIndex: number;
  viewportRange: { first: number; last: number } | null;
  viewportHeight: number;
  pageHeight: (index: number) => number;
}): number[] {
  const count = Math.max(0, Math.floor(input.pageCount));
  if (count === 0) return [];
  const current = Math.max(0, Math.min(count - 1, Math.round(input.currentIndex) || 0));
  const range = input.viewportRange;
  if (
    range &&
    range.first <= current &&
    current <= range.last &&
    range.last - range.first < READER_FIRST_SCREEN_MAX_PAGES
  ) {
    const indexes: number[] = [];
    for (let index = Math.max(0, range.first); index <= Math.min(count - 1, range.last); index += 1) {
      indexes.push(index);
    }
    return indexes;
  }
  const indexes = [current];
  let filled = Math.max(0, input.pageHeight(current) || 0);
  const screen = Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 ? input.viewportHeight : 0;
  for (
    let index = current + 1;
    index < count && filled < screen && indexes.length < READER_FIRST_SCREEN_MAX_PAGES;
    index += 1
  ) {
    indexes.push(index);
    filled += Math.max(0, input.pageHeight(index) || 0);
  }
  return indexes;
}
