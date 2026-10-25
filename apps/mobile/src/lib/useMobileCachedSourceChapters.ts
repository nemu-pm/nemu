import { useEffect, useState } from "react";
import type { ChapterSummary } from "@/data/schema";
import {
  getCachedMobileSourceDetail,
  makeMobileSourceDetailCacheKey,
} from "@/lib/mobileSourceDetailCache";

/**
 * The chapter list the detail cache holds for one source title (stale or
 * not), or null while it loads or when nothing is cached. Read again when
 * `refreshKey` changes (the title's progress moved, so the reader or the
 * detail page may have refreshed the list).
 */
export function useMobileCachedSourceChapters(
  registryId: string,
  sourceId: string,
  mangaId: string,
  refreshKey?: string | number,
): ChapterSummary[] | null {
  const key = makeMobileSourceDetailCacheKey(registryId, sourceId, mangaId);
  const [loaded, setLoaded] = useState<{ key: string; chapters: ChapterSummary[] | null } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    void getCachedMobileSourceDetail(key)
      .then((hit) => {
        if (cancelled) return;
        const chapters = hit?.payload.chapters ?? null;
        setLoaded((current) =>
          current?.key === key && current.chapters === chapters ? current : { key, chapters },
        );
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, chapters: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);
  return loaded?.key === key ? loaded.chapters : null;
}
