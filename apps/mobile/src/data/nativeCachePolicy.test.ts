import { describe, expect, test } from "bun:test";
import { selectNativeBinaryCacheEvictions } from "./nativeCachePolicy";

const policy = {
  maxAgeMs: 1_000,
  maxBytes: 100,
  maxEntries: 3,
};

describe("native binary cache policy", () => {
  test("removes expired files before enforcing byte and count limits", () => {
    expect(
      selectNativeBinaryCacheEvictions(
        [
          { id: "expired", size: 5, modifiedAt: 1_000 },
          { id: "old", size: 45, modifiedAt: 2_100 },
          { id: "middle", size: 45, modifiedAt: 2_200 },
          { id: "new", size: 45, modifiedAt: 2_300 },
          { id: "newest", size: 5, modifiedAt: 2_400 },
        ],
        policy,
        3_000,
      ),
    ).toEqual(["expired", "old"]);
  });

  test("keeps entries exactly on all configured boundaries", () => {
    expect(
      selectNativeBinaryCacheEvictions(
        [
          { id: "a", size: 30, modifiedAt: 2_000 },
          { id: "b", size: 30, modifiedAt: 2_100 },
          { id: "c", size: 40, modifiedAt: 2_200 },
        ],
        policy,
        3_000,
      ),
    ).toEqual([]);
  });

  test("uses a deterministic id tie-breaker for equal timestamps", () => {
    expect(
      selectNativeBinaryCacheEvictions(
        [
          { id: "b", size: 60, modifiedAt: 2_500 },
          { id: "a", size: 60, modifiedAt: 2_500 },
        ],
        policy,
        3_000,
      ),
    ).toEqual(["a"]);
  });

  test("keeps a newly written entry while evicting equal-time older files", () => {
    expect(
      selectNativeBinaryCacheEvictions(
        [
          { id: "new", size: 60, modifiedAt: 2_500 },
          { id: "old", size: 60, modifiedAt: 2_500 },
        ],
        policy,
        3_000,
        "new",
      ),
    ).toEqual(["old"]);
  });
});
