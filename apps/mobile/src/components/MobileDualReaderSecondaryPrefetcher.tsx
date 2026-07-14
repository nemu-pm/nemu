/**
 * Mobile dual-reader SecondaryPrefetcher — loads the secondary chapter's page
 * list for the chapter mapped to the current primary chapter, so the overlay's
 * image-resolution effect can decode page images on demand. Native counterpart
 * to web's `DualReadSecondaryPrefetcher`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:2555-2665`).
 *
 * Web prefetches pages for every loaded primary page (and inlines page-loading
 * inside `ensureSecondaryImage` via `ensureSecondaryPages`). Mobile splits the
 * concern: this component loads the *page list* for the current primary
 * chapter's mapped secondary chapter (the common case — one chapter visible at
 * a time), and the overlay's effect decodes images from those pages.
 *
 * DEVICE-GATED: the source round-trip + image decode are verified on-device
 * (T7.4). The effect wiring is typechecked here.
 */
import { useEffect, useRef } from "react";
import {
  mapSecondaryChapterForPrimary,
  mapSecondaryPageIndex,
} from "@nemu/core/dual-reader";
import { mobileInstalledSourceMatchesLink } from "@/lib/mobileInstalledSourceKeys";
import { refreshMobileReaderPages } from "@/sources/mobileSourcePages";
import type {
  MobileReaderPageProcessor,
  MobileReaderPageWindowResult,
} from "@/sources/mobileSourcePages";
import { useReadingMode } from "@/data/mobileHooks";
import { disposeMobileReaderPageProcessorIfUnowned } from "@/lib/mobileReaderPageProcessorLifecycle";
import { useMobileDualReaderContext } from "./MobileDualReaderContext";
import {
  getMobileDualReadStore,
  useMobileDualReaderStore,
} from "@/lib/mobileDualReaderStore";

export function MobileDualReaderSecondaryPrefetcher() {
  const ctx = useMobileDualReaderContext();
  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const runtimeSuspended = useMobileDualReaderStore((s) => s.runtimeSuspended);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const secondarySource = useMobileDualReaderStore((s) => s.secondarySource);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const secondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const setSecondaryPages = useMobileDualReaderStore((s) => s.setSecondaryPages);
  const clearSecondaryCache = useMobileDualReaderStore((s) => s.clearSecondaryCache);
  const driftDeltaByChapter = useMobileDualReaderStore((s) => s.driftDeltaByChapter);
  const { processPageImages } = useReadingMode();
  const processorRef = useRef<{
    chapterId: string;
    sourceKey: string;
    processPageImages: boolean;
    processor: MobileReaderPageProcessor;
  } | null>(null);

  const secondaryChapterId =
    enabled && seedPair && ctx.primaryChapter
      ? mapSecondaryChapterForPrimary({
          primaryChapter: ctx.primaryChapter,
          primaryAll: primaryChapters,
          secondaryAll: secondaryChapters,
          seedPair,
        })
      : null;
  const secondarySourceKey = secondarySource
    ? `${secondarySource.registryId}:${secondarySource.sourceId}:${secondarySource.sourceMangaId}`
    : "";
  const processingCenter = mapSecondaryPageIndex({
    primaryIndex: ctx.currentLocalIndex ?? 0,
    driftDelta: ctx.primaryChapter
      ? (driftDeltaByChapter[ctx.primaryChapter.id] ?? 0)
      : 0,
  });

  useEffect(() => {
    if (
      runtimeSuspended ||
      !enabled ||
      !seedPair ||
      !secondarySource ||
      !secondaryChapterId
    ) {
      return;
    }
    if (!primaryChapters.length || !secondaryChapters.length) return;

    const previousProcessor = processorRef.current;
    if (
      previousProcessor &&
      (previousProcessor.chapterId !== secondaryChapterId ||
        previousProcessor.sourceKey !== secondarySourceKey ||
        previousProcessor.processPageImages !== processPageImages)
    ) {
      previousProcessor.processor.dispose();
      processorRef.current = null;
      clearSecondaryCache();
    }

    const activeProcessor = processorRef.current;
    if (activeProcessor?.chapterId === secondaryChapterId) {
      let active = true;
      const controller = new AbortController();
      const applyWindowResult = (result: MobileReaderPageWindowResult) => {
        if (active) setSecondaryPages(secondaryChapterId, result.pages);
      };
      void activeProcessor.processor
        .processWindow(processingCenter, {
          signal: controller.signal,
          onUpdate: applyWindowResult,
        })
        .then((result) => {
          if (result) applyWindowResult(result);
        })
        .catch(() => undefined);
      return () => {
        active = false;
        controller.abort();
        activeProcessor.processor.cancel();
      };
    }

    // Already loaded and no pending processor means these pages do not require
    // source-specific image processing.
    if (
      getMobileDualReadStore().getState().secondaryPagesByChapter[
        secondaryChapterId
      ]
    ) {
      return;
    }

    const secondaryChapter = secondaryChapters.find((c) => c.id === secondaryChapterId);
    if (!secondaryChapter) return;

    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const installedSource = ctx.installedSources.find((item) =>
          mobileInstalledSourceMatchesLink(item, secondarySource!),
        );
        if (!installedSource) return;
        const refreshed = await refreshMobileReaderPages(
          installedSource,
          secondarySource!.sourceMangaId,
          secondaryChapter,
          {
            getSourceSettings: ctx.getSourceSettings,
            processPageImages,
          },
        );
        if (cancelled) {
          if (refreshed.status === "ready" && refreshed.pageProcessor) {
            disposeMobileReaderPageProcessorIfUnowned(
              refreshed.pageProcessor,
              processorRef.current?.processor,
            );
          }
          return;
        }
        if (refreshed.status === "ready") {
          if (!refreshed.pageProcessor) {
            setSecondaryPages(secondaryChapterId, refreshed.pages);
            return;
          }
          processorRef.current = {
            chapterId: secondaryChapterId,
            sourceKey: secondarySourceKey,
            processPageImages,
            processor: refreshed.pageProcessor,
          };
          const applyWindowResult = (result: MobileReaderPageWindowResult) => {
            if (!cancelled) setSecondaryPages(secondaryChapterId, result.pages);
          };
          const processed = await refreshed.pageProcessor.processWindow(
            processingCenter,
            {
              signal: controller.signal,
              onUpdate: applyWindowResult,
            },
          );
          if (cancelled) {
            disposeMobileReaderPageProcessorIfUnowned(
              refreshed.pageProcessor,
              processorRef.current?.processor,
            );
            return;
          }
          setSecondaryPages(
            secondaryChapterId,
            processed?.pages ?? refreshed.pages,
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[DualRead] Failed to load secondary pages", err);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      processorRef.current?.processor.cancel();
    };
  }, [
    runtimeSuspended,
    enabled,
    seedPair,
    secondarySource,
    secondarySourceKey,
    secondaryChapterId,
    primaryChapters,
    secondaryChapters,
    ctx.installedSources,
    ctx.getSourceSettings,
    processingCenter,
    processPageImages,
    setSecondaryPages,
    clearSecondaryCache,
  ]);

  useEffect(() => {
    if (enabled) return;
    processorRef.current?.processor.dispose();
    processorRef.current = null;
  }, [enabled]);

  useEffect(() => {
    return () => {
      processorRef.current?.processor.dispose();
      processorRef.current = null;
    };
  }, []);

  return null;
}
