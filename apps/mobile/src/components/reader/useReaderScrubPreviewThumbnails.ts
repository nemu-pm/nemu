import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  getCachedMobileImageUriSync,
  resolveCachedMobileImageUri,
} from "@/lib/mobileImageCache";
import {
  READER_SCRUB_PREVIEW_FETCH_DEBOUNCE_MS,
  READER_SCRUB_PREVIEW_PREFETCH_RADIUS,
  ReaderScrubPreviewThumbnailCache,
  planReaderScrubPreviewPrefetch,
  readerScrubPreviewTargetPages,
} from "@/lib/mobileReaderScrubPreviewThumbnails";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";

export type ReaderScrubPreviewThumbnail = {
  pageIndex: number;
  /** A local file (or app-owned image) to show, or null while it loads. */
  uri: string | null;
};

function thumbnailKey(page: MobileReaderPage): string {
  return `${page.id}\u0001${page.imageUri ?? ""}`;
}

/**
 * The scrub preview's thumbnails. Pages already on disk show at once; any
 * other target page is requested through the reader's own image cache (same
 * source headers, same files the reader later displays) at prefetch priority —
 * behind every visible page load — once the thumb has rested on it for
 * ~100 ms, together with a few pages either side. Pages the thumb has left
 * well behind are cancelled; ending the drag cancels everything.
 */
export function useReaderScrubPreviewThumbnails({
  pages,
  previewPageIndex,
  spreads,
  isRevealed,
}: {
  pages: readonly MobileReaderPage[];
  previewPageIndex: number | null;
  /** Two-page mode: the spreads, so the bubble shows the whole spread. */
  spreads: readonly (readonly number[])[] | null;
  /** Spoiler-safe surfaces (the notebook) withhold unread pages. */
  isRevealed?: (pageIndex: number) => boolean;
}): ReaderScrubPreviewThumbnail[] {
  const cacheRef = useRef(new ReaderScrubPreviewThumbnailCache());
  const [version, bump] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    cacheRef.current.clear();
  }, [pages]);

  const lookup = useCallback((page: MobileReaderPage | undefined): string | null => {
    if (!page?.imageUri) return null;
    if (page.imageUriOwnership === "app") return page.imageUri;
    const key = thumbnailKey(page);
    const remembered = cacheRef.current.get(key);
    if (remembered !== undefined) return remembered;
    const onDisk = getCachedMobileImageUriSync({
      uri: page.imageUri,
      headers: page.headers,
      cacheKind: "page",
    });
    if (onDisk) cacheRef.current.set(key, onDisk);
    return onDisk ?? null;
  }, []);

  const targetPages = useMemo(
    () => readerScrubPreviewTargetPages(previewPageIndex, pages.length, spreads),
    [pages.length, previewPageIndex, spreads],
  );
  const targetKey = targetPages.join(",");
  const isRevealedRef = useRef(isRevealed);
  useEffect(() => {
    isRevealedRef.current = isRevealed;
  }, [isRevealed]);

  // In-flight requests of the current drag, by page. A request survives the
  // thumb moving on while its page stays near the thumb (a sweep keeps
  // filling the pages it passes); pages left well behind are cancelled, and
  // ending the drag cancels everything.
  const inFlightRef = useRef(new Map<number, AbortController>());
  useEffect(() => {
    const inFlight = inFlightRef.current;
    if (targetPages.length === 0) {
      inFlight.forEach((controller) => controller.abort());
      inFlight.clear();
      return;
    }
    const revealed = (index: number) => isRevealedRef.current?.(index) ?? true;
    const request = (index: number) => {
      const page = pages[index];
      if (!page?.imageUri || page.imageUriOwnership === "app") return;
      if (inFlight.has(index) || !revealed(index) || lookup(page) != null) return;
      const controller = new AbortController();
      inFlight.set(index, controller);
      void resolveCachedMobileImageUri(
        { uri: page.imageUri, headers: page.headers, cacheKind: "page" },
        undefined,
        undefined,
        // Behind every visible page load of the reader itself.
        { priority: "prefetch", signal: controller.signal },
      )
        .then((uri) => {
          if (!uri || controller.signal.aborted) return;
          cacheRef.current.set(thumbnailKey(page), uri);
          bump();
        })
        .catch(() => undefined)
        .finally(() => {
          if (inFlight.get(index) === controller) inFlight.delete(index);
        });
    };
    const timer = setTimeout(() => {
      const keep = new Set([
        ...targetPages,
        ...planReaderScrubPreviewPrefetch(
          targetPages,
          pages.length,
          READER_SCRUB_PREVIEW_PREFETCH_RADIUS + 2,
        ),
      ]);
      inFlight.forEach((controller, index) => {
        if (keep.has(index)) return;
        controller.abort();
        inFlight.delete(index);
      });
      targetPages.forEach(request);
      planReaderScrubPreviewPrefetch(targetPages, pages.length).forEach(request);
    }, READER_SCRUB_PREVIEW_FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // targetKey stands in for targetPages (a new array per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, pages, targetKey]);
  useEffect(
    () => () => {
      inFlightRef.current.forEach((controller) => controller.abort());
      inFlightRef.current.clear();
    },
    [],
  );

  return useMemo(
    () =>
      targetPages.map((pageIndex) => ({
        pageIndex,
        uri:
          (isRevealed?.(pageIndex) ?? true) ? lookup(pages[pageIndex]) : null,
      })),
    // `version` re-reads the cache once a requested thumbnail lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isRevealed, lookup, pages, targetKey, version],
  );
}
