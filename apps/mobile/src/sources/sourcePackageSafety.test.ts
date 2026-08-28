import { describe, expect, test } from "bun:test";
import {
  MOBILE_AIX_PACKAGE_LIMITS,
  MOBILE_SOURCE_PACKAGE_CACHE_POLICY,
  MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES,
  MOBILE_TACHIYOMI_ZIP_LIMITS,
  assertAixCompressedByteLength,
  assertBase64DecodedByteLimit,
  assertSourcePackageCompressedByteLength,
  assertSecureSourcePackageDownloadUrl,
  assertTachiyomiRawRuntimeByteLength,
  isCachedSourcePackageFileInfoValid,
  sourcePackageCompressedByteLimit,
} from "./sourcePackageSafety";

describe("source package safety limits", () => {
  test("uses separate executable package limits within the bounded disk policy", () => {
    expect(sourcePackageCompressedByteLimit("aidoku-aix")).toBe(
      MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes,
    );
    expect(sourcePackageCompressedByteLimit("tachiyomi-extension")).toBe(
      MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES,
    );
    expect(MOBILE_SOURCE_PACKAGE_CACHE_POLICY.maxEntryBytes).toBe(
      MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES,
    );
    expect(MOBILE_SOURCE_PACKAGE_CACHE_POLICY.maxBytes).toBeGreaterThan(
      MOBILE_SOURCE_PACKAGE_CACHE_POLICY.maxEntryBytes,
    );
    expect(MOBILE_SOURCE_PACKAGE_CACHE_POLICY.maxEntries).toBeGreaterThan(0);
    expect(MOBILE_SOURCE_PACKAGE_CACHE_POLICY.maxAgeMs).toBeGreaterThan(0);
  });

  test("accepts exact compressed boundaries and rejects the next byte", () => {
    expect(() =>
      assertAixCompressedByteLength(
        MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes,
      ),
    ).not.toThrow();
    expect(() =>
      assertAixCompressedByteLength(
        MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes + 1,
      ),
    ).toThrow(/AIX package exceeds/);

    expect(() =>
      assertSourcePackageCompressedByteLength(
        "tachiyomi-extension",
        MOBILE_TACHIYOMI_PACKAGE_MAX_COMPRESSED_BYTES + 1,
      ),
    ).toThrow(/Tachiyomi extension package exceeds/);

    expect(() =>
      assertTachiyomiRawRuntimeByteLength(
        MOBILE_TACHIYOMI_ZIP_LIMITS.maxRelevantEntryBytes,
      ),
    ).not.toThrow();
    expect(() =>
      assertTachiyomiRawRuntimeByteLength(
        MOBILE_TACHIYOMI_ZIP_LIMITS.maxRelevantEntryBytes + 1,
      ),
    ).toThrow(/Tachiyomi raw JavaScript runtime exceeds/);
  });

  test("rejects oversized base64 before decoded byte allocation", () => {
    expect(() =>
      assertBase64DecodedByteLimit("AAAA", 3, "response"),
    ).not.toThrow();
    expect(() =>
      assertBase64DecodedByteLimit("AAAAAA==", 3, "response"),
    ).toThrow(/response exceeds the 3 byte safety limit/);
  });

  test("validates cached packages from metadata without accepting empty or oversized files", () => {
    expect(
      isCachedSourcePackageFileInfoValid("aidoku-aix", {
        exists: true,
        size: MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes,
      }),
    ).toBe(true);
    expect(
      isCachedSourcePackageFileInfoValid("aidoku-aix", {
        exists: true,
        size: MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes + 1,
      }),
    ).toBe(false);
    expect(
      isCachedSourcePackageFileInfoValid("aidoku-aix", {
        exists: true,
        size: 0,
      }),
    ).toBe(false);
    expect(
      isCachedSourcePackageFileInfoValid("aidoku-aix", {
        exists: false,
      }),
    ).toBe(false);
  });

  test("accepts only credential-free HTTPS executable package URLs", () => {
    expect(
      assertSecureSourcePackageDownloadUrl(
        "https://packages.example.test/source.aix",
      ),
    ).toBe("https://packages.example.test/source.aix");
    for (const value of [
      "http://packages.example.test/source.aix",
      "https://user:secret@packages.example.test/source.aix",
      "file:///tmp/source.aix",
      "not a url",
    ]) {
      expect(() => assertSecureSourcePackageDownloadUrl(value)).toThrow(
        "require a valid HTTPS URL",
      );
    }
  });
});
