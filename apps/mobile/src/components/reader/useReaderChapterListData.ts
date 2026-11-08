import { useEffect, useState } from "react";
import type { ChapterSummary, InstalledSource, LocalChapterProgress, LocalSourceLink } from "@/data/schema";
import {
  DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE,
  normalizeMobileChapterListPreference,
  type MobileChapterListPreference,
} from "@/lib/mobileChapterFilters";
import { loadMobileChapterProgressForSource } from "@/lib/mobileMangaDetailProgress";
import { getCachedMobileSourceDetail, makeMobileSourceDetailCacheKey } from "@/lib/mobileSourceDetailCache";
import type { useMobileDataStore } from "@/data/mobileDataContext";

export type ReaderChapterListData = {
  preference: MobileChapterListPreference;
  progressById: Record<string, LocalChapterProgress | undefined>;
  /** The detail page's list, for a reader whose chapter failed before the source gave one. */
  cachedChapters: ChapterSummary[];
};

const NO_DATA: ReaderChapterListData = {
  preference: DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE,
  progressById: {},
  cachedChapters: [],
};

/**
 * What the chapter sheet shows besides the reader's own list, read when it
 * opens: the detail page's sort, every chapter's progress. Null until read, so
 * the sheet presents once, in its final order and scrolled to its final place.
 */
export function useReaderChapterListData(input: {
  open: boolean;
  store: ReturnType<typeof useMobileDataStore>;
  source: LocalSourceLink;
  installedSources: InstalledSource[];
  libraryItemId: string | null;
  /** The list is in: the detail cache is not needed. */
  chaptersKnown: boolean;
}): ReaderChapterListData | null {
  const { open, store, source, installedSources, libraryItemId, chaptersKnown } = input;
  const [data, setData] = useState<ReaderChapterListData | null>(null);
  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      store.getSettings().catch(() => null),
      loadMobileChapterProgressForSource(store, source, installedSources).catch(() => ({})),
      chaptersKnown
        ? null
        : getCachedMobileSourceDetail(
            makeMobileSourceDetailCacheKey(source.registryId, source.sourceId, source.sourceMangaId),
          ).catch(() => null),
    ]).then(([settings, progressById, cached]) => {
      if (cancelled) return;
      const saved = libraryItemId ? settings?.mobileChapterListPreferences?.[libraryItemId] : undefined;
      setData({
        ...NO_DATA,
        preference: normalizeMobileChapterListPreference(saved),
        progressById,
        cachedChapters: cached?.payload.chapters ?? [],
      });
    });
    return () => {
      cancelled = true;
    };
    // One read per presentation; the list and its source don't move under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return data;
}
