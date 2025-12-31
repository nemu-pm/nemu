import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { LibraryMangaSearch } from "@/router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStores, useAllMangaProgress, useChapterProgress } from "@/data/context";
import type { Chapter } from "@/lib/sources";
import { hasSWR } from "@/lib/sources";
import type { LocalMangaProgress, LocalChapterProgress, MangaMetadata, ExternalIds } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";
import {
  getEntryEffectiveMetadata,
  getEntryCover,
  getEntryMostRecentSource,
  sourceHasUpdate,
  makeSourceKey,
} from "@/data/view";
import { CoverImage } from "@/components/cover-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceSelector } from "@/components/source-selector";
import { MangaPageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Edit02Icon,
  Delete02Icon,
  Alert02Icon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";
import { formatChapterTitle } from "@/lib/format-chapter";
import { ChapterGrid } from "@/components/chapter-grid";
import { SourceImageProvider } from "@/hooks/use-source-image";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { MetadataEditDialog } from "@/components/metadata-edit-dialog";
import { MangaStatusBadge } from "@/components/manga-status-badge";
import { SourceManageDialog } from "@/components/source-manage-dialog";
import { useSortedSources } from "@/hooks/use-sorted-sources";
import { ExpandableText } from "@/components/ui/expandable-text";
import { usePageTitle } from "@/components/page-title";

/** Find the chapter with the highest chapter number */
function findLatestChapter(chapters: Chapter[]): { id: string; title?: string; chapterNumber?: number; volumeNumber?: number } | null {
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

/** Convert LocalChapterProgress map to ChapterGrid-compatible format */
function chapterProgressToGridFormat(
  chapterProgress: Record<string, LocalChapterProgress>,
  registryId: string,
  sourceId: string,
  mangaId: string
): Record<string, { progress: number; total: number; completed: boolean; dateRead: number; id: string; registryId: string; sourceId: string; mangaId: string; chapterId: string }> {
  const result: Record<string, { progress: number; total: number; completed: boolean; dateRead: number; id: string; registryId: string; sourceId: string; mangaId: string; chapterId: string }> = {};
  for (const [chapterId, cp] of Object.entries(chapterProgress)) {
    result[chapterId] = {
      progress: cp.progress,
      total: cp.total,
      completed: cp.completed,
      dateRead: cp.lastReadAt,
      id: cp.id,
      registryId,
      sourceId,
      mangaId,
      chapterId,
    };
  }
  return result;
}

export function LibraryMangaPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const { source: sourceParam } = useSearch({ strict: false }) as LibraryMangaSearch;
  const navigate = useNavigate();
  const { useSettingsStore, useLibraryStore } = useStores();
  const progressIndex = useAllMangaProgress();
  const { getSource, availableSources } = useSettingsStore();
  const {
    entries,
    loading: libraryLoading,
    remove: removeFromLibrary,
    acknowledgeUpdate,
    updateUserEdits,
  } = useLibraryStore();

  const [chaptersMap, setChaptersMap] = useState<Record<string, Chapter[]>>({});
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [sourceManageOpen, setSourceManageOpen] = useState(false);

  const entry = useMemo<LibraryEntry | undefined>(
    () => entries.find((e) => e.item.libraryItemId === id),
    [entries, id]
  );

  const entryTitle = entry ? getEntryEffectiveMetadata(entry).title : null;
  usePageTitle(entryTitle ? [entryTitle, t("nav.library")] : [t("nav.library")]);

  // Sort sources by user-defined order (UI concern)
  const sortedSources = useSortedSources(entry?.sources ?? [], entry?.item.sourceOrder);

  // Derive selected source from URL param (default to first source)
  const selectedSourceIdx = useMemo(() => {
    if (sortedSources.length === 0) return 0;
    if (!sourceParam) return 0;
    const idx = sortedSources.findIndex((s) => s.id === sourceParam);
    return idx >= 0 ? idx : 0;
  }, [sortedSources, sourceParam]);

  const selectedSource = sortedSources[selectedSourceIdx];

  // If this entry disappears (deleted on another device), navigate back to library.
  useEffect(() => {
    if (libraryLoading) return;
    if (entry) return;
    navigate({ to: "/", replace: true });
  }, [entry, libraryLoading, navigate]);

  // If URL param points to invalid source, clear it
  useEffect(() => {
    if (!entry || entry.sources.length === 0) return;
    if (!sourceParam) return;
    const exists = entry.sources.some((s) => s.id === sourceParam);
    if (!exists) {
      navigate({ to: "/library/$id", params: { id }, search: {}, replace: true });
    }
  }, [entry, sourceParam, id, navigate]);


  // Prefetch all sources' chapters on page load (SWR pattern)
  useEffect(() => {
    if (!entry || entry.sources.length === 0) return;
    let cancelled = false;
    setError(null);

    (async () => {
      // Phase 1: Load cached chapters for ALL sources immediately
      const cachedResults = await Promise.all(
        entry.sources.map(async (source) => {
          const sourceObj = await getSource(source.registryId, source.sourceId);
          if (!sourceObj || !hasSWR(sourceObj)) return null;
          const cached = await sourceObj.getCachedChapters(source.sourceMangaId);
          return { source, chapters: cached };
        })
      );
      if (cancelled) return;

      // Update counts and chaptersMap from cache
      const newCounts: Record<string, number> = {};
      const newChaptersMap: Record<string, Chapter[]> = {};
      for (const result of cachedResults) {
        if (!result?.chapters) continue;
        const key = makeSourceKey(result.source.registryId, result.source.sourceId, result.source.sourceMangaId);
        newCounts[result.source.id] = result.chapters.length;
        newChaptersMap[key] = result.chapters;
      }
      setChapterCounts((prev) => ({ ...prev, ...newCounts }));
      setChaptersMap((prev) => ({ ...prev, ...newChaptersMap }));

      // Phase 2: Background refresh all sources (chapters + manga details for cache)
      const freshResults = await Promise.all(
        entry.sources.map(async (source) => {
          const sourceObj = await getSource(source.registryId, source.sourceId);
          if (!sourceObj) return null;
          try {
            const [chapters] = await Promise.all([
              sourceObj.getChapters(source.sourceMangaId),
              sourceObj.getManga(source.sourceMangaId), // Cache manga details (title, etc.)
            ]);
            return { source, chapters };
          } catch (e) {
            return { source, error: e }; // Track error but don't fail
          }
        })
      );
      if (cancelled) return;

      // Update with fresh data
      let hasAnySuccess = false;
      for (const result of freshResults) {
        if (!result || "error" in result) continue;
        hasAnySuccess = true;
        const key = makeSourceKey(result.source.registryId, result.source.sourceId, result.source.sourceMangaId);
        setChapterCounts((prev) => ({ ...prev, [result.source.id]: result.chapters.length }));
        setChaptersMap((prev) => ({ ...prev, [key]: result.chapters }));
      }

      // If no source succeeded and we have no cached data, show error
      if (!hasAnySuccess && Object.keys(newChaptersMap).length === 0) {
        const firstError = freshResults.find((r) => r && "error" in r);
        if (firstError && "error" in firstError) {
          setError(firstError.error instanceof Error ? firstError.error.message : String(firstError.error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry, getSource]);

  // Load chapter progress on-demand for selected source
  const { chapters: chapterProgress } = useChapterProgress(
    selectedSource?.registryId,
    selectedSource?.sourceId,
    selectedSource?.sourceMangaId
  );

  // Convert to ChapterGrid format
  const progress = useMemo(() => {
    if (!selectedSource) return {};
    return chapterProgressToGridFormat(
      chapterProgress,
      selectedSource.registryId,
      selectedSource.sourceId,
      selectedSource.sourceMangaId
    );
  }, [selectedSource, chapterProgress]);

  // Update loading state when selected source's chapters are available
  useEffect(() => {
    if (!entry || !selectedSource) return;

    const sourceKey = makeSourceKey(
      selectedSource.registryId,
      selectedSource.sourceId,
      selectedSource.sourceMangaId
    );

    // Chapters loaded by prefetch effect
    if (chaptersMap[sourceKey]) {
      setLoading(false);
    }
  }, [entry, selectedSource, chaptersMap]);

  // Acknowledge update when switching to a source tab (even if chapters are cached)
  useEffect(() => {
    if (!selectedSource) return;
    const sourceKey = makeSourceKey(
      selectedSource.registryId,
      selectedSource.sourceId,
      selectedSource.sourceMangaId
    );
    const cached = chaptersMap[sourceKey];
    if (!cached || cached.length === 0) return;

    const latest = findLatestChapter(cached);
    if (!latest) return;
    
    // Skip if already acknowledged this chapter (prevents infinite loop)
    if (selectedSource.updateAckChapter?.id === latest.id) return;
    
    acknowledgeUpdate(
      selectedSource.registryId,
      selectedSource.sourceId,
      selectedSource.sourceMangaId,
      latest
    );
  }, [selectedSource, chaptersMap, acknowledgeUpdate]);

  const handleRemove = useCallback(async () => {
    if (!entry) return;
    await removeFromLibrary(entry.item.libraryItemId);
    navigate({ to: "/", replace: true });
  }, [entry, navigate, removeFromLibrary]);

  const handleMetadataSave = useCallback(async (
    metadataOverrides: Partial<MangaMetadata>,
    externalIds?: ExternalIds,
    coverUrl?: string | null  // null = clear override
  ) => {
    if (!entry) return;
    await updateUserEdits(entry.item.libraryItemId, {
      metadataOverrides: Object.keys(metadataOverrides).length > 0 ? metadataOverrides : undefined,
      coverUrl,
      externalIds,
    });
  }, [entry, updateUserEdits]);

  // Get chapters for selected source
  const chapters = useMemo(() => {
    if (!selectedSource) return [];
    const key = makeSourceKey(
      selectedSource.registryId,
      selectedSource.sourceId,
      selectedSource.sourceMangaId
    );
    return chaptersMap[key] ?? [];
  }, [selectedSource, chaptersMap]);

  if (libraryLoading) {
    return <MangaPageSkeleton />;
  }

  if (!entry) {
    // We'll navigate away in the effect above. Render nothing to avoid a confusing flash.
    return null;
  }

  if (!entry.sources || entry.sources.length === 0) {
    return (
      <PageEmpty
        icon={Alert02Icon}
        title={t("manga.failedToLoad")}
        description={
          `Corrupt library entry: missing source links.\n\n` +
          `libraryItemId: ${entry.item.libraryItemId}\n` +
          `Tip: remove it from library (this only affects local data) then re-add from a source.`
        }
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              {t("common.back")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await removeFromLibrary(entry.item.libraryItemId);
                } finally {
                  navigate({ to: "/", replace: true });
                }
              }}
            >
              {t("library.removeFromLibrary")}
            </Button>
          </div>
        )}
      />
    );
  }

  if (error) {
    return (
      <PageEmpty
        icon={Alert02Icon}
        title={t("manga.failedToLoad")}
        description={error ?? undefined}
      />
    );
  }

  const effectiveMetadata = getEntryEffectiveMetadata(entry);
  const effectiveCover = getEntryCover(entry);

  // Get most recent source for continue reading
  const progressMap = buildProgressMap(entry, progressIndex);
  const mostRecentSource = getEntryMostRecentSource(entry, progressMap) ?? sortedSources[0];
  const mostRecentProgress = mostRecentSource ? progressMap.get(mostRecentSource.id) : undefined;
  const lastReadChapterId = mostRecentProgress?.lastReadSourceChapterId;
  const mostRecentSourceInfo = mostRecentSource
    ? availableSources.find((s) => s.id === mostRecentSource.sourceId && s.registryId === mostRecentSource.registryId)
    : undefined;

  // Find continue chapter from most recent source's chapters
  const mostRecentSourceKey = mostRecentSource
    ? makeSourceKey(mostRecentSource.registryId, mostRecentSource.sourceId, mostRecentSource.sourceMangaId)
    : "";
  const mostRecentChapters = chaptersMap[mostRecentSourceKey] ?? [];
  const firstChapter = mostRecentChapters[mostRecentChapters.length - 1];
  const continueChapter = lastReadChapterId
    ? mostRecentChapters.find((ch) => ch.id === lastReadChapterId) ?? firstChapter
    : firstChapter;

  const sourceKey = selectedSource
    ? `${selectedSource.registryId}:${selectedSource.sourceId}`
    : `${sortedSources[0].registryId}:${sortedSources[0].sourceId}`;

  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <div className="space-y-8">
        <PageHeader
          title={t("nav.library")}
          actions={[
            {
              label: t("library.editMetadata"),
              icon: <HugeiconsIcon icon={Edit02Icon} className="size-4" />,
              onClick: () => setMetadataDialogOpen(true),
            },
            {
              label: t("sources.manageSources"),
              icon: <HugeiconsIcon icon={Layers01Icon} className="size-4" />,
              onClick: () => setSourceManageOpen(true),
            },
            {
              label: t("common.remove"),
              icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
              onClick: () => setRemoveConfirmOpen(true),
            },
          ]}
        />

        {/* Hero section */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Cover with status overlay */}
          <div className="shrink-0 self-center md:self-start">
            <div className="relative mx-auto w-48 md:w-56">
            <CoverImage
              src={effectiveCover}
              alt={effectiveMetadata.title}
                className="aspect-[3/4] w-full rounded-lg object-cover shadow-xl"
              />
              {/* Status badge positioned at bottom of cover */}
              <MangaStatusBadge
                status={effectiveMetadata.status}
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-md"
            />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <h2 className="text-2xl font-bold selectable pt-2 md:pt-0">
                {effectiveMetadata.title}
              </h2>

            {effectiveMetadata.authors && effectiveMetadata.authors.length > 0 && (
              <p className="text-muted-foreground selectable">
                {effectiveMetadata.authors.join(", ")}
              </p>
            )}

            {effectiveMetadata.tags && effectiveMetadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {effectiveMetadata.tags.slice(0, 10).map((tag, i) => (
                  <Badge key={i} variant="secondary">
                    {tag}
                  </Badge>
                ))}
                {effectiveMetadata.tags.length > 10 && (
                  <Badge variant="outline">
                    +{effectiveMetadata.tags.length - 10}
                  </Badge>
                )}
              </div>
            )}

            {effectiveMetadata.description && (
              <ExpandableText
                value={effectiveMetadata.description}
                lines={3}
                className="max-w-2xl"
                textClassName="text-sm leading-relaxed text-muted-foreground selectable whitespace-pre-wrap"
                triggerClassName="justify-start w-fit px-0 hover:bg-transparent"
              />
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              {continueChapter && mostRecentSource && (
                <Link
                  to="/sources/$registryId/$sourceId/$mangaId/$chapterId"
                  params={{
                    registryId: mostRecentSource.registryId,
                    sourceId: mostRecentSource.sourceId,
                    mangaId: mostRecentSource.sourceMangaId,
                    chapterId: continueChapter.id,
                  }}
                  search={{ page: undefined }}
                >
                  <Button size="lg">
                    {mostRecentSourceInfo?.icon && (
                      <img src={mostRecentSourceInfo.icon} alt="" className="size-5 rounded" />
                    )}
                    {lastReadChapterId && continueChapter
                      ? t("manga.continueReading", {
                          chapter: formatChapterTitle(continueChapter),
                        })
                      : t("manga.startReading")}
                  </Button>
                </Link>
              )}

            </div>
          </div>
        </div>

        {/* Chapters with source selector */}
        <section>
          <h2 className="text-xl font-semibold mb-4">{t("manga.chapters")}</h2>

          <SourceSelector
            sources={sortedSources}
            selectedIndex={selectedSourceIdx}
            onSelect={(idx) => {
              const source = sortedSources[idx];
              if (!source) return;
              
              // First source = no param (cleaner URL), others = source param
              navigate({
                to: "/library/$id",
                params: { id },
                search: idx === 0 ? {} : { source: source.id },
                replace: true,
                resetScroll: false,
              });
              
              // Only show loading if we don't have cached chapters (avoids layout shift)
              const sourceKey = makeSourceKey(source.registryId, source.sourceId, source.sourceMangaId);
              if (!chaptersMap[sourceKey]) {
                setLoading(true);
              }
            }}
            getSourceInfo={(source) =>
              availableSources.find(
                (s) => s.id === source.sourceId && s.registryId === source.registryId
              )
            }
            getChapterCount={(source) => chapterCounts[source.id]}
            hasUpdate={sourceHasUpdate}
          />

          {/* Chapter content - min-height prevents scroll reset from layout shift */}
          <div className="mt-4 min-h-[200px]">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : chapters.length > 0 && selectedSource ? (
              <ChapterGrid
                chapters={chapters}
                progress={progress}
                registryId={selectedSource.registryId}
                sourceId={selectedSource.sourceId}
                mangaId={selectedSource.sourceMangaId}
              />
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {t("manga.noChapters")}
              </div>
            )}
          </div>
        </section>

        {/* Remove confirmation dialog */}
        <ResponsiveDialog
          open={removeConfirmOpen}
          onOpenChange={setRemoveConfirmOpen}
        >
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t("manga.removeFromLibrary")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("manga.removeFromLibraryDescription", {
                  name: effectiveMetadata.title,
                })}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogFooter>
              <Button
                variant="outline"
                onClick={() => setRemoveConfirmOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleRemove}>
                {t("manga.remove")}
              </Button>
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* Metadata edit dialog */}
        <MetadataEditDialog
          open={metadataDialogOpen}
          onOpenChange={setMetadataDialogOpen}
          entry={entry}
          onSave={handleMetadataSave}
        />

        {/* Source manage dialog */}
        <SourceManageDialog
          open={sourceManageOpen}
          onOpenChange={setSourceManageOpen}
          entry={entry}
        />
      </div>
    </SourceImageProvider>
  );
}
