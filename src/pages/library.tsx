import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStores, useAllMangaProgress } from "@/data/context";
import { MangaCard } from "@/components/manga-card";
import { LibraryPageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import { LibraryEmpty } from "@/components/library-empty";
import { SourceImageProvider } from "@/hooks/use-source-image";
import type { ChapterSummary, LocalMangaProgress } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";
import {
  getEntryEffectiveMetadata,
  getEntryCover,
  entryHasAnyUpdate,
  getEntryMostRecentSource,
  getEntryAddedAt,
} from "@/data/view";
import { formatChapterShort } from "@/lib/format-chapter";
import type { Chapter } from "@/lib/sources";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const REFRESH_STORAGE_KEY = "library_last_refresh";
const MAX_CONCURRENT_REQUESTS = 5;

/** Find the chapter with the highest chapter number */
function findLatestChapter(chapters: Chapter[]): ChapterSummary | null {
  if (chapters.length === 0) return null;
  const latest = chapters.reduce((best, ch) => {
    const bestNum = best.chapterNumber ?? -Infinity;
    const chNum = ch.chapterNumber ?? -Infinity;
    return chNum > bestNum ? ch : best;
  }, chapters[0]);
  return {
    id: latest.id,
    title: latest.title,
    chapterNumber: latest.chapterNumber,
    volumeNumber: latest.volumeNumber,
  };
}

/** Build progress map from manga progress index */
function buildProgressMap(
  entry: LibraryEntry,
  progressIndex: Map<string, LocalMangaProgress>
): Map<string, LocalMangaProgress> {
  const progress = new Map<string, LocalMangaProgress>();
  for (const source of entry.sources) {
    const key = makeMangaProgressId(source.registryId, source.sourceId, source.sourceMangaId);
    const p = progressIndex.get(key);
    if (p) {
      progress.set(source.id, p);
    }
  }
  return progress;
}

/** Compute progress display info for a library entry */
function useProgressInfo(
  entry: LibraryEntry,
  progressIndex: Map<string, LocalMangaProgress>,
  t: (key: string) => string
) {
  return useMemo(() => {
    const progress = buildProgressMap(entry, progressIndex);
    // Get most recently read source for progress display
    const recentSource = getEntryMostRecentSource(entry, progress);
    if (!recentSource) {
      return { badge: undefined, subtitle: t("library.unread"), lastReadAt: undefined };
    }

    const sourceProgress = progress.get(recentSource.id);
    const lastReadAt = sourceProgress?.lastReadAt;

    // "Updated" badge: any source has new chapters
    const hasNewChapters = entryHasAnyUpdate(entry);

    // Get latest chapter from most recent source
    const latestChapter = recentSource.latestChapter;

    // "Caught up": user has read the latest chapter
    const isCaughtUp =
      sourceProgress?.lastReadSourceChapterId != null &&
      latestChapter != null &&
      sourceProgress.lastReadSourceChapterId === latestChapter.id;

    // Build ChapterSummary-like object for formatting
    const lastReadChapter = sourceProgress?.lastReadSourceChapterId ? {
      id: sourceProgress.lastReadSourceChapterId,
      chapterNumber: sourceProgress.lastReadChapterNumber,
      volumeNumber: sourceProgress.lastReadVolumeNumber,
      title: sourceProgress.lastReadChapterTitle,
    } : undefined;

    let subtitle: string;
    if (isCaughtUp) {
      subtitle = t("library.caughtUp");
    } else if (lastReadChapter && latestChapter) {
      // Show both: "第5章 / 第82章" (localized)
      subtitle = `${formatChapterShort(lastReadChapter)} / ${formatChapterShort(latestChapter)}`;
    } else if (lastReadChapter) {
      // Only have last read
      subtitle = formatChapterShort(lastReadChapter);
    } else {
      subtitle = t("library.unread");
    }

    return {
      badge: hasNewChapters ? t("library.updated") : undefined,
      subtitle,
      lastReadAt,
    };
  }, [entry, progressIndex, t]);
}

let libraryPageRenders = 0;
const libraryPagePrev = { entries: 0, sources: 0, libLoading: true, setLoading: true };

export function LibraryPage() {
  const renderNum = ++libraryPageRenders;
  const { t } = useTranslation();
  const { useLibraryStore, useSettingsStore } = useStores();
  const progressIndex = useAllMangaProgress();
  const { entries, loading: libraryLoading, updateLatestChapter } = useLibraryStore();
  const { installedSources, loading: settingsLoading, getSource } = useSettingsStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  // Debug: track what changed
  const changes: string[] = [];
  if (libraryPagePrev.entries !== entries.length) changes.push(`entries: ${libraryPagePrev.entries}→${entries.length}`);
  if (libraryPagePrev.sources !== installedSources.length) changes.push(`sources: ${libraryPagePrev.sources}→${installedSources.length}`);
  if (libraryPagePrev.libLoading !== libraryLoading) changes.push(`libLoading: ${libraryPagePrev.libLoading}→${libraryLoading}`);
  if (libraryPagePrev.setLoading !== settingsLoading) changes.push(`setLoading: ${libraryPagePrev.setLoading}→${settingsLoading}`);
  libraryPagePrev.entries = entries.length;
  libraryPagePrev.sources = installedSources.length;
  libraryPagePrev.libLoading = libraryLoading;
  libraryPagePrev.setLoading = settingsLoading;
  console.log(`[LibraryPage] render #${renderNum}`, changes.length > 0 ? `CHANGED: ${changes.join(", ")}` : "(no change)");

  // Refresh library: fetch chapters for ALL sources of each entry
  const refreshLibrary = useCallback(async () => {
    if (refreshingRef.current || entries.length === 0) return;
    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      // Process entries in chunks of MAX_CONCURRENT_REQUESTS
      for (let i = 0; i < entries.length; i += MAX_CONCURRENT_REQUESTS) {
        const chunk = entries.slice(i, i + MAX_CONCURRENT_REQUESTS);
        await Promise.all(
          chunk.map(async (entry) => {
            // Fetch all sources for this entry
            await Promise.all(
              entry.sources.map(async (sourceLink) => {
                try {
                  const source = await getSource(sourceLink.registryId, sourceLink.sourceId);
                  if (!source) return;

                  const chapters = await source.getChapters(sourceLink.sourceMangaId);
                  const latest = findLatestChapter(chapters);
                  if (latest) {
                    await updateLatestChapter(
                      sourceLink.registryId,
                      sourceLink.sourceId,
                      sourceLink.sourceMangaId,
                      latest
                    );
                  }
                } catch (e) {
                  // Silently skip failed sources
                  console.warn(
                    `[Library] Failed to refresh source ${sourceLink.sourceId}:`,
                    e
                  );
                }
              })
            );
          })
        );
      }
      // Save last refresh time
      localStorage.setItem(REFRESH_STORAGE_KEY, Date.now().toString());
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [entries, getSource, updateLatestChapter]);

  // Check if refresh is needed (stale > 30 min)
  const checkAndRefresh = useCallback(() => {
    const lastRefresh = localStorage.getItem(REFRESH_STORAGE_KEY);
    const isStale = !lastRefresh || Date.now() - Number(lastRefresh) > REFRESH_INTERVAL_MS;
    if (isStale) {
      refreshLibrary();
    }
  }, [refreshLibrary]);

  // On mount: check if stale and refresh
  useEffect(() => {
    checkAndRefresh();
    const interval = setInterval(checkAndRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkAndRefresh]);

  // Sort: Updated entries first, then by most recent activity
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      // 1. Updated entries first
      const aUpdated = entryHasAnyUpdate(a);
      const bUpdated = entryHasAnyUpdate(b);
      if (aUpdated !== bUpdated) return aUpdated ? -1 : 1;

      // 2. By most recent activity: max(lastReadAt, addedAt)
      const aProgress = buildProgressMap(a, progressIndex);
      const bProgress = buildProgressMap(b, progressIndex);
      const aSource = getEntryMostRecentSource(a, aProgress);
      const bSource = getEntryMostRecentSource(b, bProgress);
      const aReadTime = aSource ? (aProgress.get(aSource.id)?.lastReadAt ?? 0) : 0;
      const bReadTime = bSource ? (bProgress.get(bSource.id)?.lastReadAt ?? 0) : 0;
      const aTime = Math.max(aReadTime, getEntryAddedAt(a));
      const bTime = Math.max(bReadTime, getEntryAddedAt(b));
      return bTime - aTime;
    });
  }, [entries, progressIndex]);

  const loading = libraryLoading || settingsLoading;
  const hasNoSources = installedSources.length === 0;
  const hasNoEntries = entries.length === 0;

  if (loading) {
    return <LibraryPageSkeleton />;
  }

  if (hasNoSources) {
    return <LibraryEmpty variant="no-sources" />;
  }

  if (hasNoEntries) {
    return <LibraryEmpty variant="no-manga" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.library")} loading={isRefreshing} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
        {sortedEntries.map((entry) => (
          <LibraryEntryCard key={entry.item.libraryItemId} entry={entry} progressIndex={progressIndex} />
        ))}
      </div>
    </div>
  );
}

/** Individual library entry card with progress info */
function LibraryEntryCard({ entry, progressIndex }: { entry: LibraryEntry; progressIndex: Map<string, LocalMangaProgress> }) {
  const { t } = useTranslation();
  const { badge, subtitle } = useProgressInfo(entry, progressIndex, t);

  // Use most recent source for cover image context
  const progress = buildProgressMap(entry, progressIndex);
  const recentSource = getEntryMostRecentSource(entry, progress) ?? entry.sources[0];
  const sourceKey = recentSource ? `${recentSource.registryId}:${recentSource.sourceId}` : "";
  const metadata = getEntryEffectiveMetadata(entry);
  const cover = getEntryCover(entry);

  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <MangaCard
        to="/library/$id"
        params={{ id: entry.item.libraryItemId }}
        cover={cover}
        title={metadata.title}
        subtitle={subtitle}
        badge={badge}
      />
    </SourceImageProvider>
  );
}
