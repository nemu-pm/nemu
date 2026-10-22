import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChapterSummary } from "@/data/schema";
import {
  appendMobileReaderStripSegment,
  mobileReaderStripWarmIndexes,
  prependMobileReaderStripSegment,
  pruneMobileReaderStrip,
  rebaseMobileReaderStrip,
  shouldAppendMobileReaderStripSegment,
  shouldPrependMobileReaderStripSegment,
  type MobileReaderStrip,
  type MobileReaderStripTail,
} from "@/lib/mobileReaderChapterStrip";
import { getMobileReaderChapterNavigation } from "@/lib/mobileReaderChapters";
import type {
  MobileReaderPage,
  MobileReaderPageProcessor,
  MobileReaderPagesRefresh,
  MobileReaderPageWindowResult,
} from "@/sources/mobileSourcePages";

/** One chapter held in the seamless scroll list. */
export type ReaderStripSegmentData = {
  chapter: ChapterSummary;
  pages: MobileReaderPage[];
  pageProcessor?: MobileReaderPageProcessor;
  fetchedAt: number;
};

export type ReaderChapterStrip = MobileReaderStrip<ChapterSummary, MobileReaderPage>;

type EdgeState = { chapterId: string; status: "loading" | "failed" | "locked" } | null;

type StripState = {
  /** The chapter (and fetch) the list opened on; a new one starts a new list. */
  sessionKey: string;
  segments: ReaderStripSegmentData[];
  currentIndex: number;
  next: EdgeState;
  previous: EdgeState;
};

const EMPTY_STATE: StripState = {
  sessionKey: "",
  segments: [],
  currentIndex: 0,
  next: null,
  previous: null,
};

export function readerStripSessionKey(chapterId: string, fetchedAt: number): string {
  return `${chapterId}:${fetchedAt}`;
}

/**
 * Seamless scroll: the chapters held around the open one (at most one on
 * each side), their fetch, their first images and their page processors.
 *
 * The open chapter itself stays the reader's (its `pagesState`); this hook
 * holds a snapshot of it only to hand it back as a neighbour after a
 * crossing. Processors of neighbouring chapters are owned here and disposed
 * when they leave the list; `retainedProcessors` lets the reader skip
 * disposing the open chapter's processor when it becomes a neighbour.
 */
export function useReaderChapterStrip(input: {
  enabled: boolean;
  /** The open chapter, live (null until its pages are ready). */
  current: ReaderStripSegmentData | null;
  /** The opening chapter + fetch of this list (see readerStripSessionKey). */
  sessionKey: string;
  /** Newest-first chapter index (as the reader keeps it). */
  chapters: readonly ChapterSummary[];
  /** The open chapter's live page (local index). */
  currentLocalIndex: number;
  loadChapter: (chapter: ChapterSummary) => Promise<MobileReaderPagesRefresh | null>;
  /** Whether dropping the first `count` segments would touch nothing on screen. */
  isHeadRemovalOffscreen: (strip: ReaderChapterStrip, count: number) => boolean;
  /** The reader is near the top of its list and not mid-seek: a prepend may land. */
  canPrepend: () => boolean;
}) {
  const {
    enabled,
    current,
    sessionKey,
    chapters,
    currentLocalIndex,
    loadChapter,
    isHeadRemovalOffscreen,
    canPrepend,
  } = input;
  const [state, setState] = useState<StripState>(EMPTY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Processors of neighbouring chapters (never the open one's). */
  const retainedProcessorsRef = useRef(new Set<MobileReaderPageProcessor>());
  const loadChapterRef = useRef(loadChapter);
  loadChapterRef.current = loadChapter;
  const isHeadRemovalOffscreenRef = useRef(isHeadRemovalOffscreen);
  isHeadRemovalOffscreenRef.current = isHeadRemovalOffscreen;
  const canPrependRef = useRef(canPrepend);
  canPrependRef.current = canPrepend;
  const runRef = useRef(0);
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;

  const disposeSegments = useCallback((segments: readonly ReaderStripSegmentData[]) => {
    for (const segment of segments) {
      const processor = segment.pageProcessor;
      if (processor && retainedProcessorsRef.current.delete(processor)) {
        processor.processPages?.([]);
        processor.dispose();
      }
    }
  }, []);

  // A new list (another chapter opened the normal way, a refetch, the flag
  // or the mode turned off): neighbours go, their processors with them.
  const activeSessionKey = enabled && current ? sessionKey : "";
  const activeSessionKeyRef = useRef(activeSessionKey);
  activeSessionKeyRef.current = activeSessionKey;
  useEffect(() => {
    const previous = stateRef.current;
    if (previous.sessionKey === activeSessionKey) return;
    runRef.current += 1;
    disposeSegments(previous.segments);
    setState(
      activeSessionKey && current
        ? { ...EMPTY_STATE, sessionKey: activeSessionKey, segments: [current] }
        : EMPTY_STATE,
    );
    // `current` is read for the opening segment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionKey, disposeSegments]);

  useEffect(
    () => () => {
      runRef.current += 1;
      disposeSegments(stateRef.current.segments);
    },
    [disposeSegments],
  );

  const live = state.sessionKey !== "" && state.sessionKey === activeSessionKey;

  // The strip as rendered: the open chapter always from the reader's live
  // state (its pages are processed in place), neighbours from here.
  // Until this list's state is set up (the render that opens it), the open
  // chapter alone: the list's rows never change identity under it.
  const strip = useMemo<ReaderChapterStrip | null>(() => {
    if (!activeSessionKey || !current) return null;
    const currentIndex = live ? state.currentIndex : 0;
    const segments = live
      ? state.segments.map((segment, index) => (index === currentIndex ? current : segment))
      : [current];
    const last = segments[segments.length - 1]!;
    const nextOfLast = getMobileReaderChapterNavigation(
      [...chapters],
      last.chapter.id,
      "scrolling",
    ).nextChapter;
    let tail: MobileReaderStripTail<ChapterSummary>;
    if (chapters.length === 0) {
      tail = null;
    } else if (!nextOfLast) {
      tail = { kind: "end" };
    } else {
      const edge = state.next?.chapterId === nextOfLast.id ? state.next : null;
      tail = {
        kind: "next",
        chapter: nextOfLast,
        status: nextOfLast.locked ? "locked" : (edge?.status ?? "idle"),
      };
    }
    return {
      segments: segments.map((segment) => ({ ...segment, pages: segment.pages })),
      currentIndex,
      tail,
    } as ReaderChapterStrip;
  }, [activeSessionKey, chapters, current, live, state]);

  const segmentsData = useMemo<ReaderStripSegmentData[]>(
    () =>
      !activeSessionKey || !current
        ? []
        : live
          ? state.segments.map((segment, index) => (index === state.currentIndex ? current : segment))
          : [current],
    [activeSessionKey, current, live, state.currentIndex, state.segments],
  );

  // Neighbour page processing: the pages next to the open chapter decode
  // ahead (the next chapter's first pages, the previous chapter's last).
  const processingRef = useRef(new Map<MobileReaderPageProcessor, string>());
  useEffect(() => {
    if (!live) return;
    const wanted = new Map<MobileReaderPageProcessor, number[]>();
    state.segments.forEach((segment, index) => {
      if (index === state.currentIndex) return;
      const processor = segment.pageProcessor;
      if (!processor?.processPages) return;
      const count = segment.pages.length;
      const warm = mobileReaderStripWarmIndexes(count);
      wanted.set(
        processor,
        index > state.currentIndex ? warm : warm.map((offset) => count - 1 - offset),
      );
    });
    wanted.forEach((indexes, processor) => {
      const signature = indexes.join(",");
      if (processingRef.current.get(processor) === signature) return;
      processingRef.current.set(processor, signature);
      let frame: number | null = null;
      let latest: MobileReaderPage[] | null = null;
      const flush = () => {
        frame = null;
        const pages = latest;
        latest = null;
        if (!pages) return;
        setState((previous) => {
          const at = previous.segments.findIndex((segment) => segment.pageProcessor === processor);
          if (at < 0 || at === previous.currentIndex) return previous;
          const segments = [...previous.segments];
          segments[at] = { ...segments[at]!, pages };
          return { ...previous, segments };
        });
      };
      processor.processPages?.(indexes, {
        onUpdate: (result: MobileReaderPageWindowResult) => {
          latest = result.pages;
          if (frame == null) frame = requestAnimationFrame(flush);
        },
      });
    });
    for (const processor of [...processingRef.current.keys()]) {
      if (!wanted.has(processor)) processingRef.current.delete(processor);
    }
  }, [live, state.currentIndex, state.segments]);

  const fetchSegment = useCallback(
    (chapter: ChapterSummary, side: "next" | "previous") => {
      const run = runRef.current;
      setState((previous) => ({ ...previous, [side]: { chapterId: chapter.id, status: "loading" } }));
      void loadChapterRef
        .current(chapter)
        .catch(() => null)
        .then((result) => {
          const ready = result?.status === "ready" ? result : null;
          if (runRef.current !== run) {
            // The list moved on while this was in flight.
            ready?.pageProcessor?.dispose();
            return;
          }
          // A one-page chapter (a single long strip) reads in its own
          // presentation: it is opened the normal way.
          if (!ready || ready.pages.length <= 1) {
            ready?.pageProcessor?.dispose();
            setState((previous) => ({
              ...previous,
              [side]: {
                chapterId: chapter.id,
                status: chapter.locked || ready?.chapter.locked ? "locked" : "failed",
              },
            }));
            return;
          }
          const segment: ReaderStripSegmentData = {
            chapter: { ...chapter, ...ready.chapter, id: chapter.id },
            pages: ready.pages,
            pageProcessor: ready.pageProcessor,
            fetchedAt: ready.fetchedAt,
          };
          if (segment.pageProcessor) retainedProcessorsRef.current.add(segment.pageProcessor);
          setState((previous) => {
            if (previous.segments.some((existing) => existing.chapter.id === chapter.id)) {
              if (segment.pageProcessor && retainedProcessorsRef.current.delete(segment.pageProcessor)) {
                segment.pageProcessor.dispose();
              }
              return { ...previous, [side]: null };
            }
            const base: ReaderChapterStrip = {
              segments: previous.segments,
              currentIndex: previous.currentIndex,
              tail: null,
            };
            const joined =
              side === "next"
                ? appendMobileReaderStripSegment(base, segment, null)
                : prependMobileReaderStripSegment(base, segment);
            return {
              ...previous,
              segments: joined.segments as ReaderStripSegmentData[],
              currentIndex: joined.currentIndex,
              [side]: null,
            };
          });
        });
    },
    [],
  );

  // Append: in the last pages of the list's last chapter, fetch the next.
  // Prepend: in the first pages of its first chapter, fetch the previous.
  useEffect(() => {
    if (!live || !current || chapters.length === 0) return;
    const { segments, currentIndex } = state;
    if (currentIndex === segments.length - 1 && state.next == null) {
      const next = getMobileReaderChapterNavigation([...chapters], current.chapter.id, "scrolling")
        .nextChapter;
      if (
        next &&
        !next.locked &&
        shouldAppendMobileReaderStripSegment(currentLocalIndex, current.pages.length)
      ) {
        fetchSegment(next, "next");
      }
    }
    if (currentIndex === 0 && state.previous == null) {
      const previous = getMobileReaderChapterNavigation(
        [...chapters],
        current.chapter.id,
        "scrolling",
      ).previousChapter;
      if (
        previous &&
        !previous.locked &&
        shouldPrependMobileReaderStripSegment(currentLocalIndex, true) &&
        canPrependRef.current()
      ) {
        fetchSegment(previous, "previous");
      }
    }
  }, [chapters, current, currentLocalIndex, fetchSegment, live, state]);

  // Keep the open chapter and one on each side; a chapter above is dropped
  // only once it is off screen.
  useEffect(() => {
    if (!live) return;
    const base: ReaderChapterStrip = {
      segments: state.segments.map((segment) => ({ chapter: segment.chapter, pages: segment.pages })),
      currentIndex: state.currentIndex,
      tail: null,
    };
    const pruned = pruneMobileReaderStrip(base);
    if (pruned.removedHead.length === 0 && pruned.removedTail.length === 0) return;
    const headCount = pruned.removedHead.length;
    if (headCount > 0 && strip && !isHeadRemovalOffscreenRef.current(strip, headCount)) return;
    const removedHead = state.segments.slice(0, headCount);
    const removedTail = state.segments.slice(state.segments.length - pruned.removedTail.length);
    disposeSegments([...removedHead, ...removedTail]);
    setState((previous) =>
      previous.segments !== state.segments
        ? previous
        : {
            ...previous,
            segments: previous.segments.slice(headCount, previous.segments.length - pruned.removedTail.length),
            currentIndex: previous.currentIndex - headCount,
            next: pruned.removedTail.length > 0 ? null : previous.next,
          },
    );
  }, [currentLocalIndex, disposeSegments, live, state, strip]);

  /**
   * The reader crossed into segment `segmentIndex`: it becomes the open
   * chapter. `leaving` is the open chapter's live state, kept as a
   * neighbour. Returns the arriving chapter's data for the reader to adopt.
   */
  const rebase = useCallback(
    (segmentIndex: number, leaving: ReaderStripSegmentData): ReaderStripSegmentData | null => {
      const previous = stateRef.current;
      const arriving = previous.segments[segmentIndex];
      if (!arriving || segmentIndex === previous.currentIndex) return null;
      // Ownership moves: the leaving chapter's processor is now a
      // neighbour's (kept here), the arriving one's the reader's.
      if (leaving.pageProcessor) retainedProcessorsRef.current.add(leaving.pageProcessor);
      if (arriving.pageProcessor) {
        retainedProcessorsRef.current.delete(arriving.pageProcessor);
        processingRef.current.delete(arriving.pageProcessor);
      }
      const segments = [...previous.segments];
      segments[previous.currentIndex] = leaving;
      const rebased = rebaseMobileReaderStrip(
        { segments, currentIndex: previous.currentIndex, tail: null },
        segmentIndex,
      );
      const nextState: StripState = {
        ...previous,
        segments,
        currentIndex: rebased.currentIndex,
      };
      stateRef.current = nextState;
      setState(nextState);
      return arriving;
    },
    [],
  );

  /**
   * The reader pulled past the top of the list: join the previous chapter
   * above (once). False when there is none to join.
   */
  const requestPrevious = useCallback((): boolean => {
    const { segments, currentIndex, previous, sessionKey: key } = stateRef.current;
    if (!key || key !== activeSessionKeyRef.current || currentIndex !== 0) return false;
    const first = segments[0];
    if (!first) return false;
    const chapter = getMobileReaderChapterNavigation(
      [...chaptersRef.current],
      first.chapter.id,
      "scrolling",
    ).previousChapter;
    if (!chapter || chapter.locked) return false;
    if (previous?.chapterId === chapter.id) {
      // Joining: wait for it. Failed or locked: the old way (open it).
      if (previous.status === "loading") return true;
      return false;
    }
    fetchSegment(chapter, "previous");
    return true;
  }, [fetchSegment]);

  /** A failed / locked neighbour: try it again. */
  const retryNext = useCallback(() => {
    setState((previous) => (previous.next?.status === "failed" ? { ...previous, next: null } : previous));
  }, []);

  const isRetainedProcessor = useCallback(
    (processor: MobileReaderPageProcessor | undefined) =>
      processor != null && retainedProcessorsRef.current.has(processor),
    [],
  );

  return {
    /** The list's chapters (null: not seamless, a single chapter list as before). */
    strip,
    segments: segmentsData,
    rebase,
    requestPrevious,
    retryNext,
    isRetainedProcessor,
  };
}
