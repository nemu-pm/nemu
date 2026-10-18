import { describe, expect, spyOn, test } from "bun:test";
import type { SQLiteDatabase } from "expo-sqlite";
import type { LocalSourceSettings } from "./schema";
import {
  encodeMobileSourceSettingsVaultMarker,
  MobileSourceSettingsVaultEntryMissingError,
  type MobileSourceSettingsVault,
} from "./mobileSourceSettingsVault";
import { NativeUserDataStore } from "./nativeStore";

class MemorySourceSettingsVault implements MobileSourceSettingsVault {
  readonly values = new Map<string, LocalSourceSettings>();
  readonly removed: string[] = [];
  /** Thrown by every read, like a keychain locked before first unlock. */
  readError: Error | null = null;

  constructor(private readonly cleanupEvents?: string[]) {}

  async put(settings: LocalSourceSettings): Promise<string> {
    const ref = `secure.${settings.sourceKey.replaceAll(":", ".")}`;
    this.values.set(ref, structuredClone(settings));
    return ref;
  }

  async get(ref: string, expectedSourceKey: string): Promise<LocalSourceSettings> {
    if (this.readError) throw this.readError;
    const value = this.values.get(ref);
    if (!value) throw new MobileSourceSettingsVaultEntryMissingError();
    if (value.sourceKey !== expectedSourceKey) throw new Error("wrong source");
    return structuredClone(value);
  }

  async remove(ref: string): Promise<void> {
    this.removed.push(ref);
    this.values.delete(ref);
  }

  async clearAll(): Promise<void> {
    this.cleanupEvents?.push("vault");
    this.values.clear();
  }

  isValidRef(ref: string): boolean {
    return ref.startsWith("secure.");
  }
}

describe("NativeUserDataStore secure source settings", () => {
  test("persists an opaque SQLite marker and removes the secure value on reset", async () => {
    let sqliteJson: string | null = null;
    const db = {
      getFirstAsync: async () =>
        sqliteJson === null ? null : { json: sqliteJson },
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.startsWith("INSERT")) sqliteJson = String(args[2]);
        if (sql.startsWith("DELETE")) sqliteJson = null;
        return {} as never;
      },
    } as unknown as SQLiteDatabase;
    const vault = new MemorySourceSettingsVault();
    const store = new NativeUserDataStore(db, vault);
    const settings: LocalSourceSettings = {
      sourceKey: "registry:source",
      values: { password: "plaintext-must-not-enter-sqlite" },
      updatedAt: 10,
    };

    await store.saveSourceSettings(settings);
    expect(sqliteJson).not.toContain("plaintext-must-not-enter-sqlite");
    expect(await store.getSourceSettings(settings.sourceKey)).toEqual(settings);
    expect(vault.values.size).toBe(1);

    await store.resetSourceSettings(settings.sourceKey);
    expect(sqliteJson).toBeNull();
    expect(vault.values.size).toBe(0);
  });

  test("restores the prior secure settings when the SQLite marker write fails", async () => {
    let sqliteJson: string | null = null;
    let failMarkerWrite = false;
    const db = {
      getFirstAsync: async () =>
        sqliteJson === null ? null : { json: sqliteJson },
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.startsWith("INSERT")) {
          if (failMarkerWrite) throw new Error("sqlite marker write failed");
          sqliteJson = String(args[2]);
        }
        return {} as never;
      },
    } as unknown as SQLiteDatabase;
    const vault = new MemorySourceSettingsVault();
    const store = new NativeUserDataStore(db, vault);
    const previous: LocalSourceSettings = {
      sourceKey: "registry:source",
      values: { token: "old-secret" },
      updatedAt: 1,
    };
    await store.saveSourceSettings(previous);
    failMarkerWrite = true;

    await expect(
      store.saveSourceSettings({
        ...previous,
        values: { token: "new-secret" },
        updatedAt: 2,
      }),
    ).rejects.toThrow("sqlite marker write failed");

    expect(await store.getSourceSettings(previous.sourceKey)).toEqual(previous);
    expect([...vault.values.values()]).toEqual([previous]);
  });

  test("clears secure credentials before deleting account SQLite rows", async () => {
    const cleanupEvents: string[] = [];
    const db = {
      databasePath: "/private/profile-cleanup.db",
      withExclusiveTransactionAsync: async (
        operation: (txn: { execAsync: (sql: string) => Promise<void> }) =>
          Promise<void>,
      ) => {
        cleanupEvents.push("database");
        await operation({ execAsync: async () => undefined });
      },
    } as unknown as SQLiteDatabase;
    const vault = new MemorySourceSettingsVault(cleanupEvents);
    const store = new NativeUserDataStore(db, vault);

    await vault.put({
      sourceKey: "registry:source",
      values: { token: "credential" },
      updatedAt: 1,
    });
    await store.clearAccountData();

    expect(cleanupEvents).toEqual(["vault", "database"]);
    expect(vault.values.size).toBe(0);
  });
  test("drops a marker whose secure item is gone and reads the source as unset", async () => {
    const sourceKey = "aidoku-community:ja.rawfree";
    const danglingMarker = encodeMobileSourceSettingsVaultMarker(
      "secure.aidoku-community.ja.rawfree",
    );
    let sqliteJson: string | null = danglingMarker;
    const deletes: unknown[][] = [];
    const db = {
      getFirstAsync: async () =>
        sqliteJson === null ? null : { json: sqliteJson },
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.startsWith("INSERT")) sqliteJson = String(args[2]);
        if (sql.startsWith("DELETE")) {
          deletes.push(args);
          if (args[1] === undefined || args[1] === sqliteJson) sqliteJson = null;
        }
        return {} as never;
      },
    } as unknown as SQLiteDatabase;
    const vault = new MemorySourceSettingsVault();
    const store = new NativeUserDataStore(db, vault);
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await store.getSourceSettings(sourceKey)).toBeNull();
      expect(sqliteJson).toBeNull();
      expect(deletes).toEqual([[sourceKey, danglingMarker]]);
      expect(vault.removed).toEqual(["secure.aidoku-community.ja.rawfree"]);

      // The same dangling state again (another stale copy): still recovered,
      // but reported only once.
      sqliteJson = danglingMarker;
      expect(await store.getSourceSettings(sourceKey)).toBeNull();
      expect(sqliteJson).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(sourceKey);

      // Settings saved afterwards work normally.
      const settings: LocalSourceSettings = {
        sourceKey,
        values: { domain: "rawfree.me" },
        updatedAt: 3,
      };
      await store.saveSourceSettings(settings);
      expect(await store.getSourceSettings(sourceKey)).toEqual(settings);
    } finally {
      warn.mockRestore();
    }
  });

  test("keeps the marker when the keychain cannot be read", async () => {
    const sourceKey = "registry:locked";
    const db = {
      getFirstAsync: async () => ({ json: marker }),
      runAsync: async () => {
        throw new Error("a locked keychain must not delete anything");
      },
    } as unknown as SQLiteDatabase;
    const vault = new MemorySourceSettingsVault();
    const marker = encodeMobileSourceSettingsVaultMarker(
      await vault.put({ sourceKey, values: { token: "kept" }, updatedAt: 1 }),
    );
    const store = new NativeUserDataStore(db, vault);
    const locked = new Error("User interaction is not allowed.");
    vault.readError = locked;

    await expect(store.getSourceSettings(sourceKey)).rejects.toBe(locked);
    expect(vault.removed).toEqual([]);
    expect(vault.values.size).toBe(1);
  });

  test("saves over a dangling marker without trying to roll back to it", async () => {
    const sourceKey = "registry:replaced";
    let sqliteJson: string | null = encodeMobileSourceSettingsVaultMarker(
      "secure.registry.replaced",
    );
    const db = {
      getFirstAsync: async () =>
        sqliteJson === null ? null : { json: sqliteJson },
      runAsync: async (sql: string, ...args: unknown[]) => {
        if (sql.startsWith("INSERT")) sqliteJson = String(args[2]);
        return {} as never;
      },
    } as unknown as SQLiteDatabase;
    const vault = new MemorySourceSettingsVault();
    const store = new NativeUserDataStore(db, vault);
    const settings: LocalSourceSettings = {
      sourceKey,
      values: { token: "fresh" },
      updatedAt: 5,
    };

    await store.saveSourceSettings(settings);
    expect(await store.getSourceSettings(sourceKey)).toEqual(settings);
  });
});
