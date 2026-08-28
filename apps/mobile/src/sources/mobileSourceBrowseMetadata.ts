import type {
  SourcePackageField,
  InstalledSource,
  SourcePackageListing,
  SourcePackageMetadata,
  SourcePackageSetting,
} from "@/data/schema";
import { FilterType, type Filter } from "./aidokuContract";
import {
  toSearchSourceDisplay,
  type SearchSourceDisplay,
} from "@/lib/mobileSearch";
import { getMobileSourceListingLabel } from "@/lib/mobileSourceListingsPresentation";
import {
  type Listing,
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorRuntime,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  defaultMobileSourceSettings,
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "./mobileSourceRuntime";
import { parseMobileRuntimeSettingsSchema } from "./mobileSourceSettingsSafety";

export type MobileSourceBrowseMetadataResult =
  | {
      status: "ready";
      source: SearchSourceDisplay;
      runtime: MobileSourceExecutorRuntime;
      listings: SourcePackageListing[];
      filters: Filter[];
      hasHomeProvider: boolean;
      hasListingProvider: boolean;
      onlySearch: boolean;
      packageMetadata: SourcePackageMetadata;
    }
  | {
      status: "blocked";
      source: SearchSourceDisplay;
      reason: string;
      detail: string;
    };

export type MobileSourceBrowseMetadataOptions = {
  getSourceSettings?: (
    sourceKey: string,
    source: InstalledSource,
  ) => Promise<Record<string, unknown>>;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
};

function normalizeRuntimeListing(listing: Listing): SourcePackageListing {
  return {
    id: listing.id,
    name: getMobileSourceListingLabel(listing),
    ...(listing.kind === 0 || listing.kind === 1 ? { kind: listing.kind } : {}),
  };
}

function filterTypeLabel(filter: Filter): string {
  switch (filter.type) {
    case FilterType.Text:
      return "text";
    case FilterType.Check:
      return "check";
    case FilterType.Select:
      return "select";
    case FilterType.Genre:
      return "genre";
    case FilterType.Sort:
      return "sort";
    case FilterType.Group:
      return "group";
    default:
      return "unknown";
  }
}

function normalizeRuntimeFilterField(
  filter: Filter,
  index: number,
): SourcePackageField {
  const optionCount =
    "options" in filter && Array.isArray(filter.options)
      ? filter.options.length
      : "filters" in filter && Array.isArray(filter.filters)
        ? filter.filters.length
        : undefined;

  return {
    id: filter.name || `filter-${index}`,
    title: filter.name || "Filter",
    type: filterTypeLabel(filter),
    ...(optionCount === undefined ? {} : { optionCount }),
  };
}

function mergeRuntimePackageMetadata({
  source,
  normalizedSourceId,
  listings,
  filters,
  settings,
}: {
  source: InstalledSource;
  normalizedSourceId: string;
  listings: SourcePackageListing[];
  filters: Filter[];
  settings: SourcePackageSetting[];
}): SourcePackageMetadata {
  const current = source.packageMetadata;
  const contentRating = current?.contentRating ?? source.contentRating;
  const languages = current?.languages ?? source.languages;

  return {
    sourceId: current?.sourceId ?? normalizedSourceId,
    name: current?.name ?? source.name ?? normalizedSourceId,
    version: current?.version ?? source.version,
    ...(languages ? { languages } : {}),
    ...(contentRating == null ? {} : { contentRating }),
    ...(current?.urls ? { urls: current.urls } : {}),
    listings: listings.length ? listings : (current?.listings ?? []),
    filters: filters.length
      ? filters.map(normalizeRuntimeFilterField)
      : (current?.filters ?? []),
    settings: settings.length ? settings : (current?.settings ?? []),
    hasWasm: current?.hasWasm ?? source.sourceKind !== "tachiyomi",
  };
}

export async function fetchMobileSourceBrowseMetadata(
  source: InstalledSource,
  options: MobileSourceBrowseMetadataOptions = {},
): Promise<MobileSourceBrowseMetadataResult> {
  const display = toSearchSourceDisplay(source);
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (
    options.getSourceSettings ?? defaultMobileSourceSettings
  )(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceBrowseMetadataResult> => {
      if (session.status === "blocked") {
        return {
          status: "blocked",
          source: display,
          reason: session.reason,
          detail: session.detail,
        };
      }

      const listings = await session.source.getListings();
      const filters = await session.source.getFilters().catch(() => []);
      const settingsSchemaJson = await (
        session.source.getSettingsSchema?.() ?? Promise.resolve(null)
      ).catch(() => null);
      const hasHomeProvider = await session.source.hasHomeProvider();
      const hasListingProvider = await session.source.hasListingProvider();
      const onlySearch = await session.source.isOnlySearch();
      const normalizedListings = listings.map(normalizeRuntimeListing);
      const runtimeSettings =
        parseMobileRuntimeSettingsSchema(settingsSchemaJson);

      return {
        status: "ready",
        source: display,
        runtime: session.runtime,
        listings: normalizedListings,
        filters,
        hasHomeProvider,
        hasListingProvider,
        onlySearch,
        packageMetadata: mergeRuntimePackageMetadata({
          source,
          normalizedSourceId: normalized.sourceId,
          listings: normalizedListings,
          filters,
          settings: runtimeSettings,
        }),
      };
    },
  );
}
