import type { ChapterSummary, MangaMetadata } from "@/data/schema";
import type {
  MobileSourceChaptersRefresh,
  MobileSourceDetailsRefresh,
  MobileSourceMetadataRefresh,
} from "@/sources/mobileSourceDetails";
import {
  createMobileSourcePriorityTicket,
  mobileSourcePriorityRank,
  mobileSourceRuntimeScheduler,
  promoteMobileSourcePriority,
  type MobileSourcePriorityTicket,
  type MobileSourceTaskPriority,
} from "@/sources/mobileSourceRuntimeScheduler";
import {
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS,
  type MobileSourceDetailCachePayload,
} from "./mobileSourceDetailCacheCore";

/**
 * Stale-while-revalidate policy for the library manga detail screen.
 *
 * Every linked source's details (metadata + full chapter list) are painted
 * from the persisted source-detail cache the moment the screen opens or the
 * source tab changes; the network only decides whether that list is replaced.
 */

/**
 * The selected source is revalidated on open once its cached copy is older
 * than this. Short enough that a new chapter shows up on the next visit,
 * long enough that bouncing between the list and a chapter, or switching tabs
 * back and forth, never re-runs the source.
 */
export const MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS = 2 * 60 * 1000;

/** Non-selected sources only feed tab badges; they follow the cache TTL. */
export const MOBILE_MANGA_DETAIL_BACKGROUND_REVALIDATE_MS =
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS;

export function shouldRevalidateMobileSourceDetail({
  cachedAgeMs,
  force,
  maxAgeMs,
}: {
  /** `null` when nothing is cached for the source. */
  cachedAgeMs: number | null;
  /** Pull-to-refresh / retry / challenge solved. */
  force: boolean;
  maxAgeMs: number;
}): boolean {
  if (force || cachedAgeMs === null) return true;
  if (!Number.isFinite(cachedAgeMs) || cachedAgeMs < 0) return true;
  return cachedAgeMs >= maxAgeMs;
}

function sameChapter(left: ChapterSummary, right: ChapterSummary): boolean {
  if (left === right) return true;
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.chapterNumber === right.chapterNumber &&
    left.volumeNumber === right.volumeNumber &&
    left.dateUploaded === right.dateUploaded &&
    left.lang === right.lang &&
    left.scanlator === right.scanlator &&
    left.locked === right.locked
  );
}

/**
 * Replaces a painted chapter list with a fresher one without disturbing what
 * is on screen: unchanged chapters keep their object identity (so memoized
 * rows do not re-render and the list keeps its scroll anchor), and an
 * unchanged list returns the previous array itself (so state does not change
 * at all). Order and membership always follow `next`, which is authoritative.
 */
export function mergeMobileChapterLists(
  previous: readonly ChapterSummary[] | null | undefined,
  next: readonly ChapterSummary[],
): ChapterSummary[] {
  if (!previous?.length) return next as ChapterSummary[];
  const previousById = new Map(previous.map((chapter) => [chapter.id, chapter]));
  let identical = previous.length === next.length;
  const merged = next.map((chapter, index) => {
    const existing = previousById.get(chapter.id);
    const kept = existing && sameChapter(existing, chapter) ? existing : chapter;
    if (identical && previous[index] !== kept) identical = false;
    return kept;
  });
  return identical ? (previous as ChapterSummary[]) : merged;
}

/**
 * Shares one in-flight promise per key: opening a title, switching its tabs
 * and the background sweep of the other linked sources never run the same
 * source request twice at once. A settled promise is forgotten immediately,
 * so a later refresh always goes to the network.
 *
 * Each request carries a priority ticket (see `mobileSourceRuntimeScheduler`)
 * that `start` passes down to the runtime, and runs at the priority of the
 * most important caller still interested in it: a caller joining raises it
 * (the background sweep's request jumps ahead the moment the user opens its
 * tab), and a caller whose `signal` aborts (the screen went away) withdraws
 * its interest — with nobody left waiting the request finishes in the
 * background (its result still fills the cache) and may be preempted by
 * whatever the user opens next.
 */
export function createMobileInflightRequests<T>(
  onPriorityDropped: () => void = () =>
    mobileSourceRuntimeScheduler.reevaluate(),
) {
  type Entry = {
    promise: Promise<T>;
    ticket: MobileSourcePriorityTicket;
    interests: Map<object, MobileSourceTaskPriority>;
  };
  const inflight = new Map<string, Entry>();

  const recompute = (entry: Entry) => {
    let best: MobileSourceTaskPriority = "background";
    for (const priority of entry.interests.values()) {
      if (mobileSourcePriorityRank(priority) < mobileSourcePriorityRank(best)) {
        best = priority;
      }
    }
    const dropped =
      mobileSourcePriorityRank(best) > mobileSourcePriorityRank(entry.ticket.priority);
    entry.ticket.priority = best;
    if (dropped) onPriorityDropped();
  };

  const register = (
    entry: Entry,
    priority: MobileSourceTaskPriority,
    signal: AbortSignal | undefined,
  ) => {
    if (signal?.aborted) return;
    const interest = {};
    entry.interests.set(interest, priority);
    promoteMobileSourcePriority(entry.ticket, priority);
    signal?.addEventListener(
      "abort",
      () => {
        if (!entry.interests.delete(interest)) return;
        recompute(entry);
      },
      { once: true },
    );
  };

  return {
    run(
      key: string,
      start: (ticket: MobileSourcePriorityTicket) => Promise<T>,
      priority: MobileSourceTaskPriority = "normal",
      signal?: AbortSignal,
    ): Promise<T> {
      const existing = inflight.get(key);
      if (existing) {
        register(existing, priority, signal);
        return existing.promise;
      }
      const ticket = createMobileSourcePriorityTicket(priority);
      const entry: Entry = {
        promise: Promise.resolve() as unknown as Promise<T>,
        ticket,
        interests: new Map(),
      };
      register(entry, priority, signal);
      const pending: Promise<T> = Promise.resolve()
        .then(() => start(ticket))
        .finally(() => {
          if (inflight.get(key) === entry) inflight.delete(key);
          entry.interests.clear();
        });
      entry.promise = pending;
      inflight.set(key, entry);
      return pending;
    },
    /** The priority an in-flight request currently runs at, if any. */
    priorityOf(key: string): MobileSourceTaskPriority | null {
      return inflight.get(key)?.ticket.priority ?? null;
    },
    has(key: string): boolean {
      return inflight.has(key);
    },
    get size(): number {
      return inflight.size;
    },
  };
}

/**
 * Process-wide in-flight source-detail requests, keyed by the source-detail
 * cache key (`registryId:sourceId:mangaId`). Shared by the library detail
 * screen's selected tab, its background sweep of the other linked sources,
 * and the source manga screen.
 */
export const mobileSourceDetailRequests =
  createMobileInflightRequests<MobileSourceDetailsRefresh>();

/**
 * A chapter-only refresh, plus the cache entry it produced. The library
 * detail screen loads chapters first (the header is already known from the
 * library row) and fetches metadata separately in the background.
 */
export type MobileSourceChapterListRefresh =
  | (Extract<MobileSourceChaptersRefresh, { status: "ready" }> & {
      payload: MobileSourceDetailCachePayload;
    })
  | Extract<MobileSourceChaptersRefresh, { status: "blocked" }>;

/** In-flight chapter-only refreshes, keyed like the detail cache. */
export const mobileSourceChapterRequests =
  createMobileInflightRequests<MobileSourceChapterListRefresh>();

/** In-flight metadata-only refreshes, keyed like the detail cache. */
export const mobileSourceMetadataRequests =
  createMobileInflightRequests<MobileSourceMetadataRefresh>();

/**
 * The library detail screen refreshes a source's metadata (description,
 * status, cover) at most this often; chapters are what change between visits.
 */
export const MOBILE_MANGA_DETAIL_METADATA_REVALIDATE_MS = 6 * 60 * 60 * 1000;

/**
 * With nothing painted yet, how long the first load may take before the
 * screen says the source is slow (the request keeps running).
 */
export const MOBILE_MANGA_DETAIL_SLOW_LOAD_MS = 6_000;

/** One linked source's chapter list as the detail screen holds it. */
export type MobileSourceChapterListState = {
  status: "cached" | "loading" | "ready" | "blocked" | "error";
  chapters: ChapterSummary[];
  /**
   * `chapters` is a complete source list (persisted detail cache or a network
   * fetch), not the handful of chapters known locally from progress rows.
   */
  full?: boolean;
  /** Source metadata that came with a full list (cover ownership, badges). */
  metadata?: MangaMetadata;
  fetchedAt?: number;
};

/**
 * Folds a complete chapter list into a tab's state. A cached copy never
 * replaces a newer list already on screen, and a fresher list is merged by
 * chapter id so unchanged rows keep their identity (no flicker, no jump).
 * Returns `existing` itself when nothing changes.
 */
export function withMobileSourceDetailSnapshot(
  existing: MobileSourceChapterListState | undefined,
  payload: MobileSourceDetailCachePayload,
  origin: "cache" | "network",
): MobileSourceChapterListState {
  if (
    existing &&
    origin === "cache" &&
    existing.full &&
    (existing.fetchedAt ?? 0) >= payload.fetchedAt
  ) {
    return existing;
  }
  const chapters = mergeMobileChapterLists(
    existing?.full ? existing.chapters : undefined,
    payload.chapters,
  );
  const status: MobileSourceChapterListState["status"] =
    origin === "network"
      ? "ready"
      : existing?.status === "ready" || existing?.status === "loading"
        ? existing.status
        : "cached";
  // A title-only placeholder (chapter-only refresh of a title whose details
  // were never fetched) must not stand in for real source metadata.
  const metadata = payload.partialMetadata
    ? existing?.metadata
    : payload.metadata;
  if (
    existing?.full &&
    existing.chapters === chapters &&
    existing.status === status &&
    existing.fetchedAt === payload.fetchedAt &&
    existing.metadata === metadata
  ) {
    return existing;
  }
  return {
    status,
    chapters,
    full: true,
    ...(metadata ? { metadata } : {}),
    fetchedAt: payload.fetchedAt,
  };
}
