import { describe, expect, test } from "bun:test";
import {
  AIDOKU_REGISTRIES,
  LEGACY_DEFAULT_SOURCE_DIRECTORIES,
  NEMU_RECOMMENDED_REGISTRY,
  NEMU_RECOMMENDED_REGISTRY_ID,
  defaultSourceDirectoryName,
  legacySourceDirectoryHostPathName,
  refreshedSourceDirectoryName,
  normalizeSourceDirectoryUrl,
  sourceDirectoryCandidateUrls,
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
  test("known directories keep their names", () => {
    expect(
      defaultSourceDirectoryName(
        "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
      ),
    ).toBe("Aidoku ZH");
    expect(
      defaultSourceDirectoryName("https://aidoku-community.github.io/sources/index.min.json"),
    ).toBe("Aidoku Community");
    expect(defaultSourceDirectoryName(NEMU_RECOMMENDED_REGISTRY.indexUrl)).toBe(
      NEMU_RECOMMENDED_REGISTRY.name,
    );
  });

  test("GitHub raw and jsDelivr URLs name the repository", () => {
    expect(
      defaultSourceDirectoryName(
        "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/dev/public/index.min.json",
      ),
    ).toBe("suiyuran/aidoku-zh-sources");
    expect(
      defaultSourceDirectoryName(
        "https://cdn.jsdelivr.net/gh/suiyuran/aidoku-zh-sources@main/public/index.min.json",
      ),
    ).toBe("suiyuran/aidoku-zh-sources");
    expect(
      defaultSourceDirectoryName("https://cdn.jsdelivr.net/gh/owner/repo/index.min.json"),
    ).toBe("owner/repo");
  });

  test("GitHub Pages sites name the owner and repository", () => {
    expect(
      defaultSourceDirectoryName("https://a.github.io/repo/index.min.json"),
    ).toBe("a/repo");
    expect(defaultSourceDirectoryName("https://a.github.io/index.min.json")).toBe("a");
    expect(defaultSourceDirectoryName("https://a.github.io/")).toBe("a");
  });

  test("any other host keeps host and folder", () => {
    expect(defaultSourceDirectoryName("https://example.com/lists/mine/index.min.json")).toBe(
      "example.com/lists/mine",
    );
    expect(defaultSourceDirectoryName("https://cdn.jsdelivr.net/npm/pkg/index.json")).toBe(
      "cdn.jsdelivr.net/npm/pkg",
    );
  });

  test("the legacy host/path form is still available for migration", () => {
    expect(legacySourceDirectoryHostPathName("https://a.github.io/repo/index.min.json")).toBe(
      "a.github.io/repo",
    );
    expect(
      legacySourceDirectoryHostPathName(
        "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
      ),
    ).toBe("raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public");
  });
});

describe("refreshedSourceDirectoryName", () => {
  const zhUrl =
    "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json";
  const repoUrl = "https://raw.githubusercontent.com/owner/repo/main/index.min.json";

  test("replaces an old host/path auto-name with the index's own name", () => {
    expect(
      refreshedSourceDirectoryName({
        storedName: "raw.githubusercontent.com/owner/repo/main",
        indexUrl: repoUrl,
        indexName: "Owner's Sources",
      }),
    ).toBe("Owner's Sources");
  });

  test("replaces an old host/path auto-name with the better fallback when the index has none", () => {
    expect(
      refreshedSourceDirectoryName({
        storedName: "raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public",
        indexUrl: zhUrl,
      }),
    ).toBe("Aidoku ZH");
    expect(
      refreshedSourceDirectoryName({
        storedName: "raw.githubusercontent.com/owner/repo/main",
        indexUrl: repoUrl,
        indexName: "   ",
      }),
    ).toBe("owner/repo");
  });

  test("a current fallback name takes the index's name once it publishes one", () => {
    expect(
      refreshedSourceDirectoryName({ storedName: "owner/repo", indexUrl: repoUrl, indexName: "Repo" }),
    ).toBe("Repo");
  });

  test("keeps names that are already right", () => {
    expect(refreshedSourceDirectoryName({ storedName: "owner/repo", indexUrl: repoUrl })).toBeNull();
    expect(
      refreshedSourceDirectoryName({ storedName: "Repo", indexUrl: repoUrl, indexName: "Repo" }),
    ).toBeNull();
  });

  test("never overwrites a name that was not generated, or a user-typed one", () => {
    expect(
      refreshedSourceDirectoryName({ storedName: "My list", indexUrl: repoUrl, indexName: "Repo" }),
    ).toBeNull();
    expect(
      refreshedSourceDirectoryName({
        storedName: "raw.githubusercontent.com/owner/repo/main",
        indexUrl: repoUrl,
        indexName: "Repo",
        customName: true,
      }),
    ).toBeNull();
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

describe("sourceDirectoryCandidateUrls", () => {
  test("a URL with no .json file is tried as a list first, then as a folder", () => {
    expect(sourceDirectoryCandidateUrls("https://example.com/lists/mine")).toEqual({
      ok: true,
      urls: ["https://example.com/lists/mine", "https://example.com/lists/mine/index.min.json"],
    });
    expect(sourceDirectoryCandidateUrls("https://example.com/#frag")).toEqual({
      ok: true,
      urls: ["https://example.com/", "https://example.com/index.min.json"],
    });
  });

  test("a .json URL is tried alone, and bad URLs keep their reason", () => {
    expect(sourceDirectoryCandidateUrls("https://example.com/a/list.json")).toEqual({
      ok: true,
      urls: ["https://example.com/a/list.json"],
    });
    expect(sourceDirectoryCandidateUrls("http://example.com/a")).toEqual({ ok: false, reason: "not-https" });
    expect(sourceDirectoryCandidateUrls("nope")).toEqual({ ok: false, reason: "invalid" });
  });
});
