import type { ChapterSummary, MangaMetadata } from "@/data/schema";
import { makeMobileSourceKey } from "./mobileSourceSettings";

/**
 * Persisted source manga details (metadata + chapter list) with
 * stale-while-revalidate semantics.
 *
 * Re-entering a source manga page paints the last fetched details instantly
 * while a fresh fetch runs in the background, and a network failure with a
 * cached copy still renders content instead of an error screen. Entries hold
 * public catalog data only (no credentials), so a small JSON-per-key store
 * with TTL/LRU bounds is sufficient. All TTL/LRU/serialization logic lives
 * here so tests run against in-memory store adapters; native persistence is
 * provided by `mobileSourceDetailCache.native.ts`.
 */

export const MOBILE_SOURCE_DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
/**
 * Persisted entries kept on disk. Sized for a whole library (every linked
 * source of every title, which the background library refresh keeps warm)
 * plus recent browsing; entries are a few KB to ~1 MB each.
 */
export const MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES = 400;
/** Decoded entries kept in memory (the titles open in this session). */
export const MOBILE_SOURCE_DETAIL_CACHE_MEMORY_ENTRIES = 24;
/** Per-entry size bound; a 10,000-chapter list with scanlators fits. */
export const MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES = 4 * 1024 * 1024;
/**
 * Long-running series (One Piece, Conan, multi-language MangaDex feeds) run
 * well past 2,000 chapters; a list over the cap is never cached at all, which
 * made exactly the slowest titles the ones that always opened cold.
 */
export const MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS = 10_000;
/** Disk pruning runs on the first write of a session, then every N writes. */
const MOBILE_SOURCE_DETAIL_CACHE_PRUNE_EVERY_WRITES = 16;

// 2: chapter lists keep the source's order. Version 1 lists were sorted by
// number with an id tie-break, which scrambled sources without numbers
// (漫画人, 拷贝漫画 volumes); dropping them forces one refetch.
const MOBILE_SOURCE_DETAIL_CACHE_FORMAT_VERSION = 2;

export type MobileSourceDetailCachePayload = {
  metadata: MangaMetadata;
  chapters: ChapterSummary[];
  /** When `chapters` was fetched. Drives revalidation. */
  fetchedAt: number;
  /**
   * When `metadata` was fetched, if that differs from `fetchedAt` (a
   * chapter-only refresh keeps the older metadata). Absent = `fetchedAt`.
   */
  metadataFetchedAt?: number;
  /**
   * `metadata` is a placeholder (title only), written by a chapter-only
   * refresh for a title whose details were never fetched.
   */
  partialMetadata?: boolean;
};

export type MobileSourceDetailCacheHit = {
  payload: MobileSourceDetailCachePayload;
  ageMs: number;
  isStale: boolean;
};

export type MobileSourceDetailCacheStore = {
  /** One entry's raw payload, or null when absent/unreadable. */
  read(key: string): Promise<string | null>;
  write(key: string, raw: string): Promise<void>;
  remove(key: string): Promise<void>;
  /**
   * Every persisted raw payload. Only whole-cache maintenance (clear,
   * per-source clear) uses it — never the paint path.
   */
  readAll(): Promise<string[]>;
  /**
   * Raw payloads whose key may start with `prefix` (a superset is fine: keys
   * are verified after decoding). Optional; falls back to `readAll`.
   */
  readPrefixed?(prefix: string): Promise<string[]>;
  /**
   * Keeps at most `maxEntries` persisted entries, dropping the least recently
   * written first and never one in `keep` (entries used this session).
   */
  prune?(maxEntries: number, keep: ReadonlySet<string>): Promise<void>;
};

export type MobileSourceDetailCache = {
  getCached(
    key: string,
    now?: number,
  ): Promise<MobileSourceDetailCacheHit | null>;
  setCached(
    key: string,
    payload: MobileSourceDetailCachePayload,
    now?: number,
  ): Promise<void>;
  /**
   * Folds a freshly fetched chapter list into the entry for `key`, keeping
   * whatever metadata is already cached (a chapter-only refresh — library
   * update checks, the detail screen's chapters-first load — does not know
   * the metadata). Without a cached entry the metadata is a title-only
   * placeholder marked `partialMetadata`.
   */
  setCachedChapters(
    key: string,
    update: {
      chapters: ChapterSummary[];
      fetchedAt: number;
      fallbackTitle: string;
    },
    now?: number,
  ): Promise<MobileSourceDetailCachePayload | null>;
  clear(key?: string): Promise<void>;
  clearForSource(sourceKey: string): Promise<void>;
  /** Runs disk pruning now (tests, maintenance). */
  compact(): Promise<void>;
};

export function makeMobileSourceDetailCacheKey(
  registryId: string,
  sourceId: string,
  mangaId: string,
): string {
  return `${makeMobileSourceKey(registryId, sourceId)}:${mangaId}`;
}

export function encodeMobileSourceDetailCache(
  key: string,
  payload: MobileSourceDetailCachePayload,
): string {
  return JSON.stringify({
    v: MOBILE_SOURCE_DETAIL_CACHE_FORMAT_VERSION,
    key,
    ...payload,
  });
}

/**
 * Decode a cached detail entry. Anything unusable (wrong version, corrupt
 * JSON, malformed metadata/chapters, future clock) is a miss, never a throw.
 */
export function decodeMobileSourceDetailCache(
  raw: string,
  now = Date.now(),
): (MobileSourceDetailCachePayload & { key: string }) | null {
  if (!raw || raw.length > MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const {
    v,
    key,
    fetchedAt,
    metadata,
    chapters,
    metadataFetchedAt,
    partialMetadata,
  } = parsed as {
    v?: unknown;
    key?: unknown;
    fetchedAt?: unknown;
    metadata?: unknown;
    chapters?: unknown;
    metadataFetchedAt?: unknown;
    partialMetadata?: unknown;
  };
  if (
    v !== MOBILE_SOURCE_DETAIL_CACHE_FORMAT_VERSION ||
    typeof key !== "string" ||
    key.length === 0 ||
    typeof fetchedAt !== "number" ||
    !Number.isFinite(fetchedAt) ||
    fetchedAt <= 0 ||
    fetchedAt > now ||
    !isValidCachedMetadata(metadata) ||
    !Array.isArray(chapters) ||
    chapters.length > MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS ||
    !chapters.every(isValidCachedChapter) ||
    (metadataFetchedAt !== undefined &&
      (typeof metadataFetchedAt !== "number" ||
        !Number.isFinite(metadataFetchedAt) ||
        metadataFetchedAt <= 0 ||
        metadataFetchedAt > now)) ||
    (partialMetadata !== undefined && typeof partialMetadata !== "boolean")
  ) {
    return null;
  }
  return {
    key,
    metadata,
    chapters,
    fetchedAt,
    ...(metadataFetchedAt !== undefined ? { metadataFetchedAt } : {}),
    ...(partialMetadata ? { partialMetadata: true } : {}),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidCachedMetadata(value: unknown): value is MangaMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as MangaMetadata;
  if (typeof metadata.title !== "string" || metadata.title.length === 0) {
    return false;
  }
  if (
    metadata.cover !== undefined &&
    typeof metadata.cover !== "string"
  ) {
    return false;
  }
  if (
    metadata.description !== undefined &&
    typeof metadata.description !== "string"
  ) {
    return false;
  }
  if (metadata.url !== undefined && typeof metadata.url !== "string") {
    return false;
  }
  if (
    metadata.status !== undefined &&
    (typeof metadata.status !== "number" || !Number.isFinite(metadata.status))
  ) {
    return false;
  }
  if (metadata.authors !== undefined && !isStringArray(metadata.authors)) {
    return false;
  }
  if (metadata.tags !== undefined && !isStringArray(metadata.tags)) {
    return false;
  }
  return true;
}

function isValidCachedChapter(value: unknown): value is ChapterSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const chapter = value as ChapterSummary;
  if (
    typeof chapter.id !== "string" ||
    chapter.id.length === 0 ||
    chapter.id.length > 512
  ) {
    return false;
  }
  if (chapter.title !== undefined && typeof chapter.title !== "string") {
    return false;
  }
  for (const field of ["chapterNumber", "volumeNumber", "dateUploaded"] as const) {
    const numberValue = chapter[field];
    if (
      numberValue !== undefined &&
      (typeof numberValue !== "number" || !Number.isFinite(numberValue))
    ) {
      return false;
    }
  }
  if (chapter.locked !== undefined && typeof chapter.locked !== "boolean") {
    return false;
  }
  if (chapter.lang !== undefined && typeof chapter.lang !== "string") {
    return false;
  }
  if (
    chapter.scanlator !== undefined &&
    typeof chapter.scanlator !== "string"
  ) {
    return false;
  }
  return true;
}

function withoutKey(
  decoded: MobileSourceDetailCachePayload & { key: string },
): MobileSourceDetailCachePayload {
  const payload: MobileSourceDetailCachePayload & { key?: string } = {
    ...decoded,
  };
  delete payload.key;
  return payload;
}

/**
 * Age of a payload's metadata (a chapter-only refresh keeps older metadata).
 * `Infinity` for a placeholder that was never fetched.
 */
export function getMobileSourceDetailMetadataAgeMs(
  payload: MobileSourceDetailCachePayload,
  now = Date.now(),
): number {
  if (payload.partialMetadata) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - (payload.metadataFetchedAt ?? payload.fetchedAt));
}

/**
 * Persisted detail cache over an injectable async store.
 *
 * The paint path costs exactly one addressed read (then memory). Nothing ever
 * loads the whole store into memory: disk size is bounded by pruning the
 * store (least recently written first), and memory by a small LRU of decoded
 * entries. Storage failures never propagate: the cache degrades to
 * memory-only.
 */
export function createMobileSourceDetailCache(
  store: MobileSourceDetailCacheStore,
): MobileSourceDetailCache {
  /** Decoded entries, least recently used first. */
  const memory = new Map<string, MobileSourceDetailCachePayload>();
  /** Keys read (painted) this session: pruning never drops them. */
  const touched = new Set<string>();
  let writes = 0;
  let pruning: Promise<void> | null = null;

  const remember = (key: string, payload: MobileSourceDetailCachePayload) => {
    memory.delete(key);
    memory.set(key, payload);
    while (memory.size > MOBILE_SOURCE_DETAIL_CACHE_MEMORY_ENTRIES) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      memory.delete(oldest);
    }
  };

  const readOne = async (
    key: string,
  ): Promise<MobileSourceDetailCachePayload | null> => {
    try {
      const raw = await store.read(key);
      if (!raw) return null;
      const decoded = decodeMobileSourceDetailCache(raw);
      if (!decoded || decoded.key !== key) return null;
      return withoutKey(decoded);
    } catch {
      return null;
    }
  };

  const compact = (): Promise<void> => {
    if (!store.prune) return Promise.resolve();
    if (!pruning) {
      pruning = store
        .prune(MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES, new Set(touched))
        .catch(() => undefined)
        .finally(() => {
          pruning = null;
        });
    }
    return pruning;
  };

  const persist = async (
    key: string,
    payload: MobileSourceDetailCachePayload,
    now: number,
  ): Promise<MobileSourceDetailCachePayload | null> => {
    const raw = encodeMobileSourceDetailCache(key, payload);
    // Serialize guards mirror decode guards: an entry that cannot survive a
    // restart round-trip is never cached at all.
    const validated = decodeMobileSourceDetailCache(raw, now);
    if (!validated || validated.key !== key) return null;
    const stored = withoutKey(validated);
    remember(key, stored);
    if (raw.length > MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES) return stored;
    try {
      await store.write(key, raw);
    } catch {
      // Persistence is best-effort; the session keeps the memory entry.
      return stored;
    }
    writes += 1;
    if (
      writes === 1 ||
      writes % MOBILE_SOURCE_DETAIL_CACHE_PRUNE_EVERY_WRITES === 0
    ) {
      await compact();
    }
    return stored;
  };

  const getPayload = async (
    key: string,
    touch: boolean,
  ): Promise<MobileSourceDetailCachePayload | null> => {
    if (touch) touched.add(key);
    const resident = memory.get(key);
    if (resident) {
      remember(key, resident);
      return resident;
    }
    const loaded = await readOne(key);
    // A write that landed while the read was in flight is newer.
    const raced = memory.get(key);
    if (raced) return raced;
    if (loaded) remember(key, loaded);
    return loaded;
  };

  return {
    async getCached(key, now = Date.now()) {
      const payload = await getPayload(key, true);
      if (!payload) return null;
      const ageMs = Math.max(0, now - payload.fetchedAt);
      return { payload, ageMs, isStale: ageMs > MOBILE_SOURCE_DETAIL_CACHE_TTL_MS };
    },

    async setCached(key, payload, now = Date.now()) {
      await persist(key, payload, now);
    },

    async setCachedChapters(key, update, now = Date.now()) {
      // Not a paint: a background writer must not pin the entry.
      const existing = await getPayload(key, false);
      const title = update.fallbackTitle.trim();
      if (!existing && !title) return null;
      const next: MobileSourceDetailCachePayload = existing
        ? {
            metadata: existing.metadata,
            chapters: update.chapters,
            fetchedAt: update.fetchedAt,
            ...(existing.partialMetadata
              ? { partialMetadata: true }
              : {
                  metadataFetchedAt:
                    existing.metadataFetchedAt ?? existing.fetchedAt,
                }),
          }
        : {
            metadata: { title },
            chapters: update.chapters,
            fetchedAt: update.fetchedAt,
            partialMetadata: true,
          };
      return persist(key, next, now);
    },

    async clear(key) {
      if (key !== undefined) {
        memory.delete(key);
        touched.delete(key);
        try {
          await store.remove(key);
        } catch {
          // Best-effort.
        }
        return;
      }
      memory.clear();
      touched.clear();
      try {
        const rawEntries = await store.readAll();
        await Promise.all(
          rawEntries.map((raw) => {
            const decoded = decodeMobileSourceDetailCache(raw);
            return decoded
              ? store.remove(decoded.key).catch(() => undefined)
              : Promise.resolve();
          }),
        );
      } catch {
        // Best-effort.
      }
    },

    async clearForSource(sourceKey) {
      const prefix = `${sourceKey}:`;
      for (const key of [...memory.keys()]) {
        if (key.startsWith(prefix)) memory.delete(key);
      }
      for (const key of [...touched]) {
        if (key.startsWith(prefix)) touched.delete(key);
      }
      try {
        const rawEntries = store.readPrefixed
          ? await store.readPrefixed(prefix)
          : await store.readAll();
        const keys = rawEntries
          .map((raw) => decodeMobileSourceDetailCache(raw)?.key)
          .filter((key): key is string => Boolean(key?.startsWith(prefix)));
        await Promise.all(
          keys.map((key) => store.remove(key).catch(() => undefined)),
        );
      } catch {
        // Best-effort.
      }
    },

    compact,
  };
}

// Base (bun tests / non-native resolution) store: process-lifetime memory only.
const memoryFiles = new Map<string, string>();

const memoryStore: MobileSourceDetailCacheStore = {
  async readAll() {
    return [...memoryFiles.values()];
  },
  async read(key) {
    return memoryFiles.get(key) ?? null;
  },
  async write(key, raw) {
    memoryFiles.delete(key);
    memoryFiles.set(key, raw);
  },
  async remove(key) {
    memoryFiles.delete(key);
  },
  async prune(maxEntries, keep) {
    const overflow = memoryFiles.size - maxEntries;
    if (overflow <= 0) return;
    let removed = 0;
    for (const key of [...memoryFiles.keys()]) {
      if (removed >= overflow) break;
      if (keep.has(key)) continue;
      memoryFiles.delete(key);
      removed += 1;
    }
  },
};

const defaultCache = createMobileSourceDetailCache(memoryStore);

export const getCachedMobileSourceDetail = defaultCache.getCached;
export const setCachedMobileSourceDetail = defaultCache.setCached;
export const setCachedMobileSourceDetailChapters = defaultCache.setCachedChapters;
export const clearMobileSourceDetailCache = defaultCache.clear;
export const clearMobileSourceDetailCacheForSource = defaultCache.clearForSource;
