import { describe, expect, test } from "bun:test";
import {
  legacyVisibleCollectionItemRows,
  legacyVisibleCollectionRows,
  legacyVisibleLibraryRows,
  legacyVisibleSourceLinkRows,
} from "../convex/syncCompatibility";

describe("deployed Web Convex compatibility", () => {
  test("projects tombstones to the hard-delete view understood by old Web", () => {
    const library = legacyVisibleLibraryRows([
      { id: "active", inLibrary: true },
      { id: "removed", inLibrary: false },
    ]);
    const activeLibraryIds = new Set(library.map((item) => item.id));
    expect(library.map((item) => item.id)).toEqual(["active"]);
    expect(
      legacyVisibleSourceLinkRows(
        [
          { libraryItemId: "active", removed: false },
          { libraryItemId: "active", removed: true },
          { libraryItemId: "removed", removed: false },
        ],
        activeLibraryIds,
      ),
    ).toEqual([{ libraryItemId: "active", removed: false }]);

    const collections = legacyVisibleCollectionRows([
      { collectionId: "active", removed: false },
      { collectionId: "removed", removed: true },
    ]);
    const activeCollectionIds = new Set(
      collections.map((collection) => collection.collectionId),
    );
    expect(
      legacyVisibleCollectionItemRows(
        [
          {
            collectionId: "active",
            libraryItemId: "active",
            removed: false,
          },
          {
            collectionId: "active",
            libraryItemId: "active",
            removed: true,
          },
          {
            collectionId: "removed",
            libraryItemId: "active",
            removed: false,
          },
          {
            collectionId: "active",
            libraryItemId: "removed",
            removed: false,
          },
        ],
        activeCollectionIds,
        activeLibraryIds,
      ),
    ).toEqual([
      {
        collectionId: "active",
        libraryItemId: "active",
        removed: false,
      },
    ]);
  });
});
