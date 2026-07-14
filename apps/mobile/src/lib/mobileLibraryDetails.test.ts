import { describe, expect, test } from "bun:test";
import type { LibraryEntry, LocalSourceLink } from "@/data/schema";
import {
  applyMobileSourceDetailsRefresh,
  mergeDefinedMangaMetadata,
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
        }
      )
    ).toEqual({
      title: "Fresh Title",
      cover: "stored-cover",
      authors: ["Stored Author"],
      description: "Fresh description",
      tags: ["Stored"],
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
      })
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
});
