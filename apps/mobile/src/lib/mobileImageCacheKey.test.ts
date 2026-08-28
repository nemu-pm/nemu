import { describe, expect, test } from "bun:test";
import { makeMobileImageCacheStorageKey } from "./mobileImageCacheKey";

describe("mobile image cache account key", () => {
  test("is stable for reordered headers within one profile", () => {
    expect(
      makeMobileImageCacheStorageKey("profile:a", {
        uri: "https://private.example/cover",
        headers: { B: "2", A: "1" },
      }),
    ).toBe(
      makeMobileImageCacheStorageKey("profile:a", {
        uri: "https://private.example/cover",
        headers: { A: "1", B: "2" },
      }),
    );
  });

  test("normalizes HTTP header casing and cannot alias delimiter-bearing fields", () => {
    expect(
      makeMobileImageCacheStorageKey("profile:a", {
        uri: "https://private.example/cover",
        headers: { Authorization: "token" },
      }),
    ).toBe(
      makeMobileImageCacheStorageKey("profile:a", {
        uri: "https://private.example/cover",
        headers: { authorization: "token" },
      }),
    );

    expect(
      makeMobileImageCacheStorageKey(
        "profile:a",
        { uri: "unused", headers: { c: "d" } },
        "a|b",
      ),
    ).not.toBe(
      makeMobileImageCacheStorageKey(
        "profile:a",
        { uri: "unused", headers: { b: "c:d" } },
        "a",
      ),
    );
  });

  test("does not collide for the known cross-profile FNV-32 collision", () => {
    const first = makeMobileImageCacheStorageKey("profile:a", {
      uri: "https://private.example/a/48209",
      headers: { authorization: "A" },
    });
    const second = makeMobileImageCacheStorageKey("profile:b", {
      uri: "https://private.example/b/12018",
      headers: { authorization: "B" },
    });

    expect(first).not.toBe(second);
    expect(first).toMatch(/^mobile-image:profile:a:[a-f0-9]{64}$/);
    expect(second).toMatch(/^mobile-image:profile:b:[a-f0-9]{64}$/);
  });

  test("keeps source URI identity when a repeated page-id discriminator is present", () => {
    const first = makeMobileImageCacheStorageKey(
      "profile:a",
      { uri: "https://private.example/chapter-a/page-0.jpg" },
      "page-0:reader-segments-v1",
    );
    const second = makeMobileImageCacheStorageKey(
      "profile:a",
      { uri: "https://private.example/chapter-b/page-0.jpg" },
      "page-0:reader-segments-v1",
    );
    expect(first).not.toBe(second);
  });
});
