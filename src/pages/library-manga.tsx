import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStores, useMangaProgressIndex, useChapterProgress, type MangaProgressIndex } from "@/data/context";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MangaPageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlayIcon,
  RefreshIcon,
  Delete02Icon,
  Add01Icon,
  Alert02Icon,
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
import { MetadataFetchDialog } from "@/components/metadata-fetch-dialog";
import { MangaStatus } from "@/lib/sources/types";

/** Status badge color and label */
function getStatusInfo(status?: number) {
  switch (status) {
    case MangaStatus.Ongoing:
      return { label: "Ongoing", variant: "default" as const };
    case MangaStatus.Completed:
      return { label: "Completed", variant: "secondary" as const };
    case MangaStatus.Hiatus:
      return { label: "Hiatus", variant: "outline" as const };
    case MangaStatus.Cancelled:
      return { label: "Cancelled", variant: "destructive" as const };
    default:
      return null;
  }
}

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

/** Build progress map from manga progress index (canonical) */
function buildProgressMap(
  entry: LibraryEntry,
  progressIndex: MangaProgressIndex
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
  const { useSettingsStore, useLibraryStore } = useStores();
  const { index: progressIndex } = useMangaProgressIndex();
  const { getSource, availableSources } = useSettingsStore();
  const {
    entries,
    loading: libraryLoading,
    remove: removeFromLibrary,
    acknowledgeUpdate,
    updateMetadata,
  } = useLibraryStore();

  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [chaptersMap, setChaptersMap] = useState<Record<string, Chapter[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);

  const entry = useMemo<LibraryEntry | undefined>(
    () => entries.find((e) => e.item.libraryItemId === id),
    [entries, id]
  );

  // Select most recently read source as default tab once entry is available.
  useEffect(() => {
    if (!entry) return;
    const progress = buildProgressMap(entry, progressIndex);
    const mostRecent = getEntryMostRecentSource(entry, progress);
    if (!mostRecent) return;
    const idx = entry.sources.findIndex((s) => s.id === mostRecent.id);
    setSelectedSourceIdx(idx >= 0 ? idx : 0);
  }, [entry, progressIndex]);

  const selectedSource = entry?.sources[selectedSourceIdx];

  // Load chapter progress on-demand for selected source
  const { chapters: chapterProgress, loading: chapterProgressLoading } = useChapterProgress(
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

  // Load chapters for selected source
  useEffect(() => {
    if (!entry || !selectedSource) return;

    const sourceKey = makeSourceKey(
      selectedSource.registryId,
      selectedSource.sourceId,
      selectedSource.sourceMangaId
    );

    // Skip if already loaded
    if (chaptersMap[sourceKey]) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const source = await getSource(selectedSource.registryId, selectedSource.sourceId);
        if (!source) {
          setError(t("manga.sourceNotFound"));
          setLoading(false);
          return;
        }

        // SWR: Try cached data first
        if (hasSWR(source)) {
          const cachedChapters = await source.getCachedChapters(selectedSource.sourceMangaId);
          if (cancelled) return;
          if (cachedChapters) {
            setChaptersMap((prev) => ({ ...prev, [sourceKey]: cachedChapters }));
            setLoading(false);
          }
        }

        // Fetch fresh data
        const chaptersData = await source.getChapters(selectedSource.sourceMangaId);
        if (cancelled) return;
        setChaptersMap((prev) => ({ ...prev, [sourceKey]: chaptersData }));
        setLoading(false);

        // Acknowledge update when user views this source
        if (chaptersData.length > 0) {
          const latest = findLatestChapter(chaptersData);
          if (latest) {
            await acknowledgeUpdate(
              selectedSource.registryId,
              selectedSource.sourceId,
              selectedSource.sourceMangaId,
              latest
            );
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry, selectedSource, chaptersMap, getSource, acknowledgeUpdate, t]);

  const handleRemove = useCallback(async () => {
    if (!entry) return;
    await removeFromLibrary(entry.item.libraryItemId);
    window.history.back();
  }, [entry, removeFromLibrary]);

  const handleMetadataSelect = useCallback(async (
    metadata: MangaMetadata,
    externalIds: ExternalIds
  ) => {
    if (!entry) return;
    await updateMetadata(entry.item.libraryItemId, metadata, externalIds);
  }, [entry, updateMetadata]);

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
    return (
      <PageEmpty
        icon={Alert02Icon}
        title={t("manga.failedToLoad")}
        description={t("library.mangaNotFound")}
      />
    );
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
            <Button variant="outline" onClick={() => window.history.back()}>
              {t("common.back")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await removeFromLibrary(entry.item.libraryItemId);
                } finally {
                  window.history.back();
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
  const statusInfo = getStatusInfo(effectiveMetadata.status);

  // Get most recent source for continue reading
  const progressMap = buildProgressMap(entry, progressIndex);
  const mostRecentSource = getEntryMostRecentSource(entry, progressMap) ?? entry.sources[0];
  const mostRecentProgress = mostRecentSource ? progressMap.get(mostRecentSource.id) : undefined;
  const lastReadChapterId = mostRecentProgress?.lastReadSourceChapterId;

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
    : `${entry.sources[0].registryId}:${entry.sources[0].sourceId}`;

  const isLoadingChapters = loading || chapterProgressLoading;

  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <div className="space-y-8">
        <PageHeader title={t("nav.library")} />

        {/* Hero section */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Cover */}
          <div className="shrink-0">
            <CoverImage
              src={effectiveCover}
              alt={effectiveMetadata.title}
              className="mx-auto aspect-[3/4] w-48 rounded-lg object-cover shadow-xl md:w-56"
            />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <div className="flex items-start gap-3">
              <h2 className="flex-1 text-2xl font-bold selectable">
                {effectiveMetadata.title}
              </h2>
              {statusInfo && (
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              )}
            </div>

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
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground selectable">
                {effectiveMetadata.description}
              </p>
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
                    <HugeiconsIcon icon={PlayIcon} />
                    {lastReadChapterId && continueChapter
                      ? t("manga.continueReading", {
                          chapter: formatChapterTitle(continueChapter),
                        })
                      : t("manga.startReading")}
                  </Button>
                </Link>
              )}

              <Button
                size="lg"
                variant="outline"
                onClick={() => setMetadataDialogOpen(true)}
              >
                <HugeiconsIcon icon={RefreshIcon} />
                {t("library.fetchMetadata")}
              </Button>

              <Button
                size="lg"
                variant="ghost"
                onClick={() => setRemoveConfirmOpen(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          </div>
        </div>

        {/* Chapters with source tabs */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("manga.chapters")}</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // TODO: Open add source dialog
                console.log("Add source");
              }}
            >
              <HugeiconsIcon icon={Add01Icon} className="mr-1.5 size-4" />
              {t("library.addSource")}
            </Button>
          </div>

          <Tabs
            value={String(selectedSourceIdx)}
            onValueChange={(v) => {
              setSelectedSourceIdx(Number(v));
              setLoading(true);
            }}
          >
            <TabsList className="mb-4 flex-wrap h-auto">
              {entry.sources.map((source, idx) => {
                const info = availableSources.find(
                  (s) => s.id === source.sourceId && s.registryId === source.registryId
                );
                const hasUpdate = sourceHasUpdate(source);

                return (
                  <TabsTrigger
                    key={source.id}
                    value={String(idx)}
                    className="gap-2"
                  >
                    {info?.icon && (
                      <img src={info.icon} alt="" className="size-4 rounded" />
                    )}
                    {info?.name ?? source.sourceId}
                    {hasUpdate && (
                      <Badge variant="destructive" className="ml-1 px-1.5 text-[10px]">
                        NEW
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {entry.sources.map((source, idx) => (
              <TabsContent key={idx} value={String(idx)}>
                {selectedSourceIdx === idx && (
                  <>
                    {isLoadingChapters ? (
                      <div className="py-8 text-center text-muted-foreground">
                        {t("common.loading")}
                      </div>
                    ) : chapters.length > 0 ? (
                      <ChapterGrid
                        chapters={chapters}
                        progress={progress}
                        registryId={source.registryId}
                        sourceId={source.sourceId}
                        mangaId={source.sourceMangaId}
                      />
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        {t("manga.noChapters")}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
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

        {/* Metadata fetch dialog */}
        <MetadataFetchDialog
          open={metadataDialogOpen}
          onOpenChange={setMetadataDialogOpen}
          currentTitle={effectiveMetadata.title}
          onSelect={handleMetadataSelect}
        />
      </div>
    </SourceImageProvider>
  );
}
