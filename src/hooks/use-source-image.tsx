/**
 * Context and hook for source-aware image fetching.
 * 
 * Pattern (like Swift's SourceManager):
 * - Parent component provides source context via <SourceImageProvider>
 * - Child components (CoverImage, cards) consume via useSourceImage()
 * - Falls back to simple proxy fetch when no context
 */
import { createContext, useContext, useCallback, useRef, type ReactNode } from "react";
import { useStores } from "@/data/context";
import type { MangaSource } from "@/lib/sources/types";
import { proxyUrl } from "@/config";
import { parseSourceKey } from "@/data/keys";

// ============ CONTEXT ============

type ImageFetcher = (url: string) => Promise<Blob>;

const SourceImageContext = createContext<ImageFetcher | null>(null);

interface SourceImageProviderProps {
  /** Source key in format "registryId:sourceId" */
  sourceKey: string;
  children: ReactNode;
}

/**
 * Provides source-aware image fetching to descendants.
 * Use this at page/section level where source is known.
 */
export function SourceImageProvider({ sourceKey, children }: SourceImageProviderProps) {
  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);
  const sourceCache = useRef<MangaSource | null | undefined>(undefined);

  const fetchImage = useCallback(async (url: string): Promise<Blob> => {
    // Lazy load source on first image request (via settings store for proper dialog handling)
    if (sourceCache.current === undefined) {
      try {
        const { registryId, sourceId } = parseSourceKey(sourceKey);
        sourceCache.current = await getSource(registryId, sourceId);
      } catch {
        sourceCache.current = null;
      }
    }

    if (sourceCache.current) {
      return sourceCache.current.fetchImage(url);
    }

    return defaultFetch(url);
  }, [sourceKey, getSource]);

  return (
    <SourceImageContext.Provider value={fetchImage}>
      {children}
    </SourceImageContext.Provider>
  );
}

/**
 * Get the image fetcher from context.
 * Returns null if not in a SourceImageProvider (will use default fetcher).
 */
export function useSourceImage(): ImageFetcher | null {
  return useContext(SourceImageContext);
}

// ============ DEFAULT FETCHER ============

/** Default fetcher - uses image origin as Referer (works for most sources) */
export async function defaultFetch(url: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  try {
    headers["x-proxy-referer"] = new URL(url).origin;
  } catch {
    // Invalid URL, proceed without referer
  }
  const res = await fetch(proxyUrl(url), { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

