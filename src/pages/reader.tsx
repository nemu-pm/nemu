import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useStores } from "@/data/context";
import { Keys } from "@/data/keys";
import type { Page, Chapter } from "@/lib/sources";
import { Reader, type ReadingMode, type PagePairingMode } from "@/components/reader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
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

const SCROLL_WIDTH_KEY = "nemu:reader:scrollWidthPct";
const TWO_PAGE_MODE_KEY = "nemu:reader:twoPageMode";
const PAGE_PAIRING_MODE_KEY = "nemu:reader:pagePairingMode";

type VirtualItem =
  | {
      kind: "page";
      key: string;
      chapterId: string;
      localIndex: number;
      page: Page;
    }
  | {
      kind: "spacer";
      key: string;
      fromChapterId: string;
      toChapterId: string;
    };

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

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterPages, setChapterPages] = useState<Record<string, Page[]>>({});
  const [windowChapterIds, setWindowChapterIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  const [isWideScreen, setIsWideScreen] = useState(() => {
    if (typeof window === "undefined") return false;
    const h = window.innerHeight;
    if (!h) return false;
    return window.innerWidth / h > 1;
  });

  const [twoPagePref, setTwoPagePref] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(TWO_PAGE_MODE_KEY);
      if (raw == null) return true; // default enabled on wide screens
      if (raw === "1" || raw === "true") return true;
      if (raw === "0" || raw === "false") return false;
      return true;
    } catch {
      return true;
    }
  });

  const [pagePairingMode, setPagePairingMode] = useState<PagePairingMode>(() => {
    if (typeof window === "undefined") return "manga";
    try {
      const raw = window.localStorage.getItem(PAGE_PAIRING_MODE_KEY);
      if (raw === "book" || raw === "manga") return raw;
      return "manga";
    } catch {
      return "manga";
    }
  });

  const isTwoPageSupported = isWideScreen && readingMode !== "scrolling";
  const isTwoPageMode = isTwoPageSupported && twoPagePref;

  // Scrolling mode "zoom": width scale persisted to localStorage only.
  // 100% = full viewport width, smaller shows black side gaps.
  const [scrollWidthPct, setScrollWidthPct] = useState(100);

  // Debounce save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track imageUrls for unmount cleanup only
  const imageUrlsRef = useRef<Map<string, string>>(new Map());
  // Track which virtual items are currently being loaded to avoid duplicate loads
  const loadingImageKeysRef = useRef<Set<string>>(new Set());

  const chapterPagesRef = useRef<Record<string, Page[]>>({});
  const loadingChaptersRef = useRef<Set<string>>(new Set());
  const loadRunIdRef = useRef(0);
  const pendingInternalUrlChaptersRef = useRef<Set<string>>(new Set());
  const lastRouteChapterIdRef = useRef<string | null>(null);
  const lastPageKeyRef = useRef<string | null>(null);

  // Auto-close settings when toolbar/UI is hidden
  useEffect(() => {
    if (!showUI && settingsOpen) {
      setSettingsOpen(false);
    }
  }, [showUI, settingsOpen]);

  // Track aspect ratio to gate two-page mode (forced off at <= 1:1)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      const h = window.innerHeight;
      if (!h) return;
      setIsWideScreen(window.innerWidth / h > 1);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Persist two-page preference (local-only, no sync)
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(TWO_PAGE_MODE_KEY, twoPagePref ? "1" : "0");
    } catch {
      // ignore
    }
  }, [twoPagePref]);

  // Persist pairing mode preference (local-only, no sync)
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(PAGE_PAIRING_MODE_KEY, pagePairingMode);
    } catch {
      // ignore
    }
  }, [pagePairingMode]);

  // Load scroll width from localStorage (local-only, no sync)
  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(SCROLL_WIDTH_KEY)
          : null;
      if (!raw) return;
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      setScrollWidthPct(Math.max(50, Math.min(100, Math.round(n))));
    } catch {
      // ignore (private mode / blocked storage)
    }
  }, []);

  // Persist scroll width to localStorage
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(SCROLL_WIDTH_KEY, String(scrollWidthPct));
    } catch {
      // ignore
    }
  }, [scrollWidthPct]);

  const chaptersReadOrder = useMemo(() => chapters.slice().reverse(), [chapters]);
  const chapterById = useMemo(() => {
    return new Map(chapters.map((c) => [c.id, c]));
  }, [chapters]);
  const chapterReadIndexById = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < chaptersReadOrder.length; i++) {
      m.set(chaptersReadOrder[i].id, i);
    }
    return m;
  }, [chaptersReadOrder]);

  const { items: virtualItems, chapterFirstIndex, keyToIndex } = useMemo(() => {
    const items: VirtualItem[] = [];
    const chapterFirstIndex = new Map<string, number>();
    const keyToIndex = new Map<string, number>();

    for (let i = 0; i < windowChapterIds.length; i++) {
      const chapId = windowChapterIds[i];
      const pages = chapterPages[chapId];
      if (!pages) continue;

      if (!chapterFirstIndex.has(chapId)) {
        chapterFirstIndex.set(chapId, items.length);
      }

      for (let local = 0; local < pages.length; local++) {
        const key = `${chapId}:${local}`;
        keyToIndex.set(key, items.length);
        items.push({
          kind: "page",
          key,
          chapterId: chapId,
          localIndex: local,
          page: pages[local],
        });
      }

      if (isTwoPageMode && i < windowChapterIds.length - 1) {
        const nextId = windowChapterIds[i + 1];
        const key = `spacer:${chapId}->${nextId}`;
        keyToIndex.set(key, items.length);
        items.push({
          kind: "spacer",
          key,
          fromChapterId: chapId,
          toChapterId: nextId,
        });
      }
    }

    return { items, chapterFirstIndex, keyToIndex };
  }, [windowChapterIds, chapterPages, isTwoPageMode]);

  const currentItem = virtualItems[currentIndex];
  // Keep a stable pointer to the last non-spacer page key so we can remap indices when
  // toggling two-page mode (spacer insertion shifts indices).
  useEffect(() => {
    if (currentItem?.kind === "page") {
      lastPageKeyRef.current = currentItem.key;
    }
  }, [currentItem]);

  useEffect(() => {
    const key = lastPageKeyRef.current;
    if (!key) return;
    const idx = keyToIndex.get(key);
    if (idx == null) return;
    if (idx !== currentIndex) setCurrentIndex(idx);
  }, [isTwoPageMode, keyToIndex, currentIndex]);

  const effectiveChapterId =
    currentItem?.kind === "page"
      ? currentItem.chapterId
      : currentItem?.kind === "spacer"
        ? currentItem.toChapterId
        : chapterId;
  const effectiveLocalIndex =
    currentItem?.kind === "page" ? currentItem.localIndex : 0;
  const effectiveChapter = chapterById.get(effectiveChapterId);
  const effectiveChapterPages = chapterPages[effectiveChapterId] ?? [];

  // Load initial chapter/pages for this manga (do NOT depend on chapterId: we sync URL internally)
  useEffect(() => {
    let cancelled = false;
    const runId = ++loadRunIdRef.current;
    const initialChapterId = chapterId;

    setLoading(true);
    setError(null);
    setCurrentIndex(0);

    // Revoke old blob URLs before clearing
    setImageUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return new Map<string, string>();
    });
    imageUrlsRef.current = new Map();
    loadingImageKeysRef.current.clear();
    loadingChaptersRef.current.clear();

    // Reset chapter window/pages
    setChapters([]);
    setChapterPages({});
    chapterPagesRef.current = {};
    setWindowChapterIds([]);

    const ensureChapterPages = async (targetChapterId: string) => {
      if (chapterPagesRef.current[targetChapterId]) {
        return chapterPagesRef.current[targetChapterId];
      }
      if (loadingChaptersRef.current.has(targetChapterId)) return null;

      loadingChaptersRef.current.add(targetChapterId);
      try {
        const source = await getSource(registryId, sourceId);
        if (!source) throw new Error("Source not found");

        const pagesData = await source.getPages(mangaId, targetChapterId);

        if (cancelled || loadRunIdRef.current !== runId) return null;

        setChapterPages((prev) => {
          const next = { ...prev, [targetChapterId]: pagesData };
          chapterPagesRef.current = next;
          return next;
        });

        return pagesData;
      } catch (e) {
        if (!cancelled && loadRunIdRef.current === runId) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return null;
      } finally {
        loadingChaptersRef.current.delete(targetChapterId);
      }
    };

    (async () => {
      try {
        const source = await getSource(registryId, sourceId);
        if (!source) throw new Error("Source not found");

        const chaptersData = await source.getChapters(mangaId);
        if (cancelled || loadRunIdRef.current !== runId) return;
        setChapters(chaptersData);

        const pagesData = await ensureChapterPages(initialChapterId);
        if (!pagesData || cancelled || loadRunIdRef.current !== runId) return;

        // Restore reading progress (only if in library)
        let startIndex = 0;
        if (inLibrary) {
          const progress = await getProgress(libraryMangaId, initialChapterId);
          if (
            progress &&
            progress.progress >= 0 &&
            progress.progress < pagesData.length
          ) {
            startIndex = progress.progress;
          }
        }

        // If we're near the start, eagerly load previous chapter so swipe-back works immediately
        const readOrder = chaptersData.slice().reverse();
        const currentReadIdx = readOrder.findIndex((c) => c.id === initialChapterId);
        const prev = currentReadIdx > 0 ? readOrder[currentReadIdx - 1] : undefined;

        if (prev && startIndex <= 1) {
          const prevPages = await ensureChapterPages(prev.id);
          if (prevPages && !cancelled && loadRunIdRef.current === runId) {
            setWindowChapterIds([prev.id, initialChapterId]);
            const inserted = prevPages.length + (isTwoPageMode ? 1 : 0);
            setCurrentIndex(startIndex + inserted);
            return;
          }
        }

        setWindowChapterIds([initialChapterId]);
        setCurrentIndex(startIndex);
      } catch (e) {
        if (!cancelled && loadRunIdRef.current === runId) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled && loadRunIdRef.current === runId) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registryId, sourceId, mangaId, getSource, getProgress, inLibrary, libraryMangaId]);

  // Keep a ref copy of chapterPages for async helpers
  useEffect(() => {
    chapterPagesRef.current = chapterPages;
  }, [chapterPages]);

  const ensureChapterPages = useCallback(
    async (targetChapterId: string, opts?: { fatal?: boolean }) => {
      if (chapterPagesRef.current[targetChapterId]) {
        return chapterPagesRef.current[targetChapterId];
      }
      if (loadingChaptersRef.current.has(targetChapterId)) return null;

      loadingChaptersRef.current.add(targetChapterId);
      try {
        const source = await getSource(registryId, sourceId);
        if (!source) throw new Error("Source not found");
        const pagesData = await source.getPages(mangaId, targetChapterId);

        setChapterPages((prev) => {
          const next = { ...prev, [targetChapterId]: pagesData };
          chapterPagesRef.current = next;
          return next;
        });

        return pagesData;
      } catch (e) {
        if (opts?.fatal) {
          setError(e instanceof Error ? e.message : String(e));
        } else {
          console.error("[Reader] Failed to load chapter pages:", e);
        }
        return null;
      } finally {
        loadingChaptersRef.current.delete(targetChapterId);
      }
    },
    [getSource, registryId, sourceId, mangaId]
  );

  // Auto-save progress (debounced, only if in library)
  useEffect(() => {
    if (!inLibrary) return;
    if (currentItem?.kind !== "page") return;
    if (effectiveChapterPages.length === 0) return;

    // Clear previous timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce save by 500ms
    saveTimerRef.current = setTimeout(() => {
      saveProgress(
        libraryMangaId,
        currentItem.chapterId,
        currentItem.localIndex,
        effectiveChapterPages.length
      );

      // Mark as completed if on last page
      if (currentItem.localIndex >= effectiveChapterPages.length - 1) {
        markCompleted(libraryMangaId, currentItem.chapterId);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    currentItem,
    effectiveChapterPages.length,
    inLibrary,
    libraryMangaId,
    saveProgress,
    markCompleted,
  ]);

  // Expand chapter window (append/prepend) so chapter boundaries feel like normal paging
  useEffect(() => {
    if (loading) return;
    if (chaptersReadOrder.length === 0) return;
    if (windowChapterIds.length === 0) return;
    if (virtualItems.length === 0) return;

    const PREFETCH_PAGES = 4;
    const firstWindowId = windowChapterIds[0];
    const lastWindowId = windowChapterIds[windowChapterIds.length - 1];

    const maybeAppend = async () => {
      if (currentIndex < virtualItems.length - PREFETCH_PAGES) return;

      const lastPos = chapterReadIndexById.get(lastWindowId);
      if (lastPos === undefined) return;
      const next = chaptersReadOrder[lastPos + 1];
      if (!next) return;
      if (windowChapterIds.includes(next.id)) return;

      const pages = await ensureChapterPages(next.id);
      if (!pages) return;
      setWindowChapterIds((ids) => (ids.includes(next.id) ? ids : [...ids, next.id]));
    };

    const maybePrepend = async () => {
      if (currentIndex > PREFETCH_PAGES) return;

      const firstPos = chapterReadIndexById.get(firstWindowId);
      if (firstPos === undefined) return;
      const prev = chaptersReadOrder[firstPos - 1];
      if (!prev) return;
      if (windowChapterIds.includes(prev.id)) return;

      const pages = await ensureChapterPages(prev.id);
      if (!pages) return;

      const insertedCount = pages.length + (isTwoPageMode ? 1 : 0);
      setWindowChapterIds((ids) => (ids.includes(prev.id) ? ids : [prev.id, ...ids]));
      setCurrentIndex((i) => i + insertedCount);
    };

    void maybeAppend();
    void maybePrepend();
  }, [
    loading,
    currentIndex,
    virtualItems.length,
    windowChapterIds,
    chaptersReadOrder,
    chapterReadIndexById,
    ensureChapterPages,
    isTwoPageMode,
  ]);

  // Sync URL to the currently visible chapter (replace: keep history clean while paging)
  useEffect(() => {
    if (!effectiveChapterId) return;
    if (effectiveChapterId === chapterId) return;

    pendingInternalUrlChaptersRef.current.add(effectiveChapterId);
    navigate({
      to: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
      params: { registryId, sourceId, mangaId, chapterId: effectiveChapterId },
      replace: true,
    });
  }, [effectiveChapterId, chapterId, navigate, registryId, sourceId, mangaId]);

  // If user navigates to a different chapter via URL/back button, jump reader without nuking session.
  // IMPORTANT: only react to actual route param changes, not to `effectiveChapterId` changes while reading.
  useEffect(() => {
    const prevRoute = lastRouteChapterIdRef.current;
    lastRouteChapterIdRef.current = chapterId;

    // Initial mount: let init loader own it.
    if (prevRoute === null) return;
    if (prevRoute === chapterId) return;

    // Treat any route updates to chapters we initiated as internal.
    if (pendingInternalUrlChaptersRef.current.has(chapterId)) {
      pendingInternalUrlChaptersRef.current.delete(chapterId);
      return;
    }

    if (loading) return;

    // If the chapter is already in our window, just jump within it (avoid resetting state).
    const existingStart = chapterFirstIndex.get(chapterId);
    if (windowChapterIds.includes(chapterId) && existingStart !== undefined) {
      setCurrentIndex(existingStart);
      return;
    }

    (async () => {
      const pages = await ensureChapterPages(chapterId, { fatal: true });
      if (!pages) return;
      setWindowChapterIds([chapterId]);

      let start = 0;
      if (inLibrary) {
        const progress = await getProgress(libraryMangaId, chapterId);
        if (progress && progress.progress >= 0 && progress.progress < pages.length) {
          start = progress.progress;
        }
      }
      setCurrentIndex(start);
    })();
  }, [
    chapterId,
    loading,
    ensureChapterPages,
    inLibrary,
    getProgress,
    libraryMangaId,
    chapterFirstIndex,
    windowChapterIds,
    currentIndex,
    virtualItems.length,
    effectiveChapterId,
  ]);

  // Preload images with eviction for memory pressure
  useEffect(() => {
    if (virtualItems.length === 0) return;

    // Keep pages within this range from current position
    const KEEP_RANGE = isTwoPageMode ? 30 : 20;

    const loadImage = async (index: number) => {
      const item = virtualItems[index];
      if (!item || item.kind !== "page") return;

      // Check if already loaded or currently loading
      if (imageUrlsRef.current.has(item.key)) return;
      if (loadingImageKeysRef.current.has(item.key)) return;

      loadingImageKeysRef.current.add(item.key);
      try {
        const blob = await item.page.getImage();
        const url = URL.createObjectURL(blob);
        setImageUrls((prev) => {
          // Double-check in case it was loaded while we were fetching
          if (prev.has(item.key)) {
            URL.revokeObjectURL(url);
            return prev;
          }
          const next = new Map(prev).set(item.key, url);
          imageUrlsRef.current = next;
          return next;
        });
      } catch (e) {
        console.error(`Failed to load page ${item.key}:`, e);
      } finally {
        loadingImageKeysRef.current.delete(item.key);
      }
    };

    // Load current page(s) and nearby pages.
    // In two-page mode, also preload the *second* page of the next spread so it is ready
    // before swipe completes (fixes "paired page spinner" on fast paging).
    const toLoad = (
      isTwoPageMode
        ? [
            currentIndex - 2,
            currentIndex - 1,
            currentIndex,
            currentIndex + 1,
            currentIndex + 2,
            currentIndex + 3,
          ]
        : [currentIndex, currentIndex + 1, currentIndex + 2, currentIndex - 1]
    ).filter((i) => i >= 0 && i < virtualItems.length);

    toLoad.forEach(loadImage);

    // Evict pages far from current position to reduce memory pressure
    setImageUrls((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, url] of prev) {
        const idx = keyToIndex.get(key);
        if (idx === undefined) continue;

        if (Math.abs(idx - currentIndex) > KEEP_RANGE) {
          URL.revokeObjectURL(url);
          next.delete(key);
          loadingImageKeysRef.current.delete(key);
          changed = true;
        }
      }
      if (changed) {
        imageUrlsRef.current = next;
        return next;
      }
      return prev;
    });
  }, [virtualItems, currentIndex, keyToIndex, isTwoPageMode]);

  // Cleanup blob URLs on unmount (only runs when component unmounts)
  useEffect(() => {
    return () => {
      imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const effectiveReadIndex = chapterReadIndexById.get(effectiveChapterId) ?? -1;
  const prevChapter =
    effectiveReadIndex > 0 ? chaptersReadOrder[effectiveReadIndex - 1] : undefined;
  const nextChapter =
    effectiveReadIndex >= 0 && effectiveReadIndex < chaptersReadOrder.length - 1
      ? chaptersReadOrder[effectiveReadIndex + 1]
      : undefined;

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
      const start = chapterFirstIndex.get(effectiveChapterId);
      if (start === undefined) return;
      setCurrentIndex(start + newPage);
    },
    [chapterFirstIndex, effectiveChapterId]
  );

  const renderImage = useCallback(
    (index: number) => {
      const isScrolling = readingMode === "scrolling";
      const item = virtualItems[index];
      if (!item) {
        return (
          <div
            className="flex w-full items-center justify-center bg-black"
            style={isScrolling ? { aspectRatio: "1 / 1.4" } : { height: "100%" }}
          >
            <Spinner className="size-8 text-white" />
          </div>
        );
      }
      if (item.kind === "spacer") {
        const from = chapterById.get(item.fromChapterId);
        const to = chapterById.get(item.toChapterId);
        return (
          <div
            className="flex w-full items-center justify-center bg-black"
            style={isScrolling ? { minHeight: "20vh" } : { height: "100%" }}
          >
            <div className="text-center text-white/80">
              <div className="text-xs uppercase tracking-widest text-white/50">
                Chapter break
              </div>
              <div className="mt-2 text-sm">
                {from?.chapterNumber != null && (
                  <span className="text-white/60">Ch. {from.chapterNumber}</span>
                )}
                {from?.chapterNumber != null && to?.chapterNumber != null && (
                  <span className="mx-2 text-white/30">→</span>
                )}
                {to?.chapterNumber != null && (
                  <span className="text-white/90">Ch. {to.chapterNumber}</span>
                )}
              </div>
            </div>
          </div>
        );
      }

      const url = imageUrls.get(item.key);
      if (!url) {
        return (
          <div
            className="flex w-full items-center justify-center bg-black"
            style={isScrolling ? { aspectRatio: "1 / 1.4" } : { height: "100%" }}
          >
            <Spinner className="size-8 text-white" />
          </div>
        );
      }
      return (
        <img
          src={url}
          alt={`Page ${item.localIndex + 1}`}
          className={
            readingMode === "scrolling"
              ? "block w-full h-auto object-contain"
              : "h-full w-full object-contain"
          }
        />
      );
    },
    [virtualItems, imageUrls, chapterById, readingMode]
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

  const sliderValue = effectiveLocalIndex;

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
                  Ch. {effectiveChapter?.chapterNumber ?? "?"}
                </h1>
                {effectiveChapter?.title && (
                  <p className="text-white/70 text-sm mt-0.5 truncate">
                    {effectiveChapter.title}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Reader */}
      <Reader
        pageCount={virtualItems.length}
        currentPage={currentIndex}
        onPageChange={setCurrentIndex}
        renderImage={renderImage}
        getPageKey={(i) => virtualItems[i]?.key ?? `missing:${i}`}
        getItemKind={(i) => virtualItems[i]?.kind ?? "page"}
        readingMode={readingMode}
        isTwoPageMode={isTwoPageMode}
        pagePairingMode={pagePairingMode}
        scrollPageWidthScale={scrollWidthPct / 100}
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
                {effectiveLocalIndex + 1} / {Math.max(1, effectiveChapterPages.length)}
              </span>
            </div>

            {/* Progress Slider */}
            <div
              className="flex-1 reader-slider-container"
              dir={readingMode === "rtl" ? "rtl" : "ltr"}
            >
              <DirectionProvider direction={readingMode === "rtl" ? "rtl" : "ltr"}>
                <Slider
                  value={[Math.min(sliderValue, Math.max(0, effectiveChapterPages.length - 1))]}
                  min={0}
                  max={Math.max(0, effectiveChapterPages.length - 1)}
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

                {readingMode !== "scrolling" && isWideScreen && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs text-white/80">Two-page view</div>
                        <div className="mt-0.5 text-[11px] text-white/50">
                          Wide screens only
                        </div>
                      </div>
                      <Switch
                        size="sm"
                        checked={twoPagePref}
                        onCheckedChange={(checked) => setTwoPagePref(checked)}
                      />
                    </div>

                    {twoPagePref && (
                      <div className="mt-3 space-y-2">
                        <div className="text-[11px] text-white/50">Pairing</div>
                        <Tabs
                          value={pagePairingMode}
                          onValueChange={(v) => setPagePairingMode(v as PagePairingMode)}
                        >
                          <TabsList className="w-full">
                            <TabsTrigger value="book" className="flex-1">
                              1-2
                            </TabsTrigger>
                            <TabsTrigger value="manga" className="flex-1">
                              1,2-3
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    )}
                  </div>
                )}

                {readingMode === "scrolling" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span>Page width</span>
                      <span>{scrollWidthPct}%</span>
                    </div>
                    <Slider
                      value={[scrollWidthPct]}
                      min={50}
                      max={100}
                      step={1}
                      onValueChange={(v) =>
                        setScrollWidthPct((prev) => {
                          const raw = Array.isArray(v) ? v[0] : v;
                          if (typeof raw !== "number" || !Number.isFinite(raw)) return prev;
                          return Math.max(50, Math.min(100, Math.round(raw)));
                        })
                      }
                    />
                  </div>
                )}
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
