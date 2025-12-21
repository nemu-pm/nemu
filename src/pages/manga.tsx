import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import type { Manga, Chapter } from "@/lib/sources";
import { hasSWR } from "@/lib/sources";
import type { HistoryEntry } from "@/data/schema";
import { Keys } from "@/data/keys";
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

export function MangaPage() {
  const { t } = useTranslation();
  const { registryId, sourceId, mangaId } = useParams({ strict: false }) as {
    registryId: string;
    sourceId: string;
    mangaId: string;
  };
  const { useSettingsStore, useLibraryStore, useHistoryStore } = useStores();
  const { getSource, availableSources } = useSettingsStore();
  
  const sourceInfo = availableSources.find(
    (s) => s.id === sourceId && s.registryId === registryId
  );
  const sourceName = sourceInfo?.name ?? sourceId;
  const sourceIcon = sourceInfo?.icon;
  const {
    mangas,
    add: addToLibrary,
    remove: removeFromLibrary,
    isInLibrary,
    updateChapterInfo,
  } = useLibraryStore();
  const { getMangaProgress } = useHistoryStore();

  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<Record<string, HistoryEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  const inLibrary = isInLibrary(registryId, sourceId, mangaId);
  const libraryManga = mangas.find((m) =>
    m.sources.some(
      (s) =>
        s.registryId === registryId &&
        s.sourceId === sourceId &&
        s.mangaId === mangaId
    )
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
          const [cachedManga, cachedChapters, cachedProgress] = await Promise.all([
            source.getCachedManga(mangaId),
            source.getCachedChapters(mangaId),
            getMangaProgress(registryId, sourceId, mangaId),
          ]);
          if (cancelled) return;
          if (cachedManga) {
            setManga(cachedManga);
            setProgress(cachedProgress);
            setLoading(false); // Stop showing loading spinner
          }
          if (cachedChapters) {
            setChapters(cachedChapters);
          }
        }

        // Fetch fresh data (revalidate) + load progress in parallel
        const [mangaData, chaptersData, historyRecord] = await Promise.all([
          source.getManga(mangaId),
          source.getChapters(mangaId),
          getMangaProgress(registryId, sourceId, mangaId),
        ]);

        if (cancelled) return;
        setManga(mangaData);
        setChapters(chaptersData);
        setProgress(historyRecord);
        setLoading(false);

        // Update library manga with latest chapter info (if in library)
        // Find the chapter with the highest chapter number (don't assume sort order)
        if (chaptersData.length > 0) {
          const latestChapter = chaptersData.reduce((latest, ch) => {
            const latestNum = latest.chapterNumber ?? -Infinity;
            const chNum = ch.chapterNumber ?? -Infinity;
            return chNum > latestNum ? ch : latest;
          }, chaptersData[0]);
          updateChapterInfo(registryId, sourceId, mangaId, {
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
  }, [registryId, sourceId, mangaId, getSource, getMangaProgress, updateChapterInfo]);

  const handleLibraryToggle = useCallback(async () => {
    if (!manga) return;

    if (inLibrary && libraryManga) {
      setRemoveConfirmOpen(true);
    } else {
      await addToLibrary({
        id: Keys.manga(registryId, sourceId, mangaId),
        title: manga.title,
        cover: manga.cover,
        addedAt: Date.now(),
        sources: [{ registryId, sourceId, mangaId }],
        activeRegistryId: registryId,
        activeSourceId: sourceId,
      });
    }
  }, [
    manga,
    inLibrary,
    libraryManga,
    registryId,
    sourceId,
    mangaId,
    addToLibrary,
  ]);

  const handleRemoveConfirm = useCallback(async () => {
    if (libraryManga) {
      await removeFromLibrary(libraryManga.id);
      setRemoveConfirmOpen(false);
    }
  }, [libraryManga, removeFromLibrary]);

  const sourceKey = `${registryId}:${sourceId}`;

  if (loading) {
    return <MangaPageSkeleton />;
  }

  if (error || !manga) {
    return (
      <PageEmpty
        icon={Alert02Icon}
        title={t("manga.failedToLoad")}
        description={error ?? undefined}
      />
    );
  }

  const firstChapter = chapters[chapters.length - 1];
  const lastReadChapter = chapters.find((ch) => {
    const p = progress[ch.id];
    return p && !p.completed;
  });
  const continueChapter = lastReadChapter ?? firstChapter;

  return (
    <SourceImageProvider sourceKey={sourceKey}>
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
            <p className="text-muted-foreground selectable">{manga.authors.join(", ")}</p>
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
                  mangaId: manga.id,
                  chapterId: continueChapter.id,
                }}
              >
                <Button size="lg">
                  <HugeiconsIcon icon={PlayIcon} />
                  {lastReadChapter
                    ? t("manga.continueReading", { chapter: formatChapterTitle(lastReadChapter) })
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
              {inLibrary ? t("manga.inLibrary") : t("manga.addToLibrary")}
            </Button>
          </div>
        </div>
      </div>

      {/* Chapters */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">
          {t("manga.chapters")}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({chapters.length})
          </span>
        </h2>

        <ChapterGrid
          chapters={chapters}
          progress={progress}
          registryId={registryId}
          sourceId={sourceId}
          mangaId={manga.id}
        />
      </section>

      <ResponsiveDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("manga.removeFromLibrary")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("manga.removeFromLibraryDescription", { name: manga.title })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveConfirm}
            >
              {t("manga.remove")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
    </SourceImageProvider>
  );
}
