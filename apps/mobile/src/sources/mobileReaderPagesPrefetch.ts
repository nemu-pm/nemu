import type { MobileReaderPagesRefresh } from "./mobileSourcePages";
import { registerMobileSourceProfileTransitionHandler } from "./mobileSourceProfileScope";

/**
 * Chapter-turn prefetch: while a chapter is being read, the next chapter's
 * page list is fetched in the background so the turn renders without a
 * loading spinner. Entries are single-consumer (taken, not shared), bounded,
 * and expire quickly — a stale page list must never outlive source updates
 * or a profile switch.
 */
export const MOBILE_READER_PAGES_PREFETCH_TTL_MS = 5 * 60_000;
export const MOBILE_READER_PAGES_PREFETCH_MAX_ENTRIES = 2;
/** Wait for the current chapter's first images before warming the next one. */
export const MOBILE_READER_NEXT_CHAPTER_PREFETCH_DELAY_MS = 2_500;

export function makeMobileReaderPagesPrefetchKey({
  registryId,
  sourceId,
  mangaId,
  chapterId,
  processPageImages,
}: {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  processPageImages: boolean;
}): string {
  return [
    registryId,
    sourceId,
    mangaId,
    chapterId,
    processPageImages ? "processed" : "raw",
  ].join("\u0000");
}

export function isMobileReaderPagesPrefetchFresh({
  startedAt,
  now,
  ttlMs = MOBILE_READER_PAGES_PREFETCH_TTL_MS,
}: {
  startedAt: number;
  now: number;
  ttlMs?: number;
}): boolean {
  return now >= startedAt && now - startedAt < ttlMs;
}

type PrefetchEntry<T> = {
  startedAt: number;
  promise: Promise<T | null>;
  dispose: (result: T | null) => void;
};

export class MobileReaderPagesPrefetchCache<T> {
  private entries = new Map<string, PrefetchEntry<T>>();

  constructor(
    private readonly maxEntries = MOBILE_READER_PAGES_PREFETCH_MAX_ENTRIES,
    private readonly ttlMs = MOBILE_READER_PAGES_PREFETCH_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Begin a prefetch unless a fresh one for the same key already exists.
   * `run` failures resolve to null so a background prefetch can never
   * surface an error; `dispose` runs for results that are evicted or
   * cleared without being taken.
   */
  start(
    key: string,
    run: () => Promise<T>,
    dispose: (result: T | null) => void = () => undefined,
  ): void {
    const existing = this.entries.get(key);
    if (
      existing &&
      isMobileReaderPagesPrefetchFresh({
        startedAt: existing.startedAt,
        now: this.now(),
        ttlMs: this.ttlMs,
      })
    ) {
      return;
    }
    if (existing) this.evict(key);

    const promise = run().catch(() => null);
    this.entries.set(key, { startedAt: this.now(), promise, dispose });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.evict(oldestKey);
    }
  }

  /** Take a fresh prefetch for the key, or null. Taking removes the entry. */
  take(key: string): Promise<T | null> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (
      !isMobileReaderPagesPrefetchFresh({
        startedAt: entry.startedAt,
        now: this.now(),
        ttlMs: this.ttlMs,
      })
    ) {
      void entry.promise.then((result) => entry.dispose(result));
      return null;
    }
    return entry.promise;
  }

  /**
   * Look at a fresh prefetch without consuming it. The chapter turn still
   * `take`s the entry; a peeker (warming the next chapter's first images)
   * must not keep the result or dispose it.
   */
  peek(key: string): Promise<T | null> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (
      !isMobileReaderPagesPrefetchFresh({
        startedAt: entry.startedAt,
        now: this.now(),
        ttlMs: this.ttlMs,
      })
    ) {
      return null;
    }
    return entry.promise;
  }

  clear(): void {
    for (const key of Array.from(this.entries.keys())) this.evict(key);
  }

  size(): number {
    return this.entries.size;
  }

  private evict(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    void entry.promise.then((result) => entry.dispose(result));
  }
}

export const mobileReaderPagesPrefetchCache =
  new MobileReaderPagesPrefetchCache<MobileReaderPagesRefresh>();

/** Free an evicted, never-consumed refresh's processed-page cache. */
export function disposeMobileReaderPagesPrefetchResult(
  result: MobileReaderPagesRefresh | null,
): void {
  if (result?.status === "ready") result.pageProcessor?.dispose();
}

registerMobileSourceProfileTransitionHandler(
  "mobile-reader-pages-prefetch",
  () => {
    mobileReaderPagesPrefetchCache.clear();
  },
);
