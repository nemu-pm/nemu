import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSourcesStore } from "@/stores/sources";
import { useHistoryStore } from "@/stores/history";
import type { Page, Chapter } from "@/providers";
import { Reader } from "@/components/reader";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import type { ReadingMode } from "@/components/reader";

export function ReaderPage() {
  const { registryId, sourceId, mangaId, chapterId } = useParams({
    strict: false,
  }) as {
    registryId: string;
    sourceId: string;
    mangaId: string;
    chapterId: string;
  };
  const navigate = useNavigate();
  const { getSource } = useSourcesStore();
  const { getProgress, saveProgress, markCompleted } = useHistoryStore();

  const [pages, setPages] = useState<Page[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [readingMode, setReadingMode] = useState<ReadingMode>("rtl");
  const [imageUrls, setImageUrls] = useState<Map<number, string>>(new Map());

  // Debounce save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track imageUrls for unmount cleanup only
  const imageUrlsRef = useRef<Map<number, string>>(new Map());

  // Load pages and restore progress
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(0);
    // Clear pages immediately to prevent stale renders
    setPages([]);

    // Revoke old blob URLs before clearing
    setImageUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return new Map<number, string>();
    });

    (async () => {
      try {
        const source = await getSource(registryId, sourceId);
        if (!source) {
          setError("Source not found");
          setLoading(false);
          return;
        }

        const [pagesData, chaptersData] = await Promise.all([
          source.getPages(mangaId, chapterId),
          source.getChapters(mangaId),
        ]);

        if (cancelled) return;
        setPages(pagesData);
        setChapters(chaptersData);

        // Restore reading progress
        const history = await getProgress(registryId, sourceId, mangaId, chapterId);
        if (history && history.progress < pagesData.length) {
          setCurrentPage(history.progress);
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
  }, [registryId, sourceId, mangaId, chapterId, getSource, getProgress]);

  // Auto-save progress (debounced)
  useEffect(() => {
    if (pages.length === 0) return;

    // Clear previous timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce save by 500ms
    saveTimerRef.current = setTimeout(() => {
      saveProgress(registryId, sourceId, mangaId, chapterId, currentPage, pages.length);

      // Mark as completed if on last page
      if (currentPage >= pages.length - 1) {
        markCompleted(registryId, sourceId, mangaId, chapterId);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    currentPage,
    pages.length,
    registryId,
    sourceId,
    mangaId,
    chapterId,
    saveProgress,
    markCompleted,
  ]);

  // Preload images
  useEffect(() => {
    if (pages.length === 0) return;

    let cancelled = false;

    const loadImage = async (index: number) => {
      if (imageUrls.has(index)) return;
      if (cancelled) return;
      try {
        const blob = await pages[index].getImage();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setImageUrls((prev) => {
          const next = new Map(prev).set(index, url);
          imageUrlsRef.current = next;
          return next;
        });
      } catch (e) {
        if (!cancelled) {
          console.error(`Failed to load page ${index}:`, e);
        }
      }
    };

    // Load current page and nearby pages
    const toLoad = [
      currentPage,
      currentPage + 1,
      currentPage + 2,
      currentPage - 1,
    ].filter((i) => i >= 0 && i < pages.length);

    toLoad.forEach(loadImage);

    return () => {
      cancelled = true;
    };
  }, [pages, currentPage, imageUrls]);

  // Cleanup blob URLs on unmount (only runs when component unmounts)
  useEffect(() => {
    return () => {
      imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const currentChapterIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = chapters[currentChapterIndex + 1];
  const nextChapter = chapters[currentChapterIndex - 1];
  const currentChapter = chapters[currentChapterIndex];

  const goToChapter = useCallback(
    (chapter: Chapter) => {
      navigate({
        to: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
        params: { registryId, sourceId, mangaId, chapterId: chapter.id },
      });
    },
    [navigate, registryId, sourceId, mangaId]
  );

  const handleBackgroundClick = useCallback(() => {
    setShowUI((prev) => !prev);
  }, []);

  const renderImage = useCallback(
    (index: number) => {
      const url = imageUrls.get(index);
      if (!url) {
        return (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Spinner className="size-8" />
          </div>
        );
      }
      return (
        <img
          key={`${chapterId}-${index}`}
          src={url}
          alt={`Page ${index + 1}`}
          className="h-full w-full object-contain"
        />
      );
    },
    [imageUrls, chapterId]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Spinner className="mx-auto mb-4 size-8" />
          <p className="text-muted-foreground">Loading chapter...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-destructive">Failed to load chapter</p>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Link
            to="/sources/$registryId/$sourceId/$mangaId"
            params={{ registryId, sourceId, mangaId }}
          >
            <Button variant="outline" className="mt-4">
              Go Back
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      {/* Top bar */}
      <header
        className={`fixed inset-x-0 top-0 z-50 bg-black/80 backdrop-blur transition-transform ${
          showUI ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              to="/sources/$registryId/$sourceId/$mangaId"
              params={{ registryId, sourceId, mangaId }}
            >
              <Button variant="ghost" size="icon-sm">
                <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
              </Button>
            </Link>
            <div className="text-sm text-white">
              <span className="font-medium">
                Ch. {currentChapter?.chapterNumber ?? "?"}
              </span>
              {currentChapter?.title && (
                <span className="ml-2 text-white/60">{currentChapter.title}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">
              {currentPage + 1} / {pages.length}
            </span>
          </div>
        </div>
      </header>

      {/* Reader */}
      <Reader
        key={`${chapterId}-${pages.length}`}
        pageCount={pages.length}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        renderImage={renderImage}
        readingMode={readingMode}
        onBackgroundClick={handleBackgroundClick}
      />

      {/* Bottom bar */}
      <footer
        className={`fixed inset-x-0 bottom-0 z-50 bg-black/80 backdrop-blur transition-transform ${
          showUI ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          {/* Chapter navigation */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!prevChapter}
            onClick={() => prevChapter && goToChapter(prevChapter)}
            className="text-white"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            Prev
          </Button>

          {/* Reading mode */}
          <Select
            value={readingMode}
            onValueChange={(v) => setReadingMode(v as ReadingMode)}
          >
            <SelectTrigger className="w-36 border-white/20 bg-transparent text-white">
              <HugeiconsIcon icon={ViewIcon} className="mr-2 size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rtl">Right to Left</SelectItem>
              <SelectItem value="ltr">Left to Right</SelectItem>
              <SelectItem value="scrolling">Vertical Scroll</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            disabled={!nextChapter}
            onClick={() => nextChapter && goToChapter(nextChapter)}
            className="text-white"
          >
            Next
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
        </div>
      </footer>
    </div>
  );
}
