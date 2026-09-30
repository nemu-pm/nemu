import { describe, expect, test } from "bun:test";
import type { LibraryEntry, LocalSourceLink } from "@/data/schema";
import {
  applyMobileSourceDetailsRefresh,
  isMobilePrimarySourceLink,
  mergeDefinedMangaMetadata,
  resolveMobileLibraryCoverAfterRefresh,
  resolveMobileSeedCoverHeaders,
} from "./mobileLibraryDetails";

describe("mobile library detail refresh helpers", () => {
  test("merges refreshed metadata without erasing missing existing fields", () => {
    expect(
      mergeDefinedMangaMetadata(
        {
          title: "Stored Title",
          cover: "stored-cover",
          authors: ["Stored Author"],
          description: "Stored description",
          tags: ["Stored"],
        },
        {
          title: "Fresh Title",
          description: "Fresh description",
        },
      ),
    ).toEqual({
      title: "Fresh Title",
      cover: "stored-cover",
      authors: ["Stored Author"],
      description: "Fresh description",
      tags: ["Stored"],
    });
  });

  test("keeps a resolved listing cover when source details return an empty cover", () => {
    expect(
      mergeDefinedMangaMetadata(
        {
          title: "Listing Title",
          cover: "https://source.test/listing-cover.jpg",
        },
        {
          title: "Detail Title",
          cover: "  ",
        },
      ),
    ).toEqual({
      title: "Detail Title",
      cover: "https://source.test/listing-cover.jpg",
    });
  });

  test("applies refreshed latest chapter and acknowledges it for an existing link", () => {
    const sourceLink: LocalSourceLink = {
      id: "aidoku-community:en.example:blue-lock",
      libraryItemId: "item-1",
      registryId: "aidoku-community",
      sourceId: "en.example",
      sourceMangaId: "blue-lock",
      latestChapter: { id: "c4", chapterNumber: 4 },
      updateAckChapter: { id: "c3", chapterNumber: 3 },
      createdAt: 100,
      updatedAt: 100,
    };
    const entry: LibraryEntry = {
      item: {
        libraryItemId: "item-1",
        metadata: {
          title: "Blue Lock",
          cover: "stored-cover",
        },
        inLibrary: true,
        createdAt: 100,
        updatedAt: 100,
      },
      sources: [sourceLink],
    };

    expect(
      applyMobileSourceDetailsRefresh(entry, sourceLink, {
        status: "ready",
        runtime: "native-aidoku",
        metadata: {
          title: "Blue Lock Deluxe",
          description: "Fresh source details",
        },
        chapters: [{ id: "c12", chapterNumber: 12 }],
        latestChapter: { id: "c12", chapterNumber: 12 },
        fetchedAt: 500,
      }),
    ).toEqual({
      item: {
        libraryItemId: "item-1",
        metadata: {
          title: "Blue Lock Deluxe",
          cover: "stored-cover",
          description: "Fresh source details",
        },
        inLibrary: true,
        createdAt: 100,
        updatedAt: 500,
      },
      sourceLink: {
        id: "aidoku-community:en.example:blue-lock",
        libraryItemId: "item-1",
        registryId: "aidoku-community",
        sourceId: "en.example",
        sourceMangaId: "blue-lock",
        latestChapter: { id: "c12", chapterNumber: 12 },
        latestChapterSortKey: "12",
        latestFetchedAt: 500,
        updateAckChapter: { id: "c12", chapterNumber: 12 },
        updateAckChapterSortKey: "12",
        updateAckAt: 500,
        createdAt: 100,
        updatedAt: 500,
      },
    });
  });

  test("does not replace a stored title with a runtime path or opaque id", () => {
    const sourceLink: LocalSourceLink = {
      id: "aidoku-community:ja.example:/manga/example-raw/",
      libraryItemId: "item-1",
      registryId: "aidoku-community",
      sourceId: "ja.example",
      sourceMangaId: "/manga/example-raw/",
      createdAt: 100,
      updatedAt: 100,
    };
    const entry: LibraryEntry = {
      item: {
        libraryItemId: "item-1",
        metadata: { title: "/Blush-DC.: Himitsu" },
        inLibrary: true,
        createdAt: 100,
        updatedAt: 100,
      },
      sources: [sourceLink],
    };

    for (const runtimeTitle of ["/manga/別名-raw/", "/manga/example-raw/"]) {
      const applied = applyMobileSourceDetailsRefresh(entry, sourceLink, {
        status: "ready",
        runtime: "native-aidoku",
        metadata: { title: runtimeTitle },
        chapters: [],
        fetchedAt: 500,
      });
      expect(applied.item.metadata.title).toBe("/Blush-DC.: Himitsu");
    }
  });

  test("keeps the listing cover when details return a blank one", () => {
    expect(
      mergeDefinedMangaMetadata(
        { title: "Seed", cover: "https://cdn.test/seed.jpg" },
        { title: "Detail", cover: "   " },
      ).cover,
    ).toBe("https://cdn.test/seed.jpg");
  });

  test("re-attaches seed cover headers while the cover is still the seed cover", () => {
    const seedCoverHeaders = { Referer: "https://source.test/" };

    // Details returned no usable cover, so the merge kept the seed cover and
    // its already-resolved headers stay valid.
    expect(
      resolveMobileSeedCoverHeaders({
        cover: "https://cdn.test/seed.jpg",
        seedCover: "https://cdn.test/seed.jpg",
        seedCoverHeaders,
      }),
    ).toEqual(seedCoverHeaders);

    // Details returned their own cover: the seed headers were resolved for a
    // different URL and must not be reused for it.
    expect(
      resolveMobileSeedCoverHeaders({
        cover: "https://cdn.test/detail.jpg",
        seedCover: "https://cdn.test/seed.jpg",
        seedCoverHeaders,
      }),
    ).toBeUndefined();

    expect(
      resolveMobileSeedCoverHeaders({
        cover: "https://cdn.test/seed.jpg",
        seedCover: "https://cdn.test/seed.jpg",
        seedCoverHeaders: {},
      }),
    ).toBeUndefined();
    expect(
      resolveMobileSeedCoverHeaders({
        cover: undefined,
        seedCover: "https://cdn.test/seed.jpg",
        seedCoverHeaders,
      }),
    ).toBeUndefined();
  });
});

describe("multi-source library titles", () => {
  const MANHUAGUI_COVER = "https://cf.hamreus.com/cpic/b/16891.jpg";
  const MANGADEX_COVER =
    "https://uploads.mangadex.org/covers/a4b39b6e/2c300b23.jpg.512.jpg";
  const manhuaguiLink: LocalSourceLink = {
    id: "aidoku-community:zh.manhuagui:16891",
    libraryItemId: "item",
    registryId: "aidoku-community",
    sourceId: "zh.manhuagui",
    sourceMangaId: "16891",
    createdAt: 1,
    updatedAt: 1,
  };
  const mangadexLink: LocalSourceLink = {
    id: "aidoku-community:multi.mangadex:a4b39b6e",
    libraryItemId: "item",
    registryId: "aidoku-community",
    sourceId: "multi.mangadex",
    sourceMangaId: "a4b39b6e",
    createdAt: 2,
    updatedAt: 2,
  };
  const entry: LibraryEntry = {
    item: {
      libraryItemId: "item",
      metadata: {
        title: "地缚少年花子君",
        cover: MANHUAGUI_COVER,
        description: "中文简介",
      },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [mangadexLink, manhuaguiLink],
  };
  const refresh = (
    metadata: { title: string; cover?: string; description?: string; tags?: string[] },
    fetchedAt = 500,
  ) => ({
    status: "ready" as const,
    runtime: "native-aidoku" as const,
    metadata,
    chapters: [{ id: "c1", chapterNumber: 1 }],
    latestChapter: { id: "c1", chapterNumber: 1 },
    fetchedAt,
  });

  test("the primary source is the first linked source (or the user order)", () => {
    expect(isMobilePrimarySourceLink(entry, manhuaguiLink)).toBe(true);
    expect(isMobilePrimarySourceLink(entry, mangadexLink)).toBe(false);
    expect(
      isMobilePrimarySourceLink(
        { ...entry, item: { ...entry.item, sourceOrder: [mangadexLink.id] } },
        mangadexLink,
      ),
    ).toBe(true);
  });

  test("refreshing a non-primary tab never replaces the library cover or title", () => {
    const applied = applyMobileSourceDetailsRefresh(
      entry,
      mangadexLink,
      refresh({
        title: "Jibaku Shounen: Hanako-kun",
        cover: MANGADEX_COVER,
        description: "English synopsis",
        tags: ["Comedy"],
      }),
    );
    expect(applied.item.metadata.cover).toBe(MANHUAGUI_COVER);
    expect(applied.item.metadata.title).toBe("地缚少年花子君");
    expect(applied.item.metadata.description).toBe("中文简介");
    // Missing fields may still be filled.
    expect(applied.item.metadata.tags).toEqual(["Comedy"]);
    expect(applied.sourceLink.latestChapter).toEqual({ id: "c1", chapterNumber: 1 });
  });

  test("switching MangaDex <-> Manhuagui repeatedly keeps one stable cover", () => {
    let current = entry;
    for (let round = 0; round < 3; round += 1) {
      for (const [link, cover, title] of [
        [mangadexLink, MANGADEX_COVER, "Jibaku Shounen: Hanako-kun"],
        [manhuaguiLink, MANHUAGUI_COVER, "地缚少年花子君"],
      ] as const) {
        const applied = applyMobileSourceDetailsRefresh(
          current,
          link,
          refresh({ title, cover }, 500 + round),
        );
        current = { ...current, item: applied.item };
        expect(current.item.metadata.cover).toBe(MANHUAGUI_COVER);
        expect(current.item.metadata.title).toBe("地缚少年花子君");
      }
    }
  });

  test("a no-op refresh keeps the library row identity (no write, no sync)", () => {
    const applied = applyMobileSourceDetailsRefresh(
      entry,
      mangadexLink,
      refresh({ title: "Jibaku Shounen: Hanako-kun", cover: MANGADEX_COVER }),
    );
    expect(applied.item).toBe(entry.item);
    const primary = applyMobileSourceDetailsRefresh(
      entry,
      manhuaguiLink,
      refresh({ title: "地缚少年花子君", cover: MANHUAGUI_COVER, description: "中文简介" }),
    );
    expect(primary.item).toBe(entry.item);
  });

  test("the primary source heals a cover a previous build stored from another tab", () => {
    const polluted: LibraryEntry = {
      ...entry,
      item: {
        ...entry.item,
        metadata: { title: "Jibaku Shounen: Hanako-kun", cover: MANGADEX_COVER },
      },
    };
    const applied = applyMobileSourceDetailsRefresh(
      polluted,
      manhuaguiLink,
      refresh({ title: "地缚少年花子君", cover: MANHUAGUI_COVER }),
    );
    expect(applied.item.metadata.cover).toBe(MANHUAGUI_COVER);
    expect(applied.item.metadata.title).toBe("地缚少年花子君");
  });

  test("a placeholder cover is never stored", () => {
    const placeholder = "https://mangadex.org/img/cover-placeholder.jpg";
    const noCover: LibraryEntry = {
      ...entry,
      item: { ...entry.item, metadata: { title: "地缚少年花子君" } },
    };
    expect(
      applyMobileSourceDetailsRefresh(
        noCover,
        manhuaguiLink,
        refresh({ title: "地缚少年花子君", cover: placeholder }),
      ).item.metadata.cover,
    ).toBeUndefined();
    expect(
      applyMobileSourceDetailsRefresh(
        entry,
        manhuaguiLink,
        refresh({ title: "地缚少年花子君", cover: placeholder }),
      ).item.metadata.cover,
    ).toBe(MANHUAGUI_COVER);
    // A stored placeholder is replaced even by a non-primary source.
    expect(
      applyMobileSourceDetailsRefresh(
        { ...entry, item: { ...entry.item, metadata: { title: "x", cover: placeholder } } },
        mangadexLink,
        refresh({ title: "y", cover: MANGADEX_COVER }),
      ).item.metadata.cover,
    ).toBe(MANGADEX_COVER);
  });

  test("a non-primary source fills a missing cover", () => {
    expect(
      resolveMobileLibraryCoverAfterRefresh({
        existing: undefined,
        refreshed: MANGADEX_COVER,
        primary: false,
      }),
    ).toBe(MANGADEX_COVER);
    expect(
      resolveMobileLibraryCoverAfterRefresh({
        existing: MANHUAGUI_COVER,
        refreshed: MANGADEX_COVER,
        primary: false,
      }),
    ).toBe(MANHUAGUI_COVER);
    expect(
      resolveMobileLibraryCoverAfterRefresh({
        existing: MANHUAGUI_COVER,
        refreshed: "  ",
        primary: true,
      }),
    ).toBe(MANHUAGUI_COVER);
  });
});
