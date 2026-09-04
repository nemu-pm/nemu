import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import {
  canClearMobileSearchQuery,
  groupLocalSearchResults,
  normalizeMobileSearchRouteQuery,
  normalizeSearchSelectionForSources,
  normalizeSearchSelection,
  resolveSearchSourcePressSelection,
  selectMobileLiveSearchSources,
  shouldRenderMobileSearchSkeleton,
  shouldRunMobileSearchSubmitFeedback,
  shouldShowMobileSearchNoSourcesEmpty,
  toggleAllSearchSources,
  toggleSearchSourceSelection,
  toSearchSourceDisplay,
} from "./mobileSearch";

function entry(
  libraryItemId: string,
  title: string,
  links: Array<{ registryId: string; sourceId: string; sourceMangaId: string }>
): LibraryEntry {
  const now = Date.now();
  return {
    item: {
      libraryItemId,
      metadata: { title, authors: ["Author"], tags: ["Action"] },
      inLibrary: true,
      createdAt: now,
      updatedAt: now,
    },
    sources: links.map((link) => ({
      id: `${link.registryId}:${link.sourceId}:${link.sourceMangaId}`,
      libraryItemId,
      registryId: link.registryId,
      sourceId: link.sourceId,
      sourceMangaId: link.sourceMangaId,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

describe("mobile search helpers", () => {
  test("normalizes search route query params", () => {
    expect(normalizeMobileSearchRouteQuery(undefined)).toBe("");
    expect(normalizeMobileSearchRouteQuery("  blue lock  ")).toBe("blue lock");
    expect(normalizeMobileSearchRouteQuery([" first ", "second"])).toBe(
      "first",
    );
  });

  test("enables clearing only while the visible search query has content", () => {
    expect(canClearMobileSearchQuery("")).toBe(false);
    expect(canClearMobileSearchQuery("blue lock")).toBe(true);
    expect(canClearMobileSearchQuery(" ")).toBe(true);
  });

  test("matches web search submit feedback to actionable route changes", () => {
    expect(shouldRunMobileSearchSubmitFeedback("", "")).toBe(false);
    expect(shouldRunMobileSearchSubmitFeedback("   ", "")).toBe(false);
    expect(shouldRunMobileSearchSubmitFeedback("blue lock", "blue lock")).toBe(false);
    expect(shouldRunMobileSearchSubmitFeedback("  blue lock  ", "blue lock")).toBe(false);
    expect(shouldRunMobileSearchSubmitFeedback("blue period", "blue lock")).toBe(true);
    expect(shouldRunMobileSearchSubmitFeedback("blue lock", "")).toBe(true);
  });

  test("normalizes installed source display from stored metadata", () => {
    expect(
      toSearchSourceDisplay({
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        sourceId: "en.example",
        name: "Example",
        icon: "https://example.test/icon.png",
        version: 1,
      })
    ).toEqual({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      rawSourceId: "en.example",
      sourceKeys: ["aidoku-community:en.example"],
      name: "Example",
      icon: "https://example.test/icon.png",
      unsupported: false,
    });
  });

  test("marks Tachiyomi sources unsupported across search presentation", () => {
    expect(
      toSearchSourceDisplay({
        id: "tachiyomi:en.example",
        registryId: "tachiyomi",
        sourceKind: "tachiyomi",
        sourceId: "en.example",
        name: "Example",
        version: 1,
      }),
    ).toMatchObject({
      id: "tachiyomi:en.example",
      unsupported: true,
    });
  });

  test("includes registry and runtime source keys for display matching", () => {
    expect(
      toSearchSourceDisplay({
        id: "aidoku-community:registry-id",
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        name: "Example",
        version: 1,
      }),
    ).toMatchObject({
      registryId: "aidoku-community",
      rawSourceId: "registry-id",
      sourceKeys: ["aidoku-community:registry-id", "aidoku-community:manifest.id"],
    });
  });

  test("contextualizes older bare source ids for display matching", () => {
    expect(
      toSearchSourceDisplay({
        id: "en.legacy",
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        name: "Legacy",
        version: 1,
      }),
    ).toMatchObject({
      registryId: "aidoku-community",
      rawSourceId: "manifest.id",
      sourceKeys: [
        "en.legacy",
        "aidoku-community:manifest.id",
        "aidoku-community:en.legacy",
      ],
    });
  });

  test("normalizes saved source selection aliases to display ids", () => {
    const sources = [
      toSearchSourceDisplay({
        id: "aidoku-community:registry-id",
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        name: "Example",
        version: 1,
      }),
      toSearchSourceDisplay({
        id: "aidoku-community:other",
        registryId: "aidoku-community",
        sourceId: "other",
        name: "Other",
        version: 1,
      }),
    ];

    expect(
      normalizeSearchSelectionForSources(sources, ["aidoku-community:manifest.id"]),
    ).toEqual(["aidoku-community:registry-id"]);
  });

  test("toggles between all, none, and selected sources", () => {
    const ids = ["a", "b", "c"];

    expect(toggleAllSearchSources(null)).toEqual([]);
    expect(toggleAllSearchSources([])).toBeNull();
    expect(toggleSearchSourceSelection(ids, null, "b")).toEqual(["a", "c"]);
    expect(toggleSearchSourceSelection(ids, ["a", "c"], "b")).toBeNull();
    expect(normalizeSearchSelection(ids, ["a", "stale"])).toEqual(["a"]);
  });

  test("shows the native search skeleton only while initial search data is unresolved", () => {
    expect(
      shouldRenderMobileSearchSkeleton({
        loading: true,
        settingsLoaded: false,
        installedCount: 2,
        libraryCount: 5,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSearchSkeleton({
        loading: true,
        settingsLoaded: true,
        installedCount: 0,
        libraryCount: 0,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSearchSkeleton({
        loading: true,
        settingsLoaded: true,
        installedCount: 2,
        libraryCount: 0,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileSearchSkeleton({
        loading: true,
        settingsLoaded: false,
        installedCount: 0,
        libraryCount: 0,
        hasError: true,
      }),
    ).toBe(false);
  });

  test("keeps search data errors retryable before showing no-source onboarding", () => {
    expect(
      shouldShowMobileSearchNoSourcesEmpty({
        loading: false,
        installedCount: 0,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileSearchNoSourcesEmpty({
        loading: true,
        installedCount: 0,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSearchNoSourcesEmpty({
        loading: false,
        installedCount: 0,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSearchNoSourcesEmpty({
        loading: false,
        installedCount: 1,
        hasError: false,
      }),
    ).toBe(false);
  });

  test("resolves source double presses as select only", () => {
    const ids = ["a", "b", "c"];

    expect(
      resolveSearchSourcePressSelection(ids, null, "b", null, 1000)
    ).toEqual({
      selection: ["a", "c"],
      lastPress: { id: "b", time: 1000 },
    });

    expect(
      resolveSearchSourcePressSelection(
        ids,
        ["a", "c"],
        "b",
        { id: "b", time: 1000 },
        1250
      )
    ).toEqual({
      selection: ["b"],
      lastPress: null,
    });

    expect(
      resolveSearchSourcePressSelection(
        ids,
        ["a", "c"],
        "b",
        { id: "b", time: 1000 },
        1300
      )
    ).toEqual({
      selection: null,
      lastPress: { id: "b", time: 1300 },
    });

    expect(
      resolveSearchSourcePressSelection(
        ids,
        ["a", "c"],
        "c",
        { id: "b", time: 1000 },
        1100
      )
    ).toEqual({
      selection: ["a"],
      lastPress: { id: "c", time: 1100 },
    });
  });

  test("groups local matches by selected installed source", () => {
    const sources = [
      {
        id: "aidoku-community:en.alpha",
        registryId: "aidoku-community",
        rawSourceId: "en.alpha",
        name: "Alpha",
      },
      {
        id: "aidoku-community:en.beta",
        registryId: "aidoku-community",
        rawSourceId: "en.beta",
        name: "Beta",
      },
    ];
    const entries = [
      entry("one", "Blue Lock", [
        {
          registryId: "aidoku-community",
          sourceId: "en.alpha",
          sourceMangaId: "blue-lock",
        },
      ]),
      entry("two", "Redline", [
        {
          registryId: "aidoku-community",
          sourceId: "en.beta",
          sourceMangaId: "redline",
        },
      ]),
    ];

    const groups = groupLocalSearchResults(entries, sources, ["aidoku-community:en.alpha"], "blue");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.source.name).toBe("Alpha");
    expect(groups[0]?.entries.map((item) => item.item.libraryItemId)).toEqual(["one"]);
  });

  test("groups local matches by registry source key when manifest ids differ", () => {
    const sources = [
      toSearchSourceDisplay({
        id: "aidoku-community:registry-id",
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        name: "Alpha",
        version: 1,
      }),
    ];
    const entries = [
      entry("one", "Blue Lock", [
        {
          registryId: "aidoku-community",
          sourceId: "registry-id",
          sourceMangaId: "blue-lock",
        },
      ]),
      entry("two", "Blue Period", [
        {
          registryId: "aidoku-community",
          sourceId: "other",
          sourceMangaId: "blue-period",
        },
      ]),
    ];

    const groups = groupLocalSearchResults(entries, sources, null, "blue");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((item) => item.item.libraryItemId)).toEqual([
      "one",
    ]);
  });

  test("groups local matches by contextualized bare source ids", () => {
    const sources = [
      toSearchSourceDisplay({
        id: "en.legacy",
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        name: "Legacy",
        version: 1,
      }),
    ];
    const entries = [
      entry("one", "Blue Lock", [
        {
          registryId: "aidoku-community",
          sourceId: "en.legacy",
          sourceMangaId: "blue-lock",
        },
      ]),
    ];

    const groups = groupLocalSearchResults(entries, sources, null, "blue");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.source.id).toBe("en.legacy");
    expect(groups[0]?.entries.map((item) => item.item.libraryItemId)).toEqual(["one"]);
  });

  test("groups local matches when saved selection uses a runtime source alias", () => {
    const sources = [
      toSearchSourceDisplay({
        id: "aidoku-community:registry-id",
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        name: "Alpha",
        version: 1,
      }),
    ];
    const entries = [
      entry("one", "Blue Lock", [
        {
          registryId: "aidoku-community",
          sourceId: "registry-id",
          sourceMangaId: "blue-lock",
        },
      ]),
    ];

    const groups = groupLocalSearchResults(
      entries,
      sources,
      ["aidoku-community:manifest.id"],
      "blue",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.source.id).toBe("aidoku-community:registry-id");
    expect(groups[0]?.entries.map((item) => item.item.libraryItemId)).toEqual(["one"]);
  });

  test("keeps unsupported sources in local matching but excludes live execution", () => {
    const supported = toSearchSourceDisplay({
      id: "aidoku-community:en.supported",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.supported",
      name: "Supported",
      version: 1,
    });
    const unsupported = toSearchSourceDisplay({
      id: "tachiyomi:en.unsupported",
      registryId: "tachiyomi",
      sourceKind: "tachiyomi",
      sourceId: "en.unsupported",
      name: "Unsupported",
      version: 1,
    });
    const sources = [supported, unsupported];
    const entries = [
      entry("saved", "Saved only", [
        {
          registryId: "tachiyomi",
          sourceId: "en.unsupported",
          sourceMangaId: "saved-only",
        },
      ]),
    ];

    expect(groupLocalSearchResults(entries, sources, null, "saved")).toEqual([
      { source: supported, entries: [] },
      { source: unsupported, entries },
    ]);
    expect(selectMobileLiveSearchSources(sources, null)).toEqual([supported]);
    expect(
      selectMobileLiveSearchSources(sources, [unsupported.id]),
    ).toEqual([]);
  });

  test("matches local saved results by title, author, tag, and source manga id", () => {
    const sources = [
      {
        id: "aidoku-community:en.alpha",
        registryId: "aidoku-community",
        rawSourceId: "en.alpha",
        name: "Alpha",
      },
    ];
    const titleMatch = entry("title", "Blue Lock", [
      {
        registryId: "aidoku-community",
        sourceId: "en.alpha",
        sourceMangaId: "unrelated-slug",
      },
    ]);
    const authorMatch = entry("author", "Unrelated", [
      {
        registryId: "aidoku-community",
        sourceId: "en.alpha",
        sourceMangaId: "other",
      },
    ]);
    authorMatch.item.metadata.authors = ["Blue Author"];
    const tagMatch = entry("tag", "Unrelated", [
      {
        registryId: "aidoku-community",
        sourceId: "en.alpha",
        sourceMangaId: "tag-only",
      },
    ]);
    tagMatch.item.metadata.tags = ["Blue"];
    tagMatch.item.metadata.authors = ["Other Author"];
    const sourceIdMatch = entry("source-id", "Unrelated", [
      {
        registryId: "aidoku-community",
        sourceId: "en.alpha",
        sourceMangaId: "blue-slug",
      },
    ]);
    sourceIdMatch.item.metadata.authors = ["Other Author"];
    sourceIdMatch.item.metadata.tags = ["Action"];
    const descriptionOnly = entry("description", "Unrelated", [
      {
        registryId: "aidoku-community",
        sourceId: "en.alpha",
        sourceMangaId: "other",
      },
    ]);
    descriptionOnly.item.metadata.description = "Blue appears only in description";
    descriptionOnly.item.metadata.authors = ["Other Author"];
    descriptionOnly.item.metadata.tags = ["Action"];

    const groups = groupLocalSearchResults(
      [titleMatch, authorMatch, tagMatch, sourceIdMatch, descriptionOnly],
      sources,
      null,
      "blue",
    );

    expect(groups[0]?.entries.map((item) => item.item.libraryItemId)).toEqual([
      "title",
      "author",
      "tag",
      "source-id",
    ]);
  });

  test("matches slug source manga ids with spaced queries", () => {
    const sources = [
      {
        id: "aidoku-community:en.alpha",
        registryId: "aidoku-community",
        rawSourceId: "en.alpha",
        name: "Alpha",
      },
    ];
    const slugMatch = entry("slug", "Unrelated", [
      {
        registryId: "aidoku-community",
        sourceId: "en.alpha",
        sourceMangaId: "blue-lock",
      },
    ]);

    const groups = groupLocalSearchResults([slugMatch], sources, null, "blue lock");

    expect(groups[0]?.entries.map((item) => item.item.libraryItemId)).toEqual([
      "slug",
    ]);
  });
});
