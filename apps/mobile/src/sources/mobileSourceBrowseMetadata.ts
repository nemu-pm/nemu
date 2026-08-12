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
    ...(listing.kind === 0 || listing.kind === 1
      ? { kind: listing.kind }
      : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return strings.length ? strings : undefined;
}

function tachiyomiPreferenceChildren(preference: Record<string, unknown>): unknown[] {
  for (const key of ["preferences", "items", "children"]) {
    const children = preference[key];
    if (Array.isArray(children)) return children;
  }
  return [];
}

function normalizeRuntimeSetting(
  preference: unknown,
  index: number,
): SourcePackageSetting | null {
  const item = asRecord(preference);
  if (!item) return null;

  const rawType = asString(item.type) ?? "";
  const key = asString(item.key) ?? asString(item.id) ?? `setting-${index}`;
  const title = asString(item.title) ?? asString(item.name) ?? key;
  const subtitle =
    asString(item.subtitle) ??
    asString(item.summary) ??
    asString(item.description);
  const footer = asString(item.footer);
  const values =
    asStringArray(item.values) ??
    asStringArray(item.entryValues) ??
    asStringArray(item.options);
  const titles =
    asStringArray(item.titles) ??
    asStringArray(item.entries) ??
    asStringArray(item.labels);
  const children = normalizeRuntimeSettings(tachiyomiPreferenceChildren(item));
  const defaultValue =
    asString(item.defaultValue) ??
    asStringArray(item.defaultValue) ??
    asNumber(item.defaultValue) ??
    asBoolean(item.defaultValue) ??
    asString(item.default) ??
    asStringArray(item.default) ??
    asNumber(item.default) ??
    asBoolean(item.default);
  const min = asNumber(item.min) ?? asNumber(item.minimum);
  const max = asNumber(item.max) ?? asNumber(item.maximum);
  const step = asNumber(item.step);
  const placeholder = asString(item.placeholder);
  const secure = asBoolean(item.secure) ?? asBoolean(item.password);
  const requires = asString(item.requires);
  const requiresFalse = asString(item.requiresFalse);
  const requiresFeature = asString(item.requiresFeature);
  const notification = asString(item.notification);
  const refreshes = asStringArray(item.refreshes)?.filter(
    (value): value is "content" | "listings" | "settings" | "filters" =>
      value === "content" ||
      value === "listings" ||
      value === "settings" ||
      value === "filters",
  );
  const action = asString(item.action);
  const url = asString(item.url);
  const urlKey = asString(item.urlKey);
  const rawMethod = asString(item.method);
  const method =
    rawMethod === "basic" || rawMethod === "web" || rawMethod === "oauth"
      ? rawMethod
      : undefined;
  const logoutTitle = asString(item.logoutTitle);
  const localStorageKeys = asStringArray(item.localStorageKeys);
  const useEmail = asBoolean(item.useEmail);
  const external = asBoolean(item.external);
  const destructive = asBoolean(item.destructive);
  const confirmTitle = asString(item.confirmTitle);
  const confirmMessage = asString(item.confirmMessage);
  const callbackScheme = asString(item.callbackScheme);
  const tokenUrl = asString(item.tokenUrl);
  const pkce = asBoolean(item.pkce);
  const info = asString(item.info);
  const optionCount = values?.length ?? titles?.length;

  const base: Omit<SourcePackageSetting, "type"> = {
    key,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(footer ? { footer } : {}),
    ...(optionCount === undefined ? {} : { optionCount }),
    ...(values ? { values } : {}),
    ...(titles ? { titles } : {}),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(step === undefined ? {} : { step }),
    ...(requires ? { requires } : {}),
    ...(requiresFalse ? { requiresFalse } : {}),
    ...(requiresFeature ? { requiresFeature } : {}),
    ...(notification ? { notification } : {}),
    ...(refreshes?.length ? { refreshes } : {}),
    ...(action ? { action } : {}),
    ...(url ? { url } : {}),
    ...(urlKey ? { urlKey } : {}),
    ...(method ? { method } : {}),
    ...(logoutTitle ? { logoutTitle } : {}),
    ...(localStorageKeys ? { localStorageKeys } : {}),
    ...(useEmail === undefined ? {} : { useEmail }),
    ...(external === undefined ? {} : { external }),
    ...(destructive === undefined ? {} : { destructive }),
    ...(confirmTitle ? { confirmTitle } : {}),
    ...(confirmMessage ? { confirmMessage } : {}),
    ...(callbackScheme ? { callbackScheme } : {}),
    ...(tokenUrl ? { tokenUrl } : {}),
    ...(pkce === undefined ? {} : { pkce }),
    ...(info ? { info } : {}),
    ...(children.length ? { items: children } : {}),
  };

  switch (rawType) {
    case "PreferenceCategory":
    case "category":
    case "group":
      return { ...base, type: "group" };
    case "ListPreference":
    case "select":
      return { ...base, type: "select" };
    case "MultiSelectListPreference":
    case "multi-select":
      return { ...base, type: "multi-select" };
    case "SwitchPreference":
    case "SwitchPreferenceCompat":
    case "CheckBoxPreference":
    case "switch":
      return { ...base, type: "switch" };
    case "EditTextPreference":
    case "text":
      return {
        ...base,
        type: "text",
        ...(placeholder ? { placeholder } : {}),
        ...(secure === undefined ? {} : { secure }),
      };
    case "SeekBarPreference":
    case "slider":
      return { ...base, type: "slider" };
    case "PreferenceScreen":
    case "page":
      return { ...base, type: "page" };
    case "button":
      return { ...base, type: "button" };
    case "link":
      return { ...base, type: "link" };
    case "login":
      return { ...base, type: "login" };
    case "segment":
    case "editable-list":
      return { ...base, type: rawType };
    default:
      return null;
  }
}

function normalizeRuntimeSettings(rawSettings: unknown): SourcePackageSetting[] {
  if (!Array.isArray(rawSettings)) return [];
  return rawSettings
    .map(normalizeRuntimeSetting)
    .filter((setting): setting is SourcePackageSetting => setting !== null);
}

function parseRuntimeSettingsSchema(schemaJson: string | null | undefined): SourcePackageSetting[] {
  if (!schemaJson) return [];

  try {
    const schema = JSON.parse(schemaJson) as unknown;
    if (Array.isArray(schema)) return normalizeRuntimeSettings(schema);
    const record = asRecord(schema);
    return normalizeRuntimeSettings(
      record?.preferences ?? record?.items ?? record?.settings ?? [],
    );
  } catch {
    return [];
  }
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

function normalizeRuntimeFilterField(filter: Filter, index: number): SourcePackageField {
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
    listings: listings.length ? listings : current?.listings ?? [],
    filters: filters.length
      ? filters.map(normalizeRuntimeFilterField)
      : current?.filters ?? [],
    settings: settings.length ? settings : current?.settings ?? [],
    hasWasm: current?.hasWasm ?? (source.sourceKind !== "tachiyomi"),
  };
}

export async function fetchMobileSourceBrowseMetadata(
  source: InstalledSource,
  options: MobileSourceBrowseMetadataOptions = {},
): Promise<MobileSourceBrowseMetadataResult> {
  const display = toSearchSourceDisplay(source);
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(
    sourceKey,
    source,
  );
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
      const settingsSchemaJson =
        await (session.source.getSettingsSchema?.() ?? Promise.resolve(null))
          .catch(() => null);
      const hasHomeProvider = await session.source.hasHomeProvider();
      const hasListingProvider = await session.source.hasListingProvider();
      const onlySearch = await session.source.isOnlySearch();
      const normalizedListings = listings.map(normalizeRuntimeListing);
      const runtimeSettings = parseRuntimeSettingsSchema(settingsSchemaJson);

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
