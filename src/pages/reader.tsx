import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useStores } from "@/data/context";
import { Keys } from "@/data/keys";
import type { Page, Chapter } from "@/lib/sources";
import { Reader, type ReadingMode } from "@/components/reader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  PreviousIcon,
  NextIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";

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
  const { useSettingsStore, useLibraryStore, useHistoryStore } = useStores();
  const { getSource, readingMode, setReadingMode } = useSettingsStore();
  const { isInLibrary } = useLibraryStore();
  const { getProgress, saveProgress, markCompleted } = useHistoryStore();

  // Library manga ID for progress tracking (only works if in library)
  const libraryMangaId = Keys.manga(registryId, sourceId, mangaId);
  const inLibrary = isInLibrary(registryId, sourceId, mangaId);

  const [pages, setPages] = useState<Page[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<number, string>>(new Map());

  // Debounce save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track imageUrls for unmount cleanup only
  const imageUrlsRef = useRef<Map<number, string>>(new Map());
  // Track which pages are currently being loaded to avoid duplicate loads
  const loadingPagesRef = useRef<Set<number>>(new Set());

  // Auto-close settings when toolbar/UI is hidden
  useEffect(() => {
    if (!showUI && settingsOpen) {
      setSettingsOpen(false);
    }
  }, [showUI, settingsOpen]);

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
    imageUrlsRef.current = new Map();
    loadingPagesRef.current.clear();

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

        // Restore reading progress (only if in library)
        if (inLibrary) {
          const progress = await getProgress(libraryMangaId, chapterId);
          if (progress && progress.progress < pagesData.length) {
            setCurrentPage(progress.progress);
          }
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
  }, [registryId, sourceId, mangaId, chapterId, getSource, getProgress, inLibrary, libraryMangaId]);

  // Auto-save progress (debounced, only if in library)
  useEffect(() => {
    if (pages.length === 0 || !inLibrary) return;

    // Clear previous timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce save by 500ms
    saveTimerRef.current = setTimeout(() => {
      saveProgress(libraryMangaId, chapterId, currentPage, pages.length);

      // Mark as completed if on last page
      if (currentPage >= pages.length - 1) {
        markCompleted(libraryMangaId, chapterId);
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
    inLibrary,
    libraryMangaId,
    chapterId,
    saveProgress,
    markCompleted,
  ]);

  // Preload images with eviction for memory pressure
  useEffect(() => {
    if (pages.length === 0) return;

    // Keep pages within this range from current position
    const KEEP_RANGE = 20;

    const loadImage = async (index: number) => {
      // Check if already loaded or currently loading
      if (imageUrlsRef.current.has(index)) return;
      if (loadingPagesRef.current.has(index)) return;

      loadingPagesRef.current.add(index);
      try {
        const blob = await pages[index].getImage();
        const url = URL.createObjectURL(blob);
        setImageUrls((prev) => {
          // Double-check in case it was loaded while we were fetching
          if (prev.has(index)) {
            URL.revokeObjectURL(url);
            return prev;
          }
          const next = new Map(prev).set(index, url);
          imageUrlsRef.current = next;
          return next;
        });
      } catch (e) {
        console.error(`Failed to load page ${index}:`, e);
      } finally {
        loadingPagesRef.current.delete(index);
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

    // Evict pages far from current position to reduce memory pressure
    setImageUrls((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [index, url] of prev) {
        if (Math.abs(index - currentPage) > KEEP_RANGE) {
          URL.revokeObjectURL(url);
          next.delete(index);
          loadingPagesRef.current.delete(index);
          changed = true;
        }
      }
      if (changed) {
        imageUrlsRef.current = next;
        return next;
      }
      return prev;
    });
  }, [pages, currentPage]);

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

  const handleSliderChange = useCallback(
    (value: number | readonly number[]) => {
      const newPage = Array.isArray(value) ? value[0] : value;
      setCurrentPage(newPage);
    },
    []
  );

  const renderImage = useCallback(
    (index: number) => {
      const url = imageUrls.get(index);
      if (!url) {
        return (
          <div className="flex h-full w-full items-center justify-center bg-black">
            <Spinner className="size-8 text-white" />
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
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-xl text-red-400">Failed to load chapter</p>
          <p className="mt-2 text-white/60">{error}</p>
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

  const sliderValue = currentPage;

  // For RTL mode, swap chapter navigation (left button = next, right button = prev)
  const leftChapter = readingMode === "rtl" ? nextChapter : prevChapter;
  const rightChapter = readingMode === "rtl" ? prevChapter : nextChapter;

  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      {/* Top Gradient Header */}
      <header
        className={`absolute left-0 right-0 z-10 reader-gradient-toolbar reader-toolbar-height transition-all duration-300 ${
          showUI ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8 pointer-events-none"
        }`}
      >
        <div
          className="py-4"
          style={{
            paddingLeft: "max(24px, env(safe-area-inset-left, 24px))",
            paddingRight: "max(24px, env(safe-area-inset-right, 24px))",
            paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                to="/sources/$registryId/$sourceId/$mangaId"
                params={{ registryId, sourceId, mangaId }}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white/90 hover:text-white hover:bg-white/20 rounded-xl transition-all duration-200"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
                </Button>
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className="text-white font-semibold truncate text-base">
                  Ch. {currentChapter?.chapterNumber ?? "?"}
                </h1>
                {currentChapter?.title && (
                  <p className="text-white/70 text-sm mt-0.5 truncate">
                    {currentChapter.title}
                  </p>
                )}
              </div>
            </div>
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

      {/* Bottom Blur Overlay */}
      <div
        className={`absolute left-0 right-0 reader-gradient-bottom reader-bottom-blur-height transition-all duration-300 ${
          showUI ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
        }`}
        style={{ zIndex: 5 }}
      />

      {/* Floating Bottom Panel */}
      <div
        className={`absolute z-10 reader-bottom-panel transition-all duration-300 ${
          showUI
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-12 scale-95 pointer-events-none"
        }`}
        style={{
          bottom: "max(24px, env(safe-area-inset-bottom, 24px))",
          left: "16px",
          right: "16px",
        }}
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-4">
            {/* Chapter Navigation - Left (Previous in LTR, Next in RTL) */}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!leftChapter}
              onClick={() => leftChapter && goToChapter(leftChapter)}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30"
            >
              <HugeiconsIcon icon={PreviousIcon} className="size-4" />
            </Button>

            {/* Page Counter */}
            <div className="text-white text-xs font-medium min-w-fit">
              <span className="bg-white/10 px-3 py-1.5 rounded-full">
                {currentPage + 1} / {pages.length}
              </span>
            </div>

            {/* Progress Slider */}
            <div
              className="flex-1 reader-slider-container"
              dir={readingMode === "rtl" ? "rtl" : "ltr"}
            >
              <DirectionProvider direction={readingMode === "rtl" ? "rtl" : "ltr"}>
                <Slider
                  value={[sliderValue]}
                  min={0}
                  max={pages.length - 1}
                  step={1}
                  onValueChange={handleSliderChange}
                />
              </DirectionProvider>
            </div>

            {/* Settings Popover */}
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger
                render={<Button variant="ghost" size="icon-sm" />}
                className={`text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 ${
                  settingsOpen ? "bg-white/10 text-white" : ""
                }`}
              >
                <HugeiconsIcon icon={Settings02Icon} className="size-4" />
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                sideOffset={12}
                className="w-auto p-3 reader-settings-popup border-white/10"
              >
                <Tabs
                  value={readingMode}
                  onValueChange={(v) => setReadingMode(v as ReadingMode)}
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="rtl" className="flex-1">
                      RTL
                    </TabsTrigger>
                    <TabsTrigger value="ltr" className="flex-1">
                      LTR
                    </TabsTrigger>
                    <TabsTrigger value="scrolling" className="flex-1">
                      Scroll
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </PopoverContent>
            </Popover>

            {/* Chapter Navigation - Right (Next in LTR, Previous in RTL) */}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!rightChapter}
              onClick={() => rightChapter && goToChapter(rightChapter)}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30"
            >
              <HugeiconsIcon icon={NextIcon} className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
