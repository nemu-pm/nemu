/**
 * Scrub preview thumbnails: which pages the bubble shows, which pages to warm
 * around the thumb, and a small in-memory LRU of resolved thumbnail files.
 * The loading itself lives in `useReaderScrubPreviewThumbnails`.
 */

/** Delay after the thumb stops on a page before its image is requested. */
export const READER_SCRUB_PREVIEW_FETCH_DEBOUNCE_MS = 100;
/** Pages warmed on each side of the thumb once a drag starts. */
export const READER_SCRUB_PREVIEW_PREFETCH_RADIUS = 3;
/** Resolved thumbnail files remembered across drags. */
export const READER_SCRUB_PREVIEW_THUMBNAIL_LRU_SIZE = 24;

/**
 * The pages the bubble shows for a previewed page: the page alone, or — in
 * two-page mode — every page of the spread holding it, in source order.
 */
export function readerScrubPreviewTargetPages(
  pageIndex: number | null,
  pageCount: number,
  spreads: readonly (readonly number[])[] | null,
): number[] {
  if (pageIndex == null || !Number.isFinite(pageIndex) || pageCount <= 0) return [];
  const clamped = Math.max(0, Math.min(pageCount - 1, Math.trunc(pageIndex)));
  if (!spreads || spreads.length === 0) return [clamped];
  const spread = spreads.find((pages) => pages.includes(clamped));
  return spread && spread.length > 0
    ? spread.filter((index) => index >= 0 && index < pageCount)
    : [clamped];
}

/**
 * Pages to warm around the thumb, nearest first, alternating ahead and
 * behind so a drag in either direction finds its next page ready. Excludes
 * the target pages themselves (they are requested on their own).
 */
export function planReaderScrubPreviewPrefetch(
  targetPages: readonly number[],
  pageCount: number,
  radius: number = READER_SCRUB_PREVIEW_PREFETCH_RADIUS,
): number[] {
  if (targetPages.length === 0 || pageCount <= 0 || radius <= 0) return [];
  const first = Math.min(...targetPages);
  const last = Math.max(...targetPages);
  const planned: number[] = [];
  for (let step = 1; step <= radius; step += 1) {
    const ahead = last + step;
    const behind = first - step;
    if (ahead < pageCount) planned.push(ahead);
    if (behind >= 0) planned.push(behind);
  }
  return planned;
}

/** Tiny LRU keyed by page identity. */
export class ReaderScrubPreviewThumbnailCache {
  private readonly entries = new Map<string, string>();

  constructor(private readonly capacity: number = READER_SCRUB_PREVIEW_THUMBNAIL_LRU_SIZE) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    // Re-insert: Map iteration order is insertion order, oldest first.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
