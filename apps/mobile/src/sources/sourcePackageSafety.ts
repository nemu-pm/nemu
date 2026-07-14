import type { NativeBinaryCachePolicy } from "@/data/nativeCachePolicy";

const MEBIBYTE = 1024 * 1024;

/**
 * AIX files are executable, untrusted ZIP archives. Keep every allocation
 * involved in importing or hydrating one below a mobile-safe ceiling.
 */
export const MOBILE_AIX_PACKAGE_LIMITS = {
  maxCompressedBytes: 32 * MEBIBYTE,
  maxEntries: 256,
  maxDeclaredUncompressedBytes: 96 * MEBIBYTE,
  maxMetadataEntryBytes: 2 * MEBIBYTE,
  maxExtractedMetadataBytes: 4 * MEBIBYTE,
} as const;

export const MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES = 64 * MEBIBYTE;

export const MOBILE_TACHIYOMI_ZIP_LIMITS = {
  maxEntries: 2_048,
  maxDeclaredUncompressedBytes: 256 * MEBIBYTE,
  maxRelevantEntryBytes: 16 * MEBIBYTE,
  maxExtractedRelevantBytes: 20 * MEBIBYTE,
} as const;

/**
 * Source packages are executable artifacts, not an unbounded general-purpose
 * cache. The entry limit also bounds a single Tachiyomi extension, whose APK
 * can legitimately be larger than an AIX package.
 */
export const MOBILE_SOURCE_PACKAGE_CACHE_POLICY: NativeBinaryCachePolicy = {
  maxBytes: 384 * MEBIBYTE,
  maxEntries: 96,
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
  maxEntryBytes: MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES,
};

export class SourcePackageLimitError extends Error {
  readonly code = "SOURCE_PACKAGE_LIMIT_EXCEEDED";

  constructor(message: string) {
    super(message);
    this.name = "SourcePackageLimitError";
  }
}

export function assertSourcePackageByteLength({
  byteLength,
  maxBytes,
  label,
}: {
  byteLength: number;
  maxBytes: number;
  label: string;
}): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new SourcePackageLimitError(`${label} has an invalid byte length.`);
  }
  if (byteLength > maxBytes) {
    throw new SourcePackageLimitError(
      `${label} exceeds the ${maxBytes} byte safety limit.`,
    );
  }
}

export function assertAixCompressedByteLength(byteLength: number): void {
  assertSourcePackageByteLength({
    byteLength,
    maxBytes: MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes,
    label: "AIX package",
  });
}

export function sourcePackageCompressedByteLimit(
  kind: "aidoku-aix" | "tachiyomi-extension",
): number {
  return kind === "aidoku-aix"
    ? MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes
    : MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES;
}

export function assertSourcePackageCompressedByteLength(
  kind: "aidoku-aix" | "tachiyomi-extension",
  byteLength: number,
): void {
  assertSourcePackageByteLength({
    byteLength,
    maxBytes: sourcePackageCompressedByteLimit(kind),
    label: kind === "aidoku-aix" ? "AIX package" : "Tachiyomi extension package",
  });
}

/** Metadata-only validation for an executable package already on disk. */
export function isCachedSourcePackageFileInfoValid(
  kind: "aidoku-aix" | "tachiyomi-extension",
  info: { exists: boolean; size?: number | null },
): boolean {
  if (
    !info.exists ||
    typeof info.size !== "number" ||
    !Number.isSafeInteger(info.size) ||
    info.size <= 0
  ) {
    return false;
  }
  try {
    assertSourcePackageCompressedByteLength(kind, info.size);
    return true;
  } catch {
    return false;
  }
}

export function assertTachiyomiRawRuntimeByteLength(byteLength: number): void {
  assertSourcePackageByteLength({
    byteLength,
    maxBytes: MOBILE_TACHIYOMI_ZIP_LIMITS.maxRelevantEntryBytes,
    label: "Tachiyomi raw JavaScript runtime",
  });
}

/**
 * Base64 always uses four characters for every three decoded bytes. Checking
 * the encoded representation before decoding prevents a second oversized
 * allocation even when an older native module ignores maxResponseBytes.
 */
export function assertBase64DecodedByteLimit(
  encoded: string,
  maxBytes: number,
  label: string,
): void {
  const compact = encoded.replace(/\s/g, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const decodedByteLength = Math.max(
    0,
    Math.floor((compact.length * 3) / 4) - padding,
  );
  if (decodedByteLength > maxBytes) {
    throw new SourcePackageLimitError(
      `${label} exceeds the ${maxBytes} byte safety limit.`,
    );
  }
}
