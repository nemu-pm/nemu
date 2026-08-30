import { describe, expect, test } from "bun:test";
import type { SQLiteDatabase } from "expo-sqlite";
import type { LocalSourceSettings } from "./schema";
import type { MobileSourceSettingsVault } from "./mobileSourceSettingsVault";
import { NativeUserDataStore } from "./nativeStore";

class MemorySourceSettingsVault implements MobileSourceSettingsVault {
  readonly values = new Map<string, LocalSourceSettings>();

  constructor(private readonly cleanupEvents?: string[]) {}

  async put(settings: LocalSourceSettings): Promise<string> {
    const ref = `secure.${settings.sourceKey.replaceAll(":", ".")}`;
    this.values.set(ref, structuredClone(settings));
    return ref;
  }

  async get(ref: string, expectedSourceKey: string): Promise<LocalSourceSettings> {
    const value = this.values.get(ref);
    if (!value || value.sourceKey !== expectedSourceKey) throw new Error("missing");
    return structuredClone(value);
  }

  async remove(ref: string): Promise<void> {
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
});
