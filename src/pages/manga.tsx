import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStores, useMangaProgressIndex, useChapterProgress } from "@/data/context";
import type { Manga, Chapter } from "@/lib/sources";
import { hasSWR } from "@/lib/sources";
import type { LocalChapterProgress } from "@/data/schema";
import { makeMangaProgressId, makeSourceLinkId } from "@/data/schema";
import { metadataFromSource } from "@/lib/metadata";
import { CoverImage } from "@/components/cover-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MangaPageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlayIcon,
  Add01Icon,
  Bookmark02Icon,
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

export function MangaPage() {
  const { t } = useTranslation();
  const { registryId, sourceId, mangaId } = useParams({ strict: false }) as {
    registryId: string;
    sourceId: string;
    mangaId: string;
  };
  const { useSettingsStore, useLibraryStore } = useStores();
  const { index: progressIndex } = useMangaProgressIndex();
  const { getSource, availableSources } = useSettingsStore();
  
  const sourceInfo = availableSources.find(
    (s) => s.id === sourceId && s.registryId === registryId
  );
  const sourceName = sourceInfo?.name ?? sourceId;
  const sourceIcon = sourceInfo?.icon;
  const {
    entries,
    add: addToLibrary,
    remove: removeFromLibrary,
    isInLibrary,
    acknowledgeUpdate,
  } = useLibraryStore();

  // Load chapter progress on-demand
  const { chapters: chapterProgress, loading: progressLoading } = useChapterProgress(
    registryId,
    sourceId,
    mangaId
  );

  // Convert to ChapterGrid format
  const progress = useMemo(() => {
    return chapterProgressToGridFormat(chapterProgress, registryId, sourceId, mangaId);
  }, [chapterProgress, registryId, sourceId, mangaId]);

  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  const inLibrary = isInLibrary(registryId, sourceId, mangaId);
  // Find library entry that contains this source
  const linkId = makeSourceLinkId(registryId, sourceId, mangaId);
  const libraryEntry = entries.find((e) =>
    e.sources.some((s) => s.id === linkId)
  );

  // Load manga data with SWR pattern
  useEffect(() => {
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const source = await getSource(registryId, sourceId);
        if (!source) {
          setError(t("manga.sourceNotFound"));
          setLoading(false);
          return;
        }

        // SWR: Try to show cached data immediately
        if (hasSWR(source)) {
          const [cachedManga, cachedChapters] = await Promise.all([
            source.getCachedManga(mangaId),
            source.getCachedChapters(mangaId),
          ]);
          if (cancelled) return;
          if (cachedManga) {
            setManga(cachedManga);
            setLoading(false); // Stop showing loading spinner
          }
          if (cachedChapters) {
            setChapters(cachedChapters);
          }
        }

        // Fetch fresh data (revalidate)
        const [mangaData, chaptersData] = await Promise.all([
          source.getManga(mangaId),
          source.getChapters(mangaId),
        ]);

        if (cancelled) return;
        setManga(mangaData);
        setChapters(chaptersData);
        setLoading(false);

        // Acknowledge update (if in library) - clears "Updated" badge
        if (chaptersData.length > 0 && inLibrary) {
          const latestChapter = chaptersData.reduce((latest, ch) => {
            const latestNum = latest.chapterNumber ?? -Infinity;
            const chNum = ch.chapterNumber ?? -Infinity;
            return chNum > latestNum ? ch : latest;
          }, chaptersData[0]);
          acknowledgeUpdate(registryId, sourceId, mangaId, {
            id: latestChapter.id,
            title: latestChapter.title,
            chapterNumber: latestChapter.chapterNumber,
            volumeNumber: latestChapter.volumeNumber,
          });
        }
      } catch (e) {
        if (cancelled) return;
        // Only show error if we have no cached data
        if (!manga) {
          setError(e instanceof Error ? e.message : String(e));
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registryId, sourceId, mangaId, getSource, acknowledgeUpdate, inLibrary]);

  const handleLibraryToggle = useCallback(async () => {
    if (!manga) return;

    if (inLibrary && libraryEntry) {
      setRemoveConfirmOpen(true);
    } else {
      await addToLibrary({
        metadata: metadataFromSource(manga),
        source: { registryId, sourceId, sourceMangaId: mangaId },
      });
    }
  }, [manga, inLibrary, libraryEntry, registryId, sourceId, mangaId, addToLibrary]);

  const handleRemoveConfirm = useCallback(async () => {
    if (libraryEntry) {
      await removeFromLibrary(libraryEntry.item.libraryItemId);
      setRemoveConfirmOpen(false);
    }
  }, [libraryEntry, removeFromLibrary]);

  // Get manga progress for continue reading (from canonical manga_progress)
  const sourceKey = makeMangaProgressId(registryId, sourceId, mangaId);
  const mangaProgress = progressIndex.get(sourceKey);
  const lastReadChapter = mangaProgress?.lastReadSourceChapterId
    ? chapters.find((ch) => ch.id === mangaProgress.lastReadSourceChapterId)
    : undefined;

  // Continue chapter = last read, or first (sorted ascending, so last array element)
  const firstChapter = chapters[chapters.length - 1];
  const continueChapter = lastReadChapter ?? firstChapter;

  const sourceKeyForProvider = `${registryId}:${sourceId}`;

  const isLoading = loading || progressLoading;

  if (isLoading) {
    return <MangaPageSkeleton />;
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

  if (!manga) {
    return (
      <PageEmpty
        icon={Alert02Icon}
        title={t("manga.failedToLoad")}
        description={t("manga.notFound")}
      />
    );
  }

  return (
    <SourceImageProvider sourceKey={sourceKeyForProvider}>
      <div className="space-y-8">
        <PageHeader title={sourceName} icon={sourceIcon} />

        {/* Hero section */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Cover */}
          <div className="shrink-0">
            <CoverImage
              src={manga.cover}
              alt={manga.title}
              className="mx-auto aspect-[3/4] w-48 rounded-lg object-cover shadow-xl md:w-56"
            />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <h2 className="text-2xl font-bold selectable">{manga.title}</h2>

            {manga.authors && manga.authors.length > 0 && (
              <p className="text-muted-foreground selectable">
                {manga.authors.join(", ")}
              </p>
            )}

            {manga.tags && manga.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {manga.tags.slice(0, 10).map((tag, i) => (
                  <Badge key={i} variant="secondary">
                    {tag}
                  </Badge>
                ))}
                {manga.tags.length > 10 && (
                  <Badge variant="outline">+{manga.tags.length - 10}</Badge>
                )}
              </div>
            )}

            {manga.description && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground selectable">
                {manga.description}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              {continueChapter && (
                <Link
                  to="/sources/$registryId/$sourceId/$mangaId/$chapterId"
                  params={{
                    registryId,
                    sourceId,
                    mangaId,
                    chapterId: continueChapter.id,
                  }}
                  search={{ page: undefined }}
                >
                  <Button size="lg">
                    <HugeiconsIcon icon={PlayIcon} />
                    {lastReadChapter
                      ? t("manga.continueReading", {
                          chapter: formatChapterTitle(lastReadChapter),
                        })
                      : t("manga.startReading")}
                  </Button>
                </Link>
              )}

              <Button
                size="lg"
                variant={inLibrary ? "secondary" : "outline"}
                onClick={handleLibraryToggle}
              >
                <HugeiconsIcon icon={inLibrary ? Bookmark02Icon : Add01Icon} />
                {inLibrary
                  ? t("manga.inLibrary")
                  : t("manga.addToLibrary")}
              </Button>
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">{t("manga.chapters")}</h2>

          {chapters.length > 0 ? (
            <ChapterGrid
              chapters={chapters}
              progress={progress}
              registryId={registryId}
              sourceId={sourceId}
              mangaId={mangaId}
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {t("manga.noChapters")}
            </div>
          )}
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
                  name: manga.title,
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
              <Button variant="destructive" onClick={handleRemoveConfirm}>
                {t("manga.remove")}
              </Button>
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>
    </SourceImageProvider>
  );
}
