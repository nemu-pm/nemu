import { describe, expect, test } from "bun:test";
import {
  isRememberableMobileSourceImageRequest,
  makeMobileSourceImageRequestMemoryKey,
  MOBILE_SOURCE_IMAGE_REQUEST_MEMORY_MAX,
  parseMobileSourceImageRequestMemory,
  rememberMobileSourceImageRequest,
  serializeMobileSourceImageRequestMemory,
  type MobileSourceImageRequestMemory,
} from "./mobileSourceImageRequestMemory";

const COVER = { url: "https://img.example/cover.jpg", headers: { Referer: "https://example.com/" } };

describe("remembered source image requests", () => {
  test("plain remote covers are remembered, with referer-like headers only", () => {
    expect(isRememberableMobileSourceImageRequest(COVER)).toBe(true);
    expect(isRememberableMobileSourceImageRequest({ url: "http://img.example/a.png", headers: {} })).toBe(true);
    // A processed cover's local file may be pruned before the next launch.
    expect(isRememberableMobileSourceImageRequest({ url: "file:///cache/cover.png", headers: {} })).toBe(false);
    // Credentials never go to the cache file.
    for (const name of ["Cookie", "Authorization", "X-Auth-Token"]) {
      expect(isRememberableMobileSourceImageRequest({ url: COVER.url, headers: { [name]: "secret" } })).toBe(false);
    }
    expect(isRememberableMobileSourceImageRequest(null)).toBe(false);
  });

  test("the key changes with the profile, the source build and the URL", () => {
    const base = { scope: "default", sourceId: "s", packageCacheKey: "p1", version: 3, updatedAt: 10 };
    const key = makeMobileSourceImageRequestMemoryKey(base, COVER.url);
    expect(makeMobileSourceImageRequestMemoryKey({ ...base }, COVER.url)).toBe(key);
    expect(makeMobileSourceImageRequestMemoryKey({ ...base, scope: "other" }, COVER.url)).not.toBe(key);
    expect(makeMobileSourceImageRequestMemoryKey({ ...base, version: 4 }, COVER.url)).not.toBe(key);
    expect(makeMobileSourceImageRequestMemoryKey({ ...base, packageCacheKey: "p2" }, COVER.url)).not.toBe(key);
    expect(makeMobileSourceImageRequestMemoryKey(base, "https://img.example/other.jpg")).not.toBe(key);
  });

  test("remembering reports a change only when the request is new or different", () => {
    const memory: MobileSourceImageRequestMemory = new Map();
    expect(rememberMobileSourceImageRequest(memory, "k", COVER)).toBe(true);
    expect(rememberMobileSourceImageRequest(memory, "k", { ...COVER, headers: { ...COVER.headers } })).toBe(false);
    expect(rememberMobileSourceImageRequest(memory, "k", { ...COVER, headers: { Referer: "https://other/" } })).toBe(true);
    // A failed resolve keeps what was known.
    expect(rememberMobileSourceImageRequest(memory, "k", null)).toBe(false);
    expect(memory.get("k")?.headers.Referer).toBe("https://other/");
    // A request that turned unrememberable (now needs a cookie) drops the stale one.
    expect(rememberMobileSourceImageRequest(memory, "k", { url: COVER.url, headers: { Cookie: "c" } })).toBe(true);
    expect(memory.has("k")).toBe(false);
  });

  test("the memory stays bounded, the newest entries kept", () => {
    const memory: MobileSourceImageRequestMemory = new Map();
    for (let index = 0; index < MOBILE_SOURCE_IMAGE_REQUEST_MEMORY_MAX + 5; index += 1) {
      rememberMobileSourceImageRequest(memory, `k${index}`, { url: `https://img.example/${index}.jpg`, headers: {} });
    }
    expect(memory.size).toBe(MOBILE_SOURCE_IMAGE_REQUEST_MEMORY_MAX);
    expect(memory.has("k0")).toBe(false);
    expect(memory.has(`k${MOBILE_SOURCE_IMAGE_REQUEST_MEMORY_MAX + 4}`)).toBe(true);
  });

  test("round-trips through the cache file and ignores anything malformed", () => {
    const memory: MobileSourceImageRequestMemory = new Map();
    rememberMobileSourceImageRequest(memory, "k", COVER);
    const restored = parseMobileSourceImageRequestMemory(serializeMobileSourceImageRequestMemory(memory));
    expect(restored.get("k")).toEqual(COVER);
    for (const text of [null, "", "{", "[]", JSON.stringify({ v: 2, entries: [["k", COVER]] })]) {
      expect(parseMobileSourceImageRequestMemory(text).size).toBe(0);
    }
    const mixed = JSON.stringify({
      v: 1,
      entries: [["a", COVER], ["b", { url: 3 }], ["c", { url: COVER.url, headers: { Cookie: "x" } }], "junk"],
    });
    expect([...parseMobileSourceImageRequestMemory(mixed).keys()]).toEqual(["a"]);
  });
});
