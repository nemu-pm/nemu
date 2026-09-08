/**
 * Bounded, platform-neutral rules for source-processed cover images.
 *
 * A source that exports `process_cover_image` hands back PNG bytes for every
 * cover, and covers are rendered by `expo-image` from a `{ uri, headers }`
 * pair. Materializing each processed cover as a `file://` entry keeps the
 * bytes out of JS (a base64 `data:` URI per cover would cost several MB per
 * screen), so the pieces that decide the file identity and keep the directory
 * bounded live here, free of any file-system or native dependency.
 */

export const MOBILE_PROCESSED_COVER_DIRECTORY_NAME = "nemu-processed-covers";

/** Cover download ceiling; matches the sandbox image input limit. */
export const MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES = 8 * 1024 * 1024;
/** Processed PNG ceiling; matches the sandbox image output limit. */
export const MOBILE_PROCESSED_COVER_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * File-count ceiling for the processed-cover directory.
 *
 * This MUST stay strictly greater than
 * `MOBILE_SOURCE_IMAGE_REQUEST_CACHE_MAX_SIZE` (the in-memory image-request
 * cache in `mobileSourceImages.ts`). That cache memoizes the resolved
 * `file://` URI of a processed cover, and nothing re-resolves an entry while
 * it is still memoized — so a disk cap at or below the request cap lets a
 * single screenful of browsing prune files whose URIs are still the ones being
 * painted, leaving permanently broken covers. `mobileSourceCoverProcessing.test.ts`
 * asserts the ordering.
 */
export const MOBILE_PROCESSED_COVER_MAX_FILES = 512;
export const MOBILE_PROCESSED_COVER_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const MOBILE_PROCESSED_COVER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PROCESSED_COVER_FILE_NAME_PATTERN =
  /^cover-[0-9a-f]{16}-[0-9a-z]{1,8}\.png$/;
const PROCESSED_COVER_STAGING_FILE_NAME_PATTERN =
  /^cover-[0-9a-f]{16}-[0-9a-z]{1,8}\.png\.part$/;

export type MobileProcessedCoverImageRequest = {
  url: string;
  headers: Record<string, string>;
};

export type MobileProcessedCoverFileStat = {
  name: string;
  byteLength: number;
  modifiedAt: number;
};

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= value.charCodeAt(index) >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/**
 * File name for one processed cover.
 *
 * The cache key already covers the source identity, its settings and the cover
 * URL, but it is far too long (and not path-safe) to use directly, so it is
 * folded into two independently seeded 32-bit hashes plus its length. A
 * collision would paint the wrong cover, which is why the identity is 64 bits
 * of hash rather than one 32-bit word.
 */
export function makeMobileProcessedCoverFileName(cacheKey: string): string {
  const digest = `${hex8(fnv1a32(cacheKey, 0x811c9dc5))}${hex8(
    fnv1a32(cacheKey, 0x9e3779b1),
  )}`;
  return `cover-${digest}-${cacheKey.length.toString(36)}.png`;
}

export function isMobileProcessedCoverFileName(name: string): boolean {
  return (
    typeof name === "string" &&
    !name.includes("/") &&
    PROCESSED_COVER_FILE_NAME_PATTERN.test(name)
  );
}

/**
 * Staging name a processed cover is written to before it is published.
 *
 * The published name is only ever created by a rename, so process death during
 * a write can leave a short staging file but never a torn cover that later
 * paints as a valid cache hit.
 */
export function makeMobileProcessedCoverStagingFileName(
  fileName: string,
): string {
  return `${fileName}.part`;
}

export function isMobileProcessedCoverStagingFileName(name: string): boolean {
  return (
    typeof name === "string" &&
    !name.includes("/") &&
    PROCESSED_COVER_STAGING_FILE_NAME_PATTERN.test(name)
  );
}

export function isMobileProcessedCoverInputByteLengthAllowed(
  byteLength: number,
): boolean {
  return (
    Number.isSafeInteger(byteLength) &&
    byteLength > 0 &&
    byteLength <= MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES
  );
}

export function isMobileProcessedCoverOutputByteLengthAllowed(
  byteLength: number,
): boolean {
  return (
    Number.isSafeInteger(byteLength) &&
    byteLength > 0 &&
    byteLength <= MOBILE_PROCESSED_COVER_OUTPUT_MAX_BYTES
  );
}

/**
 * The final request for a cover.
 *
 * A processed cover is already a local file, so it carries no headers — the
 * source's referer/auth headers only apply to the remote fetch that produced
 * it. Without a processed file the caller keeps the source's own rewrite.
 */
export function selectMobileCoverImageRequest(
  base: MobileProcessedCoverImageRequest,
  processedFileUri: string | null,
): MobileProcessedCoverImageRequest {
  return processedFileUri ? { url: processedFileUri, headers: {} } : base;
}

/**
 * Which entries of the processed-cover directory to delete, oldest first.
 *
 * Leftover staging files and expired covers always go. After that the
 * directory is trimmed down to the file-count and total-byte caps, so a long
 * browse session cannot grow the cache without bound. `keepNames` protects the
 * entries the current publish is using from being chosen as their own
 * eviction victims, and names the module does not own are never touched.
 */
export function selectMobileProcessedCoverEvictions(
  files: readonly MobileProcessedCoverFileStat[],
  options: {
    now: number;
    keepNames?: readonly string[];
    maxFiles?: number;
    maxTotalBytes?: number;
    maxAgeMs?: number;
  },
): string[] {
  const maxFiles = options.maxFiles ?? MOBILE_PROCESSED_COVER_MAX_FILES;
  const maxTotalBytes =
    options.maxTotalBytes ?? MOBILE_PROCESSED_COVER_MAX_TOTAL_BYTES;
  const maxAgeMs = options.maxAgeMs ?? MOBILE_PROCESSED_COVER_MAX_AGE_MS;
  const keepNames = new Set(options.keepNames ?? []);

  const evictions: string[] = [];
  const retained: MobileProcessedCoverFileStat[] = [];
  for (const file of files) {
    if (keepNames.has(file.name)) continue;
    if (isMobileProcessedCoverStagingFileName(file.name)) {
      // A staging file that is not the active one belongs to an interrupted
      // publish and can never be published by anybody else.
      evictions.push(file.name);
      continue;
    }
    if (!isMobileProcessedCoverFileName(file.name)) {
      // Anything the module does not own is not its business to delete.
      continue;
    }
    const byteLength = Number.isSafeInteger(file.byteLength)
      ? Math.max(0, file.byteLength)
      : 0;
    const modifiedAt = Number.isFinite(file.modifiedAt) ? file.modifiedAt : 0;
    if (options.now - modifiedAt > maxAgeMs) {
      evictions.push(file.name);
      continue;
    }
    retained.push({ name: file.name, byteLength, modifiedAt });
  }

  // Oldest first, then by name so equal timestamps evict deterministically.
  retained.sort(
    (left, right) =>
      left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name),
  );
  let totalBytes = retained.reduce((sum, file) => sum + file.byteLength, 0);
  let count = retained.length;
  for (const file of retained) {
    if (count <= maxFiles && totalBytes <= maxTotalBytes) break;
    evictions.push(file.name);
    count -= 1;
    totalBytes -= file.byteLength;
  }
  return evictions;
}
