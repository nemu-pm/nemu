import { useEffect, useRef, useState } from "react";
import { analyzePageFile, pageAnalysisAvailable } from "../../../modules/nemu-window-layout";
import {
  MobileReaderPageAnalysisQueue,
  mobileReaderPageAnalysisCacheName,
  mobileReaderPageAnalysisOrder,
  parseMobileReaderPageAnalysisCache,
  serializeMobileReaderPageAnalysisCache,
  type MobileReaderPageFeatures,
} from "@/lib/mobileReaderPageAnalysis";
import {
  readMobileReaderPageAnalysisText,
  writeMobileReaderPageAnalysisText,
} from "@/lib/mobileReaderPageAnalysisStorage";

const EMPTY = new Map<string, MobileReaderPageFeatures>();
/** The queue restarts from the reader's page every this many pages. */
const ORDER_BUCKET = 4;
const SAVE_DELAY_MS = 1500;

/**
 * Measured page features for the open chapter, keyed by page id. Pages near
 * the reader are measured while spreads can show (`enabled`); everything
 * measured is cached per chapter and loaded back on reopening.
 */
export function useMobileReaderPageFeatures({
  enabled,
  chapterKey,
  pageIds,
  currentPageIndex,
  resolveFile,
}: {
  enabled: boolean;
  chapterKey: string;
  /** Page ids in display order (`null` for a page without an image). */
  pageIds: ReadonlyArray<string | null>;
  currentPageIndex: number;
  resolveFile: (index: number, signal: AbortSignal) => Promise<string | null>;
}): ReadonlyMap<string, MobileReaderPageFeatures> {
  const [state, setState] = useState<{ key: string; features: Map<string, MobileReaderPageFeatures> }>(
    () => ({ key: chapterKey, features: new Map() }),
  );
  const [cacheLoadedKey, setCacheLoadedKey] = useState<string | null>(null);
  const resolveFileRef = useRef(resolveFile);
  useEffect(() => {
    resolveFileRef.current = resolveFile;
  }, [resolveFile]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The chapter the queue measures for; results always land under it.
  const chapterKeyRef = useRef(chapterKey);
  const available = pageAnalysisAvailable();

  const [queue] = useState(
    () =>
      new MobileReaderPageAnalysisQueue(analyzePageFile, (id, features) => {
        setState((current) => {
          const key = chapterKeyRef.current;
          const next = new Map(current.key === key ? current.features : undefined);
          next.set(id, features);
          return { key, features: next };
        });
      }),
  );

  // A new chapter: drop the old results and load what was measured before.
  useEffect(() => {
    queue.reset();
    chapterKeyRef.current = chapterKey;
    if (!available || !chapterKey) return;
    let cancelled = false;
    void readMobileReaderPageAnalysisText(mobileReaderPageAnalysisCacheName(chapterKey)).then((text) => {
      if (cancelled) return;
      const cached = parseMobileReaderPageAnalysisCache(text);
      queue.markDone(cached.keys());
      setState((current) => ({
        key: chapterKey,
        features: new Map([...cached, ...(current.key === chapterKey ? current.features : [])]),
      }));
      setCacheLoadedKey(chapterKey);
    });
    return () => {
      cancelled = true;
      queue.cancel();
    };
  }, [available, chapterKey, queue]);

  // Measure the pages around the reader, nearest first.
  const bucket = Math.floor(Math.max(0, currentPageIndex) / ORDER_BUCKET) * ORDER_BUCKET;
  const pageIdsKey = pageIds.join("\u0000");
  useEffect(() => {
    if (!enabled || !available || cacheLoadedKey !== chapterKey) return;
    const ids = pageIdsKey ? pageIdsKey.split("\u0000") : [];
    const jobs = mobileReaderPageAnalysisOrder(ids.length, bucket)
      .filter((index) => Boolean(ids[index]))
      .map((index) => ({
        id: ids[index]!,
        resolveFile: (signal: AbortSignal) => resolveFileRef.current(index, signal),
      }));
    void queue.run(jobs);
    return () => queue.cancel();
  }, [available, bucket, cacheLoadedKey, chapterKey, enabled, pageIdsKey, queue]);

  // Write the chapter's results back a moment after they stop changing.
  useEffect(() => {
    if (!available || state.key !== chapterKey || cacheLoadedKey !== chapterKey || state.features.size === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const key = state.key;
    const features = state.features;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void writeMobileReaderPageAnalysisText(
        mobileReaderPageAnalysisCacheName(key),
        serializeMobileReaderPageAnalysisCache(features),
      );
    }, SAVE_DELAY_MS);
    // No cleanup: a pending write still lands after the reader leaves.
  }, [available, cacheLoadedKey, chapterKey, state]);

  return state.key === chapterKey ? state.features : EMPTY;
}
