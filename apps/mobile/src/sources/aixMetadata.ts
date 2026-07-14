import { unzipSync, type UnzipFileInfo } from "fflate";
import type {
  SourcePackageField,
  SourcePackageListing,
  SourcePackageMetadata,
  SourcePackageSetting,
} from "@/data/schema";
import {
  MOBILE_AIX_PACKAGE_LIMITS,
  SourcePackageLimitError,
  assertAixCompressedByteLength,
} from "./sourcePackageSafety";

type JsonObject = Record<string, unknown>;

const AIX_MANIFEST_PATH = "Payload/source.json";
const AIX_FILTERS_PATH = "Payload/filters.json";
const AIX_SETTINGS_PATH = "Payload/settings.json";
const AIX_WASM_PATH = "Payload/main.wasm";
const AIX_METADATA_PATHS = new Set([
  AIX_MANIFEST_PATH,
  AIX_FILTERS_PATH,
  AIX_SETTINGS_PATH,
]);

type AixArchiveInspection = {
  hasWasm: boolean;
};

function assertZipEntrySize(value: number, path: string, kind: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SourcePackageLimitError(
      `Invalid .aix package: ${path} has an invalid ${kind} size.`,
    );
  }
}

/**
 * First walk the central directory without inflating anything. `unzipSync`'s
 * filter receives the declared compressed/uncompressed sizes before it allocates
 * an output buffer, which lets us reject ZIP bombs before metadata extraction.
 */
function inspectAixArchive(aixBytes: Uint8Array): AixArchiveInspection {
  let entryCount = 0;
  let declaredUncompressedBytes = 0;
  let hasWasm = false;
  const criticalPaths = new Set<string>();

  unzipSync(aixBytes, {
    filter(entry: UnzipFileInfo) {
      entryCount += 1;
      if (entryCount > MOBILE_AIX_PACKAGE_LIMITS.maxEntries) {
        throw new SourcePackageLimitError(
          `Invalid .aix package: archive exceeds the ${MOBILE_AIX_PACKAGE_LIMITS.maxEntries} entry safety limit.`,
        );
      }

      assertZipEntrySize(entry.size, entry.name, "compressed");
      assertZipEntrySize(entry.originalSize, entry.name, "uncompressed");
      declaredUncompressedBytes += entry.originalSize;
      if (
        declaredUncompressedBytes >
        MOBILE_AIX_PACKAGE_LIMITS.maxDeclaredUncompressedBytes
      ) {
        throw new SourcePackageLimitError(
          `Invalid .aix package: declared uncompressed data exceeds the ${MOBILE_AIX_PACKAGE_LIMITS.maxDeclaredUncompressedBytes} byte safety limit.`,
        );
      }

      const isMetadata = AIX_METADATA_PATHS.has(entry.name);
      const isWasm = entry.name === AIX_WASM_PATH;
      if (isMetadata || isWasm) {
        if (criticalPaths.has(entry.name)) {
          throw new SourcePackageLimitError(
            `Invalid .aix package: duplicate ${entry.name} entry.`,
          );
        }
        criticalPaths.add(entry.name);
      }

      if (
        isMetadata &&
        entry.originalSize > MOBILE_AIX_PACKAGE_LIMITS.maxMetadataEntryBytes
      ) {
        throw new SourcePackageLimitError(
          `Invalid .aix package: ${entry.name} exceeds the ${MOBILE_AIX_PACKAGE_LIMITS.maxMetadataEntryBytes} byte metadata safety limit.`,
        );
      }
      if (isWasm) hasWasm = true;

      // This pass is inspection-only. In particular, never inflate main.wasm
      // merely to display package metadata in Settings.
      return false;
    },
  });

  return { hasWasm };
}

function extractAixMetadataFiles(aixBytes: Uint8Array): Record<string, Uint8Array> {
  const files = unzipSync(aixBytes, {
    filter(entry) {
      return AIX_METADATA_PATHS.has(entry.name);
    },
  });
  let actualBytes = 0;
  for (const [path, bytes] of Object.entries(files)) {
    if (bytes.byteLength > MOBILE_AIX_PACKAGE_LIMITS.maxMetadataEntryBytes) {
      throw new SourcePackageLimitError(
        `Invalid .aix package: ${path} exceeds the ${MOBILE_AIX_PACKAGE_LIMITS.maxMetadataEntryBytes} byte metadata safety limit.`,
      );
    }
    actualBytes += bytes.byteLength;
    if (actualBytes > MOBILE_AIX_PACKAGE_LIMITS.maxExtractedMetadataBytes) {
      throw new SourcePackageLimitError(
        `Invalid .aix package: extracted metadata exceeds the ${MOBILE_AIX_PACKAGE_LIMITS.maxExtractedMetadataBytes} byte safety limit.`,
      );
    }
  }
  return files;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.length ? strings : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return undefined;
  return JSON.parse(new TextDecoder().decode(bytes));
}

function parseObjectArray(bytes: Uint8Array | undefined): JsonObject[] | undefined {
  const parsed = parseJson(bytes);
  if (!Array.isArray(parsed)) return undefined;
  const objects = parsed.map(asObject).filter((item): item is JsonObject => item !== null);
  return objects.length ? objects : undefined;
}

function normalizeListings(value: unknown): SourcePackageListing[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asObject)
    .filter((item): item is JsonObject => item !== null)
    .map((item, index) => {
      const id = asString(item.id) ?? asString(item.name) ?? `listing-${index}`;
      const kind = asNumber(item.kind);
      const listing: SourcePackageListing = {
        id,
        name: asString(item.name) ?? asString(item.title) ?? id,
      };
      if (kind === 0 || kind === 1) listing.kind = kind;
      return listing;
    });
}

function normalizeFields(value: unknown): SourcePackageField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asObject)
    .filter((item): item is JsonObject => item !== null)
    .map((item) => {
      const id = asString(item.id);
      const title = asString(item.title) ?? asString(item.name) ?? id ?? "Filter";
      const options = Array.isArray(item.options) ? item.options : undefined;
      return {
        id,
        title,
        type: asString(item.type) ?? "unknown",
        optionCount: options?.length,
      };
    });
}

function normalizeSettings(value: unknown): SourcePackageSetting[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asObject)
    .filter((item): item is JsonObject => item !== null)
    .map((item, index) => {
      const key = asString(item.key) ?? asString(item.id) ?? `setting-${index}`;
      const optionValues = asStringArray(item.values) ?? asStringArray(item.options);
      const optionTitles = asStringArray(item.titles) ?? asStringArray(item.labels);
      const children = normalizeSettings(item.items);
      const stringDefault = asString(item.default);
      const numberDefault = asNumber(item.default);
      const booleanDefault = asBoolean(item.default);
      const arrayDefault = asStringArray(item.default);
      const setting: SourcePackageSetting = {
        key,
        title: asString(item.title) ?? asString(item.name) ?? key,
        type: asString(item.type) ?? "unknown",
      };
      const subtitle = asString(item.subtitle) ?? asString(item.description);
      const footer = asString(item.footer);
      const defaultValue = stringDefault ?? numberDefault ?? booleanDefault ?? arrayDefault;
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
      const info = asString(item.info);
      const icon = asObject(item.icon);
      const optionCount = optionValues?.length ?? optionTitles?.length;

      if (subtitle) setting.subtitle = subtitle;
      if (footer) setting.footer = footer;
      if (optionCount !== undefined) setting.optionCount = optionCount;
      if (optionValues) setting.values = optionValues;
      if (optionTitles) setting.titles = optionTitles;
      if (defaultValue !== undefined) setting.default = defaultValue;
      if (min !== undefined) setting.min = min;
      if (max !== undefined) setting.max = max;
      if (step !== undefined) setting.step = step;
      if (placeholder) setting.placeholder = placeholder;
      if (secure !== undefined) setting.secure = secure;
      if (requires) setting.requires = requires;
      if (requiresFalse) setting.requiresFalse = requiresFalse;
      if (requiresFeature) setting.requiresFeature = requiresFeature;
      if (notification) setting.notification = notification;
      if (refreshes?.length) setting.refreshes = refreshes;
      if (action) setting.action = action;
      if (url) setting.url = url;
      if (urlKey) setting.urlKey = urlKey;
      if (info) setting.info = info;
      if (icon) {
        const iconType = asString(icon.type);
        const normalizedIcon: SourcePackageSetting["icon"] = {};
        const iconName = asString(icon.name);
        const iconUrl = asString(icon.url);
        const iconColor = asString(icon.color);
        if (iconType === "system" || iconType === "url") normalizedIcon.type = iconType;
        if (iconName) normalizedIcon.name = iconName;
        if (iconUrl) normalizedIcon.url = iconUrl;
        if (iconColor) normalizedIcon.color = iconColor;
        if (Object.keys(normalizedIcon).length) setting.icon = normalizedIcon;
      }
      if (children.length) setting.items = children;

      return setting;
    });
}

export function extractAixMetadata(aixBytes: Uint8Array): SourcePackageMetadata {
  assertAixCompressedByteLength(aixBytes.byteLength);
  const archive = inspectAixArchive(aixBytes);
  const files = extractAixMetadataFiles(aixBytes);
  const manifest = asObject(parseJson(files[AIX_MANIFEST_PATH]));
  if (!manifest) {
    throw new Error("Invalid .aix package: missing Payload/source.json");
  }

  const info = asObject(manifest.info);
  if (!info) {
    throw new Error("Invalid .aix package: missing manifest info");
  }

  const sourceId = asString(info.id);
  const name = asString(info.name) ?? sourceId;
  if (!sourceId || !name) {
    throw new Error("Invalid .aix package: missing source id or name");
  }

  const filtersJson = parseObjectArray(files[AIX_FILTERS_PATH]);
  const settingsJson = parseObjectArray(files[AIX_SETTINGS_PATH]);
  const languageFallback = asString(info.lang);
  const manifestFilters =
    Array.isArray(manifest.filters) && manifest.filters.length > 0
      ? manifest.filters
      : filtersJson;

  return {
    sourceId,
    name,
    version: asNumber(info.version) ?? 1,
    languages: asStringArray(info.languages) ?? (languageFallback ? [languageFallback] : undefined),
    contentRating: asNumber(info.contentRating),
    urls: asStringArray(info.urls) ?? (asString(info.url) ? [asString(info.url) as string] : undefined),
    listings: normalizeListings(manifest.listings),
    filters: normalizeFields(manifestFilters),
    settings: normalizeSettings(settingsJson),
    hasWasm: archive.hasWasm,
  };
}
