import { describe, expect, test } from "bun:test";
import {
  AIDOKU_REGISTRIES,
  LEGACY_DEFAULT_SOURCE_DIRECTORIES,
  NEMU_RECOMMENDED_REGISTRY,
  NEMU_RECOMMENDED_REGISTRY_ID,
  defaultSourceDirectoryName,
  normalizeSourceDirectoryUrl,
  sourceDirectoryIdForUrl,
} from "./registries";

describe("normalizeSourceDirectoryUrl", () => {
  test("keeps an explicit index file", () => {
    expect(
      normalizeSourceDirectoryUrl(
        " https://example.github.io/sources/index.min.json#x ",
      ),
    ).toEqual({
      ok: true,
      indexUrl: "https://example.github.io/sources/index.min.json",
    });
  });

  test("appends index.min.json to a site or folder URL", () => {
    expect(normalizeSourceDirectoryUrl("https://example.github.io/")).toEqual({
      ok: true,
      indexUrl: "https://example.github.io/index.min.json",
    });
    expect(
      normalizeSourceDirectoryUrl("https://example.github.io/repo/"),
    ).toEqual({
      ok: true,
      indexUrl: "https://example.github.io/repo/index.min.json",
    });
  });

  test("rejects anything that is not a public https URL", () => {
    expect(normalizeSourceDirectoryUrl("  ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(normalizeSourceDirectoryUrl("not a url")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(normalizeSourceDirectoryUrl("http://example.com/index.json")).toEqual(
      { ok: false, reason: "not-https" },
    );
    expect(
      normalizeSourceDirectoryUrl("https://user:pw@example.com/index.json"),
    ).toEqual({ ok: false, reason: "credentials" });
    for (const host of [
      "localhost",
      "127.0.0.1",
      "192.168.1.5",
      "10.0.0.2",
      "172.20.1.1",
      "169.254.1.1",
      "nas.local",
      "[::1]",
    ]) {
      expect(normalizeSourceDirectoryUrl(`https://${host}/index.json`)).toEqual(
        { ok: false, reason: "local-host" },
      );
    }
    expect(
      normalizeSourceDirectoryUrl("https://fdroid.org/index.json").ok,
    ).toBe(true);
    expect(normalizeSourceDirectoryUrl("https://172.32.0.1/index.json").ok).toBe(
      true,
    );
  });
});

describe("sourceDirectoryIdForUrl", () => {
  test("is deterministic and keeps the ids installed sources already use", () => {
    const url = "https://example.github.io/index.min.json";
    expect(sourceDirectoryIdForUrl(url)).toBe(sourceDirectoryIdForUrl(url));
    expect(sourceDirectoryIdForUrl(url)).toMatch(/^dir-[0-9a-f]{12}$/);
    expect(sourceDirectoryIdForUrl(`${url}?x=1`)).not.toBe(
      sourceDirectoryIdForUrl(url),
    );
    expect(sourceDirectoryIdForUrl(NEMU_RECOMMENDED_REGISTRY.indexUrl)).toBe(
      NEMU_RECOMMENDED_REGISTRY_ID,
    );
    for (const legacy of LEGACY_DEFAULT_SOURCE_DIRECTORIES) {
      expect(sourceDirectoryIdForUrl(legacy.indexUrl)).toBe(legacy.id);
    }
  });

  test("legacy built-ins are still the Community and ZH directories", () => {
    expect(AIDOKU_REGISTRIES.map((entry) => entry.id)).toEqual([
      "aidoku-community",
      "aidoku-zh",
    ]);
  });
});

describe("defaultSourceDirectoryName", () => {
  test("uses host and folder", () => {
    expect(
      defaultSourceDirectoryName("https://a.github.io/repo/index.min.json"),
    ).toBe("a.github.io/repo");
    expect(defaultSourceDirectoryName("https://a.github.io/index.min.json")).toBe(
      "a.github.io",
    );
  });
});

describe("web default directories", () => {
  test("AIDOKU_REGISTRIES is exactly the pair web has always shipped", () => {
    expect(AIDOKU_REGISTRIES).toEqual([
      { id: "aidoku-community", name: "Aidoku Community", indexUrl: "https://aidoku-community.github.io/sources/index.min.json" },
      {
        id: "aidoku-zh",
        name: "Aidoku ZH",
        indexUrl: "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
      },
    ]);
  });
});
