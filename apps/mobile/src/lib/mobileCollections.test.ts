import { describe, expect, test } from "bun:test";
import type { LibraryEntry, LocalCollection, LocalCollectionItem } from "@/data/schema";
import {
  buildCollectionMembership,
  buildRenamedCollection,
  canSelectMobileCollectionScope,
  canCreateMobileCollection,
  canRenameMobileCollection,
  canRetryMobileCollectionMembershipLoadError,
  canSaveMobileCollectionMembership,
  canStartMobileCollectionAction,
  collectionCount,
  collectionManagementTarget,
  collectionSelectionForLibraryItem,
  diffCollectionSelection,
  diffLibraryItemSelection,
  entriesForCollection,
  getMobileCollectionMembershipSaveResultAction,
  getMobileCollectionSelectionSessionKey,
  isMobileCollectionActionBusy,
  resolveCollectionSelection,
  resolveMobileCollectionCreatePressAction,
  sortCollections,
  toggleCollectionSelection,
} from "./mobileCollections";

function collection(collectionId: string, createdAt: number): LocalCollection {
  return {
    collectionId,
    name: collectionId,
    createdAt,
    updatedAt: createdAt,
  };
}

function membership(collectionId: string, libraryItemId: string): LocalCollectionItem {
  return {
    collectionId,
    libraryItemId,
    addedAt: 1,
    updatedAt: 1,
  };
}

function entry(libraryItemId: string): LibraryEntry {
  return {
    item: {
      libraryItemId,
      metadata: { title: libraryItemId },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [],
  };
}

describe("mobile collection helpers", () => {
  test("sorts collections by newest first and stable id fallback", () => {
    expect(
      sortCollections([
        collection("b", 1),
        collection("a", 1),
        collection("new", 2),
      ]).map((item) => item.collectionId)
    ).toEqual(["new", "a", "b"]);
  });

  test("builds membership and counts items", () => {
    const map = buildCollectionMembership([
      membership("favorites", "one"),
      membership("favorites", "two"),
      membership("later", "two"),
    ]);

    expect(collectionCount("favorites", map)).toBe(2);
    expect(collectionCount("missing", map)).toBe(0);
  });

  test("builds a trimmed renamed collection without changing identity", () => {
    expect(buildRenamedCollection(collection("favorites", 10), " Reading ", 20)).toEqual({
      collectionId: "favorites",
      name: "Reading",
      createdAt: 10,
      updatedAt: 20,
    });
  });

  test("ignores empty and unchanged collection names", () => {
    const existing = collection("favorites", 10);

    expect(buildRenamedCollection(existing, "   ", 20)).toBeNull();
    expect(buildRenamedCollection(existing, "favorites", 20)).toBeNull();
  });

  test("filters entries by collection membership", () => {
    const entries = [entry("one"), entry("two"), entry("three")];
    const map = buildCollectionMembership([
      membership("favorites", "one"),
      membership("favorites", "three"),
    ]);

    expect(entriesForCollection(entries, null, map).map((item) => item.item.libraryItemId)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(
      entriesForCollection(entries, "favorites", map).map((item) => item.item.libraryItemId)
    ).toEqual(["one", "three"]);
  });

  test("resolves collection route selection without falling back to all entries", () => {
    const collections = [
      collection("favorites", 1),
      collection("later", 2),
    ];

    expect(resolveCollectionSelection(collections, null)).toEqual({
      collection: null,
      effectiveCollectionId: null,
      missing: false,
    });
    expect(resolveCollectionSelection(collections, "later")).toEqual({
      collection: collections[1],
      effectiveCollectionId: "later",
      missing: false,
    });
    expect(resolveCollectionSelection(collections, "deleted")).toEqual({
      collection: null,
      effectiveCollectionId: null,
      missing: true,
    });
  });

  test("picks the current collection or newest collection for management", () => {
    const collections = sortCollections([
      collection("old", 1),
      collection("new", 2),
    ]);

    expect(collectionManagementTarget(collections, "old")?.collectionId).toBe("old");
    expect(collectionManagementTarget(collections, "missing")?.collectionId).toBe("new");
    expect(collectionManagementTarget(collections, null)?.collectionId).toBe("new");
    expect(collectionManagementTarget([], null)).toBeNull();
  });

  test("gates collection actions while any collection mutation is active", () => {
    const idle = {
      creating: false,
      renaming: false,
      savingMembership: false,
      removing: false,
    };
    const creating = { ...idle, creating: true };
    const renaming = { ...idle, renaming: true };
    const savingMembership = { ...idle, savingMembership: true };
    const removing = { ...idle, removing: true };
    const loadingCollections = { ...idle, loadingCollections: true };

    expect(isMobileCollectionActionBusy(idle)).toBe(false);
    expect(canStartMobileCollectionAction(idle)).toBe(true);
    expect(canStartMobileCollectionAction(creating)).toBe(false);
    expect(canStartMobileCollectionAction(loadingCollections)).toBe(false);
    expect(canStartMobileCollectionAction(renaming)).toBe(false);
    expect(canStartMobileCollectionAction(savingMembership)).toBe(false);
    expect(canStartMobileCollectionAction(removing)).toBe(false);
  });

  test("keeps failed collection membership saves retryable from the sheet", () => {
    expect(
      getMobileCollectionMembershipSaveResultAction({ saved: true }),
    ).toBe("close-sheet");
    expect(
      getMobileCollectionMembershipSaveResultAction({ saved: false }),
    ).toBe("keep-sheet-open");
  });

  test("gates collection scope selection to real idle changes", () => {
    const idle = {
      creating: false,
      renaming: false,
      savingMembership: false,
      removing: false,
    };
    const busy = { ...idle, savingMembership: true };

    expect(
      canSelectMobileCollectionScope({
        currentCollectionId: null,
        nextCollectionId: "favorites",
        state: idle,
      }),
    ).toBe(true);
    expect(
      canSelectMobileCollectionScope({
        currentCollectionId: "favorites",
        nextCollectionId: null,
        state: idle,
      }),
    ).toBe(true);
    expect(
      canSelectMobileCollectionScope({
        currentCollectionId: "favorites",
        nextCollectionId: "favorites",
        state: idle,
      }),
    ).toBe(false);
    expect(
      canSelectMobileCollectionScope({
        currentCollectionId: null,
        nextCollectionId: null,
        state: idle,
      }),
    ).toBe(false);
    expect(
      canSelectMobileCollectionScope({
        currentCollectionId: null,
        nextCollectionId: "favorites",
        state: busy,
      }),
    ).toBe(false);
  });

  test("gates collection create, rename, and membership saves", () => {
    const idle = {
      creating: false,
      renaming: false,
      savingMembership: false,
      removing: false,
    };
    const busy = { ...idle, savingMembership: true };

    expect(canCreateMobileCollection(idle, " Favorites ")).toBe(true);
    expect(canCreateMobileCollection(idle, "   ")).toBe(false);
    expect(canCreateMobileCollection(busy, "Favorites")).toBe(false);

    expect(canRenameMobileCollection(idle, " Favorites ", "Old")).toBe(true);
    expect(canRenameMobileCollection(idle, " Old ", "Old")).toBe(false);
    expect(canRenameMobileCollection(idle, "   ", "Old")).toBe(false);
    expect(canRenameMobileCollection(busy, "Favorites", "Old")).toBe(false);

    expect(canSaveMobileCollectionMembership(idle, 1)).toBe(true);
    expect(canSaveMobileCollectionMembership(idle, 0)).toBe(false);
    expect(canSaveMobileCollectionMembership(busy, 1)).toBe(false);
  });

  test("gates collection load-error retries while collection actions are busy", () => {
    const idle = {
      creating: false,
      renaming: false,
      savingMembership: false,
      removing: false,
    };
    const busy = { ...idle, savingMembership: true };

    expect(
      canRetryMobileCollectionMembershipLoadError({
        hasError: true,
        state: idle,
      }),
    ).toBe(true);
    expect(
      canRetryMobileCollectionMembershipLoadError({
        hasError: false,
        state: idle,
      }),
    ).toBe(false);
    expect(
      canRetryMobileCollectionMembershipLoadError({
        hasError: true,
        state: busy,
      }),
    ).toBe(false);
  });

  test("keys staged membership sessions by open target", () => {
    expect(
      getMobileCollectionSelectionSessionKey({
        visible: true,
        targetId: "favorites",
      }),
    ).toBe("target:favorites");
    expect(
      getMobileCollectionSelectionSessionKey({
        visible: true,
        targetId: "later",
      }),
    ).toBe("target:later");
    expect(
      getMobileCollectionSelectionSessionKey({
        visible: false,
        targetId: "favorites",
      }),
    ).toBe("target:favorites");
  });

  test("opens collection creation in place on library and collection routes", () => {
    const idle = {
      creating: false,
      renaming: false,
      savingMembership: false,
      removing: false,
    };
    const busy = { ...idle, creating: true };

    expect(
      resolveMobileCollectionCreatePressAction({
        state: idle,
        isCollectionRoute: false,
      })
    ).toEqual({
      action: "open-panel",
      preserveCurrentRoute: false,
    });
    expect(
      resolveMobileCollectionCreatePressAction({
        state: idle,
        isCollectionRoute: true,
      })
    ).toEqual({
      action: "open-panel",
      preserveCurrentRoute: true,
    });
    expect(
      resolveMobileCollectionCreatePressAction({
        state: busy,
        isCollectionRoute: true,
      })
    ).toEqual({ action: "ignore" });
  });

  test("selects collections that contain a library item", () => {
    const collections = [
      collection("favorites", 1),
      collection("later", 2),
      collection("empty", 3),
    ];
    const map = buildCollectionMembership([
      membership("favorites", "one"),
      membership("later", "two"),
      membership("later", "one"),
    ]);

    expect([...collectionSelectionForLibraryItem(collections, map, "one")]).toEqual([
      "favorites",
      "later",
    ]);
  });

  test("toggles collection selection without mutating the original set", () => {
    const selected = new Set(["favorites"]);
    const withLater = toggleCollectionSelection(selected, "later");
    const withoutFavorites = toggleCollectionSelection(withLater, "favorites");

    expect([...selected]).toEqual(["favorites"]);
    expect([...withLater]).toEqual(["favorites", "later"]);
    expect([...withoutFavorites]).toEqual(["later"]);
  });

  test("diffs staged collection membership and ignores removed collections", () => {
    const result = diffCollectionSelection(
      new Set(["favorites", "archived"]),
      new Set(["later", "archived"]),
      new Set(["favorites", "later"])
    );

    expect(result).toEqual({
      idsToAdd: ["later"],
      idsToRemove: ["favorites"],
    });
  });

  test("diffs staged library item membership and ignores removed library entries", () => {
    const result = diffLibraryItemSelection(
      new Set(["one", "deleted"]),
      new Set(["two", "deleted"]),
      new Set(["one", "two"])
    );

    expect(result).toEqual({
      idsToAdd: ["two"],
      idsToRemove: ["one"],
    });
  });
});
