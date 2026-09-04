import type { InstalledSource } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { SearchSourceDisplay, SearchSourceSelection } from "@/lib/mobileSearch";
import {
  selectMobileLiveSearchSources,
  toSearchSourceDisplay,
} from "@/lib/mobileSearch";
import {
  getMobileSourceErrorPresentation,
  sanitizeMobileErrorDiagnostic,
} from "@/lib/mobileSourceErrors";
import {
  type AidokuManga,
  type FilterValue,
  type MobileAidokuExecutorSource,
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorRuntime,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  MOBILE_SOURCE_SESSION_POOL_SIZE,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  defaultMobileSourceSettings,
  makeMobileRuntimeSourceKey,
  MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL,
  normalizeInstalledSource,
} from "./mobileSourceRuntime";
import { lcsLength, mergeAuthors } from "@nemu/core/sources";

export type MobileLiveSearchManga = {
  id: string;
  title: string;
  cover?: string;
  coverHeaders?: Record<string, string>;
  authors?: string[];
  description?: string;
  tags?: string[];
  status?: number;
  url?: string;
};

export type MobileLiveSearchGroup =
  | {
      status: "ready";
      source: SearchSourceDisplay;
      runtime: MobileSourceExecutorRuntime;
      items: MobileLiveSearchManga[];
      hasMore: boolean;
    }
  | {
      status: "blocked";
      source: SearchSourceDisplay;
      reason: string;
      title?: string;
      detail: string;
    };

export type MobileLiveSearchLoadingGroup = {
  status: "loading";
  source: SearchSourceDisplay;
};

export type MobileLiveSearchDisplayGroup =
  | MobileLiveSearchLoadingGroup
  | MobileLiveSearchGroup;

export function presentMobileLiveSearchGroup(
  group: MobileLiveSearchGroup,
  strings: Pick<MobileStrings, "common">,
): MobileLiveSearchGroup {
  if (group.status !== "blocked" || group.title) return group;
  const presentation = getMobileSourceErrorPresentation(group.detail, strings);
  return {
    ...group,
    title: presentation.title,
    detail: presentation.detail,
  };
}

export type MobileLiveSearchOptions = {
  page?: number;
  filters?: FilterValue[];
  titlePool?: MobileSourceTitlePool | null;
  compareTitles?: string[];
  getSourceSettings?: (sourceKey: string, source: InstalledSource) => Promise<Record<string, unknown>>;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
  signal?: AbortSignal;
  imageRequestConcurrency?: number;
  imageRequestDeadlineMs?: number;
};

const MOBILE_SEARCH_IMAGE_REQUEST_CONCURRENCY = 4;
const MOBILE_SEARCH_IMAGE_REQUEST_DEADLINE_MS = 2_000;
/**
 * Sources searched at once.
 *
 * Held one below the session pool so a multi-source search cannot evict every
 * warm session: at pool size N the fan-out compiles at most N-1 runtimes and
 * leaves room for a session the reader still has pinned. Never below 1.
 */
export function resolveMobileLiveSearchSourceConcurrency(
  poolSize: number,
): number {
  if (!Number.isFinite(poolSize)) return 1;
  return Math.max(1, Math.trunc(poolSize) - 1);
}

export const MOBILE_LIVE_SEARCH_SOURCE_CONCURRENCY =
  resolveMobileLiveSearchSourceConcurrency(MOBILE_SOURCE_SESSION_POOL_SIZE);

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  const finite =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : fallback;
  return Math.max(1, Math.min(maximum, finite));
}

export type MobileSourceTitlePool = {
  en: string[];
  ja: string[];
  zh: string[];
  all: string[];
};

function isAsciiLetterOrNumber(codePoint: number): boolean {
  return (
    (codePoint >= 48 && codePoint <= 57) ||
    (codePoint >= 65 && codePoint <= 90) ||
    (codePoint >= 97 && codePoint <= 122)
  );
}

function isMobileTitleSeparator(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return true;
  if (codePoint <= 127) return !isAsciiLetterOrNumber(codePoint);
  return (
    character.trim() === "" ||
    (codePoint >= 0x2000 && codePoint <= 0x206f) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff65) ||
    codePoint === 0x00b7 ||
    codePoint === 0x2022 ||
    codePoint === 0x30fb
  );
}

function normalizeMobileTitleForMatching(title: string): string {
  let normalized = "";
  let previousWasSpace = true;
  for (const character of title.normalize("NFKC").toLowerCase()) {
    if (isMobileTitleSeparator(character)) {
      if (!previousWasSpace) {
        normalized += " ";
        previousWasSpace = true;
      }
      continue;
    }
    normalized += character;
    previousWasSpace = false;
  }
  return normalized.trim();
}

export function calculateMobileTitleSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeMobileTitleForMatching(left);
  const normalizedRight = normalizeMobileTitleForMatching(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  return lcsLength(normalizedLeft, normalizedRight) / Math.max(
    normalizedLeft.length,
    normalizedRight.length
  );
}

export function getBestMobileTitleSimilarityScore(
  candidateTitle: string,
  compareTitles: string[]
): number {
  let bestScore = 0;
  for (const title of compareTitles) {
    const score = calculateMobileTitleSimilarity(candidateTitle, title);
    if (score > bestScore) bestScore = score;
    if (score === 1) return 1;
  }
  return bestScore;
}

function normalizeMobileSourceLanguage(language: string | undefined): string {
  return language?.split("-")[0]?.toLowerCase() || "multi";
}

function hasMobileJapaneseCharacters(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value);
}

function hasMobileCjkCharacters(value: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}

function addMobileTitleToPool(title: string | undefined, pool: MobileSourceTitlePool): void {
  const trimmed = title?.trim();
  if (!trimmed || pool.all.includes(trimmed)) return;

  if (hasMobileJapaneseCharacters(trimmed)) {
    pool.ja.push(trimmed);
  } else if (hasMobileCjkCharacters(trimmed)) {
    pool.zh.push(trimmed);
  } else {
    pool.en.push(trimmed);
  }
  pool.all.push(trimmed);
}

export function buildMobileSourceTitlePool(titles: Iterable<string | undefined>): MobileSourceTitlePool {
  const pool: MobileSourceTitlePool = {
    en: [],
    ja: [],
    zh: [],
    all: [],
  };

  for (const title of titles) {
    addMobileTitleToPool(title, pool);
  }
  return pool;
}

function getMobileSourcePrimaryLanguage(source: InstalledSource): string {
  const languages = source.languages ?? source.packageMetadata?.languages ?? [];
  if (!languages.length || languages.length > 1) return "multi";
  return normalizeMobileSourceLanguage(languages[0]);
}

export function getMobileSearchQueryForSource(
  source: InstalledSource,
  titlePool: MobileSourceTitlePool
): string | null {
  const language = getMobileSourcePrimaryLanguage(source);

  switch (language) {
    case "ja":
      return titlePool.ja[0] ?? titlePool.en[0] ?? titlePool.all[0] ?? null;
    case "zh":
      return titlePool.zh[0] ?? titlePool.ja[0] ?? titlePool.en[0] ?? titlePool.all[0] ?? null;
    case "ko":
      return titlePool.ja[0] ?? titlePool.en[0] ?? titlePool.all[0] ?? null;
    case "en":
    case "multi":
    default:
      return titlePool.en[0] ?? titlePool.all[0] ?? null;
  }
}

function getMobileSearchCompareTitles(query: string, options: MobileLiveSearchOptions): string[] {
  if (options.compareTitles?.length) return options.compareTitles;
  if (options.titlePool?.all.length) return options.titlePool.all;
  return query.trim() ? [query] : [];
}

export function mapAidokuMangaToLiveSearchManga(manga: AidokuManga): MobileLiveSearchManga {
  const imageRequest = manga as AidokuManga & {
    coverHeaders?: Record<string, string>;
  };
  return {
    id: manga.key,
    title: manga.title ?? manga.key,
    cover: manga.cover,
    coverHeaders: imageRequest.coverHeaders,
    authors: mergeAuthors(manga.authors, manga.artists),
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  };
}

export async function mapAidokuMangaToLiveSearchMangaWithImageRequest(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  manga: AidokuManga,
): Promise<MobileLiveSearchManga> {
  const mapped = mapAidokuMangaToLiveSearchManga(manga);
  if (!mapped.cover) return mapped;

  try {
    const request = await source.modifyImageRequest(mapped.cover);
    return {
      ...mapped,
      cover: request.url,
      coverHeaders: request.headers,
    };
  } catch {
    return mapped;
  }
}

export async function mapAidokuMangasToLiveSearchMangaWithImageRequests(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  mangas: AidokuManga[],
  options: Pick<
    MobileLiveSearchOptions,
    "signal" | "imageRequestConcurrency" | "imageRequestDeadlineMs"
  > = {},
): Promise<MobileLiveSearchManga[]> {
  const items = mangas.map(mapAidokuMangaToLiveSearchManga);
  if (options.signal?.aborted) return items;
  const coverIndexes = mangas.flatMap((manga, index) =>
    manga.cover ? [index] : [],
  );
  if (coverIndexes.length === 0) return items;

  const concurrency = Math.min(
    coverIndexes.length,
    boundedPositiveInteger(
      options.imageRequestConcurrency,
      MOBILE_SEARCH_IMAGE_REQUEST_CONCURRENCY,
      MOBILE_SEARCH_IMAGE_REQUEST_CONCURRENCY,
    ),
  );
  const deadlineMs = boundedPositiveInteger(
    options.imageRequestDeadlineMs,
    MOBILE_SEARCH_IMAGE_REQUEST_DEADLINE_MS,
    MOBILE_SEARCH_IMAGE_REQUEST_DEADLINE_MS,
  );
  let acceptingResults = true;
  let nextCover = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (acceptingResults && !options.signal?.aborted) {
      const coverOffset = nextCover;
      nextCover += 1;
      const mangaIndex = coverIndexes[coverOffset];
      if (mangaIndex === undefined) return;
      const rewritten = await mapAidokuMangaToLiveSearchMangaWithImageRequest(
        source,
        mangas[mangaIndex]!,
      );
      if (acceptingResults && !options.signal?.aborted) {
        items[mangaIndex] = rewritten;
      }
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const stop = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deadlineMs);
    if (options.signal) {
      abortListener = () => resolve();
      options.signal.addEventListener("abort", abortListener, { once: true });
    }
  });
  await Promise.race([Promise.all(workers).then(() => undefined), stop]);
  acceptingResults = false;
  if (timer) clearTimeout(timer);
  if (options.signal && abortListener) {
    options.signal.removeEventListener("abort", abortListener);
  }
  return items;
}

export function selectInstalledSourcesForSearch(
  sources: InstalledSource[],
  selection: SearchSourceSelection
): InstalledSource[] {
  const sourceDisplays = sources.map(toSearchSourceDisplay);
  const selectedIds = new Set(
    selectMobileLiveSearchSources(sourceDisplays, selection).map(
      (source) => source.id,
    ),
  );

  return sources.filter((source) => selectedIds.has(source.id));
}

function sortSearchItemsBySimilarity(
  items: MobileLiveSearchManga[],
  compareTitles: string[]
): MobileLiveSearchManga[] {
  if (!compareTitles.length) return items;
  return [...items].sort((left, right) => {
    const leftScore = getBestMobileTitleSimilarityScore(left.title, compareTitles);
    const rightScore = getBestMobileTitleSimilarityScore(right.title, compareTitles);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return left.title.localeCompare(right.title);
  });
}

function liveSearchGroupSortCategory(group: MobileLiveSearchGroup): number {
  if (group.status === "ready" && group.items.length > 0) return 0;
  if (group.status === "ready") return 1;
  return 2;
}

function liveSearchGroupBestScore(
  group: MobileLiveSearchGroup,
  compareTitles: string[]
): number {
  if (group.status !== "ready") return 0;
  return group.items.reduce(
    (best, item) => Math.max(best, getBestMobileTitleSimilarityScore(item.title, compareTitles)),
    0
  );
}

export function sortMobileLiveSearchGroupsBySimilarity(
  groups: MobileLiveSearchGroup[],
  compareTitles: string[]
): MobileLiveSearchGroup[] {
  if (!compareTitles.length) return groups;
  return [...groups].sort((left, right) => {
    const leftCategory = liveSearchGroupSortCategory(left);
    const rightCategory = liveSearchGroupSortCategory(right);
    if (leftCategory !== rightCategory) return leftCategory - rightCategory;

    const leftScore = liveSearchGroupBestScore(left, compareTitles);
    const rightScore = liveSearchGroupBestScore(right, compareTitles);
    if (leftScore !== rightScore) return rightScore - leftScore;

    return left.source.name.localeCompare(right.source.name);
  });
}

export function buildMobileLiveSearchProgressGroups(
  sources: InstalledSource[],
  completedGroups: MobileLiveSearchGroup[],
  compareTitles: string[]
): MobileLiveSearchDisplayGroup[] {
  const completedIds = new Set(completedGroups.map((group) => group.source.id));
  const loadingGroups = sources
    .filter((source) => !completedIds.has(source.id))
    .map<MobileLiveSearchLoadingGroup>((source) => ({
      status: "loading",
      source: toSearchSourceDisplay(source),
    }));

  return [
    ...sortMobileLiveSearchGroupsBySimilarity(completedGroups, compareTitles),
    ...loadingGroups,
  ];
}

export async function searchMobileSource(
  source: InstalledSource,
  query: string,
  options: MobileLiveSearchOptions = {}
): Promise<MobileLiveSearchGroup> {
  if (options.signal?.aborted) {
    const error = new Error("The source search was aborted.");
    error.name = "AbortError";
    throw error;
  }
  const display = toSearchSourceDisplay(source);
  if (display.unsupported) {
    return {
      status: "blocked",
      source: display,
      reason: "unsupported-source",
      detail: MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL,
    };
  }
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings, signal: options.signal },
    async (session): Promise<MobileLiveSearchGroup> => {
      if (options.signal?.aborted) {
        const error = new Error("The source search was aborted.");
        error.name = "AbortError";
        throw error;
      }
      if (session.status === "blocked") {
        return {
          status: "blocked",
          source: display,
          reason: session.reason,
          detail: session.detail,
        };
      }

      const result = await session.source.getSearchMangaList(
        query.trim() || null,
        options.page ?? 1,
        options.filters ?? []
      );

      return {
        status: "ready",
        source: display,
        runtime: session.runtime,
        items: sortSearchItemsBySimilarity(
          await mapAidokuMangasToLiveSearchMangaWithImageRequests(
            session.source,
            result.entries,
            options,
          ),
          getMobileSearchCompareTitles(query, options)
        ),
        hasMore: result.hasNextPage,
      };
    }
  );
}

async function searchMobileSourceOrBlocked(
  source: InstalledSource,
  query: string,
  options: MobileLiveSearchOptions,
): Promise<MobileLiveSearchGroup> {
  try {
    return await searchMobileSource(source, query, options);
  } catch (error) {
    return {
      status: "blocked",
      source: toSearchSourceDisplay(source),
      reason: "search-failed",
      detail: sanitizeMobileErrorDiagnostic(error) ?? "Search failed.",
    };
  }
}

export async function searchMobileSources(
  sources: InstalledSource[],
  query: string,
  selection: SearchSourceSelection,
  options: MobileLiveSearchOptions = {}
): Promise<MobileLiveSearchGroup[]> {
  const selectedSources = selectInstalledSourcesForSearch(sources, selection);
  const fallbackQuery = query.trim();
  if ((!fallbackQuery && !options.titlePool?.all.length) || selectedSources.length === 0) {
    return [];
  }

  const groups: MobileLiveSearchGroup[] = [];
  let nextSource = 0;
  const workers = Array.from(
    {
      length: Math.min(
        MOBILE_LIVE_SEARCH_SOURCE_CONCURRENCY,
        selectedSources.length,
      ),
    },
    async () => {
      while (!options.signal?.aborted) {
        const index = nextSource;
        nextSource += 1;
        const source = selectedSources[index];
        if (!source) return;
        const sourceQuery = options.titlePool
          ? getMobileSearchQueryForSource(source, options.titlePool) ??
            fallbackQuery
          : fallbackQuery;
        const group = await searchMobileSourceOrBlocked(
          source,
          sourceQuery,
          options,
        );
        if (!options.signal?.aborted) groups.push(group);
      }
    },
  );
  await Promise.all(workers);
  return sortMobileLiveSearchGroupsBySimilarity(
    groups,
    getMobileSearchCompareTitles(fallbackQuery, options)
  );
}
