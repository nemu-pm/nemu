import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { MangaCard } from "@/components/manga-card";
import { Button } from "@/components/ui/button";
import { LibraryPageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import { NoSourcesEmpty } from "@/components/no-sources-empty";
import { PageEmpty } from "@/components/page-empty";
import { Book01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { SourceImageProvider } from "@/hooks/use-source-image";
import { formatChapterShort } from "@/lib/format-chapter";
import type { LibraryManga, ChapterSummary } from "@/data/schema";
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

/** Check if "Updated" badge should show for a manga */
function hasUpdatedBadge(manga: LibraryManga): boolean {
  const { latestChapter, seenLatestChapter } = manga;
  return (
    latestChapter?.chapterNumber != null &&
    seenLatestChapter?.chapterNumber != null &&
    latestChapter.chapterNumber > seenLatestChapter.chapterNumber
  );
}

/** Compute progress display info for a library manga */
function useProgressInfo(manga: LibraryManga, t: (key: string) => string) {
  return useMemo(() => {
    const { lastReadChapter, latestChapter, seenLatestChapter } = manga;

    // "Updated" badge: new chapters since user last viewed
    // Only compare if both have valid chapter numbers
    const hasNewChapters =
      latestChapter?.chapterNumber != null &&
      seenLatestChapter?.chapterNumber != null &&
      latestChapter.chapterNumber > seenLatestChapter.chapterNumber;

    // "Caught up": user has read the latest chapter
    // Require valid chapter numbers on both, or same chapter ID
    const isCaughtUp =
      lastReadChapter &&
      latestChapter &&
      (lastReadChapter.id === latestChapter.id ||
        (lastReadChapter.chapterNumber != null &&
          latestChapter.chapterNumber != null &&
          lastReadChapter.chapterNumber >= latestChapter.chapterNumber));

    // Subtitle text
    let subtitle: string;
    if (isCaughtUp) {
      subtitle = t("library.caughtUp");
    } else if (lastReadChapter && latestChapter) {
      subtitle = `${formatChapterShort(lastReadChapter)} / ${formatChapterShort(latestChapter)}`;
    } else if (lastReadChapter) {
      subtitle = formatChapterShort(lastReadChapter);
    } else {
      subtitle = t("library.unread");
    }

    return {
      badge: hasNewChapters ? t("library.updated") : undefined,
      subtitle,
    };
  }, [manga, t]);
}

export function LibraryPage() {
  const { t } = useTranslation();
  const { useLibraryStore, useSettingsStore } = useStores();
  const { mangas, loading: libraryLoading, updateLatestChapter } = useLibraryStore();
  const { installedSources, loading: settingsLoading, getSource } = useSettingsStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  // Refresh library: fetch latest chapters for all manga
  const refreshLibrary = useCallback(async () => {
    if (refreshingRef.current || mangas.length === 0) return;
    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      // Process manga in chunks of MAX_CONCURRENT_REQUESTS
      for (let i = 0; i < mangas.length; i += MAX_CONCURRENT_REQUESTS) {
        const chunk = mangas.slice(i, i + MAX_CONCURRENT_REQUESTS);
        await Promise.all(
          chunk.map(async (manga) => {
            try {
              const { activeRegistryId, activeSourceId } = manga;
              const activeSourceLink = manga.sources.find(
                (s) => s.registryId === activeRegistryId && s.sourceId === activeSourceId
              );
              if (!activeSourceLink) return;

              const source = await getSource(activeRegistryId, activeSourceId);
              if (!source) return;

              const chapters = await source.getChapters(activeSourceLink.mangaId);
              const latest = findLatestChapter(chapters);
              if (latest) {
                await updateLatestChapter(
                  activeRegistryId,
                  activeSourceId,
                  activeSourceLink.mangaId,
                  latest
                );
              }
            } catch (e) {
              // Silently skip failed manga
              console.warn(`[Library] Failed to refresh ${manga.title}:`, e);
            }
          })
        );
      }
      // Save last refresh time
      localStorage.setItem(REFRESH_STORAGE_KEY, Date.now().toString());
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [mangas, getSource, updateLatestChapter]);

  // Check if refresh is needed (stale > 30 min)
  const checkAndRefresh = useCallback(() => {
    const lastRefresh = localStorage.getItem(REFRESH_STORAGE_KEY);
    const isStale = !lastRefresh || Date.now() - Number(lastRefresh) > REFRESH_INTERVAL_MS;
    if (isStale) {
      refreshLibrary();
    }
  }, [refreshLibrary]);

  // On mount: check if stale and refresh
  // Also set up interval for periodic refresh
  useEffect(() => {
    // Initial check on mount
    checkAndRefresh();

    // Set up interval for periodic refresh
    const interval = setInterval(checkAndRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkAndRefresh]);

  // Sort: Updated manga first, then by lastReadAt, then by addedAt
  const sortedMangas = useMemo(() => {
    return [...mangas].sort((a, b) => {
      // 1. Updated manga first
      const aUpdated = hasUpdatedBadge(a);
      const bUpdated = hasUpdatedBadge(b);
      if (aUpdated !== bUpdated) return aUpdated ? -1 : 1;
      // 2. By lastReadAt (most recent first)
      const aTime = a.lastReadAt ?? 0;
      const bTime = b.lastReadAt ?? 0;
      if (aTime !== bTime) return bTime - aTime;
      // 3. Fall back to addedAt
      return b.addedAt - a.addedAt;
    });
  }, [mangas]);

  const loading = libraryLoading || settingsLoading;
  const hasNoSources = installedSources.length === 0;
  const hasNoMangas = mangas.length === 0;

  if (loading) {
    return <LibraryPageSkeleton />;
  }

  // Empty state: no sources installed
  if (hasNoSources) {
    return (
      <NoSourcesEmpty
        icon={Book01Icon}
        titleKey="library.noSources"
        descriptionKey="library.noSourcesDescription"
        buttonKey="library.addSource"
      />
    );
  }

  // Empty state: no mangas in library
  if (hasNoMangas) {
    return (
      <PageEmpty
        icon={Book01Icon}
        title={t("library.empty")}
        description={t("library.emptyDescription")}
        action={
          <Link to="/search" search={{ q: "" }}>
            <Button>{t("library.startSearching")}</Button>
          </Link>
        }
      />
    );
  }

  // Library grid
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.library")} loading={isRefreshing} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
        {sortedMangas.map((manga) => (
          <LibraryMangaCard key={manga.id} manga={manga} />
        ))}
      </div>
    </div>
  );
}

/** Individual library manga card with progress info */
function LibraryMangaCard({ manga }: { manga: LibraryManga }) {
  const { t } = useTranslation();
  const { badge, subtitle } = useProgressInfo(manga, t);

  const activeSource = manga.sources.find(
    (s) =>
      s.registryId === manga.activeRegistryId &&
      s.sourceId === manga.activeSourceId
  );
  const sourceKey = `${manga.activeRegistryId}:${manga.activeSourceId}`;

  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <MangaCard
        to="/sources/$registryId/$sourceId/$mangaId"
        params={{
          registryId: manga.activeRegistryId,
          sourceId: manga.activeSourceId,
          mangaId: activeSource?.mangaId ?? "",
        }}
        cover={manga.cover}
        title={manga.title}
        subtitle={subtitle}
        badge={badge}
      />
    </SourceImageProvider>
  );
}
