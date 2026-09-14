import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LocalMangaProgress } from "./schema";
import { WebUserDataStore } from "./webStore";
import {
  applyMangaProgressPatch,
  mangaProgressWriteCursor,
  mangaProgressWritesSince,
  recordMangaProgressBulkChange,
  recordMangaProgressWrite,
  resetMangaProgressChangeLog,
} from "./mangaProgressChangeLog";

afterEach(() => {
  resetMangaProgressChangeLog();
});

describe("manga progress change log", () => {
  test("reports only the rows written since a cursor", () => {
    const cursor = mangaProgressWriteCursor();
    recordMangaProgressWrite("manga-a");
    recordMangaProgressWrite("manga-b");
    recordMangaProgressWrite("manga-a");

    const delta = mangaProgressWritesSince(cursor);
    expect(delta?.ids.sort()).toEqual(["manga-a", "manga-b"]);
    // The returned cursor consumes exactly the reported writes.
    expect(mangaProgressWritesSince(delta!.cursor)).toEqual({
      cursor: delta!.cursor,
      ids: [],
    });
  });

  test("keeps a page turn from reporting unrelated rows", () => {
    recordMangaProgressWrite("manga-a");
    const cursor = mangaProgressWriteCursor();
    recordMangaProgressWrite("manga-b");

    expect(mangaProgressWritesSince(cursor)?.ids).toEqual(["manga-b"]);
  });

  test("falls back to a full read after a bulk change", () => {
    const cursor = mangaProgressWriteCursor();
    recordMangaProgressWrite("manga-a");
    recordMangaProgressBulkChange();

    expect(mangaProgressWritesSince(cursor)).toBeNull();
  });

  test("falls back to a full read once the window has evicted the cursor", () => {
    const cursor = mangaProgressWriteCursor();
    for (let index = 0; index < 400; index += 1) {
      recordMangaProgressWrite(`manga-${index}`);
    }

    expect(mangaProgressWritesSince(cursor)).toBeNull();
    // A cursor inside the retained window still resolves.
    const recent = mangaProgressWriteCursor();
    recordMangaProgressWrite("manga-latest");
    expect(mangaProgressWritesSince(recent)?.ids).toEqual(["manga-latest"]);
  });

  test("rejects cursors it cannot have issued", () => {
    recordMangaProgressWrite("manga-a");
    expect(mangaProgressWritesSince(mangaProgressWriteCursor() + 1)).toBeNull();
    expect(mangaProgressWritesSince(-1)).toBeNull();
    expect(mangaProgressWritesSince(Number.NaN)).toBeNull();
  });
});

function progress(id: string, lastReadAt: number): LocalMangaProgress {
  return {
    id,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: id,
    lastReadAt,
    updatedAt: lastReadAt,
  };
}

describe("manga progress patching", () => {
  test("replaces only the re-read row and keeps sibling identities", () => {
    const untouched = progress("manga-b", 20);
    const current = [progress("manga-a", 30), untouched];
    const updated = progress("manga-a", 40);

    const next = applyMangaProgressPatch(current, ["manga-a"], [updated]);

    expect(next).toEqual([updated, untouched]);
    expect(next[1]).toBe(untouched);
  });

  test("inserts a newly read manga in recency order", () => {
    const current = [progress("manga-a", 30)];

    expect(
      applyMangaProgressPatch(current, ["manga-b"], [progress("manga-b", 50)]),
    ).toEqual([progress("manga-b", 50), progress("manga-a", 30)]);
  });

  test("re-sorts when a patched row becomes the most recent", () => {
    const current = [progress("manga-a", 30), progress("manga-b", 20)];

    expect(
      applyMangaProgressPatch(
        current,
        ["manga-b"],
        [progress("manga-b", 90)],
      ).map((entry) => entry.id),
    ).toEqual(["manga-b", "manga-a"]);
  });

  test("drops rows that no longer exist", () => {
    const current = [progress("manga-a", 30), progress("manga-b", 20)];

    expect(
      applyMangaProgressPatch(current, ["manga-a"], [null]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["manga-b"]);
  });
});

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

describe("store writes feed the change log", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryLocalStorage(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("a persisted page turn names exactly the manga that moved", async () => {
    const store = new WebUserDataStore();
    await store.saveMangaProgress(progress("manga-a", 10));
    await store.saveMangaProgress(progress("manga-b", 20));
    const cursor = mangaProgressWriteCursor();

    await store.saveMangaProgress(progress("manga-a", 30));

    const delta = mangaProgressWritesSince(cursor);
    expect(delta?.ids).toEqual(["manga-a"]);
    // Reading only the named row is enough to stay current.
    expect(await store.getMangaProgressById("manga-a")).toMatchObject({
      lastReadAt: 30,
    });
  });

  test("wiping account data forces subscribers back to a full read", async () => {
    const store = new WebUserDataStore();
    await store.saveMangaProgress(progress("manga-a", 10));
    const cursor = mangaProgressWriteCursor();

    await store.clearAccountData();

    expect(mangaProgressWritesSince(cursor)).toBeNull();
  });
});
