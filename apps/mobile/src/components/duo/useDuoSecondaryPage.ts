/**
 * `useDuoSecondaryPage` — the dual-reader secondary page for one primary page:
 * store selectors + `resolveMobileDuoSecondaryTarget` + on-demand decode.
 *
 * Shared by the per-page `MobileDualReaderOverlay` (load only while the
 * secondary side is shown) and the Duo bilingual side-by-side pane (load
 * whenever the dual reader is enabled), so both use the same chapter/page
 * mapping, render plans (single / split / merge / missing), alignment and
 * image cache keys. Decoding goes through `ensureSecondaryImage` /
 * `ensureSecondaryCompositeImage`, which dedupe in-flight work per cache key,
 * so an overlay and a pane asking for the same page decode it once.
 *
 * Args:
 * - `chapterId` / `localIndex`: the primary chapter and page index (null = none).
 * - `load`: resolve the image now. The request is aborted on unmount / change.
 */
import { useEffect, useMemo } from "react";
import {
  adaptMobileDualReadStore,
  ensureSecondaryCompositeImage,
  ensureSecondaryImage,
  fetchMobilePageBytes,
} from "@/lib/mobileDualReaderSecondaryImages";
import {
  getMobileDualReadStore,
  useMobileDualReaderStore,
} from "@/lib/mobileDualReaderStore";
import { getMobileDualReaderRenderer } from "@/lib/mobileDualReaderSkiaAdapter";
import {
  resolveMobileDuoSecondaryChapter,
  resolveMobileDuoSecondaryTarget,
  type MobileDuoSecondaryTarget,
} from "@/lib/mobileDuoSecondaryTarget";

export type DuoSecondaryPage = MobileDuoSecondaryTarget & {
  /** Dual reader is on (the store's `enabled`). */
  enabled: boolean;
};

export function useDuoSecondaryPage({
  chapterId,
  localIndex,
  load,
}: {
  chapterId: string | null;
  localIndex: number | null;
  load: boolean;
}): DuoSecondaryPage {
  const renderer = getMobileDualReaderRenderer();
  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const runtimeSuspended = useMobileDualReaderStore((s) => s.runtimeSuspended);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const driftDeltaByChapter = useMobileDualReaderStore((s) => s.driftDeltaByChapter);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const secondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const secondarySource = useMobileDualReaderStore((s) => s.secondarySource);
  const secondaryPagesByChapter = useMobileDualReaderStore((s) => s.secondaryPagesByChapter);
  const secondaryImageUrls = useMobileDualReaderStore((s) => s.secondaryImageUrls);
  const secondaryRenderPlansByChapter = useMobileDualReaderStore(
    (s) => s.secondaryRenderPlansByChapter,
  );
  const secondaryAlignmentByChapter = useMobileDualReaderStore(
    (s) => s.secondaryAlignmentByChapter,
  );

  // Chapter matching walks both chapter lists; keep it off the image-cache
  // update path (every decoded image replaces `secondaryImageUrls`).
  const chapter = useMemo(
    () => resolveMobileDuoSecondaryChapter({ chapterId, primaryChapters, secondaryChapters, seedPair }),
    [chapterId, primaryChapters, secondaryChapters, seedPair],
  );
  const target = useMemo(
    () => resolveMobileDuoSecondaryTarget(chapter, {
      chapterId,
      localIndex,
      driftDeltaByChapter,
      secondaryPagesByChapter,
      secondaryRenderPlansByChapter,
      secondaryAlignmentByChapter,
      secondaryImageUrls,
    }),
    [
      chapter,
      chapterId,
      localIndex,
      driftDeltaByChapter,
      secondaryPagesByChapter,
      secondaryRenderPlansByChapter,
      secondaryAlignmentByChapter,
      secondaryImageUrls,
    ],
  );

  const { secondaryChapterId } = chapter;
  const { renderPlan, mappedIndex, secondaryPages, imageKey, handle } = target;
  const shouldLoad = load && enabled;

  // Resolve the secondary image on demand (mirrors web's DualReadOverlay effect).
  useEffect(() => {
    if (
      runtimeSuspended ||
      !shouldLoad ||
      !secondarySource ||
      !secondaryChapterId ||
      handle?.image
    ) {
      return;
    }
    const controller = new AbortController();
    const store = adaptMobileDualReadStore(getMobileDualReadStore());
    const fetcher = (
      page: Parameters<typeof fetchMobilePageBytes>[0],
      options?: { signal?: AbortSignal },
    ) => fetchMobilePageBytes(page, { signal: options?.signal });
    if (renderPlan) {
      if (renderPlan.kind === "missing") return () => controller.abort();
      const pages = secondaryPages ?? [];
      if (pages.length === 0) return () => controller.abort();
      void ensureSecondaryCompositeImage({
        renderer,
        fetchBytes: fetcher,
        store,
        pages,
        plan: renderPlan,
        signal: controller.signal,
      });
      return () => controller.abort();
    }
    if (mappedIndex == null || !secondaryPages) {
      return () => controller.abort();
    }
    void ensureSecondaryImage({
      renderer,
      fetchBytes: fetcher,
      store,
      pages: secondaryPages,
      chapterId: secondaryChapterId,
      index: mappedIndex,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [
    runtimeSuspended,
    shouldLoad,
    secondarySource,
    secondaryChapterId,
    imageKey,
    handle?.image,
    renderPlan,
    mappedIndex,
    secondaryPages,
    renderer,
  ]);

  return useMemo(() => ({ ...target, enabled }), [target, enabled]);
}
