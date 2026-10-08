import type { MobileCoverRgb } from "./mobileCoverTint";

/**
 * Persisted cover tints: the serialisation and the bounded, recency-ordered
 * map behind `useMobileCoverTint`. Kept pure so the first frame after a cold
 * start can paint a card in its cover's colour from one synchronous read.
 *
 * Keys are cover URLs (never request headers, which can carry tokens) or a
 * caller alias such as `item:<libraryItemId>`.
 */
const MOBILE_COVER_TINT_STORE_VERSION = 1;
const MOBILE_COVER_TINT_STORE_LIMIT = 300;
/** Longer keys (data URIs) are not worth a slot. */
const MAX_KEY_LENGTH = 2048;

export type MobileCoverTintStore = Map<string, MobileCoverRgb>;

function isChannel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

/** Tolerant of a missing, truncated or foreign file: bad input is an empty store. */
export function parseMobileCoverTintStore(
  text: string | null | undefined,
  limit = MOBILE_COVER_TINT_STORE_LIMIT,
): MobileCoverTintStore {
  const store: MobileCoverTintStore = new Map();
  if (!text) return store;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return store;
  }
  if (!parsed || typeof parsed !== "object") return store;
  const { version, tints } = parsed as { version?: unknown; tints?: unknown };
  if (version !== MOBILE_COVER_TINT_STORE_VERSION || !Array.isArray(tints)) return store;
  for (const entry of tints) {
    if (!Array.isArray(entry) || entry.length !== 4) continue;
    const [key, r, g, b] = entry as unknown[];
    if (typeof key !== "string" || !key || key.length > MAX_KEY_LENGTH) continue;
    if (!isChannel(r) || !isChannel(g) || !isChannel(b)) continue;
    store.set(key, { r, g, b });
  }
  while (store.size > limit) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return store;
}

/** Oldest first, so a parse keeps the same recency order. */
export function serializeMobileCoverTintStore(store: MobileCoverTintStore): string {
  return JSON.stringify({
    version: MOBILE_COVER_TINT_STORE_VERSION,
    tints: [...store].map(([key, { r, g, b }]) => [key, r, g, b]),
  });
}

/**
 * Records a tint as the most recent entry and evicts the oldest beyond
 * `limit`. Returns whether the store needs writing (a re-sample of the same
 * colour only refreshes recency in memory).
 */
export function rememberMobileCoverTint(
  store: MobileCoverTintStore,
  key: string,
  tint: MobileCoverRgb,
  limit = MOBILE_COVER_TINT_STORE_LIMIT,
): boolean {
  if (!key || key.length > MAX_KEY_LENGTH) return false;
  const previous = store.get(key);
  const changed =
    !previous || previous.r !== tint.r || previous.g !== tint.g || previous.b !== tint.b;
  store.delete(key);
  store.set(key, { r: tint.r, g: tint.g, b: tint.b });
  while (store.size > limit) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return changed;
}
