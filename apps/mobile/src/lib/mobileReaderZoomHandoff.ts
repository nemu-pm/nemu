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
/**
 * The taps that started zooms, by zoom id (the opening's clock): one slot
 * per zoom, so a later prime for another zoom cannot take an earlier one's.
 */
const taps = new Map<string, number>();
/**
 * The cover each zoom source last painted (the title page's hero, the
 * Library tile that opened it), for the session: a tap whose own cover is
 * still unresolved lands on this rather than on black.
 */
const knownCovers = new Map<string, MobileReaderZoomCover>();
const KNOWN_COVERS_MAX = 64;

/**
 * One spelling per zoom id. The router hands the reader route its `zoom`
 * param decoded, while a title page opened from a Library tile builds its id
 * from a still URL-encoded item id (`…:%2Fepisode%2F…`): r16 primed and looked
 * up two spellings of one zoom (Jump+ ids carry `/`; ToG's `multi.webtoon:95`
 * does not), so the reader found no cover and no tap. Every key here, the
 * hero's zoom source and the route's zoom target take the decoded spelling.
 */
export function canonicalMobileReaderZoomId(zoomId: string): string;
export function canonicalMobileReaderZoomId(zoomId: string | null | undefined): string | null;
export function canonicalMobileReaderZoomId(zoomId: string | null | undefined): string | null {
  if (!zoomId) return null;
  let value = zoomId;
  for (let round = 0; round < 3 && /%[0-9a-fA-F]{2}/.test(value); round += 1) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}

/** The reader zoom id of a library title's page (its hero cover). */
export function mobileReaderZoomIdForDetail(libraryItemId: string): string {
  return canonicalMobileReaderZoomId(`detail:${libraryItemId}`);
}

/** Remembers the cover the zoom source `zoomId` paints (latest wins). */
export function noteMobileReaderZoomSourceCover(
  zoomId: string | null | undefined,
  cover: MobileReaderZoomCover | null | undefined,
): void {
  zoomId = canonicalMobileReaderZoomId(zoomId);
  if (!zoomId || !cover?.uri) return;
  knownCovers.delete(zoomId);
  knownCovers.set(zoomId, cover);
  while (knownCovers.size > KNOWN_COVERS_MAX) {
    const oldest = knownCovers.keys().next().value;
    if (oldest === undefined) break;
    knownCovers.delete(oldest);
  }
}

export function recallMobileReaderZoomSourceCover(
  zoomId: string | null | undefined,
): MobileReaderZoomCover | null {
  const key = canonicalMobileReaderZoomId(zoomId);
  return (key && knownCovers.get(key)) || null;
}

/**
 * Called at the tap (Continue, a tile), synchronously in its handler. No
 * cover of its own: the one the zoom source last painted.
 */
export function primeMobileReaderZoomCover(
  zoomId: string,
  cover: MobileReaderZoomCover | null | undefined,
  now: number = Date.now(),
): MobileReaderZoomCover | null {
  zoomId = canonicalMobileReaderZoomId(zoomId);
  const landing = cover?.uri ? cover : recallMobileReaderZoomSourceCover(zoomId);
  pending = landing ? { zoomId, cover: landing, at: now } : null;
  taps.set(zoomId, now);
  if (taps.size > KNOWN_COVERS_MAX) {
    for (const [id, at] of taps) {
      if (now - at > MOBILE_READER_ZOOM_HANDOFF_TTL_MS) taps.delete(id);
    }
  }
  if (landing) noteMobileReaderZoomSourceCover(zoomId, landing);
  return landing;
}

/**
 * When the tap that started the `zoomId` zoom happened (wall clock), within
 * the handoff's few seconds; null otherwise. Not consumed.
 */
export function peekMobileReaderZoomTapAt(
  zoomId: string | null | undefined,
  now: number = Date.now(),
): number | null {
  zoomId = canonicalMobileReaderZoomId(zoomId);
  if (!zoomId) return null;
  const at = taps.get(zoomId);
  if (at == null) return null;
  const age = now - at;
  if (age < 0 || age > MOBILE_READER_ZOOM_HANDOFF_TTL_MS) return null;
  return at;
}

/**
 * The cover primed for `zoomId` within the last few seconds, else the one
 * its zoom source last painted. Reading does not consume it: a first render
 * can run twice.
 */
export function peekMobileReaderZoomCover(
  zoomId: string | null | undefined,
  now: number = Date.now(),
): MobileReaderZoomCover | null {
  zoomId = canonicalMobileReaderZoomId(zoomId);
  if (!zoomId) return null;
  if (pending) {
    const age = now - pending.at;
    if (age < 0 || age > MOBILE_READER_ZOOM_HANDOFF_TTL_MS) pending = null;
    else if (pending.zoomId === zoomId) return pending.cover;
  }
  return recallMobileReaderZoomSourceCover(zoomId);
}

/**
 * The cover a reader zoom starts from is the one the hero paints: its own
 * resolved request, or — while that is unknown or failed — the cover the
 * tapped cell handed over, which the hero shows meanwhile. Priming only the
 * former left the zoom landing on black (and the reader without a cover
 * fade) whenever the hero was still showing the handed-over cover.
 */
export function resolveMobileReaderZoomHandoffCover(
  painted: MobileReaderZoomCover | null | undefined,
  held: MobileReaderZoomCover | null | undefined,
): MobileReaderZoomCover | null {
  if (painted?.uri) return painted;
  if (held?.uri) return held;
  return null;
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
