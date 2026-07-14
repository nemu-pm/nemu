import type { AppLanguage, ExternalIds, MangaMetadata } from "@/data/schema";
import {
  listToMetadataInput,
  type MobileMetadataFormValues,
} from "@/lib/mobileMetadataOverrides";
import { mobileConvexRef } from "@/sync/mobileSyncRuntime";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { translateTags } from "../../../../src/lib/metadata/translations";
import { api } from "../../../../convex/_generated/api";

const ANILIST_API_URL = "https://graphql.anilist.co";
const JIKAN_API_BASE = "https://api.jikan.moe/v4";
const MANGA_UPDATES_API_BASE = "https://api.mangaupdates.com/v1";
const SERVICE_PROXY_URL = "https://service.nemu.pm/proxy?url=";

const MangaStatus = {
  Unknown: 0,
  Ongoing: 1,
  Completed: 2,
  Cancelled: 3,
  Hiatus: 4,
} as const;

const PROVIDER_PRIORITY: MobileMetadataMatchProvider[] = ["anilist", "mal", "mangaupdates"];
export const MOBILE_METADATA_MATCH_RESULTS_PER_PROVIDER = 10;

const ANILIST_SEARCH_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 10) {
      media(search: $search, type: MANGA) {
        id
        title { romaji english native }
        description
        coverImage { large extraLarge }
        genres
        tags { name rank }
        status
        chapters
        volumes
        synonyms
        siteUrl
        staff(sort: RELEVANCE, perPage: 10) {
          edges {
            role
            node { name { full native } }
          }
        }
      }
    }
  }
`;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type MobileMetadataMatchProvider = "mangaupdates" | "anilist" | "mal";

export type MobileMetadataMatchFieldKey =
  | "title"
  | "cover"
  | "authors"
  | "status"
  | "tags"
  | "description";

export type MobileMetadataMatchResult = {
  provider: MobileMetadataMatchProvider;
  providerLabel: string;
  externalId: number;
  title: string;
  subtitle?: string;
  metadata: MangaMetadata;
  externalIds: ExternalIds;
  coverUrl?: string;
  sourceUrl?: string;
  alternativeTitles: string[];
  localizationData?: {
    alTitle?: { romaji?: string; english?: string; native?: string };
    alSynonyms?: string[];
    alStaff?: Array<{ role: string; native?: string }>;
    malTitleEnglish?: string;
    malTitleJapanese?: string;
    muAssociated?: Array<{ title: string }>;
  };
};

export type MobileMetadataMatchSearchResult = {
  results: MobileMetadataMatchResult[];
  errors: Partial<Record<MobileMetadataMatchProvider, string>>;
};

export type MobileMetadataSmartMatchSearchResult =
  MobileMetadataMatchSearchResult & {
    query: string;
    exactMatches: MobileMetadataMatchResult[];
    fallbackTitle?: string;
  };

export type MobileMetadataMatchSearchOptions = {
  providers?: MobileMetadataMatchProvider[];
  fetcher?: Fetcher;
  mangaUpdatesMaxResults?: number;
  convexSiteUrl?: string | null;
  forceMangaUpdatesProxy?: boolean;
};

export type MobileMetadataSmartMatchSearchOptions =
  MobileMetadataMatchSearchOptions & {
    authors?: string[];
    japaneseTitleClient?: MobileJapaneseTitleFallbackClient | null;
  };

export type MobileMetadataMatchApplyOptions = {
  metadataLanguage?: AppLanguage;
  chineseTitleClient?: MobileMetadataChineseTitleClient | null;
  descriptionClient?: MobileMetadataDescriptionClient | null;
};

export type MobileJapaneseTitleFallbackClient = {
  action: (
    action: unknown,
    args: { title: string; authors?: string[] },
  ) => Promise<unknown>;
};

export type MobileMetadataDescriptionClient = {
  action: (
    action: unknown,
    args: { japaneseTitle: string; romajiTitle?: string; englishTitle?: string }
  ) => Promise<unknown>;
};

export type MobileMetadataChineseTitleClient = {
  action: (
    action: unknown,
    args: { japaneseTitle: string; englishTitle?: string }
  ) => Promise<unknown>;
};

export type MobileMetadataAiLocalizationOptions = {
  chineseTitleClient?: MobileMetadataChineseTitleClient | null;
  descriptionClient?: MobileMetadataDescriptionClient | null;
  includeChineseTitle?: boolean;
  includeDescription?: boolean;
};

export type MobileMetadataMatchFieldAvailability = Record<
  MobileMetadataMatchFieldKey,
  boolean
>;

export const MOBILE_METADATA_MATCH_FIELD_ORDER: MobileMetadataMatchFieldKey[] = [
  "cover",
  "title",
  "status",
  "authors",
  "description",
  "tags",
];

const DEFAULT_METADATA_MATCH_FIELDS: MobileMetadataMatchFieldKey[] =
  MOBILE_METADATA_MATCH_FIELD_ORDER;

type AniListMedia = {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  description?: string;
  coverImage?: {
    large?: string;
    extraLarge?: string;
  };
  genres?: string[];
  tags?: Array<{ name: string; rank: number }>;
  status?: string;
  synonyms?: string[];
  siteUrl?: string;
  staff?: {
    edges?: Array<{
      role: string;
      node: { name: { full?: string; native?: string } };
    }>;
  };
};

type JikanManga = {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  url?: string;
  images?: {
    jpg?: { large_image_url?: string };
    webp?: { large_image_url?: string };
  };
  synopsis?: string;
  status?: string;
  genres?: Array<{ name: string }>;
  themes?: Array<{ name: string }>;
  authors?: Array<{ mal_id: number; name: string }>;
};

type MangaUpdatesSearchRecord = {
  series_id: number;
  title: string;
  url: string;
};

type MangaUpdatesSeriesDetail = {
  series_id: number;
  title: string;
  url: string;
  description?: string;
  image?: {
    url: { original?: string; thumb?: string };
  };
  status?: string;
  genres?: Array<{ genre: string }>;
  authors?: Array<{ name: string; type?: string; author_id?: number }>;
  associated?: Array<{ title: string }>;
};

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function cleanDescription(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
  return cleaned || undefined;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasJapaneseKana(value: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(value);
}

function hasCJKCharacters(value: string): boolean {
  return /[\u4E00-\u9FFF]/.test(value);
}

function scoreResult(query: string, result: MobileMetadataMatchResult): number {
  const normalizedQuery = normalizeTitle(query);
  const candidates = result.alternativeTitles.map(normalizeTitle).filter(Boolean);
  const providerScore = PROVIDER_PRIORITY.length - PROVIDER_PRIORITY.indexOf(result.provider);
  const exactScore = candidates.some((candidate) => candidate === normalizedQuery) ? 100 : 0;
  const containsScore = candidates.some((candidate) => candidate.includes(normalizedQuery)) ? 20 : 0;
  return exactScore + containsScore + providerScore;
}

function sortResultsByQuery(
  query: string,
  results: MobileMetadataMatchResult[]
): MobileMetadataMatchResult[] {
  return [...results].sort(
    (left, right) => scoreResult(query, right) - scoreResult(query, left)
  );
}

function mergeMatchResults(
  current: MobileMetadataMatchResult[],
  incoming: MobileMetadataMatchResult[]
): MobileMetadataMatchResult[] {
  const merged = new Map<string, MobileMetadataMatchResult>();
  for (const result of [...current, ...incoming]) {
    merged.set(`${result.provider}:${result.externalId}`, result);
  }
  return [...merged.values()];
}

export function selectMobileMetadataMatchResultsForDisplay(
  results: MobileMetadataMatchResult[],
  limitPerProvider: number = MOBILE_METADATA_MATCH_RESULTS_PER_PROVIDER
): MobileMetadataMatchResult[] {
  const safeLimit =
    Number.isFinite(limitPerProvider) && limitPerProvider > 0
      ? Math.floor(limitPerProvider)
      : MOBILE_METADATA_MATCH_RESULTS_PER_PROVIDER;
  const counts = new Map<MobileMetadataMatchProvider, number>();
  const selected: MobileMetadataMatchResult[] = [];

  for (const result of results) {
    const count = counts.get(result.provider) ?? 0;
    if (count >= safeLimit) continue;
    counts.set(result.provider, count + 1);
    selected.push(result);
  }

  return selected;
}

function exactMatchesForQuery(
  query: string,
  results: MobileMetadataMatchResult[]
): MobileMetadataMatchResult[] {
  return sortResultsByQuery(
    query,
    results.filter((result) => isMobileMetadataExactTitleMatch(query, result))
  );
}

function prioritySortedMatches(
  matches: MobileMetadataMatchResult[]
): MobileMetadataMatchResult[] {
  const canonicalPriority: MobileMetadataMatchProvider[] = [
    "mangaupdates",
    "anilist",
    "mal",
  ];
  return [...matches].sort(
    (left, right) =>
      canonicalPriority.indexOf(left.provider) -
      canonicalPriority.indexOf(right.provider)
  );
}

function hasMissingExactMatchProvider(
  matches: MobileMetadataMatchResult[],
  providers: MobileMetadataMatchProvider[]
): boolean {
  const matchedProviders = new Set(matches.map((match) => match.provider));
  return providers.some((provider) => !matchedProviders.has(provider));
}

function localizedTitleForResult(
  result: MobileMetadataMatchResult,
  language: AppLanguage
): string {
  if (language === "en") return result.metadata.title;

  if (language === "ja") {
    return (
      result.alternativeTitles.find((title) => hasJapaneseKana(title)) ??
      result.metadata.title
    );
  }

  return (
    result.alternativeTitles.find(
      (title) => hasCJKCharacters(title) && !hasJapaneseKana(title)
    ) ?? result.metadata.title
  );
}

function isAniListAuthorRole(role: string): boolean {
  const normalizedRole = role.toLowerCase();
  return (
    normalizedRole.includes("story") ||
    normalizedRole.includes("original") ||
    normalizedRole.includes("art")
  );
}

function localizedAuthorsForResult(
  result: MobileMetadataMatchResult,
  language: AppLanguage
): string[] | undefined {
  if (language === "en" || result.provider !== "anilist") {
    return result.metadata.authors;
  }

  const nativeNames = uniqueStrings(
    result.localizationData?.alStaff
      ?.filter((staff) => isAniListAuthorRole(staff.role))
      .map((staff) => staff.native) ?? []
  );

  return nativeNames.length ? nativeNames : result.metadata.authors;
}

export function localizeMobileMetadataMatch(
  result: MobileMetadataMatchResult,
  language: AppLanguage
): MobileMetadataMatchResult {
  if (language === "en") return result;

  const localizedTitle = localizedTitleForResult(result, language);
  const localizedTags = result.metadata.tags
    ? translateTags(result.metadata.tags, language)
    : undefined;
  const localizedAuthors = localizedAuthorsForResult(result, language);
  const metadata: MangaMetadata = {
    ...result.metadata,
    title: localizedTitle,
    ...(localizedAuthors ? { authors: localizedAuthors } : {}),
    ...(localizedTags ? { tags: localizedTags } : {}),
  };

  return {
    ...result,
    title: localizedTitle,
    metadata,
  };
}

export function isMobileMetadataExactTitleMatch(
  query: string,
  result: MobileMetadataMatchResult
): boolean {
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedQuery) return false;
  return result.alternativeTitles
    .map(normalizeTitle)
    .some((candidate) => candidate === normalizedQuery);
}

export async function findMobileJapaneseTitleFallback(
  title: string,
  authors?: string[],
  client: MobileJapaneseTitleFallbackClient | null =
    mobileConvexRef.current as MobileJapaneseTitleFallbackClient | null,
): Promise<string | null> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || !client) return null;

  try {
    const result = await client.action(api.ai_metadata.findJapaneseTitle, {
      title: trimmedTitle,
      ...(authors?.length ? { authors } : {}),
    });
    return typeof result === "string" && result.trim() ? result.trim() : null;
  } catch {
    return null;
  }
}

function textIsInLanguage(text: string | undefined, language: AppLanguage): boolean {
  if (!text || language === "en") return false;
  if (language === "ja") return hasJapaneseKana(text);
  return hasCJKCharacters(text) && !hasJapaneseKana(text);
}

function aiLookupTitlesForResult(result: MobileMetadataMatchResult): {
  japaneseTitle: string;
  romajiTitle?: string;
  englishTitle?: string;
} | null {
  const localization = result.localizationData;
  const japaneseTitle =
    localization?.alTitle?.native ??
    localization?.malTitleJapanese ??
    localization?.muAssociated?.find((associated) =>
      hasJapaneseKana(associated.title)
    )?.title ??
    result.alternativeTitles.find(hasJapaneseKana) ??
    result.metadata.title;
  const englishTitle =
    localization?.alTitle?.english ??
    localization?.malTitleEnglish ??
    result.alternativeTitles.find((title) => /[A-Za-z]/.test(title)) ??
    result.metadata.title;
  const romajiTitle =
    localization?.alTitle?.romaji ??
    (/[A-Za-z]/.test(result.metadata.title) ? result.metadata.title : undefined);

  if (!japaneseTitle && !englishTitle) return null;
  return {
    japaneseTitle: japaneseTitle || englishTitle!,
    ...(romajiTitle ? { romajiTitle } : {}),
    ...(englishTitle ? { englishTitle } : {}),
  };
}

export async function findMobileChineseTitleFallback(
  result: MobileMetadataMatchResult,
  client: MobileMetadataChineseTitleClient | null =
    mobileConvexRef.current as unknown as MobileMetadataChineseTitleClient | null
): Promise<string | null> {
  const localizedTitle = localizedTitleForResult(result, "zh");
  if (localizedTitle !== result.metadata.title || !client) return null;

  const titles = aiLookupTitlesForResult(result);
  if (!titles) return null;

  try {
    const response = await client.action(api.ai_metadata.findChineseTitle, {
      japaneseTitle: titles.japaneseTitle,
      ...(titles.englishTitle ? { englishTitle: titles.englishTitle } : {}),
    });

    if (typeof response === "string") {
      return response.trim() ? response.trim() : null;
    }
    if (response && typeof response === "object") {
      const title = response as {
        simplified?: unknown;
        traditional?: unknown;
      };
      const simplified =
        typeof title.simplified === "string" ? title.simplified.trim() : "";
      const traditional =
        typeof title.traditional === "string" ? title.traditional.trim() : "";
      return simplified || traditional || null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function findMobileLocalizedDescription(
  result: MobileMetadataMatchResult,
  language: AppLanguage,
  client: MobileMetadataDescriptionClient | null =
    mobileConvexRef.current as unknown as MobileMetadataDescriptionClient | null
): Promise<string | null> {
  if (
    language === "en" ||
    textIsInLanguage(result.metadata.description, language) ||
    !client
  ) {
    return null;
  }

  const titles = aiLookupTitlesForResult(result);
  if (!titles) return null;

  try {
    const action =
      language === "ja"
        ? api.ai_metadata.findJapaneseDescription
        : api.ai_metadata.findChineseDescription;
    const args =
      language === "ja"
        ? {
            japaneseTitle: titles.japaneseTitle,
            ...(titles.romajiTitle ? { romajiTitle: titles.romajiTitle } : {}),
          }
        : {
            japaneseTitle: titles.japaneseTitle,
            ...(titles.englishTitle ? { englishTitle: titles.englishTitle } : {}),
          };
    const description = await client.action(action, args);
    return typeof description === "string" && description.trim()
      ? description.trim()
      : null;
  } catch {
    return null;
  }
}

export async function localizeMobileMetadataMatchWithDescription(
  result: MobileMetadataMatchResult,
  language: AppLanguage,
  client?: MobileMetadataDescriptionClient | null
): Promise<MobileMetadataMatchResult> {
  return localizeMobileMetadataMatchWithAiLocalization(result, language, {
    descriptionClient: client,
    includeChineseTitle: false,
    includeDescription: true,
  });
}

export async function localizeMobileMetadataMatchWithAiLocalization(
  result: MobileMetadataMatchResult,
  language: AppLanguage,
  options: MobileMetadataAiLocalizationOptions = {}
): Promise<MobileMetadataMatchResult> {
  let localized = localizeMobileMetadataMatch(result, language);

  const shouldFindChineseTitle =
    language === "zh" && options.includeChineseTitle !== false;
  if (shouldFindChineseTitle) {
    const title = await findMobileChineseTitleFallback(
      result,
      options.chineseTitleClient
    );
    if (title) {
      localized = {
        ...localized,
        title,
        metadata: {
          ...localized.metadata,
          title,
        },
      };
    }
  }

  if (options.includeDescription === false) return localized;

  const description = await findMobileLocalizedDescription(
    result,
    language,
    options.descriptionClient
  );

  if (!description) return localized;

  return {
    ...localized,
    metadata: {
      ...localized.metadata,
      description,
    },
  };
}

function providerLabel(provider: MobileMetadataMatchProvider): string {
  switch (provider) {
    case "anilist":
      return "AniList";
    case "mal":
      return "MAL";
    case "mangaupdates":
      return "MangaUpdates";
  }
}

export function getMobileMetadataMatchFieldAvailability(
  result: MobileMetadataMatchResult
): MobileMetadataMatchFieldAvailability {
  return {
    title: Boolean(result.metadata.title),
    cover: Boolean(result.metadata.cover),
    authors: Boolean(result.metadata.authors?.length),
    status: result.metadata.status !== undefined,
    tags: Boolean(result.metadata.tags?.length),
    description: Boolean(result.metadata.description),
  };
}

export function canRunMobileMetadataMatchSearch(
  matchQuery: string,
  fallbackTitle: string,
  busy: boolean
): boolean {
  return !busy && Boolean((matchQuery.trim() || fallbackTitle.trim()).trim());
}

export function applyMobileMetadataMatchToForm(
  form: MobileMetadataFormValues,
  result: MobileMetadataMatchResult,
  fields: MobileMetadataMatchFieldKey[] = DEFAULT_METADATA_MATCH_FIELDS,
  options: MobileMetadataMatchApplyOptions = {}
): MobileMetadataFormValues {
  const match = localizeMobileMetadataMatch(
    result,
    options.metadataLanguage ?? "en"
  );
  const next: MobileMetadataFormValues = {
    ...form,
    externalIds: {
      ...form.externalIds,
      ...match.externalIds,
    },
  };

  for (const field of fields) {
    switch (field) {
      case "title":
        next.title = match.metadata.title || next.title;
        break;
      case "cover":
        next.coverUrl = match.metadata.cover ?? next.coverUrl;
        break;
      case "authors":
        next.authorsText = match.metadata.authors
          ? listToMetadataInput(match.metadata.authors)
          : next.authorsText;
        break;
      case "status":
        next.status = match.metadata.status ?? next.status;
        break;
      case "tags":
        next.tagsText = match.metadata.tags
          ? listToMetadataInput(match.metadata.tags)
          : next.tagsText;
        break;
      case "description":
        next.description = match.metadata.description ?? next.description;
        break;
    }
  }

  return next;
}

export async function applyMobileMetadataMatchToFormWithDescription(
  form: MobileMetadataFormValues,
  result: MobileMetadataMatchResult,
  fields: MobileMetadataMatchFieldKey[] = DEFAULT_METADATA_MATCH_FIELDS,
  options: MobileMetadataMatchApplyOptions = {}
): Promise<MobileMetadataFormValues> {
  const metadataLanguage = options.metadataLanguage ?? "en";
  const shouldLocalizeDescription = fields.includes("description");
  const shouldLocalizeChineseTitle =
    metadataLanguage === "zh" && fields.includes("title");

  if (
    metadataLanguage === "en" ||
    (!shouldLocalizeDescription && !shouldLocalizeChineseTitle)
  ) {
    return applyMobileMetadataMatchToForm(form, result, fields, options);
  }

  const localized = await localizeMobileMetadataMatchWithAiLocalization(
    result,
    metadataLanguage,
    {
      chineseTitleClient:
        "chineseTitleClient" in options
          ? options.chineseTitleClient
          : undefined,
      descriptionClient:
        "descriptionClient" in options ? options.descriptionClient : undefined,
      includeChineseTitle: shouldLocalizeChineseTitle,
      includeDescription: shouldLocalizeDescription,
    }
  );

  return applyMobileMetadataMatchToForm(form, localized, fields, {
    metadataLanguage: "en",
  });
}

function externalIdsForProvider(provider: MobileMetadataMatchProvider, id: number): ExternalIds {
  switch (provider) {
    case "anilist":
      return { aniList: id };
    case "mal":
      return { mal: id };
    case "mangaupdates":
      return { mangaUpdates: id };
  }
}

function statusFromAniList(status: string | undefined): number {
  switch (status) {
    case "RELEASING":
      return MangaStatus.Ongoing;
    case "FINISHED":
      return MangaStatus.Completed;
    case "HIATUS":
      return MangaStatus.Hiatus;
    case "CANCELLED":
      return MangaStatus.Cancelled;
    default:
      return MangaStatus.Unknown;
  }
}

function statusFromText(status: string | undefined): number {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized.includes("ongoing") || normalized.includes("publishing")) {
    return MangaStatus.Ongoing;
  }
  if (normalized.includes("complete") || normalized.includes("finished")) {
    return MangaStatus.Completed;
  }
  if (normalized.includes("hiatus")) {
    return MangaStatus.Hiatus;
  }
  if (normalized.includes("discontinue") || normalized.includes("cancel")) {
    return MangaStatus.Cancelled;
  }
  return MangaStatus.Unknown;
}

export function mapAniListMatch(media: AniListMedia): MobileMetadataMatchResult {
  const title = media.title.romaji || media.title.english || media.title.native || "";
  const alternativeTitles = uniqueStrings([
    media.title.romaji,
    media.title.english,
    media.title.native,
    ...(media.synonyms ?? []),
  ]);
  const authors = uniqueStrings(
    (media.staff?.edges ?? [])
      .filter((edge) => isAniListAuthorRole(edge.role))
      .map((edge) => edge.node.name.full)
  );
  const tags = uniqueStrings([
    ...(media.genres ?? []),
    ...(media.tags?.slice(0, 10).map((tag) => tag.name) ?? []),
  ]);
  const cover = media.coverImage?.extraLarge || media.coverImage?.large;

  return {
    provider: "anilist",
    providerLabel: providerLabel("anilist"),
    externalId: media.id,
    title,
    subtitle: media.title.english && media.title.english !== title ? media.title.english : media.title.native,
    metadata: {
      title,
      cover,
      authors: authors.length ? authors : undefined,
      description: cleanDescription(media.description),
      tags: tags.length ? tags : undefined,
      status: statusFromAniList(media.status),
      url: media.siteUrl,
    },
    externalIds: externalIdsForProvider("anilist", media.id),
    coverUrl: cover,
    sourceUrl: media.siteUrl,
    alternativeTitles,
    localizationData: {
      alTitle: {
        romaji: media.title.romaji,
        english: media.title.english,
        native: media.title.native,
      },
      alSynonyms: media.synonyms,
      alStaff: media.staff?.edges?.map((edge) => ({
        role: edge.role,
        native: edge.node.name.native,
      })),
    },
  };
}

export function mapJikanMatch(manga: JikanManga): MobileMetadataMatchResult {
  const cover = manga.images?.webp?.large_image_url || manga.images?.jpg?.large_image_url;
  const tags = uniqueStrings([
    ...(manga.genres?.map((genre) => genre.name) ?? []),
    ...(manga.themes?.map((theme) => theme.name) ?? []),
  ]);
  const alternativeTitles = uniqueStrings([
    manga.title,
    manga.title_english,
    manga.title_japanese,
    ...(manga.title_synonyms ?? []),
  ]);

  return {
    provider: "mal",
    providerLabel: providerLabel("mal"),
    externalId: manga.mal_id,
    title: manga.title,
    subtitle: manga.title_english && manga.title_english !== manga.title ? manga.title_english : manga.title_japanese,
    metadata: {
      title: manga.title,
      cover,
      authors: manga.authors?.map((author) => author.name),
      description: manga.synopsis,
      tags: tags.length ? tags : undefined,
      status: statusFromText(manga.status),
      url: manga.url,
    },
    externalIds: externalIdsForProvider("mal", manga.mal_id),
    coverUrl: cover,
    sourceUrl: manga.url,
    alternativeTitles,
    localizationData: {
      malTitleEnglish: manga.title_english,
      malTitleJapanese: manga.title_japanese,
    },
  };
}

export function mapMangaUpdatesMatch(detail: MangaUpdatesSeriesDetail): MobileMetadataMatchResult {
  const authors = uniqueStrings(detail.authors?.map((author) => author.name) ?? []);
  const tags = uniqueStrings(detail.genres?.map((genre) => genre.genre) ?? []);
  const alternativeTitles = uniqueStrings([
    detail.title,
    ...(detail.associated?.map((associated) => associated.title) ?? []),
  ]);
  const cover = detail.image?.url.original;

  return {
    provider: "mangaupdates",
    providerLabel: providerLabel("mangaupdates"),
    externalId: detail.series_id,
    title: detail.title,
    subtitle: detail.associated?.find((associated) => associated.title !== detail.title)?.title,
    metadata: {
      title: detail.title,
      cover,
      authors: authors.length ? authors : undefined,
      description: detail.description,
      tags: tags.length ? tags : undefined,
      status: statusFromText(detail.status),
      url: detail.url,
    },
    externalIds: externalIdsForProvider("mangaupdates", detail.series_id),
    coverUrl: cover,
    sourceUrl: detail.url,
    alternativeTitles,
    localizationData: {
      muAssociated: detail.associated?.map((associated) => ({
        title: associated.title,
      })),
    },
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function searchAniList(query: string, fetcher: Fetcher): Promise<MobileMetadataMatchResult[]> {
  const response = await fetcher(ANILIST_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ANILIST_SEARCH_QUERY, variables: { search: query } }),
  });
  const data = await readJson<{ data?: { Page?: { media?: AniListMedia[] } } }>(response);
  return (data?.data?.Page?.media ?? []).map(mapAniListMatch).filter((result) => result.title);
}

let lastJikanRequestAt = 0;

async function waitForJikanRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastJikanRequestAt;
  if (elapsed < 350) {
    await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
  }
  lastJikanRequestAt = Date.now();
}

async function searchJikan(query: string, fetcher: Fetcher): Promise<MobileMetadataMatchResult[]> {
  await waitForJikanRateLimit();
  const params = new URLSearchParams({ q: query, limit: "10" });
  const response = await fetcher(`${JIKAN_API_BASE}/manga?${params}`);
  const data = await readJson<{ data?: JikanManga[] }>(response);
  return (data?.data ?? []).map(mapJikanMatch).filter((result) => result.title);
}

function isBrowserRuntime(): boolean {
  return typeof document !== "undefined";
}

function buildServiceProxyUrl(url: string): string {
  return `${SERVICE_PROXY_URL}${encodeURIComponent(url)}`;
}

function buildConvexProxyUrl(url: string, siteUrl: string | null | undefined): string | null {
  const cleanSiteUrl = siteUrl?.trim().replace(/\/+$/, "");
  if (!cleanSiteUrl) return null;
  return `${cleanSiteUrl}/proxy?url=${encodeURIComponent(url)}`;
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function mangaUpdatesCandidates(
  url: string,
  options: MobileMetadataMatchSearchOptions
): string[] {
  const proxyFirst = options.forceMangaUpdatesProxy ?? isBrowserRuntime();
  const convexProxy = buildConvexProxyUrl(
    url,
    options.convexSiteUrl ?? mobileSyncConfig.siteUrl
  );
  const proxyUrls = [convexProxy, buildServiceProxyUrl(url)];
  return proxyFirst
    ? uniqueUrls([...proxyUrls, url])
    : uniqueUrls([url, ...proxyUrls]);
}

async function fetchMangaUpdatesJson<T>(
  url: string,
  init: RequestInit,
  options: MobileMetadataMatchSearchOptions
): Promise<T | null> {
  for (const candidate of mangaUpdatesCandidates(url, options)) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    headers.set("x-proxy-user-agent", "Mozilla/5.0 (compatible; Nemu/1.0)");

    try {
      const response = await options.fetcher!(candidate, {
        ...init,
        headers,
      });
      const data = await readJson<T>(response);
      if (data) return data;
    } catch {
      // Try the next direct/proxy candidate before treating the provider as unavailable.
    }
  }
  return null;
}

async function fetchMangaUpdatesDetail(
  seriesId: number,
  options: MobileMetadataMatchSearchOptions
): Promise<MangaUpdatesSeriesDetail | null> {
  return fetchMangaUpdatesJson<MangaUpdatesSeriesDetail>(
    `${MANGA_UPDATES_API_BASE}/series/${seriesId}`,
    { method: "GET" },
    options
  );
}

async function searchMangaUpdates(
  query: string,
  options: MobileMetadataMatchSearchOptions
): Promise<MobileMetadataMatchResult[]> {
  const maxResults = options.mangaUpdatesMaxResults ?? 6;
  const search = await fetchMangaUpdatesJson<{
    results?: Array<{ record?: MangaUpdatesSearchRecord }>;
  }>(
    `${MANGA_UPDATES_API_BASE}/series/search`,
    {
      method: "POST",
      body: JSON.stringify({ search: query, per_page: maxResults }),
    },
    options
  );
  const records =
    search?.results
      ?.map((result) => result.record)
      .filter((record): record is MangaUpdatesSearchRecord => Boolean(record)) ?? [];
  const details = await Promise.all(
    records
      .slice(0, maxResults)
      .map((record) => fetchMangaUpdatesDetail(record.series_id, options))
  );

  return details
    .filter((detail): detail is MangaUpdatesSeriesDetail => detail !== null)
    .map(mapMangaUpdatesMatch)
    .filter((result) => result.title);
}

async function runProviderSearch(
  provider: MobileMetadataMatchProvider,
  query: string,
  options: MobileMetadataMatchSearchOptions
): Promise<MobileMetadataMatchResult[]> {
  switch (provider) {
    case "anilist":
      return searchAniList(query, options.fetcher!);
    case "mal":
      return searchJikan(query, options.fetcher!);
    case "mangaupdates":
      return searchMangaUpdates(query, options);
  }
}

export async function searchMobileMetadataMatches(
  query: string,
  options: MobileMetadataMatchSearchOptions = {}
): Promise<MobileMetadataMatchSearchResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return { results: [], errors: {} };

  const providers = options.providers ?? PROVIDER_PRIORITY;
  const searchOptions: MobileMetadataMatchSearchOptions = {
    ...options,
    fetcher: options.fetcher ?? fetch,
  };
  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider,
      results: await runProviderSearch(provider, trimmedQuery, searchOptions),
    }))
  );
  const errors: Partial<Record<MobileMetadataMatchProvider, string>> = {};
  const results: MobileMetadataMatchResult[] = [];

  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === "fulfilled") {
      results.push(...result.value.results);
    } else {
      errors[provider] = result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  });

  results.sort((left, right) => scoreResult(trimmedQuery, right) - scoreResult(trimmedQuery, left));
  return { results, errors };
}

export async function searchMobileMetadataSmartMatches(
  query: string,
  options: MobileMetadataSmartMatchSearchOptions = {}
): Promise<MobileMetadataSmartMatchSearchResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { results: [], errors: {}, query: "", exactMatches: [] };
  }

  const providers = options.providers ?? PROVIDER_PRIORITY;
  const searchOptions: MobileMetadataMatchSearchOptions = {
    ...options,
    providers,
  };

  const firstSearch = await searchMobileMetadataMatches(trimmedQuery, searchOptions);
  let allResults = firstSearch.results;
  let errors = { ...firstSearch.errors };
  let lastQuery = trimmedQuery;
  let exactMatches = exactMatchesForQuery(trimmedQuery, allResults);

  const searchMissingProviders = async (canonicalTitle: string) => {
    const matchedProviders = new Set(exactMatches.map((match) => match.provider));
    const missingProviders = providers.filter((provider) => !matchedProviders.has(provider));
    if (missingProviders.length === 0) return;

    const retrySearch = await searchMobileMetadataMatches(canonicalTitle, {
      ...searchOptions,
      providers: missingProviders,
    });
    allResults = mergeMatchResults(allResults, retrySearch.results);
    errors = { ...errors, ...retrySearch.errors };
    lastQuery = canonicalTitle;
    exactMatches = exactMatchesForQuery(canonicalTitle, allResults);
  };

  if (
    exactMatches.length > 0 &&
    hasMissingExactMatchProvider(exactMatches, providers)
  ) {
    const canonicalTitle = prioritySortedMatches(exactMatches)[0]?.metadata.title;
    if (canonicalTitle && canonicalTitle !== trimmedQuery) {
      await searchMissingProviders(canonicalTitle);
    }
  }

  let fallbackTitle: string | undefined;
  if (exactMatches.length === 0) {
    const aiTitle =
      "japaneseTitleClient" in options
        ? await findMobileJapaneseTitleFallback(
            trimmedQuery,
            options.authors,
            options.japaneseTitleClient ?? null
          )
        : await findMobileJapaneseTitleFallback(trimmedQuery, options.authors);

    if (aiTitle && aiTitle !== trimmedQuery) {
      fallbackTitle = aiTitle;
      const fallbackSearch = await searchMobileMetadataMatches(aiTitle, searchOptions);
      allResults = mergeMatchResults(allResults, fallbackSearch.results);
      errors = { ...errors, ...fallbackSearch.errors };
      lastQuery = aiTitle;
      exactMatches = exactMatchesForQuery(aiTitle, allResults);

      if (
        exactMatches.length > 0 &&
        hasMissingExactMatchProvider(exactMatches, providers)
      ) {
        const canonicalTitle = prioritySortedMatches(exactMatches)[0]?.metadata.title;
        if (canonicalTitle && canonicalTitle !== aiTitle) {
          await searchMissingProviders(canonicalTitle);
        }
      }
    }
  }

  return {
    results: sortResultsByQuery(lastQuery, allResults),
    errors,
    query: lastQuery,
    exactMatches,
    fallbackTitle,
  };
}
