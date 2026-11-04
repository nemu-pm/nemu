import { afterEach, describe, expect, test } from "bun:test";
import type {
  InstalledSource,
  LibraryEntry,
  LocalSourceLink,
} from "@/data/schema";
import {
  rememberMobileSourceCoverOwner,
  resetMobileSourceCoverOwnersForTesting,
  resolveMobileEntryCoverSourceLinks,
  resolveMobileEntryCoverSources,
  resolveMobileEntryDisplayCover,
} from "./mobileEntryCover";

const REGISTRY = "aidoku-community";
const MANGADEX_COVER =
  "https://uploads.mangadex.org/covers/a4b39b6e/2c300b23.jpg.512.jpg";
const MANHUAGUI_COVER = "https://cf.hamreus.com/cpic/b/16891.jpg";

function installed(sourceId: string, urls: string[]): InstalledSource {
  return {
    id: `${REGISTRY}:${sourceId}`,
    registryId: REGISTRY,
    sourceId,
    version: 1,
    packageMetadata: {
      sourceId,
      name: sourceId,
      version: 1,
      urls,
      listings: [],
      filters: [],
      settings: [],
      hasWasm: true,
    },
  };
}

function link(sourceId: string, createdAt: number): LocalSourceLink {
  return {
    id: `${REGISTRY}:${sourceId}:manga`,
    libraryItemId: "item",
    registryId: REGISTRY,
    sourceId,
    sourceMangaId: "manga",
    createdAt,
    updatedAt: createdAt,
  };
}

const manhuagui = installed("zh.manhuagui", [
  "https://www.manhuagui.com",
  "https://tw.manhuagui.com",
]);
const mangadex = installed("multi.mangadex", ["https://mangadex.org"]);
const manhuaguiLink = link("zh.manhuagui", 1);
const mangadexLink = link("multi.mangadex", 2);

function hanako(cover?: string, overrides?: LibraryEntry["item"]["overrides"]): LibraryEntry {
  return {
    item: {
      libraryItemId: "item",
      metadata: { title: "地缚少年花子君", ...(cover ? { cover } : {}) },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
      ...(overrides ? { overrides } : {}),
    },
    sources: [mangadexLink, manhuaguiLink],
  };
}

afterEach(() => resetMobileSourceCoverOwnersForTesting());

describe("cover owner resolution", () => {
  test("a MangaDex cover is requested through MangaDex even when it is not primary", () => {
    expect(
      resolveMobileEntryCoverSources(hanako(MANGADEX_COVER), [manhuagui, mangadex]).map(
        (source) => source.id,
      ),
    ).toEqual([mangadex.id, manhuagui.id]);
  });

  test("a CDN cover with no domain match falls back to the primary source", () => {
    // cf.hamreus.com matches neither package; Manhuagui was linked first.
    expect(
      resolveMobileEntryCoverSources(hanako(MANHUAGUI_COVER), [mangadex, manhuagui]).map(
        (source) => source.id,
      ),
    ).toEqual([manhuagui.id, mangadex.id]);
  });

  test("a source's reported cover pins ownership over the user source order", () => {
    const entry = {
      ...hanako(MANHUAGUI_COVER),
      item: { ...hanako(MANHUAGUI_COVER).item, sourceOrder: [mangadexLink.id] },
    };
    expect(
      resolveMobileEntryCoverSourceLinks(entry, [mangadex, manhuagui]).map(
        (item) => item.id,
      ),
    ).toEqual([mangadexLink.id, manhuaguiLink.id]);
    expect(
      resolveMobileEntryCoverSourceLinks(entry, [mangadex, manhuagui], {
        knownSourceCovers: { [manhuaguiLink.id]: MANHUAGUI_COVER },
      }).map((item) => item.id),
    ).toEqual([manhuaguiLink.id, mangadexLink.id]);
  });

  test("remembered owners route the library grid without per-link details", () => {
    const entry = {
      ...hanako(MANHUAGUI_COVER),
      item: { ...hanako(MANHUAGUI_COVER).item, sourceOrder: [mangadexLink.id] },
    };
    rememberMobileSourceCoverOwner(MANHUAGUI_COVER, {
      registryId: REGISTRY,
      sourceId: "zh.manhuagui",
    });
    expect(resolveMobileEntryCoverSources(entry, [mangadex, manhuagui])[0]?.id).toBe(
      manhuagui.id,
    );
  });

  test("the selected tab plays no part: the result only depends on the entry", () => {
    const entry = hanako(MANHUAGUI_COVER);
    const first = resolveMobileEntryCoverSources(entry, [manhuagui, mangadex]);
    const second = resolveMobileEntryCoverSources(entry, [mangadex, manhuagui]);
    expect(first.map((source) => source.id)).toEqual(
      second.map((source) => source.id),
    );
  });

  test("skips uninstalled and removed links", () => {
    const entry: LibraryEntry = {
      ...hanako(MANGADEX_COVER),
      sources: [{ ...mangadexLink, removed: true }, manhuaguiLink],
    };
    expect(
      resolveMobileEntryCoverSources(entry, [manhuagui, mangadex]).map(
        (source) => source.id,
      ),
    ).toEqual([manhuagui.id]);
    expect(resolveMobileEntryCoverSources(hanako(MANGADEX_COVER), [])).toEqual([]);
  });
});

describe("display cover", () => {
  test("user override beats the stored cover, which beats source covers", () => {
    expect(
      resolveMobileEntryDisplayCover(
        hanako(MANHUAGUI_COVER, { coverUrl: "file:///covers/custom.jpg" }),
        { [mangadexLink.id]: MANGADEX_COVER },
      ),
    ).toBe("file:///covers/custom.jpg");
    expect(
      resolveMobileEntryDisplayCover(hanako(MANHUAGUI_COVER), {
        [mangadexLink.id]: MANGADEX_COVER,
      }),
    ).toBe(MANHUAGUI_COVER);
  });

  test("a missing or placeholder cover falls back to the first known source cover", () => {
    expect(
      resolveMobileEntryDisplayCover(hanako(undefined), {
        [mangadexLink.id]: MANGADEX_COVER,
        [manhuaguiLink.id]: MANHUAGUI_COVER,
      }),
    ).toBe(MANHUAGUI_COVER);
    expect(
      resolveMobileEntryDisplayCover(
        hanako("https://mangadex.org/img/cover-placeholder.jpg"),
        { [mangadexLink.id]: MANGADEX_COVER },
      ),
    ).toBe(MANGADEX_COVER);
    expect(resolveMobileEntryDisplayCover(hanako(undefined))).toBeUndefined();
  });
});
