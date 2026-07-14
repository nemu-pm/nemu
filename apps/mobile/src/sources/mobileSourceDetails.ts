import type {
  ChapterSummary,
  InstalledSource,
  MangaMetadata,
  SourcePackageSetting,
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
  defaultMobileSourceSettings, makeMobileRuntimeSourceKey, normalizeInstalledSource,
} from "./mobileSourceRuntime";
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
  getSourceSettings?: (sourceKey: string, source: InstalledSource) => Promise<Record<string, unknown>>;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
  onSourcePackageHydrated?: MobileSourcePackageHydrationHandler;
  now?: () => number;
};

export function mapAidokuMangaToMetadata(manga: AidokuManga, fallbackId: string): MangaMetadata {
  return {
    title: manga.title || fallbackId,
    cover: manga.cover,
    authors: mergeAuthors(manga.authors, manga.artists),
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  };
}

export function mapAidokuChapterToSummary(chapter: AidokuChapter): ChapterSummary {
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

export function sortChapterSummaries(chapters: ChapterSummary[]): ChapterSummary[] {
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
  options: MobileSourceDetailsOptions = {}
): Promise<MobileSourceDetailsRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceDetailsRefresh> => {
      await notifyMobileSourcePackageHydrated(
        source,
        session.sourcePackageHydration,
        options.onSourcePackageHydrated,
      );
      if (session.status === "blocked") {
        return { status: "blocked", reason: session.reason, detail: session.detail };
      }
      const manga = await session.source.getMangaDetails({ key: mangaId });
      const chapters = sortChapterSummaries(
        (await session.source.getChapterList({ key: mangaId })).map(mapAidokuChapterToSummary)
      );
      return {
        status: "ready",
        runtime: session.runtime,
        metadata: mapAidokuMangaToMetadata(manga, mangaId),
        chapters,
        latestChapter: chapters[0],
        fetchedAt: options.now?.() ?? Date.now(),
      };
    }
  );
}

export async function refreshMobileSourceMetadata(
  source: InstalledSource,
  mangaId: string,
  options: MobileSourceDetailsOptions = {}
): Promise<MobileSourceMetadataRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceMetadataRefresh> => {
      await notifyMobileSourcePackageHydrated(
        source,
        session.sourcePackageHydration,
        options.onSourcePackageHydrated,
      );
      if (session.status === "blocked") {
        return { status: "blocked", reason: session.reason, detail: session.detail };
      }
      const manga = await session.source.getMangaDetails({ key: mangaId });
      return {
        status: "ready",
        runtime: session.runtime,
        metadata: mapAidokuMangaToMetadata(manga, mangaId),
        fetchedAt: options.now?.() ?? Date.now(),
      };
    }
  );
}

export async function refreshMobileSourceLatestChapter(
  source: InstalledSource,
  mangaId: string,
  options: MobileSourceDetailsOptions = {}
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
  options: MobileSourceDetailsOptions = {}
): Promise<MobileSourceChaptersRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceChaptersRefresh> => {
      await notifyMobileSourcePackageHydrated(
        source,
        session.sourcePackageHydration,
        options.onSourcePackageHydrated,
      );
      if (session.status === "blocked") {
        return { status: "blocked", reason: session.reason, detail: session.detail };
      }
      const chapters = sortChapterSummaries(
        (await session.source.getChapterList({ key: mangaId })).map(mapAidokuChapterToSummary)
      );
      return {
        status: "ready",
        runtime: session.runtime,
        chapters,
        latestChapter: chapters[0],
        fetchedAt: options.now?.() ?? Date.now(),
      };
    }
  );
}
