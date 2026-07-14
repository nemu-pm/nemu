import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_BASE64_IMAGE_URI_PREFIX,
  MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES,
  MOBILE_SOURCE_MAX_PAGE_COUNT,
  MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH,
  assertMobileSourcePageCount,
  assertMobileTachiyomiEncodedImageLength,
  isMobileReaderPageImageCacheLimitExceeded,
} from "./mobileSourcePageSafety";

describe("mobile source page safety limits", () => {
  test("accepts the exact page-count limit and rejects the next page", () => {
    expect(() =>
      assertMobileSourcePageCount(MOBILE_SOURCE_MAX_PAGE_COUNT),
    ).not.toThrow();
    expect(() =>
      assertMobileSourcePageCount(MOBILE_SOURCE_MAX_PAGE_COUNT + 1),
    ).toThrow(/page safety limit/);
  });

  test("accepts the exact encoded-image limit and rejects the next character", () => {
    expect(
      (MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH +
        MOBILE_READER_BASE64_IMAGE_URI_PREFIX.length) *
        2,
    ).toBe(MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES);
    expect(() =>
      assertMobileTachiyomiEncodedImageLength(
        MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileTachiyomiEncodedImageLength(
        MOBILE_TACHIYOMI_PAGE_IMAGE_MAX_ENCODED_LENGTH + 1,
      ),
    ).toThrow(/encoded-image safety limit/);
  });

  test("accepts the exact aggregate cache limit and rejects the next byte", () => {
    expect(
      isMobileReaderPageImageCacheLimitExceeded(
        MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES,
      ),
    ).toBe(false);
    expect(
      isMobileReaderPageImageCacheLimitExceeded(
        MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES + 1,
      ),
    ).toBe(true);
  });
});
