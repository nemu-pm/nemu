const MEBIBYTE = 1024 * 1024;

/**
 * Source page lists are untrusted extension output. Two thousand pages keeps
 * unusually long webtoon chapters reachable while bounding the JS metadata
 * array and the reader's per-page bookkeeping.
 */
export const MOBILE_SOURCE_MAX_PAGE_COUNT = 2_000;

/** Data URIs are retained as UTF-16 strings in the JS heap. */
export const MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES = 32 * MEBIBYTE;

export const MOBILE_READER_BASE64_IMAGE_URI_PREFIX =
  "data:image/jpeg;base64,";

/**
 * A single Tachiyomi image must fit in the aggregate cache even after the
 * base64 prefix is added and the JS string expands to two bytes per code unit.
 */
export const MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH =
  Math.floor(MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES / 2) -
  MOBILE_READER_BASE64_IMAGE_URI_PREFIX.length;

export function assertMobileSourcePageCount(pageCount: number): void {
  if (
    !Number.isSafeInteger(pageCount) ||
    pageCount < 0 ||
    pageCount > MOBILE_SOURCE_MAX_PAGE_COUNT
  ) {
    throw new Error(
      `Source page list exceeds the ${MOBILE_SOURCE_MAX_PAGE_COUNT} page safety limit.`,
    );
  }
}

export function assertMobileTachiyomiEncodedImageLength(
  encodedLength: number,
): void {
  if (
    !Number.isSafeInteger(encodedLength) ||
    encodedLength <= 0 ||
    encodedLength > MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH
  ) {
    throw new Error(
      `Tachiyomi page image exceeds the ${MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH} character encoded-image safety limit.`,
    );
  }
}

export function isMobileReaderPageImageCacheLimitExceeded(
  byteLength: number,
  maxBytes: number = MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES,
): boolean {
  return (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    byteLength > maxBytes
  );
}
