import { unzipSync, type UnzipFileInfo } from "fflate";
import type {
  SourcePackageField,
  SourcePackageListing,
  SourcePackageMetadata,
} from "@/data/schema";
import {
  MAX_CORE_SETTING_KEY_LENGTH,
  MAX_CORE_SETTING_NODES,
  MAX_CORE_SETTING_OPTIONS,
  MAX_CORE_SETTING_SCHEMA_STRING_CHARS,
  MAX_CORE_SETTING_STRING_LENGTH,
  MAX_CORE_SETTING_URL_LENGTH,
  isUnsafeSettingTextCodePoint,
  sanitizeSettingDisplayText,
} from "@nemu/core";
import {
  MOBILE_AIX_PACKAGE_LIMITS,
  SourcePackageLimitError,
  assertAixCompressedByteLength,
} from "./sourcePackageSafety";
import { sanitizeMobileSourceSettings } from "./mobileSourceSettingsSafety";

type JsonObject = Record<string, unknown>;

export const MOBILE_AIX_METADATA_LIMITS = {
  maxCollectionItems: MAX_CORE_SETTING_NODES,
  maxOptionItems: MAX_CORE_SETTING_OPTIONS,
  maxKeyLength: MAX_CORE_SETTING_KEY_LENGTH,
  maxStringLength: MAX_CORE_SETTING_STRING_LENGTH,
  maxUrlLength: MAX_CORE_SETTING_URL_LENGTH,
  maxTotalStringChars: MAX_CORE_SETTING_SCHEMA_STRING_CHARS,
} as const;

type MetadataStringBudget = { remaining: number };

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

function extractAixMetadataFiles(
  aixBytes: Uint8Array,
): Record<string, Uint8Array> {
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
  if (!value || typeof value !== "object") return null;
  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function ownValue(record: JsonObject, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeArrayLength(value: readonly unknown[]): number {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = descriptor && "value" in descriptor ? descriptor.value : 0;
    return Number.isSafeInteger(length) && length >= 0 ? length : 0;
  } catch {
    return 0;
  }
}

function safeArrayValue(value: readonly unknown[], index: number): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isSafeAtomicString(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      codePoint === 0x200c ||
      codePoint === 0x200d ||
      isUnsafeSettingTextCodePoint(codePoint)
    ) {
      return false;
    }
  }
  return true;
}

function takeString(
  value: unknown,
  budget: MetadataStringBudget,
  maxLength: number = MOBILE_AIX_METADATA_LIMITS.maxStringLength,
  display = false,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    return undefined;
  }
  const result = display ? sanitizeSettingDisplayText(value, maxLength) : value;
  if (
    !result ||
    (!display && (result.trim().length === 0 || !isSafeAtomicString(result)))
  ) {
    return undefined;
  }
  if (result.length > budget.remaining) return undefined;
  budget.remaining -= result.length;
  return result;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asNonNegativeSafeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function takeStringArray(
  value: unknown,
  budget: MetadataStringBudget,
  maxStringLength: number = MOBILE_AIX_METADATA_LIMITS.maxStringLength,
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings: string[] = [];
  const seen = new Set<string>();
  const end = Math.min(
    safeArrayLength(value),
    MOBILE_AIX_METADATA_LIMITS.maxOptionItems,
  );
  for (let index = 0; index < end; index += 1) {
    const item = takeString(
      safeArrayValue(value, index),
      budget,
      maxStringLength,
    );
    if (!item || seen.has(item)) continue;
    seen.add(item);
    strings.push(item);
  }
  return strings.length > 0 ? strings : undefined;
}

function takeHttpUrl(
  value: unknown,
  budget: MetadataStringBudget,
): string | undefined {
  const raw = takeString(
    value,
    budget,
    MOBILE_AIX_METADATA_LIMITS.maxUrlLength,
  );
  if (!raw) return undefined;
  try {
    const normalized = raw.trim();
    const parsed = new URL(normalized);
    return parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      (parsed.protocol === "https:" || parsed.protocol === "http:")
      ? normalized
      : undefined;
  } catch {
    return undefined;
  }
}

function takeUrlArray(
  value: unknown,
  budget: MetadataStringBudget,
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const urls: string[] = [];
  const seen = new Set<string>();
  const end = Math.min(
    safeArrayLength(value),
    MOBILE_AIX_METADATA_LIMITS.maxOptionItems,
  );
  for (let index = 0; index < end; index += 1) {
    const url = takeHttpUrl(safeArrayValue(value, index), budget);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls.length > 0 ? urls : undefined;
}

function parseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return undefined;
  return JSON.parse(new TextDecoder().decode(bytes));
}

function normalizeListings(
  value: unknown,
  budget: MetadataStringBudget,
): SourcePackageListing[] {
  if (!Array.isArray(value)) return [];
  const listings: SourcePackageListing[] = [];
  const end = Math.min(
    safeArrayLength(value),
    MOBILE_AIX_METADATA_LIMITS.maxCollectionItems,
  );
  for (let index = 0; index < end; index += 1) {
    const item = asObject(safeArrayValue(value, index));
    if (!item) continue;
    const id =
      takeString(
        ownValue(item, "id"),
        budget,
        MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
      ) ??
      takeString(
        ownValue(item, "name"),
        budget,
        MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
      ) ??
      `listing-${index}`;
    const kind = asNumber(ownValue(item, "kind"));
    const listing: SourcePackageListing = {
      id,
      name:
        takeString(ownValue(item, "name"), budget, undefined, true) ??
        takeString(ownValue(item, "title"), budget, undefined, true) ??
        id,
    };
    if (kind === 0 || kind === 1) listing.kind = kind;
    listings.push(listing);
  }
  return listings;
}

function normalizeFields(
  value: unknown,
  budget: MetadataStringBudget,
): SourcePackageField[] {
  if (!Array.isArray(value)) return [];
  const fields: SourcePackageField[] = [];
  const end = Math.min(
    safeArrayLength(value),
    MOBILE_AIX_METADATA_LIMITS.maxCollectionItems,
  );
  for (let index = 0; index < end; index += 1) {
    const item = asObject(safeArrayValue(value, index));
    if (!item) continue;
    const id = takeString(
      ownValue(item, "id"),
      budget,
      MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
    );
    const title =
      takeString(ownValue(item, "title"), budget, undefined, true) ??
      takeString(ownValue(item, "name"), budget, undefined, true) ??
      id ??
      "Filter";
    const type =
      takeString(
        ownValue(item, "type"),
        budget,
        MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
      ) ?? "unknown";
    const options = ownValue(item, "options");
    const optionCount = Array.isArray(options)
      ? Math.min(
          safeArrayLength(options),
          MOBILE_AIX_METADATA_LIMITS.maxOptionItems,
        )
      : undefined;
    fields.push({ id, title, type, optionCount });
  }
  return fields;
}

export function extractAixMetadata(
  aixBytes: Uint8Array,
): SourcePackageMetadata {
  assertAixCompressedByteLength(aixBytes.byteLength);
  const archive = inspectAixArchive(aixBytes);
  const files = extractAixMetadataFiles(aixBytes);
  const manifest = asObject(parseJson(files[AIX_MANIFEST_PATH]));
  if (!manifest) {
    throw new Error("Invalid .aix package: missing Payload/source.json");
  }

  const info = asObject(ownValue(manifest, "info"));
  if (!info) {
    throw new Error("Invalid .aix package: missing manifest info");
  }

  const stringBudget: MetadataStringBudget = {
    remaining: MOBILE_AIX_METADATA_LIMITS.maxTotalStringChars,
  };
  const sourceId = takeString(
    ownValue(info, "id"),
    stringBudget,
    MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
  );
  const name =
    takeString(ownValue(info, "name"), stringBudget, undefined, true) ??
    sourceId;
  if (!sourceId || !name) {
    throw new Error("Invalid .aix package: missing source id or name");
  }

  const filtersJson = parseJson(files[AIX_FILTERS_PATH]);
  const settingsJson = parseJson(files[AIX_SETTINGS_PATH]);
  const languageFallback = takeString(
    ownValue(info, "lang"),
    stringBudget,
    MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
  );
  const rawManifestFilters = ownValue(manifest, "filters");
  const manifestFilters =
    Array.isArray(rawManifestFilters) && safeArrayLength(rawManifestFilters) > 0
      ? rawManifestFilters
      : filtersJson;
  const languages =
    takeStringArray(
      ownValue(info, "languages"),
      stringBudget,
      MOBILE_AIX_METADATA_LIMITS.maxKeyLength,
    ) ?? (languageFallback ? [languageFallback] : undefined);
  const singleUrl = takeHttpUrl(ownValue(info, "url"), stringBudget);
  const urls =
    takeUrlArray(ownValue(info, "urls"), stringBudget) ??
    (singleUrl ? [singleUrl] : undefined);

  return {
    sourceId,
    name,
    version: asNonNegativeSafeInteger(ownValue(info, "version")) ?? 1,
    languages,
    contentRating: asNonNegativeSafeInteger(ownValue(info, "contentRating")),
    urls,
    listings: normalizeListings(ownValue(manifest, "listings"), stringBudget),
    filters: normalizeFields(manifestFilters, stringBudget),
    settings: sanitizeMobileSourceSettings(settingsJson),
    hasWasm: archive.hasWasm,
  };
}
