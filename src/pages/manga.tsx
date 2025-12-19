import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useStores } from "@/data/context";
import type { Manga, Chapter } from "@/lib/sources";
import type { ChapterProgress } from "@/data/schema";
import { Keys } from "@/data/keys";
import { CoverImage } from "@/components/cover-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  PlayIcon,
  Add01Icon,
  CheckmarkCircle02Icon,
  Bookmark02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function MangaPage() {
  const { registryId, sourceId, mangaId } = useParams({ strict: false }) as {
    registryId: string;
    sourceId: string;
    mangaId: string;
  };
  const navigate = useNavigate();
  const { useSettingsStore, useLibraryStore, useHistoryStore } = useStores();
  const { getSource } = useSettingsStore();
  const {
    mangas,
    add: addToLibrary,
    remove: removeFromLibrary,
    isInLibrary,
  } = useLibraryStore();
  const { getMangaProgress } = useHistoryStore();

  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<Record<string, ChapterProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inLibrary = isInLibrary(registryId, sourceId, mangaId);
  const libraryManga = mangas.find((m) =>
    m.sources.some(
      (s) =>
        s.registryId === registryId &&
        s.sourceId === sourceId &&
        s.mangaId === mangaId
    )
  );

  // Load manga data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const source = await getSource(registryId, sourceId);
        if (!source) {
          setError("Source not found");
          setLoading(false);
          return;
        }

        const [mangaData, chaptersData] = await Promise.all([
          source.getManga(mangaId),
          source.getChapters(mangaId),
        ]);

        if (cancelled) return;
        setManga(mangaData);
        setChapters(chaptersData);

        // Load reading progress (only if in library)
        if (libraryManga) {
          const historyRecord = await getMangaProgress(libraryManga.id);
          setProgress(historyRecord);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registryId, sourceId, mangaId, getSource, getMangaProgress, libraryManga]);

  const handleLibraryToggle = useCallback(async () => {
    if (!manga) return;

    if (inLibrary && libraryManga) {
      await removeFromLibrary(libraryManga.id);
    } else {
      await addToLibrary({
        id: Keys.manga(registryId, sourceId, mangaId),
        title: manga.title,
        cover: manga.cover,
        addedAt: Date.now(),
        sources: [{ registryId, sourceId, mangaId }],
        activeRegistryId: registryId,
        activeSourceId: sourceId,
        history: {},
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
    removeFromLibrary,
  ]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4 size-8" />
          <p className="text-muted-foreground">Loading manga details...</p>
        </div>
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-destructive">Failed to load manga</p>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate({ to: "/search", search: { q: "" } })}
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const firstChapter = chapters[chapters.length - 1];
  const lastReadChapter = chapters.find((ch) => {
    const p = progress[ch.id];
    return p && !p.completed;
  });
  const continueChapter = lastReadChapter ?? firstChapter;

  return (
    <div className="space-y-8">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/search", search: { q: "" } })}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
        Back to Search
      </Button>

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
          <h1 className="text-3xl font-bold tracking-tight">{manga.title}</h1>

          {manga.authors && manga.authors.length > 0 && (
            <p className="text-muted-foreground">by {manga.authors.join(", ")}</p>
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
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
                  {lastReadChapter ? "Continue Reading" : "Start Reading"}
                </Button>
              </Link>
            )}

            <Button
              size="lg"
              variant={inLibrary ? "secondary" : "outline"}
              onClick={handleLibraryToggle}
            >
              <HugeiconsIcon icon={inLibrary ? Bookmark02Icon : Add01Icon} />
              {inLibrary ? "In Library" : "Add to Library"}
            </Button>
          </div>
        </div>
      </div>

      {/* Chapters */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">
          Chapters
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({chapters.length})
          </span>
        </h2>

        <div className="space-y-1">
          {chapters.map((chapter) => {
            const chapterProgress = progress[chapter.id];
            const isRead = chapterProgress?.completed;
            const isInProgress = chapterProgress && !chapterProgress.completed;

            return (
              <Link
                key={chapter.id}
                to="/sources/$registryId/$sourceId/$mangaId/$chapterId"
                params={{
                  registryId,
                  sourceId,
                  mangaId: manga.id,
                  chapterId: chapter.id,
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted",
                  isRead && "opacity-60"
                )}
              >
                <div className="flex items-center gap-3">
                  {isRead && (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      className="size-5 text-green-500"
                    />
                  )}
                  <div>
                    <p className="font-medium">
                      Ch. {chapter.chapterNumber ?? "?"}
                      {chapter.title && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {chapter.title}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {chapter.scanlator && `${chapter.scanlator} • `}
                      {chapter.dateUploaded &&
                        new Date(chapter.dateUploaded).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {isInProgress && (
                  <span className="text-xs text-muted-foreground">
                    Page {chapterProgress.progress + 1}/{chapterProgress.total}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
