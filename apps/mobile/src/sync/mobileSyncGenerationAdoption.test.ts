import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { mergeLibrarySnapshot } from "@nemu/core";
import { WebUserDataStore } from "@/data/webStore";
import type {
  LocalChapterProgress,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";

// MobileSyncProvider reaches the native auth client at module scope, so the
// winner-push helpers are imported lazily behind the same react-native stub the
// other sync tests use.
mock.module("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  Platform: { OS: "ios" },
}));
mock.module("expo-constants", () => ({
  default: { expoConfig: { scheme: "nemu" }, platform: {} },
}));
mock.module("expo-linking", () => ({
  createURL: (path: string) => `nemu://${path}`,
}));

const { mobileSyncWinnerPushTestUtils } = await import("./MobileSyncProvider");

class MemoryLocalStorage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function item(id: string, updatedAt: number, title = id): LocalLibraryItem {
  return {
    libraryItemId: id,
    metadata: { title },
    inLibrary: true,
    createdAt: 1,
    updatedAt,
  };
}

function link(libraryItemId: string, updatedAt: number): LocalSourceLink {
  return {
    id: `registry:source:${libraryItemId}`,
    libraryItemId,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: libraryItemId,
    createdAt: 1,
    updatedAt,
  };
}

function chapterProgress(
  sourceMangaId: string,
  updatedAt: number,
): LocalChapterProgress {
  return {
    id: `registry:source:${sourceMangaId}:chapter-1`,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId,
    sourceChapterId: "chapter-1",
    progress: 4,
    total: 10,
    completed: false,
    lastReadAt: updatedAt,
    updatedAt,
  };
}

function mangaProgress(
  sourceMangaId: string,
  updatedAt: number,
): LocalMangaProgress {
  return {
    id: `registry:source:${sourceMangaId}`,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId,
    lastReadAt: updatedAt,
    updatedAt,
  };
}

/** Seed a store the way an anonymous (never signed-in) device looks: real
 * user content and no sync generation of any kind. */
async function seedAnonymousStore(): Promise<WebUserDataStore> {
  const store = new WebUserDataStore();
  await store.saveLibrarySnapshot(
    [item("local-only", 10), item("shared", 10, "local title")],
    [link("local-only", 10), link("shared", 10)],
  );
  await store.saveChapterProgressBatch([
    chapterProgress("local-only", 10),
    chapterProgress("shared", 10),
  ]);
  await store.saveMangaProgressBatch([
    mangaProgress("local-only", 10),
    mangaProgress("shared", 10),
  ]);
  await store.saveInstalledSource({
    id: "registry:source",
    registryId: "registry",
    version: 1,
    updatedAt: 10,
  });
  return store;
}

function recordingConvex(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): Pick<ConvexReactClient, "mutation"> {
  return {
    mutation: async (mutation: unknown, args: Record<string, unknown>) => {
      calls.push({ name: getFunctionName(mutation as never), args });
      return null;
    },
  } as unknown as Pick<ConvexReactClient, "mutation">;
}

describe("first sign-in adopts an anonymous library", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryLocalStorage(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("keeps never-synced local rows when an account's cloud generation arrives", async () => {
    const store = await seedAnonymousStore();
    expect(await store.getSyncGeneration()).toBeNull();

    // Signing into an account that already holds cloud data delivers a
    // non-zero generation, which decides as "reset".
    await expect(store.applySyncGeneration(4)).resolves.toBe("reset");

    expect(
      (await store.getAllLibraryItems({ includeRemoved: true })).map(
        (entry) => entry.libraryItemId,
      ),
    ).toEqual(["local-only", "shared"]);
    expect(await store.getAllSourceLinks({ includeRemoved: true })).toHaveLength(
      2,
    );
    expect(await store.getAllChapterProgress()).toHaveLength(2);
    expect(await store.getAllMangaProgress()).toHaveLength(2);
    expect(
      (await store.getSyncSettings()).installedSources.map((s) => s.id),
    ).toEqual(["registry:source"]);
    expect(await store.getSyncGeneration()).toBe(4);
  });

  test("pushes the adopted rows the cloud does not have and lets the cloud win conflicts", async () => {
    const store = await seedAnonymousStore();
    await store.applySyncGeneration(4);

    // The account's cloud copy knows "shared" (with a newer edit) and one item
    // the anonymous device has never seen.
    const cloudItems = [item("shared", 50, "cloud title"), item("cloud-only", 50)];
    const cloudLinks = [link("shared", 50), link("cloud-only", 50)];
    const merged = mergeLibrarySnapshot(
      await store.getAllLibraryItems({ includeRemoved: true }),
      await store.getAllSourceLinks({ includeRemoved: true }),
      cloudItems,
      cloudLinks,
    );
    await store.saveLibrarySnapshot(merged.items, merged.links);

    expect(
      merged.localItemsToPush.map((entry) => entry.libraryItemId),
    ).toEqual(["local-only"]);

    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    await mobileSyncWinnerPushTestUtils.pushLocalLibraryWinners(
      store,
      recordingConvex(calls),
      merged.localItemsToPush,
      merged.localLinksToPush,
      () => true,
      4,
      "account-a",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("library:save");
    expect(calls[0]?.args).toMatchObject({
      libraryItemId: "local-only",
      generation: 4,
      expectedUserId: "account-a",
    });

    const items = await store.getAllLibraryItems({ includeRemoved: true });
    const byId = new Map(items.map((entry) => [entry.libraryItemId, entry]));
    // Nothing was lost, and the newer cloud edit still wins the conflict.
    expect([...byId.keys()].sort()).toEqual([
      "cloud-only",
      "local-only",
      "shared",
    ]);
    expect(byId.get("shared")?.metadata.title).toBe("cloud title");
  });

  test("reports adopted progress rows as local winners to push", async () => {
    const store = await seedAnonymousStore();
    await store.applySyncGeneration(4);

    const chapterResult = await store.applyChapterProgressSnapshot([
      { ...chapterProgress("shared", 50), progress: 9 },
    ]);
    expect(
      chapterResult.localWinners.map((entry) => entry.sourceMangaId),
    ).toEqual(["local-only"]);

    const mangaResult = await store.applyMangaProgressSnapshot([
      mangaProgress("shared", 50),
    ]);
    expect(
      mangaResult.localWinners.map((entry) => entry.sourceMangaId),
    ).toEqual(["local-only"]);
  });

  test("still discards local rows for a genuine remote reset", async () => {
    const store = await seedAnonymousStore();
    // The device has already synced generation 4 …
    await store.applySyncGeneration(4);
    // … and the account's cloud data is then reset to generation 5.
    await expect(store.applySyncGeneration(5)).resolves.toBe("reset");

    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getAllMangaProgress()).toEqual([]);
    expect((await store.getSyncSettings()).installedSources).toEqual([]);
  });
});
