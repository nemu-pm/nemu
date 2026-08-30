import { describe, expect, test } from "bun:test";
import type { InstalledSource, LibraryEntry, LocalSourceLink } from "@/data/schema";
import { findMobileReaderLibrarySource } from "./mobileReaderLibrary";

function installed(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    version: 1,
    ...overrides,
  };
}

function sourceLink(overrides: Partial<LocalSourceLink> = {}): LocalSourceLink {
  return {
    id: "aidoku-community:en.example:blue-lock",
    libraryItemId: "item-1",
    registryId: "aidoku-community",
    sourceId: "en.example",
    sourceMangaId: "blue-lock",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function entry(sources: LocalSourceLink[]): LibraryEntry {
  return {
    item: {
      libraryItemId: "item-1",
      metadata: { title: "Blue Lock" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    },
    sources,
  };
}

describe("mobile reader library source lookup", () => {
  test("finds the current reader source link by direct route identity", () => {
    const link = sourceLink();
    const result = findMobileReaderLibrarySource(
      [entry([link])],
      installed(),
      "aidoku-community",
      "en.example",
      "blue-lock",
    );

    expect(result.entry?.item.libraryItemId).toBe("item-1");
    expect(result.sourceLink).toBe(link);
  });

  test("finds registry-keyed source links when manifest ids differ", () => {
    const link = sourceLink({
      id: "aidoku-community:registry-id:blue-lock",
      sourceId: "registry-id",
    });
    const result = findMobileReaderLibrarySource(
      [entry([link])],
      installed({
        id: "aidoku-community:registry-id",
        sourceId: "manifest.id",
      }),
      "aidoku-community",
      "manifest.id",
      "blue-lock",
    );

    expect(result.sourceLink).toBe(link);
  });

  test("keeps different source manga ids separate across aliases", () => {
    const link = sourceLink({
      id: "aidoku-community:registry-id:other-title",
      sourceId: "registry-id",
      sourceMangaId: "other-title",
    });
    const result = findMobileReaderLibrarySource(
      [entry([link])],
      installed({
        id: "aidoku-community:registry-id",
        sourceId: "manifest.id",
      }),
      "aidoku-community",
      "manifest.id",
      "blue-lock",
    );

    expect(result).toEqual({ entry: null, sourceLink: null });
  });

  test("falls back to the route source when no installed source is resolved", () => {
    const link = sourceLink();
    const result = findMobileReaderLibrarySource(
      [entry([link])],
      null,
      "aidoku-community",
      "en.example",
      "blue-lock",
    );

    expect(result.sourceLink).toBe(link);
  });
});
