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
export const MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES = 64;
export const MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES = 1024 * 1024;
export const MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS = 2_000;

const MOBILE_SOURCE_DETAIL_CACHE_FORMAT_VERSION = 1;

export type MobileSourceDetailCachePayload = {
  metadata: MangaMetadata;
  chapters: ChapterSummary[];
  fetchedAt: number;
};

export type MobileSourceDetailCacheHit = {
  payload: MobileSourceDetailCachePayload;
  ageMs: number;
  isStale: boolean;
};

export type MobileSourceDetailCacheStore = {
  /** Every persisted raw payload. Missing/corrupt entries are skipped. The
   * cache key is recovered from inside each payload, so adapters never need
   * to reverse a lossy file-name encoding. */
  readAll(): Promise<string[]>;
  /**
   * Single-entry read for the paint path. Optional: adapters that can address
   * one entry directly (a file per key) implement it so a cold `getCached`
   * costs one read instead of a full-directory hydration. Adapters without it
   * fall back to `readAll`.
   */
  read?(key: string): Promise<string | null>;
  write(key: string, raw: string): Promise<void>;
  remove(key: string): Promise<void>;
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
  clear(key?: string): Promise<void>;
  clearForSource(sourceKey: string): Promise<void>;
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
  const { v, key, fetchedAt, metadata, chapters } = parsed as {
    v?: unknown;
    key?: unknown;
    fetchedAt?: unknown;
    metadata?: unknown;
    chapters?: unknown;
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
    !chapters.every(isValidCachedChapter)
  ) {
    return null;
  }
  return { key, metadata, chapters, fetchedAt };
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
  return true;
}

/**
 * In-memory LRU over an injectable async store. The store is read once on
 * first use; afterwards the in-memory map is authoritative and recency is
 * tracked by insertion order (a cold restart falls back to fetchedAt order).
 * Storage failures never propagate: the cache degrades to memory-only.
 */
export function createMobileSourceDetailCache(
  store: MobileSourceDetailCacheStore,
): MobileSourceDetailCache {
  const entries = new Map<string, MobileSourceDetailCachePayload>();
  let hydration: Promise<void> | null = null;

  const ensureHydrated = (): Promise<void> => {
    if (!hydration) {
      hydration = (async () => {
        try {
          const rawEntries = await store.readAll();
          const loaded = rawEntries
            .map((raw) => decodeMobileSourceDetailCache(raw))
            .filter(
              (payload): payload is MobileSourceDetailCachePayload & {
                key: string;
              } => payload !== null,
            );
          loaded.sort((left, right) => {
            const difference = left.fetchedAt - right.fetchedAt;
            return difference !== 0
              ? difference
              : left.key.localeCompare(right.key);
          });
          // Entries already touched this session (single-entry reads, writes)
          // are more recent than anything recovered from disk, so replay them
          // after the disk order to keep them at the young end of the LRU.
          const touchedThisSession = [...entries.entries()];
          entries.clear();
          for (const { key, ...payload } of loaded) {
            entries.set(key, payload);
          }
          for (const [key, payload] of touchedThisSession) {
            entries.delete(key);
            entries.set(key, payload);
          }
        } catch {
          // Storage unavailable: operate memory-only for this session.
        }
      })();
    }
    return hydration;
  };

  /**
   * Kick off full hydration without blocking the caller. LRU/eviction
   * bookkeeping needs the whole directory, but the read path that paints a
   * screen does not, so the scan is deferred past the current frame.
   */
  const scheduleHydration = (): void => {
    if (hydration) return;
    setTimeout(() => {
      void ensureHydrated();
    }, 0);
  };

  /**
   * Cold read of a single entry, used only when the in-memory map has not
   * seen the key yet and the adapter can address one entry directly.
   */
  const readOne = async (
    key: string,
  ): Promise<MobileSourceDetailCachePayload | null> => {
    const readEntry = store.read;
    if (!readEntry) return null;
    try {
      const raw = await readEntry.call(store, key);
      if (!raw) return null;
      const decoded = decodeMobileSourceDetailCache(raw);
      if (!decoded || decoded.key !== key) return null;
      return {
        metadata: decoded.metadata,
        chapters: decoded.chapters,
        fetchedAt: decoded.fetchedAt,
      };
    } catch {
      return null;
    }
  };

  const evictOverflow = (): void => {
    while (entries.size > MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES) {
      const oldestKey = entries.keys().next().value;
      if (!oldestKey) break;
      entries.delete(oldestKey);
      void store.remove(oldestKey).catch(() => undefined);
    }
  };

  return {
    async getCached(key, now = Date.now()) {
      let payload = entries.get(key);
      if (!payload) {
        if (store.read && !hydration) {
          // Cold paint path: one addressed read instead of scanning (and
          // validating) every persisted entry.
          payload = (await readOne(key)) ?? undefined;
          scheduleHydration();
        } else {
          await ensureHydrated();
          payload = entries.get(key);
        }
      }
      if (!payload) return null;
      // Refresh recency: most-recently-read entries survive the LRU cap.
      entries.delete(key);
      entries.set(key, payload);
      const ageMs = Math.max(0, now - payload.fetchedAt);
      return { payload, ageMs, isStale: ageMs > MOBILE_SOURCE_DETAIL_CACHE_TTL_MS };
    },

    async setCached(key, payload, now = Date.now()) {
      await ensureHydrated();
      const raw = encodeMobileSourceDetailCache(key, payload);
      // Serialize guards mirror decode guards: an entry that cannot survive a
      // restart round-trip is never cached at all.
      const validated = decodeMobileSourceDetailCache(raw, now);
      if (!validated || validated.key !== key) return;
      const payloadWithoutKey: MobileSourceDetailCachePayload = {
        metadata: validated.metadata,
        chapters: validated.chapters,
        fetchedAt: validated.fetchedAt,
      };
      entries.delete(key);
      entries.set(key, payloadWithoutKey);
      evictOverflow();
      if (raw.length > MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES) return;
      try {
        await store.write(key, raw);
      } catch {
        // Persistence is best-effort; the session keeps the memory entry.
      }
    },

    async clear(key) {
      await ensureHydrated();
      if (key !== undefined) {
        entries.delete(key);
        try {
          await store.remove(key);
        } catch {
          // Best-effort.
        }
        return;
      }
      entries.clear();
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
      await ensureHydrated();
      const prefix = `${sourceKey}:`;
      const keys = [...entries.keys()].filter((key) =>
        key.startsWith(prefix),
      );
      for (const key of keys) entries.delete(key);
      await Promise.all(
        keys.map((key) => store.remove(key).catch(() => undefined)),
      );
    },
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
    memoryFiles.set(key, raw);
  },
  async remove(key) {
    memoryFiles.delete(key);
  },
};

const defaultCache = createMobileSourceDetailCache(memoryStore);

export const getCachedMobileSourceDetail = defaultCache.getCached;
export const setCachedMobileSourceDetail = defaultCache.setCached;
export const clearMobileSourceDetailCache = defaultCache.clear;
export const clearMobileSourceDetailCacheForSource = defaultCache.clearForSource;
