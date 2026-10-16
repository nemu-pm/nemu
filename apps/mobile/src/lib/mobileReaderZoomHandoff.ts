/**
 * The cover a reader zoom grows out of, handed from the tapped cover to the
 * reader route. The reader mounts only after the zoom has landed, so without
 * it the zoom lands on a black page and stays black until the first page
 * decodes; with it the zoom lands on the cover, which then cross-fades into
 * the page.
 */
export type MobileReaderZoomCover = {
  uri: string;
  headers?: Record<string, string>;
};

/** A handoff is for the push that follows the tap, not for a later visit. */
const MOBILE_READER_ZOOM_HANDOFF_TTL_MS = 3000;

let pending: { zoomId: string; cover: MobileReaderZoomCover; at: number } | null = null;

export function primeMobileReaderZoomCover(
  zoomId: string,
  cover: MobileReaderZoomCover | null | undefined,
  now: number = Date.now(),
): void {
  pending = cover?.uri ? { zoomId, cover, at: now } : null;
}

/**
 * The cover primed for `zoomId` within the last few seconds. Reading does not
 * consume it: a first render can run twice.
 */
export function peekMobileReaderZoomCover(
  zoomId: string | null | undefined,
  now: number = Date.now(),
): MobileReaderZoomCover | null {
  if (!pending || !zoomId) return null;
  const age = now - pending.at;
  if (age < 0 || age > MOBILE_READER_ZOOM_HANDOFF_TTL_MS) {
    pending = null;
    return null;
  }
  return pending.zoomId === zoomId ? pending.cover : null;
}

/** Covers are drawn 2:3 everywhere a reader zoom starts. */
const COVER_ASPECT = 2 / 3;

/**
 * Where the zoom lands: the cover fitted to the reading area (the window less
 * its safe-area insets), centred there, the way the first page is laid out.
 */
export function getMobileReaderZoomCoverFrame({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: { top: number; right: number; bottom: number; left: number };
}): { x: number; y: number; width: number; height: number } {
  const areaWidth = Math.max(0, width - insets.left - insets.right);
  const areaHeight = Math.max(0, height - insets.top - insets.bottom);
  const coverWidth = Math.min(areaWidth, areaHeight * COVER_ASPECT);
  const coverHeight = coverWidth / COVER_ASPECT;
  return {
    x: Math.round(insets.left + (areaWidth - coverWidth) / 2),
    y: Math.round(insets.top + (areaHeight - coverHeight) / 2),
    width: Math.round(coverWidth),
    height: Math.round(coverHeight),
  };
}
