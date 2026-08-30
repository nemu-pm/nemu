import { describe, expect, test } from "bun:test";
import {
  MOBILE_DUAL_READER_DHASH_CACHE_POLICY,
  selectMobileDualReaderDhashCacheEvictions,
} from "./mobileDualReaderDhashCachePolicy";

const policy = {
  maxBytes: 100,
  maxEntries: 3,
  maxAgeMs: 1_000,
};

describe("mobile dual-reader dHash disk-cache policy", () => {
  test("uses the production 64 MiB / 4096 entry / 90 day bounds", () => {
    expect(MOBILE_DUAL_READER_DHASH_CACHE_POLICY).toEqual({
      maxBytes: 64 * 1024 * 1024,
      maxEntries: 4_096,
      maxAgeMs: 90 * 24 * 60 * 60 * 1_000,
    });
  });

  test("keeps entries exactly on every configured boundary", () => {
    expect(
      selectMobileDualReaderDhashCacheEvictions(
        [
          { id: "a", sizeBytes: 30, modifiedAtMs: 2_000 },
          { id: "b", sizeBytes: 30, modifiedAtMs: 2_100 },
          { id: "c", sizeBytes: 40, modifiedAtMs: 2_200 },
        ],
        policy,
        3_000,
      ),
    ).toEqual([]);
  });

  test("removes expired entries before enforcing byte and count quotas", () => {
    expect(
      selectMobileDualReaderDhashCacheEvictions(
        [
          { id: "expired", sizeBytes: 5, modifiedAtMs: 1_000 },
          { id: "old", sizeBytes: 45, modifiedAtMs: 2_100 },
          { id: "middle", sizeBytes: 45, modifiedAtMs: 2_200 },
          { id: "new", sizeBytes: 45, modifiedAtMs: 2_300 },
          { id: "newest", sizeBytes: 5, modifiedAtMs: 2_400 },
        ],
        policy,
        3_000,
      ),
    ).toEqual(["expired", "old"]);
  });

  test("uses the stable id when oldest timestamps tie", () => {
    expect(
      selectMobileDualReaderDhashCacheEvictions(
        [
          { id: "b", sizeBytes: 60, modifiedAtMs: 2_500 },
          { id: "a", sizeBytes: 60, modifiedAtMs: 2_500 },
        ],
        policy,
        3_000,
      ),
    ).toEqual(["a"]);
  });

  test("protects the just-written entry until older entries are gone", () => {
    expect(
      selectMobileDualReaderDhashCacheEvictions(
        [
          { id: "new", sizeBytes: 60, modifiedAtMs: 2_500 },
          { id: "old", sizeBytes: 60, modifiedAtMs: 2_500 },
        ],
        policy,
        3_000,
        "new",
      ),
    ).toEqual(["old"]);
  });
});
