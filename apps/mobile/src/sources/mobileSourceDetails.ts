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
import {
  DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS,
  withMobileSourceOperationTimeout,
} from "./mobileSourceOperationTimeout";
import { mergeAuthors } from "@nemu/core/sources";

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
};

/**
 * A details refresh is package hydration plus one or two WASM runtime calls,
 * each of which can wedge on a hostile source. Bound the whole refresh here so
 * no caller can forget to — screens that already wrap the call with their own
 * localized timeout keep that wrap; the inner bound is the floor, not a second
 * user-visible failure mode.
 *
 * `getMangaDetails` and `getChapterList` stay sequential on purpose. Both run
 * through `NemuAidokuModule.executeAidokuSandboxOperation`, and the iOS sandbox
 * manager dispatches every operation onto one serial queue
 * (`pm.nemu.aidoku.ios-sandbox`), so issuing them concurrently would not
 * overlap any work — it would only queue a chapter-list call that a failed
 * details call has already made pointless.
 */
function withDetailsTimeout<T>(
  operation: () => Promise<T>,
  options: MobileSourceDetailsOptions,
): Promise<T> {
  return withMobileSourceOperationTimeout(operation, {
    timeoutMs: options.timeoutMs ?? DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS,
    message: options.timeoutMessage,
  });
}

export function isMobileSourceMangaTitlePathLike(value: string): boolean {
  const title = value.trim();
  return (
    /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(title) ||
    /^\.{1,2}[\\/]/.test(title) ||
    /^[\\/][^\\/]+[\\/]/.test(title) ||
    /^[a-z]:[\\/]/i.test(title) ||
    /^www\.[^\s/]+(?:\/|$)/i.test(title)
  );
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
  return summary;
}

export function chapterSortValue(chapter: ChapterSummary): number {
  const volume = chapter.volumeNumber ?? 0;
  const chapterNumber = chapter.chapterNumber ?? Number.NEGATIVE_INFINITY;
  return volume * 1_000_000 + chapterNumber;
}

export function sortChapterSummaries(
  chapters: ChapterSummary[],
): ChapterSummary[] {
  return [...chapters].sort((a, b) => {
    const aValue = chapterSortValue(a);
    const bValue = chapterSortValue(b);
    if (aValue !== bValue) return bValue - aValue;
    return b.id.localeCompare(a.id);
  });
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

  return withDetailsTimeout(
    () =>
      cache.withSession(
        normalized,
        { ...options.executor, settings },
        async (session): Promise<MobileSourceDetailsRefresh> => {
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
          const chapters = sortChapterSummaries(
            (await session.source.getChapterList({ key: mangaId })).map(
              mapAidokuChapterToSummary,
            ),
          );
          return {
            status: "ready",
            runtime: session.runtime,
            metadata: mapAidokuMangaToMetadata(manga, mangaId),
            chapters,
            latestChapter: chapters[0],
            fetchedAt: options.now?.() ?? Date.now(),
          };
        },
      ),
    options,
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

  return withDetailsTimeout(
    () =>
      cache.withSession(
        normalized,
        { ...options.executor, settings },
        async (session): Promise<MobileSourceMetadataRefresh> => {
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
        },
      ),
    options,
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

  return withDetailsTimeout(
    () =>
      cache.withSession(
        normalized,
        { ...options.executor, settings },
        async (session): Promise<MobileSourceChaptersRefresh> => {
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
          const chapters = sortChapterSummaries(
            (await session.source.getChapterList({ key: mangaId })).map(
              mapAidokuChapterToSummary,
            ),
          );
          return {
            status: "ready",
            runtime: session.runtime,
            chapters,
            latestChapter: chapters[0],
            fetchedAt: options.now?.() ?? Date.now(),
          };
        },
      ),
    options,
  );
}
