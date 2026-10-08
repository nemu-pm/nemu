/**
 * A sharper copy of a library title's own cover.
 *
 * A title's cover is whatever its first source reported, and some sources
 * only serve thumbnails (Manhuagui: 132 px wide). The cards and the hero fill
 * their slot with whatever cover they have, so a thumbnail looks soft there.
 * The design-explore surfaces therefore look for a larger copy of the *same artwork*:
 *
 * 1. the size variants the source itself serves for that URL
 *    (`getMobileCoverSizeVariants`: Manhuagui's `cpic/g/`, Niconico's
 *    full-size material), and
 * 2. the covers the title's other linked sources reported.
 *
 * Every candidate is measured and compared with the own cover's pixels; only
 * one that shows the same picture (`isMobileSameCoverArt`) and is clearly
 * wider wins. A different artwork never replaces the cover the user has been
 * seeing (another volume's cover changes the title's look and its colour
 * across the library); a user who wants it can set it by hand. A cover the
 * user set by hand is never replaced.
 *
 * Local only: the candidates are URLs already known (no source call), fetched
 * through the shared image cache. The pick is remembered per title so every
 * surface (card, shelf, accessory, hero, the zoom between them) shows the same
 * image from the first frame; the tint keeps the title's remembered colour on
 * that frame (`item:` alias) and the same artwork samples to the same colour.
 */

type MobileMeasuredCover = {
  url: string;
  width: number | null;
  /** Whether the pixels show the own cover's artwork (null: not compared). */
  sameArt?: boolean | null;
};

/** A candidate wins only when it is at least this much wider than the title's own cover. */
const MOBILE_SHARPER_COVER_RATIO = 1.5;
/**
 * A cover at least this wide already fills the largest slot that shows it
 * (the 210 pt hero at 3× within the 1.5× cap): no need to look further.
 */
const MOBILE_COVER_SHARP_ENOUGH_PX = 420;

/**
 * The candidate to show instead of `own`, or null to keep `own`. Unmeasured
 * covers never win, a candidate that is only a little wider never wins, and
 * neither does one whose artwork is not the own cover's (or was not compared).
 */
export function pickMobileSharperCover(
  own: MobileMeasuredCover,
  candidates: readonly MobileMeasuredCover[],
): string | null {
  if (own.width === null || !(own.width > 0)) return null;
  if (own.width >= MOBILE_COVER_SHARP_ENOUGH_PX) return null;
  let best: MobileMeasuredCover | null = null;
  for (const candidate of candidates) {
    if (candidate.url === own.url || candidate.width === null) continue;
    if (candidate.sameArt !== true) continue;
    if (candidate.width < own.width * MOBILE_SHARPER_COVER_RATIO) continue;
    if (!best || candidate.width > (best.width ?? 0)) best = candidate;
  }
  return best?.url ?? null;
}

/** Whether a measured cover is worth looking past (it would be drawn small). */
export function isMobileCoverBelowSharp(width: number | null | undefined): boolean {
  return typeof width === "number" && width > 0 && width < MOBILE_COVER_SHARP_ENOUGH_PX;
}

/**
 * Larger copies of the same cover that the source serves at a sibling URL
 * (largest first). Only patterns checked against the live sources:
 * - Manhuagui `…/cpic/{b,h,m,s,l}/<id>.jpg` (132–180 px) → `cpic/g/` (240 px);
 * - Niconico Seiga `…/material/<hash>/<id>qa?<v>` (320 px) → `…/<id>?<v>` (500 px);
 * - MangaDex `….jpg.256.jpg` → `….jpg.512.jpg`.
 * The result is still measured and compared before it is shown.
 */
export function getMobileCoverSizeVariants(url: string | null | undefined): string[] {
  const value = url?.trim();
  if (!value || !/^https?:\/\//i.test(value)) return [];
  const manhuagui = /^(https?:\/\/[^/]*(?:hamreus|mhgui|manhuagui)\.com\/cpic\/)([bhmsl])(\/\d+\.jpg)$/i.exec(value);
  if (manhuagui) return [`${manhuagui[1]}g${manhuagui[3]}`];
  const seiga = /^(https?:\/\/deliver\.cdn\.nicomanga\.jp\/material\/[0-9a-f]+\/\d+)qa(\?\d+)?$/i.exec(value);
  if (seiga) return [`${seiga[1]}${seiga[2] ?? ""}`];
  const mangadex = /^(https?:\/\/uploads\.mangadex\.org\/covers\/.+\.(?:jpe?g|png|webp))\.256\.jpg$/i.exec(value);
  if (mangadex) return [`${mangadex[1]}.512.jpg`];
  return [];
}

/** Whether `candidate` is one of the sibling-size URLs of `own` (same owner, same request). */
export function isMobileCoverSizeVariantOf(candidate: string | null | undefined, own: string | null | undefined): boolean {
  return Boolean(candidate) && getMobileCoverSizeVariants(own).includes(candidate!.trim());
}

/** Fingerprint raster: both covers are stretched to this grid (RGBA, row-major). */
export const MOBILE_COVER_FINGERPRINT_WIDTH = 12;
export const MOBILE_COVER_FINGERPRINT_HEIGHT = 18;
/**
 * Same artwork: luma correlation and mean channel difference on the grid.
 * Measured on the live covers: copies of one picture at two sizes score
 * ≥ 0.999 / ≤ 1.3, a 2–4 % crop or a recompression ≥ 0.84 / ≤ 16, two
 * different covers of one title ≤ 0.18 / ≥ 27.
 */
const MOBILE_SAME_COVER_MIN_CORRELATION = 0.8;
const MOBILE_SAME_COVER_MAX_DIFFERENCE = 20;

export function compareMobileCoverFingerprints(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): { correlation: number; difference: number } | null {
  const pixels = MOBILE_COVER_FINGERPRINT_WIDTH * MOBILE_COVER_FINGERPRINT_HEIGHT;
  if (a.length < pixels * 4 || b.length < pixels * 4) return null;
  const lumaA: number[] = [];
  const lumaB: number[] = [];
  let difference = 0;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    lumaA.push(0.2126 * a[offset]! + 0.7152 * a[offset + 1]! + 0.0722 * a[offset + 2]!);
    lumaB.push(0.2126 * b[offset]! + 0.7152 * b[offset + 1]! + 0.0722 * b[offset + 2]!);
    for (let channel = 0; channel < 3; channel += 1) {
      difference += Math.abs(a[offset + channel]! - b[offset + channel]!);
    }
  }
  const meanA = lumaA.reduce((sum, value) => sum + value, 0) / pixels;
  const meanB = lumaB.reduce((sum, value) => sum + value, 0) / pixels;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < pixels; index += 1) {
    const da = lumaA[index]! - meanA;
    const db = lumaB[index]! - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  // A flat picture (one colour) has no shape to correlate: only the colour counts.
  const correlation =
    varianceA > 0 && varianceB > 0
      ? covariance / Math.sqrt(varianceA * varianceB)
      : varianceA === varianceB
        ? 1
        : 0;
  return { correlation, difference: difference / (pixels * 3) };
}

export function isMobileSameCoverArt(
  a: ArrayLike<number> | null | undefined,
  b: ArrayLike<number> | null | undefined,
): boolean | null {
  if (!a || !b) return null;
  const result = compareMobileCoverFingerprints(a, b);
  if (!result) return null;
  return (
    result.correlation >= MOBILE_SAME_COVER_MIN_CORRELATION &&
    result.difference <= MOBILE_SAME_COVER_MAX_DIFFERENCE
  );
}

// 2: picks are the same artwork only (version 1 could hold another volume's cover).
const MOBILE_COVER_PREFERENCE_STORE_VERSION = 2;
export const MOBILE_COVER_PREFERENCE_STORE_LIMIT = 300;
const MAX_VALUE_LENGTH = 2048;

/** Library item id → the cover URL to show (recency-ordered, oldest first). */
export type MobileCoverPreferenceStore = Map<string, string>;

/** Tolerant of a missing, truncated or foreign file: bad input is an empty store. */
export function parseMobileCoverPreferenceStore(
  text: string | null | undefined,
  limit = MOBILE_COVER_PREFERENCE_STORE_LIMIT,
): MobileCoverPreferenceStore {
  const store: MobileCoverPreferenceStore = new Map();
  if (!text) return store;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return store;
  }
  if (!parsed || typeof parsed !== "object") return store;
  const { version, covers } = parsed as { version?: unknown; covers?: unknown };
  if (version !== MOBILE_COVER_PREFERENCE_STORE_VERSION || !Array.isArray(covers)) return store;
  for (const entry of covers) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [id, url] = entry as unknown[];
    if (typeof id !== "string" || !id || id.length > MAX_VALUE_LENGTH) continue;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || url.length > MAX_VALUE_LENGTH) continue;
    store.set(id, url);
  }
  while (store.size > limit) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return store;
}

export function serializeMobileCoverPreferenceStore(store: MobileCoverPreferenceStore): string {
  return JSON.stringify({ version: MOBILE_COVER_PREFERENCE_STORE_VERSION, covers: [...store] });
}

/** Records (or with `url` null, forgets) a title's cover; returns whether anything changed. */
export function rememberMobileCoverPreference(
  store: MobileCoverPreferenceStore,
  id: string,
  url: string | null,
  limit = MOBILE_COVER_PREFERENCE_STORE_LIMIT,
): boolean {
  if (!id || id.length > MAX_VALUE_LENGTH) return false;
  const previous = store.get(id);
  if (url === null) return store.delete(id);
  if (url.length > MAX_VALUE_LENGTH || !/^https?:\/\//i.test(url)) return false;
  store.delete(id);
  store.set(id, url);
  while (store.size > limit) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return previous !== url;
}
