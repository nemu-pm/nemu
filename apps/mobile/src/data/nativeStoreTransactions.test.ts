import { describe, expect, test } from "bun:test";
import type { SQLiteDatabase } from "expo-sqlite";
import type {
  InstalledSource,
  LocalChapterProgress,
  LocalMangaProgress,
  UserSettings,
} from "./schema";
import { NativeUserDataStore } from "./nativeStore";

type TransactionExecutor = Pick<
  SQLiteDatabase,
  "execAsync" | "getAllAsync" | "getFirstAsync" | "runAsync"
>;

describe("NativeUserDataStore transactions", () => {
  test("atomically composes concurrent scalar updates without rewriting source rows", async () => {
    let settings: UserSettings = { installedSources: [] };
    const tombstone: InstalledSource = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      version: 1,
      updatedAt: 2,
      removed: true,
    };
    let installedSourceWrites = 0;
    const txn = {
      execAsync: async () => undefined,
      getAllAsync: async (sql: string) =>
        sql.includes("installed_sources") ? [] : [],
      getFirstAsync: async (sql: string) =>
        sql.includes("settings") ? { json: JSON.stringify(settings) } : null,
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.includes("settings (id, json")) {
          settings = JSON.parse(String(args[1])) as UserSettings;
        }
        if (sql.includes("installed_sources")) installedSourceWrites += 1;
        return {} as never;
      },
    } as unknown as TransactionExecutor;
    const db = {
      withExclusiveTransactionAsync: async (
        task: (executor: TransactionExecutor) => Promise<void>,
      ) => task(txn),
    } as unknown as SQLiteDatabase;
    const store = new NativeUserDataStore(db);

    await Promise.all([
      store.updateSettings((current) => ({
        ...current,
        themePreference: "dark",
      })),
      store.updateSettings((current) => ({
        ...current,
        appLanguage: "ja",
      })),
    ]);
    await store.saveSettings({
      ...settings,
      installedSources: [{ ...tombstone, removed: false, updatedAt: 1 }],
      readingMode: "rtl",
    });

    expect(settings).toMatchObject({
      installedSources: [],
      themePreference: "dark",
      appLanguage: "ja",
      readingMode: "rtl",
    });
    expect(installedSourceWrites).toBe(0);
  });

  test("runs reset writes on the executor from an exclusive transaction", async () => {
    let exclusiveTransactions = 0;
    let legacyTransactions = 0;
    let transactionExecs = 0;
    let ownerExecs = 0;
    const txn = {
      execAsync: async () => {
        transactionExecs += 1;
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      runAsync: async () => ({}) as never,
    } as unknown as TransactionExecutor;
    const db = {
      withExclusiveTransactionAsync: async (
        task: (executor: TransactionExecutor) => Promise<void>,
      ) => {
        exclusiveTransactions += 1;
        await task(txn);
      },
      withTransactionAsync: async () => {
        legacyTransactions += 1;
        throw new Error("non-exclusive transaction used");
      },
      execAsync: async () => {
        ownerExecs += 1;
        throw new Error("transaction wrote through the owner connection");
      },
    } as unknown as SQLiteDatabase;

    await new NativeUserDataStore(db).clearAllUserData();

    expect(exclusiveTransactions).toBe(1);
    expect(legacyTransactions).toBe(0);
    expect(transactionExecs).toBe(1);
    expect(ownerExecs).toBe(0);
  });

  test("runs generation read and write on the exclusive transaction executor", async () => {
    let exclusiveTransactions = 0;
    let transactionReads = 0;
    let transactionWrites = 0;
    let ownerReads = 0;
    let ownerWrites = 0;
    const txn = {
      execAsync: async () => undefined,
      getAllAsync: async () => [],
      getFirstAsync: async () => {
        transactionReads += 1;
        return null;
      },
      runAsync: async () => {
        transactionWrites += 1;
        return {} as never;
      },
    } as unknown as TransactionExecutor;
    const db = {
      withExclusiveTransactionAsync: async (
        task: (executor: TransactionExecutor) => Promise<void>,
      ) => {
        exclusiveTransactions += 1;
        await task(txn);
      },
      withTransactionAsync: async () => {
        throw new Error("non-exclusive transaction used");
      },
      getFirstAsync: async () => {
        ownerReads += 1;
        throw new Error("transaction read through the owner connection");
      },
      runAsync: async () => {
        ownerWrites += 1;
        throw new Error("transaction wrote through the owner connection");
      },
    } as unknown as SQLiteDatabase;

    await expect(
      new NativeUserDataStore(db).applySyncGeneration(7),
    ).resolves.toBe("reset");

    expect(exclusiveTransactions).toBe(1);
    expect(transactionReads).toBe(2);
    expect(transactionWrites).toBe(1);
    expect(ownerReads).toBe(0);
    expect(ownerWrites).toBe(0);
  });

  test("orders snapshot health durably across wall-clock rollback and fences stale generations", async () => {
    let generation = 7;
    let healthRow: { json: string; updatedAt: number } | null = null;
    const getFirst = async (sql: string) => {
      if (sql.includes("sync_state")) return { generation };
      if (sql.includes("sync_health")) return healthRow;
      if (sql.includes("settings")) return null;
      return null;
    };
    const txn = {
      execAsync: async (sql: string) => {
        if (sql.includes("DELETE FROM sync_health")) healthRow = null;
      },
      getAllAsync: async () => [],
      getFirstAsync: getFirst,
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.includes("sync_health")) {
          healthRow = {
            json: String(args[1]),
            updatedAt: Number(args[2]),
          };
        } else if (sql.includes("sync_state")) {
          generation = Number(args[1]);
        }
        return {} as never;
      },
    } as unknown as TransactionExecutor;
    const db = {
      getFirstAsync: getFirst,
      withExclusiveTransactionAsync: async (
        task: (executor: TransactionExecutor) => Promise<void>,
      ) => task(txn),
    } as unknown as SQLiteDatabase;
    const store = new NativeUserDataStore(db);

    expect(
      await store.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 7,
        origin: "background",
        resourceKey: "chapterProgress",
        observedAt: Date.now() + 1_000_000,
      }),
    ).toBe(true);
    const blockedState = await store.getSyncSnapshotState();
    expect(blockedState).toMatchObject({
      status: "budget-exceeded",
      generation: 7,
    });
    if (!blockedState) throw new Error("Expected persisted sync health.");
    const futureClock = Date.now() + 1_000_000;
    healthRow = {
      json: JSON.stringify({ ...blockedState, observedAt: futureClock }),
      updatedAt: futureClock,
    };
    expect(
      await store.recordSyncSnapshotState({
        status: "healthy",
        generation: 7,
        origin: "foreground",
        observedAt: 1,
      }),
    ).toBe(true);
    const healthyState = await store.getSyncSnapshotState();
    expect(healthyState).toMatchObject({ status: "healthy" });
    expect(healthyState?.observedAt).toBeGreaterThan(futureClock);

    expect(await store.applySyncGeneration(8)).toBe("reset");
    expect(await store.getSyncSnapshotState()).toBeNull();
    expect(
      await store.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 7,
        origin: "background",
        observedAt: 300,
      }),
    ).toBe(false);
  });

  test("fails closed when the durable native snapshot gate is corrupt", async () => {
    const db = {
      getFirstAsync: async () => ({ json: JSON.stringify({}) }),
    } as unknown as SQLiteDatabase;

    await expect(
      new NativeUserDataStore(db).getSyncSnapshotState(),
    ).rejects.toThrow("Invalid mobile sync snapshot state");
  });

  test("reads one manga progress row with a primary-key select", async () => {
    const row: LocalMangaProgress = {
      id: "registry:source:manga",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      lastReadAt: 5,
      updatedAt: 5,
    };
    const statements: string[] = [];
    const db = {
      getAllAsync: async (sql: string) => {
        statements.push(sql);
        return [];
      },
      getFirstAsync: async (sql: string, ...args: unknown[]) => {
        statements.push(sql);
        return args[0] === row.id ? { json: JSON.stringify(row) } : null;
      },
    } as unknown as SQLiteDatabase;
    const store = new NativeUserDataStore(db);

    expect(await store.getMangaProgressById(row.id)).toEqual(row);
    expect(await store.getMangaProgressById("missing")).toBeNull();
    // A full-table scan would have to read every row back through getAllAsync.
    expect(statements.every((sql) => sql.includes("WHERE id = ?"))).toBe(true);
  });

  test("merges a saved manga progress row against the point lookup", async () => {
    const existing: LocalMangaProgress = {
      id: "registry:source:manga",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      lastReadAt: 10,
      updatedAt: 10,
    };
    let scans = 0;
    let saved: LocalMangaProgress | null = null;
    const db = {
      getAllAsync: async () => {
        scans += 1;
        return [];
      },
      getFirstAsync: async () => ({ json: JSON.stringify(existing) }),
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.includes("manga_progress")) {
          saved = JSON.parse(String(args[7])) as LocalMangaProgress;
        }
        return {} as never;
      },
    } as unknown as SQLiteDatabase;
    const store = new NativeUserDataStore(db);

    await store.saveMangaProgress({ ...existing, lastReadAt: 20, updatedAt: 20 });

    expect(saved).not.toBeNull();
    expect(saved!.lastReadAt).toBe(20);
    expect(scans).toBe(0);
  });

  test("does zero SQLite puts for unchanged 10k progress snapshots", async () => {
    const chapters: LocalChapterProgress[] = Array.from(
      { length: 10_000 },
      (_, index) => ({
        id: `registry:source:manga:chapter-${index}`,
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: "manga",
        sourceChapterId: `chapter-${index}`,
        progress: index % 20,
        total: 20,
        completed: index % 20 === 19,
        lastReadAt: index,
        updatedAt: index,
      }),
    );
    const manga: LocalMangaProgress[] = Array.from(
      { length: 10_000 },
      (_, index) => ({
        id: `registry:source:manga-${index}`,
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: `manga-${index}`,
        lastReadAt: index,
        updatedAt: index,
      }),
    );
    const chapterRows = chapters.map((entry) => ({
      json: JSON.stringify(entry),
    }));
    const mangaRows = manga.map((entry) => ({ json: JSON.stringify(entry) }));
    let sqlitePuts = 0;
    const txn = {
      execAsync: async () => undefined,
      getAllAsync: async (sql: string) =>
        sql.includes("chapter_progress") ? chapterRows : mangaRows,
      getFirstAsync: async () => null,
      runAsync: async () => {
        sqlitePuts += 1;
        return {} as never;
      },
    } as unknown as TransactionExecutor;
    const db = {
      withExclusiveTransactionAsync: async (
        task: (executor: TransactionExecutor) => Promise<void>,
      ) => task(txn),
    } as unknown as SQLiteDatabase;
    const store = new NativeUserDataStore(db);

    const chapterResult = await store.applyChapterProgressSnapshot(
      chapters.map((entry) => ({ ...entry })),
    );
    const mangaResult = await store.applyMangaProgressSnapshot(
      manga.map((entry) => ({ ...entry })),
    );

    expect(chapterResult.progress).toHaveLength(10_000);
    expect(chapterResult.changed).toHaveLength(0);
    expect(chapterResult.localWinners).toHaveLength(0);
    expect(mangaResult.progress).toHaveLength(10_000);
    expect(mangaResult.changed).toHaveLength(0);
    expect(mangaResult.localWinners).toHaveLength(0);
    expect(sqlitePuts).toBe(0);
  });
});

describe("NativeUserDataStore library counting", () => {
  test("counts in SQLite instead of scanning and parsing every row", async () => {
    const statements: string[] = [];
    const db = {
      getAllAsync: async (sql: string) => {
        statements.push(sql);
        return [];
      },
      getFirstAsync: async (sql: string) => {
        statements.push(sql);
        return { count: 7 };
      },
      runAsync: async () => ({}) as never,
      execAsync: async () => undefined,
    } as unknown as SQLiteDatabase;
    const store = new NativeUserDataStore(db);

    expect(await store.countLibraryEntries()).toBe(7);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("COUNT(*)");
    expect(statements[0]).toContain("inLibrary = 1");
    // No `SELECT json` means no per-row JSON.parse on the sync-progress path.
    expect(statements.some((sql) => sql.includes("SELECT json"))).toBe(false);
  });

  test("reports zero when the count row is missing", async () => {
    const db = {
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      runAsync: async () => ({}) as never,
      execAsync: async () => undefined,
    } as unknown as SQLiteDatabase;

    expect(await new NativeUserDataStore(db).countLibraryEntries()).toBe(0);
  });
});

describe("NativeUserDataStore source-link tombstones", () => {
  function recordingDb() {
    const statements: string[] = [];
    const db = {
      getAllAsync: async (sql: string) => {
        statements.push(sql);
        return [];
      },
      getFirstAsync: async () => null,
      runAsync: async () => ({}) as never,
      execAsync: async () => undefined,
    } as unknown as SQLiteDatabase;
    return { db, statements };
  }

  test("filters removal tombstones in SQL by default", async () => {
    const { db, statements } = recordingDb();

    await new NativeUserDataStore(db).getAllSourceLinks();

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("json_extract(json, '$.removed') IS NOT 1");
  });

  test("keeps tombstones available for sync merges", async () => {
    const { db, statements } = recordingDb();

    await new NativeUserDataStore(db).getAllSourceLinks({
      includeRemoved: true,
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toContain("json_extract");
  });

  test("library hydration never fetches tombstoned links", async () => {
    const { db, statements } = recordingDb();

    await new NativeUserDataStore(db).getLibraryEntries();

    const linkStatements = statements.filter((sql) =>
      sql.includes("source_links"),
    );
    expect(linkStatements).toHaveLength(1);
    expect(linkStatements[0]).toContain("json_extract(json, '$.removed')");
  });
});
