import type {
  ChapterSummary,
  InstalledSource,
  MangaMetadata,
} from "@/data/schema";
import {
  type AidokuChapter,
  type AidokuManga,
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorRuntime,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  notifyMobileSourcePackageHydrated,
  type MobileSourcePackageHydrationHandler,
} from "./mobileSourcePackageLoader";
import {
  defaultMobileSourceSettings,
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "./mobileSourceRuntime";
import { withMobileSourceOperationTimeout } from "./mobileSourceOperationTimeout";
import type { MobileSourcePriorityInput } from "./mobileSourceRuntimeScheduler";
import { mergeAuthors } from "@nemu/core/sources";
import { orderMobileChaptersNewestFirst } from "@/lib/mobileChapterOrder";
import { markMobilePerformance } from "@/lib/mobilePerformance";
import { isMobileSourceMangaTitlePathLike } from "@/lib/mobileReaderMangaTitle";

export { isMobileSourceMangaTitlePathLike };

export type MobileSourceDetailsRefresh =
  | {
      status: "ready";
      runtime: MobileSourceExecutorRuntime;
      metadata: MangaMetadata;
      chapters: ChapterSummary[];
      latestChapter?: ChapterSummary;
      fetchedAt: number;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

export type MobileSourceMetadataRefresh =
  | {
      status: "ready";
      runtime: MobileSourceExecutorRuntime;
      metadata: MangaMetadata;
      fetchedAt: number;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

export type MobileSourceLatestChapterRefresh =
  | {
      status: "ready";
      runtime: MobileSourceExecutorRuntime;
      latestChapter?: ChapterSummary;
      fetchedAt: number;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

export type MobileSourceChaptersRefresh =
  | {
      status: "ready";
      runtime: MobileSourceExecutorRuntime;
      chapters: ChapterSummary[];
      latestChapter?: ChapterSummary;
      fetchedAt: number;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

export type MobileSourceDetailsOptions = {
  getSourceSettings?: (
    sourceKey: string,
    source: InstalledSource,
  ) => Promise<Record<string, unknown>>;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
  onSourcePackageHydrated?: MobileSourcePackageHydrationHandler;
  now?: () => number;
  /** Whole-refresh bound, inherited by every caller. */
  timeoutMs?: number;
  /** Localized copy for the timeout error, when the caller has strings. */
  timeoutMessage?: string;
  /**
   * Who is waiting (see `mobileSourceRuntimeScheduler`): `user` for the
   * screen the user is looking at, `background` for sweeps and update
   * checks. A shared ticket lets a joined request be promoted. Omitted =
   * `normal`.
   */
  priority?: MobileSourcePriorityInput;
  /** A caller that gave up while queued never reaches the runtime. */
  signal?: AbortSignal;
};

/**
 * Whole-refresh floor for a details refresh (package hydration, session
 * creation, then one or two runtime calls). Each runtime call is already
 * bounded from the moment it is dispatched (20 s, session creation 40 s), so
 * this only has to guarantee settlement; it starts once the source's turn
 * arrives, never while the call waits behind other work.
 */
export const MOBILE_SOURCE_DETAILS_REFRESH_TIMEOUT_MS = 60_000;

/**
 * A details refresh is package hydration plus one or two WASM runtime calls,
 * each of which can wedge on a hostile source. Bound the whole refresh here so
 * no caller can forget to. The clock starts when the source's turn arrives
 * (inside `withSession`), so time spent queued behind other work never turns
 * into a timeout.
 *
 * `getMangaDetails` and `getChapterList` stay sequential on purpose. Both run
 * through `NemuAidokuModule.executeAidokuSandboxOperation`, and the native
 * sandbox runs one operation at a time, so issuing them concurrently would
 * not overlap any work — it would only queue a chapter-list call that a failed
 * details call has already made pointless.
 */
function withDetailsTimeout<T>(
  operation: () => Promise<T>,
  options: MobileSourceDetailsOptions,
): Promise<T> {
  return withMobileSourceOperationTimeout(operation, {
    timeoutMs: options.timeoutMs ?? MOBILE_SOURCE_DETAILS_REFRESH_TIMEOUT_MS,
    message: options.timeoutMessage,
  });
}

function sessionOptions(
  options: MobileSourceDetailsOptions,
  settings: Record<string, unknown>,
) {
  return {
    ...options.executor,
    settings,
    ...(options.priority ? { priority: options.priority } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

export function resolveMobileSourceMangaMetadataTitle(
  runtimeTitle: string | null | undefined,
  fallbackId: string,
  fallbackTitle?: string | null,
): string {
  const runtime = runtimeTitle?.trim() ?? "";
  const knownTitle = fallbackTitle?.trim() ?? "";
  const id = fallbackId.trim();

  if (runtime && runtime !== id && !isMobileSourceMangaTitlePathLike(runtime)) {
    return runtime;
  }
  if (knownTitle && knownTitle !== id) {
    return knownTitle;
  }
  if (runtime && !isMobileSourceMangaTitlePathLike(runtime)) return runtime;
  return id || knownTitle || runtime;
}

export function mapAidokuMangaToMetadata(
  manga: AidokuManga,
  fallbackId: string,
): MangaMetadata {
  return {
    title: resolveMobileSourceMangaMetadataTitle(manga.title, fallbackId),
    cover: manga.cover,
    authors: mergeAuthors(manga.authors, manga.artists),
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  };
}

export function mapAidokuChapterToSummary(
  chapter: AidokuChapter,
): ChapterSummary {
  const summary: ChapterSummary = {
    id: chapter.key,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
  };
  if (chapter.dateUploaded != null) summary.dateUploaded = chapter.dateUploaded;
  if (chapter.locked) summary.locked = true;
  if (chapter.lang) summary.lang = chapter.lang;
  if (chapter.scanlator) summary.scanlator = chapter.scanlator;
  return summary;
}

/**
 * The source's chapter list mapped to summaries, newest first in the source's
 * own order (see `orderMobileChaptersNewestFirst`).
 */
export function mapAidokuChapterList(
  chapters: readonly AidokuChapter[],
): ChapterSummary[] {
  return orderMobileChaptersNewestFirst(chapters.map(mapAidokuChapterToSummary));
}

export async function refreshMobileSourceDetails(
  source: InstalledSource,
  mangaId: string,
  options: MobileSourceDetailsOptions = {},
): Promise<MobileSourceDetailsRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (
    options.getSourceSettings ?? defaultMobileSourceSettings
  )(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    sessionOptions(options, settings),
    (session) =>
      withDetailsTimeout(async (): Promise<MobileSourceDetailsRefresh> => {
        markMobilePerformance("source.details.session-ready", { sourceKey });
        await notifyMobileSourcePackageHydrated(
          source,
          session.sourcePackageHydration,
          options.onSourcePackageHydrated,
        );
        if (session.status === "blocked") {
          return {
            status: "blocked",
            reason: session.reason,
            detail: session.detail,
          };
        }
        const manga = await session.source.getMangaDetails({ key: mangaId });
        markMobilePerformance("source.details.manga-done", { sourceKey });
        const chapters = mapAidokuChapterList(
          await session.source.getChapterList({ key: mangaId }),
        );
        markMobilePerformance("source.details.chapters-done", {
          sourceKey,
          count: chapters.length,
        });
        return {
          status: "ready",
          runtime: session.runtime,
          metadata: mapAidokuMangaToMetadata(manga, mangaId),
          chapters,
          latestChapter: chapters[0],
          fetchedAt: options.now?.() ?? Date.now(),
        };
      }, options),
  );
}

export async function refreshMobileSourceMetadata(
  source: InstalledSource,
  mangaId: string,
  options: MobileSourceDetailsOptions = {},
): Promise<MobileSourceMetadataRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (
    options.getSourceSettings ?? defaultMobileSourceSettings
  )(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    sessionOptions(options, settings),
    (session) =>
      withDetailsTimeout(async (): Promise<MobileSourceMetadataRefresh> => {
        await notifyMobileSourcePackageHydrated(
          source,
          session.sourcePackageHydration,
          options.onSourcePackageHydrated,
        );
        if (session.status === "blocked") {
          return {
            status: "blocked",
            reason: session.reason,
            detail: session.detail,
          };
        }
        const manga = await session.source.getMangaDetails({ key: mangaId });
        return {
          status: "ready",
          runtime: session.runtime,
          metadata: mapAidokuMangaToMetadata(manga, mangaId),
          fetchedAt: options.now?.() ?? Date.now(),
        };
      }, options),
  );
}

export async function refreshMobileSourceLatestChapter(
  source: InstalledSource,
  mangaId: string,
  options: MobileSourceDetailsOptions = {},
): Promise<MobileSourceLatestChapterRefresh> {
  const refreshed = await refreshMobileSourceChapters(source, mangaId, options);
  if (refreshed.status === "blocked") return refreshed;
  return {
    status: "ready",
    runtime: refreshed.runtime,
    latestChapter: refreshed.latestChapter,
    fetchedAt: refreshed.fetchedAt,
  };
}

export async function refreshMobileSourceChapters(
  source: InstalledSource,
  mangaId: string,
  options: MobileSourceDetailsOptions = {},
): Promise<MobileSourceChaptersRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (
    options.getSourceSettings ?? defaultMobileSourceSettings
  )(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    sessionOptions(options, settings),
    (session) =>
      withDetailsTimeout(async (): Promise<MobileSourceChaptersRefresh> => {
        await notifyMobileSourcePackageHydrated(
          source,
          session.sourcePackageHydration,
          options.onSourcePackageHydrated,
        );
        if (session.status === "blocked") {
          return {
            status: "blocked",
            reason: session.reason,
            detail: session.detail,
          };
        }
        const chapters = mapAidokuChapterList(
          await session.source.getChapterList({ key: mangaId }),
        );
        return {
          status: "ready",
          runtime: session.runtime,
          chapters,
          latestChapter: chapters[0],
          fetchedAt: options.now?.() ?? Date.now(),
        };
      }, options),
  );
}
