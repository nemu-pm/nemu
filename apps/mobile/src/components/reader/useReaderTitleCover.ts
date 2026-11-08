import { useEffect, useMemo, useState } from "react";
import type { InstalledSource, LibraryEntry } from "@/data/schema";
import { useMobileExploreEntryCover } from "@/components/explore/mobileExploreCover";
import {
  getCachedMobileSourceDetail,
  makeMobileSourceDetailCacheKey,
} from "@/lib/mobileSourceDetailCache";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";

export type ReaderTitleCoverSource = { uri: string; headers?: Record<string, string> } | null;

/**
 * The reader's title cover: the library's display cover (as the library and
 * the detail page paint it), else the source's cached details for a title
 * read outside the library. Looked up only while `enabled`.
 */
export function useReaderTitleCover(input: {
  enabled: boolean;
  entry: LibraryEntry | null;
  installedSources: InstalledSource[];
  /** The route's source, for a title read outside the library. */
  routeSource: InstalledSource | null;
  registryId: string;
  sourceId: string;
  mangaId: string;
}): ReaderTitleCoverSource {
  const { enabled, entry, registryId, sourceId, mangaId } = input;
  const libraryCover = useMobileExploreEntryCover(enabled ? entry : null, input.installedSources);
  const [detailCover, setDetailCover] = useState<string | null>(null);
  useEffect(() => {
    setDetailCover(null);
    if (!enabled || entry) return undefined;
    let cancelled = false;
    void getCachedMobileSourceDetail(makeMobileSourceDetailCacheKey(registryId, sourceId, mangaId))
      .then((cached) => {
        if (!cancelled) setDetailCover(cached?.payload.metadata.cover?.trim() || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, entry, mangaId, registryId, sourceId]);
  const detailRequest = useMobileSourceImageRequest(input.routeSource, enabled && !entry ? detailCover : null);
  return useMemo<ReaderTitleCoverSource>(() => {
    if (!enabled) return null;
    if (entry) return libraryCover;
    const uri = detailRequest?.url ?? detailCover;
    return uri ? { uri, headers: detailRequest?.headers } : null;
  }, [detailCover, detailRequest?.headers, detailRequest?.url, enabled, entry, libraryCover]);
}
