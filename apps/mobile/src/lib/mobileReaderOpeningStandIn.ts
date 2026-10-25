/**
 * The page a reader showed when it was last at rest on a chapter, kept for
 * this session: its image request and where it sat in the window. Reopening
 * that chapter (the reader restores the same spot) cross-fades the zoom's
 * cover into a stand-in of exactly that page during the second half of the
 * zoom, so the page is fully shown the moment the zoom lands, before the
 * reader itself has mounted underneath (it mounts on the landing). The
 * stand-in leaves once the reader has drawn the same page under it.
 *
 * Session memory only (request headers can carry short-lived tokens), a few
 * chapters, never data URIs (a processed page held in memory).
 *
 * Pure (no React Native), so it is testable.
 */

export type MobileReaderStandInRect = { x: number; y: number; width: number; height: number };

export type MobileReaderStandInPage = {
  id: string;
  uri: string;
  headers?: Record<string, string>;
  uriOwnership?: "source" | "app";
  /** Window coordinates of the page's frame (its image is contain-fitted in it). */
  rect: MobileReaderStandInRect;
};

export type MobileReaderStandIn = {
  pages: MobileReaderStandInPage[];
  /** The window the rects were measured in: another size never reuses them. */
  window: { width: number; height: number };
};

/** The cover's cross-fade into the stand-in (Colo): its second half, ending at the landing. */
export const MOBILE_READER_STAND_IN_FADE_MS = 300;

const MAX_CHAPTERS = 8;
const standIns = new Map<string, MobileReaderStandIn>();

export function mobileReaderStandInKey(input: {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
}): string {
  return JSON.stringify([input.registryId, input.sourceId, input.mangaId, input.chapterId]);
}

function usableRect(rect: MobileReaderStandInRect, window: { width: number; height: number }): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    rect.width > 1 &&
    rect.height > 1 &&
    // On screen (the pager's neighbours sit a page away, off it).
    rect.x >= -1 &&
    rect.y >= -1 &&
    rect.x + rect.width <= window.width + 1 &&
    rect.y + rect.height <= window.height + 1
  );
}

/**
 * Notes what a chapter shows at rest. Pages off screen, without a usable
 * request or with a data URI are dropped; nothing usable forgets the chapter
 * (a stale stand-in must never stand in for another page).
 */
export function rememberMobileReaderStandIn(key: string, standIn: MobileReaderStandIn): void {
  const pages = standIn.pages.filter(
    (page) => page.uri !== "" && !page.uri.startsWith("data:") && usableRect(page.rect, standIn.window),
  );
  standIns.delete(key);
  if (pages.length === 0) return;
  standIns.set(key, { pages, window: standIn.window });
  while (standIns.size > MAX_CHAPTERS) {
    const oldest = standIns.keys().next().value;
    if (oldest === undefined) break;
    standIns.delete(oldest);
  }
}

/** The stand-in for a chapter, when it was measured in a window of this size. */
export function peekMobileReaderStandIn(
  key: string,
  window: { width: number; height: number },
): MobileReaderStandIn | null {
  const standIn = standIns.get(key);
  if (!standIn) return null;
  if (Math.abs(standIn.window.width - window.width) > 0.5 || Math.abs(standIn.window.height - window.height) > 0.5) {
    return null;
  }
  return standIn;
}

/** Whether the reader opens on the very pages the stand-in shows. */
export function mobileReaderStandInMatches(standIn: MobileReaderStandIn, pageIds: readonly string[]): boolean {
  if (standIn.pages.length !== pageIds.length) return false;
  const ids = new Set(pageIds);
  return standIn.pages.every((page) => ids.has(page.id));
}

/**
 * When the cover's cross-fade into the stand-in runs: its last
 * `fadeMs` before the zoom lands (start + duration), or from the moment the
 * stand-in is ready when that is later (it then ends after the landing).
 * Null when the stand-in is ready only after the landing: the reader's own
 * opening (the cover held until its page draws) takes over.
 */
export function resolveMobileReaderStandInFade(input: {
  startedAtMs: number;
  durationMs: number;
  readyAtMs: number;
  nowMs: number;
  fadeMs?: number;
}): { delayMs: number; durationMs: number } | null {
  const fadeMs = input.fadeMs ?? MOBILE_READER_STAND_IN_FADE_MS;
  const landsAt = input.startedAtMs + input.durationMs;
  if (input.readyAtMs > landsAt) return null;
  const startsAt = Math.max(input.readyAtMs, landsAt - fadeMs);
  return { delayMs: Math.max(0, Math.round(startsAt - input.nowMs)), durationMs: fadeMs };
}

/** Exposed for tests. */
export function resetMobileReaderStandInsForTesting(): void {
  standIns.clear();
}
