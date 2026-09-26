import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import { getMobileImageUriPolicy } from "@/lib/mobileImageUriPolicy";

/**
 * Reader page-image prefetch planning.
 *
 * The reader only mounts `<Image>`s for pages near the one on screen, so after
 * the page cache is cleared every swipe waited on the network. The prefetcher
 * warms the on-disk page cache (the same `cacheKind: "page"` key, headers and
 * native decoration path a mounted page uses) for the next few pages, the
 * previous one, and — near the end — the next chapter's opening pages. It
 * downloads to disk only; nothing is decoded until the page mounts, so long
 * strips cost disk, not memory.
 */
/**
 * Two pages past the reader's mounted window (`MOBILE_READER_PAGE_RENDER_WINDOW`
 * = 3), so the pages a swipe run reaches next are already on disk; the ones
 * inside the window share the mounted page's in-flight request.
 */
export const MOBILE_READER_PREFETCH_PAGES_AHEAD = 5;
export const MOBILE_READER_PREFETCH_PAGES_BEHIND = 1;
/** Opening pages of the next chapter warmed once the reader nears the end. */
export const MOBILE_READER_PREFETCH_NEXT_CHAPTER_PAGES = 2;
/** How close to the last page (in pages) the next chapter starts warming. */
export const MOBILE_READER_PREFETCH_NEXT_CHAPTER_WITHIN = 3;
/** Completed prefetches remembered so a revisit does not re-request them. */
const MOBILE_READER_PREFETCH_DONE_MEMORY = 96;

export type MobileReaderPrefetchImage = {
  key: string;
  uri: string;
  headers?: Record<string, string>;
};

function headersKey(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.keys(headers)
    .sort()
    .map((name) => `${name}\u0001${headers[name]}`)
    .join("\u0002");
}

/**
 * A page can be warmed only when the reader would fetch exactly this remote
 * URL: pending source processing replaces the URI, and app-owned (processed)
 * images are already local.
 */
export function mobileReaderPrefetchImageForPage(
  page: MobileReaderPage,
): MobileReaderPrefetchImage | null {
  if (!page.imageUri || page.imageUriOwnership !== "source") return null;
  if (page.imageProcessing === "pending") return null;
  const policy = getMobileImageUriPolicy(page.imageUri, "source");
  if (!policy.allowed || policy.kind !== "source-remote") return null;
  return {
    key: `${page.imageUri}\u0000${headersKey(page.headers)}`,
    uri: page.imageUri,
    headers: page.headers,
  };
}

/**
 * Pages to warm around `currentIndex`, nearest first: the next pages in
 * reading order, then the previous page. A single-page chapter is a long
 * strip that the reader caches under its own segmented key, so it is skipped.
 */
export function planMobileReaderPagePrefetch({
  pages,
  currentIndex,
  ahead = MOBILE_READER_PREFETCH_PAGES_AHEAD,
  behind = MOBILE_READER_PREFETCH_PAGES_BEHIND,
}: {
  pages: readonly MobileReaderPage[];
  currentIndex: number;
  ahead?: number;
  behind?: number;
}): MobileReaderPrefetchImage[] {
  if (pages.length <= 1 || !Number.isFinite(currentIndex)) return [];
  const current = Math.max(0, Math.min(pages.length - 1, Math.round(currentIndex)));
  const indexes: number[] = [];
  for (let offset = 1; offset <= ahead; offset += 1) {
    indexes.push(current + offset);
  }
  for (let offset = 1; offset <= behind; offset += 1) {
    indexes.push(current - offset);
  }
  const images: MobileReaderPrefetchImage[] = [];
  for (const index of indexes) {
    const page = pages[index];
    if (!page) continue;
    const image = mobileReaderPrefetchImageForPage(page);
    if (image) images.push(image);
  }
  return images;
}

/** Whether the reader is close enough to the end to warm the next chapter. */
export function shouldPrefetchMobileReaderNextChapter({
  pageCount,
  currentIndex,
  within = MOBILE_READER_PREFETCH_NEXT_CHAPTER_WITHIN,
}: {
  pageCount: number;
  currentIndex: number;
  within?: number;
}): boolean {
  if (pageCount <= 0 || !Number.isFinite(currentIndex)) return false;
  return pageCount - 1 - currentIndex <= within;
}

/** The next chapter's opening pages, in reading order. */
export function planMobileReaderNextChapterPrefetch(
  pages: readonly MobileReaderPage[],
  count = MOBILE_READER_PREFETCH_NEXT_CHAPTER_PAGES,
): MobileReaderPrefetchImage[] {
  if (pages.length <= 1) return [];
  const images: MobileReaderPrefetchImage[] = [];
  for (const page of pages.slice(0, count)) {
    const image = mobileReaderPrefetchImageForPage(page);
    if (image) images.push(image);
  }
  return images;
}

export type MobileReaderPrefetchLoader = (
  image: MobileReaderPrefetchImage,
  signal: AbortSignal,
) => Promise<unknown>;

/**
 * Keeps exactly the planned downloads in flight. A new plan aborts the ones
 * that dropped out of it (a fast scrub no longer wants them) while keeping
 * the ones still wanted, so a page turn never restarts a half-finished
 * download. Finished keys are remembered (bounded) and not requested again.
 */
export class MobileReaderImagePrefetcher {
  private readonly inFlight = new Map<string, AbortController>();
  private readonly done = new Set<string>();

  constructor(private readonly load: MobileReaderPrefetchLoader) {}

  update(images: readonly MobileReaderPrefetchImage[]): void {
    const wanted = new Map<string, MobileReaderPrefetchImage>();
    for (const image of images) {
      if (!wanted.has(image.key)) wanted.set(image.key, image);
    }
    for (const [key, controller] of this.inFlight) {
      if (!wanted.has(key)) {
        controller.abort();
        this.inFlight.delete(key);
      }
    }
    for (const [key, image] of wanted) {
      if (this.inFlight.has(key) || this.done.has(key)) continue;
      const controller = new AbortController();
      this.inFlight.set(key, controller);
      void this.load(image, controller.signal)
        .then(
          (result) => {
            if (controller.signal.aborted) return;
            // A null result is a failed or refused download; leave it
            // retryable for the mounted page's own visible request.
            if (result != null) this.remember(key);
          },
          () => undefined,
        )
        .finally(() => {
          if (this.inFlight.get(key) === controller) this.inFlight.delete(key);
        });
    }
  }

  cancelAll(): void {
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
  }

  /** Forget completed keys, e.g. after the page cache is cleared. */
  reset(): void {
    this.cancelAll();
    this.done.clear();
  }

  inFlightKeys(): string[] {
    return Array.from(this.inFlight.keys());
  }

  private remember(key: string): void {
    this.done.delete(key);
    this.done.add(key);
    while (this.done.size > MOBILE_READER_PREFETCH_DONE_MEMORY) {
      const oldest = this.done.values().next().value;
      if (oldest === undefined) break;
      this.done.delete(oldest);
    }
  }
}
