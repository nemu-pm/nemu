import type { SourcePackageMetadata } from "@/data/schema";
import { mobileNativeFetch } from "./mobileNativeHttp";
import {
  AIDOKU_REGISTRIES as CORE_AIDOKU_REGISTRIES,
  type AidokuRegistryDefinition,
} from "@nemu/core/sources";
import { sha256Bytes } from "@nemu/core";
import { throwIfMobileNativeHttpAborted } from "./mobileNativeHttpAbort";

// Re-export the shared type so existing `import { type AidokuRegistryDefinition
// } from "./aidokuRegistry"` call sites (incl. the test fixture) keep working.
export type { AidokuRegistryDefinition };

export type MobileRegistrySource = {
  id: string;
  registryId: string;
  registryName: string;
  sourceKind?: "aidoku" | "tachiyomi";
  name: string;
  version: number;
  icon?: string;
  downloadUrl?: string;
  languages?: string[];
  contentRating?: number;
  hasAuthentication?: boolean;
  hasCloudflare?: boolean;
  packageMetadata?: SourcePackageMetadata | null;
};

type RegistryIndexSource = Record<string, unknown>;

export const MOBILE_AIDOKU_REGISTRY_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MOBILE_AIDOKU_REGISTRY_MAX_SOURCES = 2_048;
const MOBILE_AIDOKU_REGISTRY_MAX_ID_LENGTH = 256;
const MOBILE_AIDOKU_REGISTRY_MAX_NAME_LENGTH = 512;
const MOBILE_AIDOKU_REGISTRY_MAX_URL_LENGTH = 8_192;
const MOBILE_AIDOKU_REGISTRY_MAX_LANGUAGES = 64;
const MOBILE_AIDOKU_REGISTRY_MAX_LANGUAGE_LENGTH = 64;

// Mutable re-export of the shared list. Core holds it `as const` (readonly);
// mobile's `fetchAllAidokuRegistrySources` uses
// `registries: AidokuRegistryDefinition[] = AIDOKU_REGISTRIES` as a default
// param, which requires a mutable array type, so we spread the readonly list
// into a mutable copy. Mobile never mutates the list (only `.find`/`.map`),
// so this is behavior-identical to the prior inline definition.
export const AIDOKU_REGISTRIES: AidokuRegistryDefinition[] = [
  ...CORE_AIDOKU_REGISTRIES,
];

export function makeSourceKey(registryId: string, sourceId: string): string {
  return `${registryId}:${sourceId}`;
}

export function makeAixCacheKey(registryId: string, sourceId: string): string {
  return `aix:${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}`;
}

function sha256Hex(value: string): string {
  return Array.from(sha256Bytes(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Executable packages use immutable artifact keys. Keeping version and the
 * canonical download/content identity in the digest prevents a late download
 * for v1 from overwriting the file referenced by an already-installed v2.
 */
export function makeAixArtifactCacheKey({
  artifactIdentity,
  registryId,
  sourceId,
  version,
}: {
  artifactIdentity: string;
  registryId: string;
  sourceId: string;
  version: number;
}): string {
  return `aix:${sha256Hex(
    JSON.stringify([registryId, sourceId, version, artifactIdentity]),
  )}`;
}

/** True only for immutable, content-identity-bound AIX cache keys. */
export function isAixArtifactCacheKey(value: string): boolean {
  return /^aix:[0-9a-f]{64}$/.test(value);
}

function decodeSourceKeyPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function parseSourceKey(key: string): {
  registryId: string;
  sourceId: string;
} {
  const index = key.indexOf(":");
  if (index < 0)
    return { registryId: "unknown", sourceId: decodeSourceKeyPart(key) };
  return {
    registryId: decodeSourceKeyPart(key.slice(0, index)),
    sourceId: decodeSourceKeyPart(key.slice(index + 1)),
  };
}

function baseUrlFor(indexUrl: string): string {
  return indexUrl.replace(/\/[^/]+$/, "");
}

function absoluteUrl(baseUrl: string, path: unknown): string | undefined {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > MOBILE_AIDOKU_REGISTRY_MAX_URL_LENGTH
  ) {
    return undefined;
  }
  try {
    const url = new URL(path, `${baseUrl}/`);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.toString().length > MOBILE_AIDOKU_REGISTRY_MAX_URL_LENGTH
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function absoluteExecutableUrl(
  baseUrl: string,
  path: unknown,
): string | undefined {
  const url = absoluteUrl(baseUrl, path);
  return url && new URL(url).protocol === "https:" ? url : undefined;
}

function normalizeLanguages(source: RegistryIndexSource): string[] | undefined {
  const rawLanguages = Array.isArray(source.languages)
    ? source.languages
    : typeof source.lang === "string"
      ? [source.lang]
      : [];
  const normalized = rawLanguages
    .slice(0, MOBILE_AIDOKU_REGISTRY_MAX_LANGUAGES)
    .filter(
      (lang): lang is string =>
        typeof lang === "string" &&
        lang.length > 0 &&
        lang.length <= MOBILE_AIDOKU_REGISTRY_MAX_LANGUAGE_LENGTH,
    )
    .map((lang) => lang.toLowerCase().replace("_", "-"));

  return normalized.length > 0 ? normalized : undefined;
}

function readBoolean(
  source: RegistryIndexSource,
  keys: string[],
): boolean | undefined {
  for (const key of keys) {
    if (source[key] === true) return true;
    if (source[key] === false) return false;
  }
  return undefined;
}

function readSources(data: unknown): RegistryIndexSource[] {
  let sources: unknown[];
  if (Array.isArray(data)) {
    sources = data;
  } else if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { sources?: unknown }).sources)
  ) {
    sources = (data as { sources: unknown[] }).sources;
  } else {
    return [];
  }
  if (sources.length > MOBILE_AIDOKU_REGISTRY_MAX_SOURCES) {
    throw new Error(
      `Registry exceeds the ${MOBILE_AIDOKU_REGISTRY_MAX_SOURCES} source safety limit.`,
    );
  }
  return sources.filter(
    (item): item is RegistryIndexSource =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

export async function fetchAidokuRegistrySources(
  registry: AidokuRegistryDefinition,
  options: { signal?: AbortSignal } = {},
): Promise<MobileRegistrySource[]> {
  const response = await mobileNativeFetch(registry.indexUrl, {
    responseMode: "text",
    maxResponseBytes: MOBILE_AIDOKU_REGISTRY_MAX_RESPONSE_BYTES,
    requireHttps: true,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${registry.name}: ${response.status}`);
  }

  const data = await response.json();
  const baseUrl = baseUrlFor(registry.indexUrl);

  return readSources(data)
    .map((source): MobileRegistrySource | null => {
      const id =
        typeof source.id === "string" &&
        source.id.length > 0 &&
        source.id.length <= MOBILE_AIDOKU_REGISTRY_MAX_ID_LENGTH
          ? source.id
          : null;
      const name =
        typeof source.name === "string" &&
        source.name.length > 0 &&
        source.name.length <= MOBILE_AIDOKU_REGISTRY_MAX_NAME_LENGTH
          ? source.name
          : id;
      const version =
        typeof source.version === "number" &&
        Number.isSafeInteger(source.version) &&
        source.version >= 0
          ? source.version
          : 1;
      if (!id || !name) return null;

      const iconPath =
        source.iconURL ??
        (typeof source.icon === "string" ? `icons/${source.icon}` : undefined);
      const downloadPath =
        source.downloadURL ??
        (typeof source.file === "string"
          ? `sources/${source.file}`
          : undefined);
      const rating =
        typeof source.contentRating === "number"
          ? source.contentRating
          : source.nsfw === true
            ? 2
            : source.nsfw === false
              ? 0
              : undefined;
      const hasAuthentication = readBoolean(source, [
        "hasAuthentication",
        "requiresAuthentication",
        "hasWebView",
      ]);
      const hasCloudflare = readBoolean(source, [
        "hasCloudflare",
        "cloudflare",
      ]);

      return {
        id,
        registryId: registry.id,
        registryName: registry.name,
        name,
        version,
        icon: absoluteUrl(baseUrl, iconPath),
        downloadUrl: absoluteExecutableUrl(baseUrl, downloadPath),
        languages: normalizeLanguages(source),
        contentRating: rating,
        ...(hasAuthentication == null ? {} : { hasAuthentication }),
        ...(hasCloudflare == null ? {} : { hasCloudflare }),
      };
    })
    .filter((source): source is MobileRegistrySource => source !== null);
}

export async function fetchAllAidokuRegistrySources(
  registries: AidokuRegistryDefinition[] = AIDOKU_REGISTRIES,
  options: { signal?: AbortSignal } = {},
): Promise<MobileRegistrySource[]> {
  throwIfMobileNativeHttpAborted(options.signal);
  const results = await Promise.allSettled(
    registries.map((registry) =>
      fetchAidokuRegistrySources(registry, options),
    ),
  );
  throwIfMobileNativeHttpAborted(options.signal);
  const sources: MobileRegistrySource[] = [];
  const errors = new Set<string>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      sources.push(...result.value);
    } else {
      errors.add(
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );
    }
  }

  if (sources.length === 0 && errors.size > 0) {
    throw new Error([...errors].join("\n"));
  }

  return sources.sort((a, b) => {
    const aPrimary = a.languages?.[0] ?? "zz";
    const bPrimary = b.languages?.[0] ?? "zz";
    if (aPrimary !== bPrimary) return aPrimary.localeCompare(bPrimary);
    return a.name.localeCompare(b.name);
  });
}
