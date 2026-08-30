import { describe, expect, test } from "bun:test";
import {
  makeSourceLinkId,
  type InstalledSource,
  type LibraryEntry,
  type LocalSourceLink,
} from "@/data/schema";
import {
  applyMobileLatestChapterRefreshAttempt,
  applyMobileLatestChapterRefresh,
  canRefreshInstalledSource,
  findInstalledSourceForLink,
  hasMobileLibraryStaleSourceLinks,
  refreshMobileLibraryLatestChapters,
  getMobileLibraryRefreshLifecycleDecision,
  isMobileLibraryRefreshAppActive,
  sourceLinkNeedsLatestRefresh,
} from "./mobileLibraryRefresh";

function installedSource(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    name: "Example",
    version: 1,
    packageUri: "file:///cache/example.aix",
    packageMetadata: {
      sourceId: "en.example",
      name: "Example",
      version: 1,
      listings: [],
      filters: [],
      settings: [],
      hasWasm: true,
    },
    ...overrides,
  };
}

function sourceLink(
  sourceMangaId: string,
  overrides: Partial<LocalSourceLink> = {}
): LocalSourceLink {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  return {
    id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
    libraryItemId: sourceMangaId,
    registryId,
    sourceId,
    sourceMangaId,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function entry(sourceLinks: LocalSourceLink[]): LibraryEntry {
  return {
    item: {
      libraryItemId: sourceLinks[0]?.libraryItemId ?? "item",
      metadata: { title: "Item" },
      inLibrary: true,
      createdAt: 100,
      updatedAt: 100,
    },
    sources: sourceLinks,
  };
}

describe("mobile library refresh", () => {
  test("allows scheduled refresh work only while the app is active", () => {
    expect(isMobileLibraryRefreshAppActive("active")).toBe(true);
    expect(isMobileLibraryRefreshAppActive("inactive")).toBe(false);
    expect(isMobileLibraryRefreshAppActive("background")).toBe(false);
    expect(isMobileLibraryRefreshAppActive("unknown")).toBe(false);
  });

  test("aborts on background and requests an immediate foreground catch-up", () => {
    expect(getMobileLibraryRefreshLifecycleDecision({
      previous: "active",
      next: "background",
      inFlight: true,
    })).toEqual({
      abortCurrent: true,
      refreshNow: false,
      refreshAfterInFlight: false,
    });
    expect(getMobileLibraryRefreshLifecycleDecision({
      previous: "background",
      next: "active",
      inFlight: false,
    })).toEqual({
      abortCurrent: false,
      refreshNow: true,
      refreshAfterInFlight: false,
    });
    expect(getMobileLibraryRefreshLifecycleDecision({
      previous: "inactive",
      next: "active",
      inFlight: true,
    })).toEqual({
      abortCurrent: false,
      refreshNow: false,
      refreshAfterInFlight: true,
    });
  });

  test("detects stale source links from latest fetched time", () => {
    expect(sourceLinkNeedsLatestRefresh(sourceLink("missing"), 10_000)).toBe(true);
    expect(
      sourceLinkNeedsLatestRefresh(sourceLink("fresh", { latestFetchedAt: 9_000 }), 10_000, 2_000)
    ).toBe(false);
    expect(
      sourceLinkNeedsLatestRefresh(sourceLink("stale", { latestFetchedAt: 7_000 }), 10_000, 2_000)
    ).toBe(true);
  });

  test("detects whether any library source link is stale", () => {
    expect(
      hasMobileLibraryStaleSourceLinks(
        [entry([sourceLink("fresh", { latestFetchedAt: 9_500 })])],
        10_000,
        2_000
      )
    ).toBe(false);
    expect(
      hasMobileLibraryStaleSourceLinks(
        [entry([sourceLink("fresh", { latestFetchedAt: 9_500 }), sourceLink("missing")])],
        10_000,
        2_000
      )
    ).toBe(true);
  });

  test("ignores stale source links that do not have a refreshable runtime", () => {
    const staleTachiyomi = sourceLink("tachiyomi", {
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      latestFetchedAt: 1_000,
    });

    expect(canRefreshInstalledSource(installedSource())).toBe(true);
    expect(
      canRefreshInstalledSource(
        installedSource({
          id: "tachiyomi-local:en.mangapill",
          registryId: "tachiyomi-local",
          sourceId: "en.mangapill",
          packageUri: undefined,
          packageMetadata: undefined,
        }),
      ),
    ).toBe(false);
    expect(
      hasMobileLibraryStaleSourceLinks(
        [entry([staleTachiyomi])],
        10_000,
        2_000,
        [
          installedSource({
            id: "tachiyomi-local:en.mangapill",
            registryId: "tachiyomi-local",
            sourceId: "en.mangapill",
            packageUri: undefined,
            packageMetadata: undefined,
          }),
        ],
      )
    ).toBe(false);
  });

  test("matches installed source records after runtime normalization", () => {
    expect(
      findInstalledSourceForLink(
        [installedSource({ id: "aidoku-community:legacy", sourceId: undefined })],
        sourceLink("manga", { sourceId: "legacy" })
      )
    ).toMatchObject({ id: "aidoku-community:legacy" });
  });

  test("matches source links by registry id when package source ids differ", () => {
    expect(
      findInstalledSourceForLink(
        [
          installedSource({
            id: "aidoku-community:registry-id",
            sourceId: "manifest.id",
          }),
        ],
        sourceLink("manga", { sourceId: "registry-id" }),
      )
    ).toMatchObject({ sourceId: "manifest.id" });
  });

  test("updates latest chapter without acknowledging newer chapters", () => {
    const refreshed = applyMobileLatestChapterRefresh(
      sourceLink("manga", {
        latestChapter: { id: "c3", chapterNumber: 3 },
        updateAckChapter: { id: "c2", chapterNumber: 2 },
        updateAckChapterSortKey: "2",
      }),
      {
        status: "ready",
        runtime: "native-aidoku",
        latestChapter: { id: "c5", chapterNumber: 5 },
        fetchedAt: 500,
      }
    );

    expect(refreshed).toMatchObject({
      latestChapter: { id: "c5", chapterNumber: 5 },
      latestChapterSortKey: "5",
      updateAckChapter: { id: "c2", chapterNumber: 2 },
      updateAckChapterSortKey: "2",
      latestFetchedAt: 500,
      updatedAt: 500,
    });
  });

  test("initializes acknowledgement on first latest chapter refresh", () => {
    expect(
      applyMobileLatestChapterRefresh(sourceLink("manga"), {
        status: "ready",
        runtime: "native-aidoku",
        latestChapter: { id: "c1", chapterNumber: 1 },
        fetchedAt: 500,
      })
    ).toMatchObject({
      latestChapter: { id: "c1", chapterNumber: 1 },
      updateAckChapter: { id: "c1", chapterNumber: 1 },
      latestFetchedAt: 500,
    });
  });

  test("records failed refresh attempts without acknowledging chapters", () => {
    expect(
      applyMobileLatestChapterRefreshAttempt(
        sourceLink("manga", {
          latestChapter: { id: "c3", chapterNumber: 3 },
          latestFetchedAt: 100,
          updateAckChapter: { id: "c2", chapterNumber: 2 },
          updateAckChapterSortKey: "2",
          updatedAt: 50,
        }),
        10_000
      )
    ).toMatchObject({
      latestChapter: { id: "c3", chapterNumber: 3 },
      latestFetchedAt: 10_000,
      updateAckChapter: { id: "c2", chapterNumber: 2 },
      updateAckChapterSortKey: "2",
      updatedAt: 50,
    });
  });

  test("refreshes stale source links and skips fresh or missing packages", async () => {
    const saved: LocalSourceLink[] = [];
    const stale = sourceLink("stale", { latestFetchedAt: 1_000 });
    const fresh = sourceLink("fresh", { latestFetchedAt: 9_500 });
    const missing = sourceLink("missing", { sourceId: "missing", latestFetchedAt: 1_000 });

    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry([stale, fresh, missing])],
      installedSources: [installedSource()],
      saveSourceLink: async (nextSourceLink) => {
        saved.push(nextSourceLink);
      },
      refreshLatestChapter: async (_source, mangaId) => ({
        status: "ready",
        runtime: "native-aidoku",
        latestChapter: { id: `${mangaId}-latest`, chapterNumber: 12 },
        fetchedAt: 10_000,
      }),
      now: () => 10_000,
      intervalMs: 2_000,
    });

    expect(result).toEqual({
      checked: 1,
      refreshed: 1,
      updated: 1,
      skippedFresh: 1,
      skippedMissingSource: 1,
      blocked: 0,
      failed: 0,
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      sourceMangaId: "stale",
      latestChapter: { id: "stale-latest", chapterNumber: 12 },
    });
  });

  test("can force fresh source links for manual refresh", async () => {
    const saved: LocalSourceLink[] = [];
    const fresh = sourceLink("fresh", { latestFetchedAt: 9_500 });

    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry([fresh])],
      force: true,
      installedSources: [installedSource()],
      saveSourceLink: async (nextSourceLink) => {
        saved.push(nextSourceLink);
      },
      refreshLatestChapter: async (_source, mangaId) => ({
        status: "ready",
        runtime: "native-aidoku",
        latestChapter: { id: `${mangaId}-latest`, chapterNumber: 12 },
        fetchedAt: 10_000,
      }),
      now: () => 10_000,
      intervalMs: 2_000,
    });

    expect(result).toEqual({
      checked: 1,
      refreshed: 1,
      updated: 1,
      skippedFresh: 0,
      skippedMissingSource: 0,
      blocked: 0,
      failed: 0,
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      sourceMangaId: "fresh",
      latestChapter: { id: "fresh-latest", chapterNumber: 12 },
    });
  });

  test("does not invoke latest refresh for unsupported installed sources", async () => {
    const staleTachiyomi = sourceLink("tachiyomi", {
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      latestFetchedAt: 1_000,
    });
    let refreshCalled = false;

    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry([staleTachiyomi])],
      installedSources: [
        installedSource({
          id: "tachiyomi-local:en.mangapill",
          registryId: "tachiyomi-local",
          sourceId: "en.mangapill",
          packageUri: undefined,
          packageMetadata: undefined,
        }),
      ],
      saveSourceLink: async () => {},
      refreshLatestChapter: async () => {
        refreshCalled = true;
        return {
          status: "ready",
          runtime: "native-aidoku",
          latestChapter: { id: "c1", chapterNumber: 1 },
          fetchedAt: 10_000,
        };
      },
      now: () => 10_000,
      intervalMs: 2_000,
    });

    expect(refreshCalled).toBe(false);
    expect(result).toEqual({
      checked: 0,
      refreshed: 0,
      updated: 0,
      skippedFresh: 0,
      skippedMissingSource: 0,
      blocked: 1,
      failed: 0,
    });
  });

  test("records blocked runtime attempts so auto refresh gets a cooldown", async () => {
    const saved: LocalSourceLink[] = [];
    const stale = sourceLink("blocked", { latestFetchedAt: 1_000 });

    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry([stale])],
      installedSources: [installedSource()],
      saveSourceLink: async (nextSourceLink) => {
        saved.push(nextSourceLink);
      },
      refreshLatestChapter: async () => ({
        status: "blocked",
        reason: "runtime",
        detail: "Native bridge unavailable",
      }),
      now: () => 10_000,
      intervalMs: 2_000,
    });

    expect(result).toEqual({
      checked: 1,
      refreshed: 0,
      updated: 0,
      skippedFresh: 0,
      skippedMissingSource: 0,
      blocked: 1,
      failed: 0,
    });
    expect(saved).toEqual([
      expect.objectContaining({
        sourceMangaId: "blocked",
        latestFetchedAt: 10_000,
      }),
    ]);
  });

  test("keeps blocked runtime counters stable when recording the cooldown fails", async () => {
    const stale = sourceLink("blocked", { latestFetchedAt: 1_000 });
    const warn = console.warn;
    console.warn = () => {};

    try {
      const result = await refreshMobileLibraryLatestChapters({
        entries: [entry([stale])],
        installedSources: [installedSource()],
        saveSourceLink: async () => {
          throw new Error("store");
        },
        refreshLatestChapter: async () => ({
          status: "blocked",
          reason: "runtime",
          detail: "Native bridge unavailable",
        }),
        now: () => 10_000,
        intervalMs: 2_000,
      });

      expect(result).toEqual({
        checked: 1,
        refreshed: 0,
        updated: 0,
        skippedFresh: 0,
        skippedMissingSource: 0,
        blocked: 1,
        failed: 0,
      });
    } finally {
      console.warn = warn;
    }
  });

  test("records failed runtime attempts so auto refresh gets a cooldown", async () => {
    const saved: LocalSourceLink[] = [];
    const stale = sourceLink("failed", { latestFetchedAt: 1_000 });
    const warn = console.warn;
    console.warn = () => {};

    try {
      const result = await refreshMobileLibraryLatestChapters({
        entries: [entry([stale])],
        installedSources: [installedSource()],
        saveSourceLink: async (nextSourceLink) => {
          saved.push(nextSourceLink);
        },
        refreshLatestChapter: async () => {
          throw new Error("network");
        },
        now: () => 10_000,
        intervalMs: 2_000,
      });

      expect(result).toEqual({
        checked: 1,
        refreshed: 0,
        updated: 0,
        skippedFresh: 0,
        skippedMissingSource: 0,
        blocked: 0,
        failed: 1,
      });
      expect(saved).toEqual([
        expect.objectContaining({
          sourceMangaId: "failed",
          latestFetchedAt: 10_000,
        }),
      ]);
    } finally {
      console.warn = warn;
    }
  });

  test("aborts between chunks when the signal flips and reports partial work", async () => {
    const saved: LocalSourceLink[] = [];
    const staleLinks = [
      sourceLink("a", { latestFetchedAt: 1_000 }),
      sourceLink("b", { latestFetchedAt: 1_000 }),
      sourceLink("c", { latestFetchedAt: 1_000 }),
      sourceLink("d", { latestFetchedAt: 1_000 }),
    ];
    const signal = { aborted: false };
    let refreshCalls = 0;

    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry(staleLinks)],
      installedSources: [installedSource()],
      saveSourceLink: async (nextSourceLink) => {
        saved.push(nextSourceLink);
      },
      refreshLatestChapter: async (_source, mangaId) => {
        refreshCalls += 1;
        // Flip the abort after the first chunk completes so the run stops
        // before processing the remaining links.
        if (refreshCalls >= 2) {
          signal.aborted = true;
        }
        return {
          status: "ready",
          runtime: "native-aidoku",
          latestChapter: { id: `${mangaId}-latest`, chapterNumber: 1 },
          fetchedAt: 10_000,
        };
      },
      now: () => 10_000,
      intervalMs: 2_000,
      maxConcurrentRequests: 2,
      signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.refreshed).toBeLessThan(staleLinks.length);
    expect(refreshCalls).toBeLessThan(staleLinks.length);
    expect(saved.length).toBeLessThan(staleLinks.length);
  });

  test("does not apply failure cooldown when native HTTP is cancelled on background", async () => {
    const saved: LocalSourceLink[] = [];
    const signal = { aborted: false };
    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry([sourceLink("backgrounded", { latestFetchedAt: 1_000 })])],
      installedSources: [installedSource()],
      saveSourceLink: async (nextSourceLink) => {
        saved.push(nextSourceLink);
      },
      refreshLatestChapter: async () => {
        signal.aborted = true;
        throw new Error("App is not active.");
      },
      now: () => 10_000,
      intervalMs: 2_000,
      signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.failed).toBe(0);
    expect(saved).toEqual([]);
  });

  test("does not start source work when already backgrounded", async () => {
    let refreshCalls = 0;
    let cooldownWrites = 0;
    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry([sourceLink("backgrounded", { latestFetchedAt: 1_000 })])],
      installedSources: [installedSource()],
      saveSourceLink: async () => {
        cooldownWrites += 1;
      },
      refreshLatestChapter: async () => {
        refreshCalls += 1;
        throw new Error("must not run");
      },
      now: () => 10_000,
      intervalMs: 2_000,
      signal: {
        aborted: !isMobileLibraryRefreshAppActive("background"),
      },
    });

    expect(result.aborted).toBe(true);
    expect(result.failed).toBe(0);
    expect(refreshCalls).toBe(0);
    expect(cooldownWrites).toBe(0);
  });

  test("completes fully and omits aborted when the signal never flips", async () => {
    const staleLinks = [
      sourceLink("a", { latestFetchedAt: 1_000 }),
      sourceLink("b", { latestFetchedAt: 1_000 }),
    ];
    const result = await refreshMobileLibraryLatestChapters({
      entries: [entry(staleLinks)],
      installedSources: [installedSource()],
      saveSourceLink: async () => {},
      refreshLatestChapter: async (_source, mangaId) => ({
        status: "ready",
        runtime: "native-aidoku",
        latestChapter: { id: `${mangaId}-latest`, chapterNumber: 1 },
        fetchedAt: 10_000,
      }),
      now: () => 10_000,
      intervalMs: 2_000,
      maxConcurrentRequests: 1,
      signal: { aborted: false },
    });

    expect(result.aborted).toBeUndefined();
    expect(result.refreshed).toBe(2);
  });
});
