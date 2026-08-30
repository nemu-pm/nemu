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

type MobilePresentedFilter = Filter & {
  displayName?: string;
  optionName?: string;
  hideFromHeader?: boolean;
};

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
    case FilterType.Title:
      return "title";
    case FilterType.Author:
      return "author";
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
  const presentation = filter as MobilePresentedFilter;
  const displayName = presentation.displayName;
  const optionCount =
    "options" in filter && Array.isArray(filter.options)
      ? filter.options.length
      : "filters" in filter && Array.isArray(filter.filters)
        ? filter.filters.length
        : undefined;

  return {
    id: filter.name || `filter-${index}`,
    ...(typeof presentation.optionName === "string" &&
    presentation.optionName.trim()
      ? { name: presentation.optionName.trim() }
      : {}),
    title:
      (typeof displayName === "string" && displayName.trim()) ||
      filter.name ||
      "Filter",
    type: filterTypeLabel(filter),
    ...(presentation.hideFromHeader === undefined
      ? {}
      : { hideFromHeader: presentation.hideFromHeader }),
    ...(optionCount === undefined ? {} : { optionCount }),
    ...("options" in filter && Array.isArray(filter.options)
      ? { options: filter.options }
      : {}),
    ...("ids" in filter && Array.isArray(filter.ids)
      ? { ids: filter.ids }
      : {}),
    ...(filter.type === FilterType.Text && filter.placeholder
      ? { placeholder: filter.placeholder }
      : {}),
    ...(filter.type === FilterType.Sort
      ? { default: filter.default, canAscend: filter.canAscend }
      : {}),
    ...(filter.type === FilterType.Select
      ? { default: filter.default }
      : {}),
    ...(filter.type === FilterType.Check
      ? {
          default: filter.default,
          ...(filter.canExclude === undefined
            ? {}
            : { canExclude: filter.canExclude }),
        }
      : {}),
    ...(filter.type === FilterType.Genre
      ? { canExclude: filter.canExclude }
      : {}),
  };
}

function withPackageFilterPresentation<T extends Filter>(
  filter: T,
  field: SourcePackageField,
): T {
  return {
    ...filter,
    displayName: field.title,
    ...(field.name ? { optionName: field.name } : {}),
    ...(field.hideFromHeader === undefined
      ? {}
      : { hideFromHeader: field.hideFromHeader }),
  } as T;
}

function packageFieldToRuntimeFilter(
  field: SourcePackageField,
  index: number,
): Filter | null {
  const name = field.id?.trim() || field.title.trim() || `filter-${index}`;
  const type = field.type.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const options = field.options ?? [];
  const ids =
    field.ids && field.ids.length === options.length ? field.ids : undefined;

  if (type === "title" || (type === "text" && name.toLowerCase() === "title")) {
    return withPackageFilterPresentation(
      { type: FilterType.Title, name },
      field,
    );
  }
  if (type === "author" || (type === "text" && name.toLowerCase() === "author")) {
    return withPackageFilterPresentation(
      { type: FilterType.Author, name },
      field,
    );
  }
  if (type === "text") {
    return withPackageFilterPresentation(
      {
        type: FilterType.Text,
        name,
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      },
      field,
    );
  }
  if (type === "sort" && options.length) {
    const rawDefault = field.default;
    const defaultSelection =
      rawDefault && typeof rawDefault === "object"
        ? rawDefault
        : { index: 0, ascending: false };
    return withPackageFilterPresentation(
      {
        type: FilterType.Sort,
        name,
        options,
        default: {
          index: Math.min(defaultSelection.index, options.length - 1),
          ascending: defaultSelection.ascending,
        },
        canAscend: field.canAscend ?? false,
      },
      field,
    );
  }
  if (
    (type === "select" || type === "single-select" || type === "multi-single-select") &&
    options.length
  ) {
    const defaultIndex =
      typeof field.default === "number" && field.default >= 0
        ? Math.min(field.default, options.length - 1)
        : 0;
    return withPackageFilterPresentation(
      {
        type: FilterType.Select,
        name,
        options,
        ...(ids ? { ids } : {}),
        default: defaultIndex,
      },
      field,
    );
  }
  if (type === "check" || type === "toggle") {
    return withPackageFilterPresentation(
      {
        type: FilterType.Check,
        name,
        default: typeof field.default === "boolean" ? field.default : false,
        ...(field.canExclude === undefined
          ? {}
          : { canExclude: field.canExclude }),
      },
      field,
    );
  }
  if ((type === "multi-select" || type === "multiselect" || type === "genre") && options.length) {
    return withPackageFilterPresentation(
      {
        type: FilterType.Genre,
        name,
        options,
        ...(ids ? { ids } : {}),
        canExclude: field.canExclude ?? false,
        default: [],
      },
      field,
    );
  }
  return null;
}

function mergeRuntimeAndPackageFilters(
  runtimeFilters: Filter[],
  packageFields: SourcePackageField[],
): Filter[] {
  const validRuntimeFilters = runtimeFilters.filter((filter) =>
    [
      FilterType.Title,
      FilterType.Author,
      FilterType.Text,
      FilterType.Select,
      FilterType.Sort,
      FilterType.Check,
      FilterType.Group,
      FilterType.Genre,
    ].includes(filter.type),
  );
  const packageByName = new Map<string, SourcePackageField>();
  packageFields.forEach((field, index) => {
    packageByName.set(field.id?.trim() || field.title.trim() || `filter-${index}`, field);
  });
  const merged = validRuntimeFilters.map((filter) => {
    const field = packageByName.get(filter.name);
    return field ? withPackageFilterPresentation(filter, field) : filter;
  });
  const runtimeNames = new Set(validRuntimeFilters.map((filter) => filter.name));
  packageFields.forEach((field, index) => {
    const filter = packageFieldToRuntimeFilter(field, index);
    if (filter && !runtimeNames.has(filter.name)) merged.push(filter);
  });
  return merged;
}

function mergeRuntimePackageMetadata({
  source,
  baseMetadata,
  normalizedSourceId,
  listings,
  filters,
  settings,
}: {
  source: InstalledSource;
  baseMetadata?: SourcePackageMetadata | null;
  normalizedSourceId: string;
  listings: SourcePackageListing[];
  filters: Filter[];
  settings: SourcePackageSetting[];
}): SourcePackageMetadata {
  const current = baseMetadata ?? source.packageMetadata;
  const contentRating = current?.contentRating ?? source.contentRating;
  const languages = current?.languages ?? source.languages;
  const persisted = source.packageMetadata;

  return {
    sourceId: current?.sourceId ?? normalizedSourceId,
    name: current?.name ?? source.name ?? normalizedSourceId,
    version: current?.version ?? source.version,
    ...(languages ? { languages } : {}),
    ...(contentRating == null ? {} : { contentRating }),
    ...(current?.urls ?? persisted?.urls
      ? { urls: current?.urls ?? persisted?.urls }
      : {}),
    listings: listings.length
      ? listings
      : current?.listings.length
        ? current.listings
        : (persisted?.listings ?? []),
    filters: filters.length
      ? filters.map(normalizeRuntimeFilterField)
      : current?.filters.length
        ? current.filters
        : (persisted?.filters ?? []),
    settings: settings.length
      ? settings
      : current?.settings.length
        ? current.settings
        : (persisted?.settings ?? []),
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
      const runtimeFilters = await session.source.getFilters().catch(() => []);
      const packageFilterFields = session.metadata?.filters.length
        ? session.metadata.filters
        : (source.packageMetadata?.filters ?? []);
      const filters = mergeRuntimeAndPackageFilters(
        runtimeFilters,
        packageFilterFields,
      );
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
          baseMetadata: session.metadata,
          normalizedSourceId: normalized.sourceId,
          listings: normalizedListings,
          filters,
          settings: runtimeSettings,
        }),
      };
    },
  );
}
