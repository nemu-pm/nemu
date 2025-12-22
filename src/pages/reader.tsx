import { useParams, useNavigate, useSearch, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useStores } from "@/data/context";
import type { Page, Chapter, Manga } from "@/lib/sources";
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
import { formatChapterTitle } from "@/lib/format-chapter";
import {
  ReaderPluginProvider,
  usePluginPageOverlays,
  usePluginCtx,
  PluginNavbarActions,
  PluginSettingsSections,
  PluginDialog,
  useIsInteractionLocked,
} from "@/lib/plugins";

// Wrapper for Reader that has access to plugin context for interaction lock
function InteractionAwareReader(props: Parameters<typeof Reader>[0]) {
  const isLocked = useIsInteractionLocked();
  
  const onBackgroundClick = useCallback(() => {
    if (isLocked) return;
    props.onBackgroundClick?.();
  }, [isLocked, props.onBackgroundClick]);
  
  return <Reader {...props} onBackgroundClick={onBackgroundClick} disableZoom={isLocked} />;
}

// Inner component that has access to plugin context for overlay rendering
function PluginAwareImage({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const overlays = usePluginPageOverlays();
  const ctx = usePluginCtx();

  if (overlays.length === 0) return <>{children}</>;

  return (
    <div className="relative w-full h-full">
      {children}
      {overlays.map((overlay) => (
        <div
          key={overlay.id}
          className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto"
          style={{ zIndex: overlay.zIndex ?? 10 }}
        >
          {overlay.render(index, ctx)}
        </div>
      ))}
    </div>
  );
}

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
  const { t } = useTranslation();
  const { registryId, sourceId, mangaId, chapterId } = useParams({
    strict: false,
  }) as {
    registryId: string;
    sourceId: string;
    mangaId: string;
    chapterId: string;
  };
  const { page: routePage } = useSearch({ strict: false }) as { page?: number };
  const navigate = useNavigate();
  const router = useRouter();
  const { useSettingsStore, useHistoryStore, useLibraryStore } = useStores();
  const { getSource, readingMode, setReadingMode, availableSources } = useSettingsStore();
  const { getProgress, saveProgress, markCompleted } = useHistoryStore();
  const { updateLastRead } = useLibraryStore();

  const [manga, setManga] = useState<Manga | null>(null);
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
  const [scrollWidthPct, setScrollWidthPct] = useState(() => {
    if (typeof window === "undefined") return 100;
    try {
      const raw = window.localStorage.getItem(SCROLL_WIDTH_KEY);
      if (!raw) return 100;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 100;
      return Math.max(50, Math.min(100, Math.round(n)));
    } catch {
      // ignore (private mode / blocked storage)
      return 100;
    }
  });

  // Debounce save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track max page seen per chapter for high-water mark completion detection
  // Key: chapterId, Value: max page index seen
  const maxPageSeenRef = useRef<Map<string, number>>(new Map());
  // Track which chapters we've already marked as completed this session (avoid duplicate calls)
  const completedChaptersRef = useRef<Set<string>>(new Set());
  // Track imageUrls for unmount cleanup only
  const imageUrlsRef = useRef<Map<string, string>>(new Map());
  // Track which virtual items are currently being loaded to avoid duplicate loads
  const loadingImageKeysRef = useRef<Set<string>>(new Set());

  const chapterPagesRef = useRef<Record<string, Page[]>>({});
  const loadingChaptersRef = useRef<Set<string>>(new Set());
  const pendingScrollPrependRef = useRef(false);
  const loadRunIdRef = useRef(0);
  const pendingInternalUrlChaptersRef = useRef<Set<string>>(new Set());
  // Track internal URL sync (chapterId + page) so we don't treat our own `navigate(replace)`
  // updates as user navigation.
  const pendingInternalUrlLocationsRef = useRef<Set<string>>(new Set());
  const lastRouteChapterIdRef = useRef<string | null>(null);
  const lastRoutePageRef = useRef<number | undefined>(undefined);
  const lastPageKeyRef = useRef<string | null>(null);
  const urlSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRoutePageRef = useRef<number | undefined>(routePage);

  const makeLocationKey = useCallback((chapId: string, page?: number) => {
    return `${chapId}|${page ?? ""}`;
  }, []);

  const clampPage = useCallback((p: number, total: number) => {
    if (!Number.isFinite(p)) return 1;
    if (total <= 0) return 1;
    return Math.max(1, Math.min(total, Math.trunc(p)));
  }, []);

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

  // Compute visible page indices (for two-page mode, this includes both pages in the spread)
  const visiblePageIndices = useMemo(() => {
    if (!isTwoPageMode || currentItem?.kind !== "page") {
      // Single page mode or spacer: just return current index if it's a page
      return currentItem?.kind === "page" ? [currentIndex] : [];
    }

    // Two-page mode: compute spread like TwoPageGallery does
    const isSpacer = (i: number) => virtualItems[i]?.kind === "spacer";
    const pageCount = virtualItems.length;

    // Find the current spread containing currentIndex
    let i = 0;
    let segmentStart = true;
    while (i < pageCount) {
      if (isSpacer(i)) {
        i += 1;
        segmentStart = true;
        continue;
      }

      let spread: number[];
      if (pagePairingMode === "manga" && segmentStart) {
        // First page of each segment alone
        spread = [i];
        i += 1;
        segmentStart = false;
      } else {
        const next = i + 1;
        if (next < pageCount && !isSpacer(next)) {
          spread = [i, next];
          i += 2;
        } else {
          spread = [i];
          i += 1;
        }
        segmentStart = false;
      }

      // Check if this spread contains our current index
      if (spread.includes(currentIndex)) {
        return spread;
      }
    }

    return [currentIndex];
  }, [virtualItems, currentIndex, isTwoPageMode, pagePairingMode, currentItem?.kind]);

  // Derive source languages for plugins
  const sourceLanguages = useMemo(() => {
    const source = availableSources.find(
      (s) => s.registryId === registryId && s.id === sourceId
    );
    return source?.languages ?? [];
  }, [availableSources, registryId, sourceId]);

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

  // Derive current chapter language for plugins (more precise than source-supported languages)
  const chapterLanguage = effectiveChapter?.lang ?? null;

  // Synchronously clear previous session state on manga switches so plugins can't
  // see stale pages/chapters and accidentally start background work (auto-detect).
  useLayoutEffect(() => {
    // This effect intentionally only keys on the "reader session", not chapterId/page.
    let cancelled = false;
    // Mark loading early so the UI doesn't try to render old session data.
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

    // Reset manga/chapter window/pages
    setManga(null);
    setChapters([]);
    setChapterPages({});
    chapterPagesRef.current = {};
    setWindowChapterIds([]);

    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [registryId, sourceId, mangaId]);

  // Load initial chapter/pages for this manga (do NOT depend on chapterId: we sync URL internally)
  useEffect(() => {
    let cancelled = false;
    const runId = ++loadRunIdRef.current;
    const initialChapterId = chapterId;
    const initialPage = initialRoutePageRef.current;

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

        // Fetch manga and chapters in parallel
        const [mangaData, chaptersData] = await Promise.all([
          source.getManga(mangaId),
          source.getChapters(mangaId),
        ]);
        if (cancelled || loadRunIdRef.current !== runId) return;
        setManga(mangaData);
        setChapters(chaptersData);

        const pagesData = await ensureChapterPages(initialChapterId);
        if (!pagesData || cancelled || loadRunIdRef.current !== runId) return;

        // Restore reading progress
        let startIndex = 0;
        if (typeof initialPage === "number") {
          // URL deep-link: 1-based, clamp to bounds
          startIndex = clampPage(initialPage, pagesData.length) - 1;
        } else {
          const progress = await getProgress(registryId, sourceId, mangaId, initialChapterId);
          if (
            progress &&
            progress.progress >= 0 &&
            progress.progress < pagesData.length
          ) {
            startIndex = progress.progress;
          }
        }

        // If we're near the start, eagerly load previous chapter so swipe-back works immediately.
        // In scrolling mode we avoid implicitly prepending the previous chapter, since that can
        // cause confusing jumps when re-entering the reader (window indices shift upwards).
        const readOrder = chaptersData.slice().reverse();
        const currentReadIdx = readOrder.findIndex((c) => c.id === initialChapterId);
        const prev =
          readingMode !== "scrolling" && currentReadIdx > 0
            ? readOrder[currentReadIdx - 1]
            : undefined;

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
  }, [registryId, sourceId, mangaId, getSource, getProgress, clampPage]);

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

  // Scrolling mode: explicitly prepend the previous chapter when user "pulls" past the top.
  // This is NOT auto-prefetch (which can cause index-shift snaps on reopen); it's user-driven.
  const handleScrollingReachStart = useCallback(async () => {
    if (readingMode !== "scrolling") return;
    if (loading) return;
    if (pendingScrollPrependRef.current) return;
    if (chaptersReadOrder.length === 0) return;
    if (windowChapterIds.length === 0) return;

    const firstWindowId = windowChapterIds[0]!;
    const firstPos = chapterReadIndexById.get(firstWindowId);
    if (firstPos === undefined) return;
    const prev = chaptersReadOrder[firstPos - 1];
    if (!prev) return;
    if (windowChapterIds.includes(prev.id)) return;

    pendingScrollPrependRef.current = true;
    try {
      const pages = await ensureChapterPages(prev.id);
      if (!pages) return;

      const insertedCount = pages.length + (isTwoPageMode ? 1 : 0);
      setWindowChapterIds((ids) => (ids.includes(prev.id) ? ids : [prev.id, ...ids]));
      // Preserve current visual position by shifting the current index forward.
      setCurrentIndex((i) => i + insertedCount);
    } finally {
      pendingScrollPrependRef.current = false;
    }
  }, [
    readingMode,
    loading,
    chaptersReadOrder,
    windowChapterIds,
    chapterReadIndexById,
    ensureChapterPages,
    isTwoPageMode,
  ]);

  // CRITICAL: Immediately track max page seen and mark completed (not debounced)
  // This high-water mark pattern ensures completion is never lost due to fast scrolling
  useEffect(() => {
    if (visiblePageIndices.length === 0) return;

    // Update high-water marks for every page currently visible (two-page spreads need this).
    for (const idx of visiblePageIndices) {
      const item = virtualItems[idx];
      if (!item || item.kind !== "page") continue;
      const total = chapterPagesRef.current[item.chapterId]?.length ?? 0;
      if (total <= 0) continue;

      const prevMax = maxPageSeenRef.current.get(item.chapterId) ?? -1;
      if (item.localIndex > prevMax) {
        maxPageSeenRef.current.set(item.chapterId, item.localIndex);
      }

      const maxSeen = maxPageSeenRef.current.get(item.chapterId) ?? item.localIndex;
      const shouldComplete = maxSeen >= total - 1;
      const alreadyCompleted = completedChaptersRef.current.has(item.chapterId);
      if (shouldComplete && !alreadyCompleted) {
        completedChaptersRef.current.add(item.chapterId);
        markCompleted(registryId, sourceId, mangaId, item.chapterId, total);
      }
    }
  }, [visiblePageIndices, virtualItems, registryId, sourceId, mangaId, markCompleted]);

  // Auto-save progress (debounced) - position tracking, non-critical
  useEffect(() => {
    if (currentItem?.kind !== "page") return;
    if (effectiveChapterPages.length === 0) return;

    // Clear previous timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce save by 500ms
    saveTimerRef.current = setTimeout(() => {
      saveProgress(
        registryId,
        sourceId,
        mangaId,
        currentItem.chapterId,
        currentItem.localIndex,
        effectiveChapterPages.length
      );

      // Update library manga's lastReadChapter
      const chapter = chapters.find((c) => c.id === currentItem.chapterId);
      if (chapter) {
        updateLastRead(registryId, sourceId, mangaId, {
          id: chapter.id,
          title: chapter.title,
          chapterNumber: chapter.chapterNumber,
          volumeNumber: chapter.volumeNumber,
        });
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
    registryId,
    sourceId,
    mangaId,
    chapters,
    saveProgress,
    updateLastRead,
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
      // In scrolling mode, don't auto-expand backwards into previous chapters.
      // This keeps the scroll position stable when the reader is reopened and
      // avoids the "snap to previous chapter" glitch caused by index shifts.
      if (readingMode === "scrolling") return;
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
    readingMode,
  ]);

  // Sync URL to the currently visible chapter (replace: keep history clean while paging)
  useEffect(() => {
    if (!effectiveChapterId) return;
    if (currentItem?.kind !== "page") return;

    const desiredPage = effectiveLocalIndex + 1;
    const needsUpdate = effectiveChapterId !== chapterId || desiredPage !== routePage;
    if (!needsUpdate) return;

    // Debounce URL updates so scroll mode doesn't spam router updates.
    if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    urlSyncTimerRef.current = setTimeout(() => {
      const key = makeLocationKey(effectiveChapterId, desiredPage);
      pendingInternalUrlLocationsRef.current.add(key);
      pendingInternalUrlChaptersRef.current.add(effectiveChapterId);
      navigate({
        to: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
        params: { registryId, sourceId, mangaId, chapterId: effectiveChapterId },
        search: { page: desiredPage },
        replace: true,
      });
    }, 300);
  }, [
    effectiveChapterId,
    chapterId,
    routePage,
    effectiveLocalIndex,
    currentItem?.kind,
    navigate,
    registryId,
    sourceId,
    mangaId,
    makeLocationKey,
  ]);

  // Cleanup URL debounce timer on unmount
  useEffect(() => {
    return () => {
      if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    };
  }, []);

  // If user navigates to a different chapter via URL/back button, jump reader without nuking session.
  // IMPORTANT: only react to actual route param changes, not to `effectiveChapterId` changes while reading.
  useEffect(() => {
    const prevRoute = lastRouteChapterIdRef.current;
    lastRouteChapterIdRef.current = chapterId;
    const prevPage = lastRoutePageRef.current;
    lastRoutePageRef.current = routePage;

    // Initial mount: let init loader own it.
    if (prevRoute === null) return;
    if (prevRoute === chapterId && prevPage === routePage) return;

    // Treat any route updates to chapters we initiated as internal.
    const locKey = makeLocationKey(chapterId, routePage);
    if (pendingInternalUrlLocationsRef.current.has(locKey)) {
      pendingInternalUrlLocationsRef.current.delete(locKey);
      pendingInternalUrlChaptersRef.current.delete(chapterId);
      return;
    }

    if (loading) return;

    // If the chapter is already in our window, just jump within it (avoid resetting state).
    const existingStart = chapterFirstIndex.get(chapterId);
    if (windowChapterIds.includes(chapterId) && existingStart !== undefined) {
      const pages = chapterPagesRef.current[chapterId] ?? [];
      if (typeof routePage === "number" && pages.length > 0) {
        const clamped = clampPage(routePage, pages.length);
        setCurrentIndex(existingStart + (clamped - 1));
        // If URL was out of bounds, normalize it.
        if (clamped !== routePage) {
          const key = makeLocationKey(chapterId, clamped);
          pendingInternalUrlLocationsRef.current.add(key);
          navigate({
            to: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
            params: { registryId, sourceId, mangaId, chapterId },
            search: { page: clamped },
            replace: true,
          });
        }
      } else {
        setCurrentIndex(existingStart);
      }
      return;
    }

    (async () => {
      const pages = await ensureChapterPages(chapterId, { fatal: true });
      if (!pages) return;
      setWindowChapterIds([chapterId]);

      let start = 0;
      if (typeof routePage === "number") {
        const clamped = clampPage(routePage, pages.length);
        start = clamped - 1;
        if (clamped !== routePage) {
          const key = makeLocationKey(chapterId, clamped);
          pendingInternalUrlLocationsRef.current.add(key);
          navigate({
            to: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
            params: { registryId, sourceId, mangaId, chapterId },
            search: { page: clamped },
            replace: true,
          });
        }
      } else {
        const progress = await getProgress(registryId, sourceId, mangaId, chapterId);
        if (progress && progress.progress >= 0 && progress.progress < pages.length) {
          start = progress.progress;
        }
      }
      setCurrentIndex(start);
    })();
  }, [
    chapterId,
    routePage,
    loading,
    ensureChapterPages,
    getProgress,
    registryId,
    sourceId,
    mangaId,
    chapterFirstIndex,
    windowChapterIds,
    navigate,
    makeLocationKey,
    clampPage,
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
    (chapter: Chapter, opts?: { startAt?: "start" | "end" }) => {
      const startAt = opts?.startAt ?? "start";
      // In-reader chapter navigation should be sequential and must not consult history.
      // Use explicit `page` (1-based). For `end`, use a large value that will be clamped.
      const page = startAt === "end" ? Number.MAX_SAFE_INTEGER : 1;
      navigate({
        to: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
        params: { registryId, sourceId, mangaId, chapterId: chapter.id },
        search: { page },
        replace: true, // Stay in reader context, don't pollute history
      });
    },
    [navigate, registryId, sourceId, mangaId]
  );

  // Go back in history - properly pops the reader entry instead of creating duplicates
  const handleBack = useCallback(() => {
    router.history.back();
  }, [router]);

  const handleBackgroundClick = useCallback(() => {
    setShowUI((prev) => !prev);
  }, []);

  const handleKeyboardNavigation = useCallback(() => {
    setShowUI(false);
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
      // Manga page placeholder: ~0.7:1 aspect ratio (width:height)
      const placeholderStyle = isScrolling
        ? { aspectRatio: "5 / 7" }
        : { aspectRatio: "5 / 7", height: "100%", maxWidth: "100%" };
      const item = virtualItems[index];
      if (!item) {
        return (
          <div
            className="flex w-full items-center justify-center bg-black"
            style={placeholderStyle}
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
                {t("reader.chapterBreak")}
              </div>
              <div className="mt-2 text-sm">
                {from && (
                  <span className="text-white/60">{formatChapterTitle(from)}</span>
                )}
                {from && to && (
                  <span className="mx-2 text-white/30">→</span>
                )}
                {to && (
                  <span className="text-white/90">{formatChapterTitle(to)}</span>
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
            style={placeholderStyle}
          >
            <Spinner className="size-8 text-white" />
          </div>
        );
      }
      return (
        <PluginAwareImage index={index}>
          <img
            src={url}
            alt={`Page ${item.localIndex + 1}`}
            className={
              readingMode === "scrolling"
                ? "block w-full h-auto object-contain"
                : "h-full w-full object-contain"
            }
          />
        </PluginAwareImage>
      );
    },
    [virtualItems, imageUrls, chapterById, readingMode]
  );

  // Plugin context helpers (must be before early returns to maintain hook order)
  const getPageImageUrl = useCallback(
    (pageIndex: number) => {
      const item = virtualItems[pageIndex];
      if (!item || item.kind !== "page") return undefined;
      return imageUrls.get(item.key);
    },
    [virtualItems, imageUrls]
  );

  const getLoadedPageUrls = useCallback(() => {
    const result = new Map<number, string>();
    virtualItems.forEach((item, index) => {
      if (item.kind === "page") {
        const url = imageUrls.get(item.key);
        if (url) result.set(index, url);
      }
    });
    return result;
  }, [virtualItems, imageUrls]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black reader-lock-scroll">
        <Spinner className="size-8 text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black reader-lock-scroll">
        <div className="text-center">
          <p className="text-xl text-red-400">{t("reader.failedToLoad")}</p>
          <p className="mt-2 text-neutral-400 selectable">{error}</p>
          <Button
            variant="outline"
            className="mt-4 text-white border-white/20 hover:bg-white/10"
            onClick={() => router.history.back()}
          >
            {t("common.goBack")}
          </Button>
        </div>
      </div>
    );
  }

  const sliderValue = effectiveLocalIndex;

  // For RTL mode, swap chapter navigation (left button = next, right button = prev)
  const leftChapter = readingMode === "rtl" ? nextChapter : prevChapter;
  const rightChapter = readingMode === "rtl" ? prevChapter : nextChapter;

  return (
    <ReaderPluginProvider
      currentPageIndex={currentIndex}
      visiblePageIndices={visiblePageIndices}
      pageCount={virtualItems.length}
      chapterId={effectiveChapterId}
      mangaId={mangaId}
      sourceId={sourceId}
      registryId={registryId}
      readingMode={readingMode}
      sourceLanguages={sourceLanguages}
      chapterLanguage={chapterLanguage}
      getPageImageUrl={getPageImageUrl}
      getLoadedPageUrls={getLoadedPageUrls}
    >
    <div className="h-dvh w-screen bg-black relative overflow-hidden reader-lock-scroll">
      {/* Floating Top Bar */}
      <header
        className={`absolute left-0 right-0 z-10 flex justify-center ${
          showUI ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          top: "max(16px, env(safe-area-inset-top, 16px))",
          paddingLeft: "16px",
          paddingRight: "16px",
        }}
      >
        <div
          className="reader-ui-panel flex items-center gap-3 rounded-2xl px-3 py-2 max-w-lg w-full"
          data-visible={showUI}
          data-position="top"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleBack}
            className="reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 shrink-0"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="reader-ui-text-primary font-semibold truncate text-sm">
              {manga?.title ?? "..."}
            </h1>
            <p className="reader-ui-text-secondary text-xs truncate">
              {effectiveChapter ? formatChapterTitle(effectiveChapter) : "..."}
            </p>
          </div>
          <div className="reader-ui-text-secondary text-xs font-medium shrink-0">
            {effectiveLocalIndex + 1} / {Math.max(1, effectiveChapterPages.length)}
          </div>
        </div>
      </header>

      {/* Reader */}
      <InteractionAwareReader
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
        onKeyboardNavigation={handleKeyboardNavigation}
        onScrollingReachStart={handleScrollingReachStart}
      />

      {/* Floating Bottom Panel */}
      <div
        className={`absolute z-10 left-0 right-0 flex justify-center ${
          showUI ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "16px",
          paddingRight: "16px",
        }}
      >
        <div
          className="reader-ui-panel rounded-2xl px-4 py-3 max-w-lg w-full"
          data-visible={showUI}
          data-position="bottom"
        >
          <div className="flex items-center gap-3">
            {/* Chapter Navigation - Left (Previous in LTR/scrolling, Next in RTL) */}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!leftChapter}
              onClick={() =>
                leftChapter &&
                goToChapter(leftChapter, {
                  startAt: readingMode === "rtl" ? "start" : "end",
                })
              }
              className="reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 disabled:opacity-30 shrink-0"
            >
              <HugeiconsIcon icon={PreviousIcon} className="size-4" />
            </Button>

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

            {/* Chapter Navigation - Right (Next in LTR/scrolling, Previous in RTL) */}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!rightChapter}
              onClick={() =>
                rightChapter &&
                goToChapter(rightChapter, {
                  startAt: readingMode === "rtl" ? "end" : "start",
                })
              }
              className="reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 disabled:opacity-30 shrink-0"
            >
              <HugeiconsIcon icon={NextIcon} className="size-4" />
            </Button>

            {/* Plugin Navbar Actions */}
            <PluginNavbarActions />

            {/* Settings Popover */}
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger
                render={<Button variant="ghost" size="icon-sm" />}
                className={`reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 shrink-0 ${
                  settingsOpen ? "reader-ui-bg-hover reader-ui-text-primary" : ""
                }`}
              >
                <HugeiconsIcon icon={Settings02Icon} className="size-4" />
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                sideOffset={12}
                className="w-auto p-3 reader-settings-popup"
              >
                <Tabs
                  value={readingMode}
                  onValueChange={(v) => setReadingMode(v as ReadingMode)}
                >
                  <TabsList className="w-full reader-ui-tabs-list">
                    <TabsTrigger value="rtl" className="flex-1 reader-ui-tab">
                      {t("reader.rtl")}
                    </TabsTrigger>
                    <TabsTrigger value="ltr" className="flex-1 reader-ui-tab">
                      {t("reader.ltr")}
                    </TabsTrigger>
                    <TabsTrigger value="scrolling" className="flex-1 reader-ui-tab">
                      {t("reader.scroll")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {readingMode !== "scrolling" && isWideScreen && (
                  <div className="mt-3 border-t reader-ui-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs reader-ui-text-primary">{t("reader.twoPageView")}</div>
                        <div className="mt-0.5 text-[11px] reader-ui-text-muted">
                          {t("reader.wideScreensOnly")}
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
                        <div className="text-[11px] reader-ui-text-muted">{t("reader.pairing")}</div>
                        <Tabs
                          value={pagePairingMode}
                          onValueChange={(v) => setPagePairingMode(v as PagePairingMode)}
                        >
                          <TabsList className="w-full reader-ui-tabs-list">
                            <TabsTrigger value="book" className="flex-1 reader-ui-tab">
                              1-2
                            </TabsTrigger>
                            <TabsTrigger value="manga" className="flex-1 reader-ui-tab">
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
                    <div className="flex items-center justify-between text-xs reader-ui-text-secondary">
                      <span>{t("reader.pageWidth")}</span>
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

                {/* Plugin Settings Sections */}
                <PluginSettingsSections />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Plugin Dialog */}
      <PluginDialog />
    </div>
    </ReaderPluginProvider>
  );
}
