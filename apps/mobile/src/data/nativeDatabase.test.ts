import { describe, expect, test } from "bun:test";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  isDeferredNativeDatabaseVacuumPending,
  migrateNativeDatabase,
  runDeferredNativeDatabaseVacuum,
} from "./nativeDatabase";
import {
  createMobileSourceSettingsVault,
  decodeMobileSourceSettingsVaultMarker,
} from "./mobileSourceSettingsVault";

describe("native database migrations", () => {
  test("migrates a v4 profile to the account-scoped sync health schema", async () => {
    const statements: string[] = [];
    const db = {
      getFirstAsync: async () => ({ user_version: 4 }),
      execAsync: async (sql: string) => {
        statements.push(sql);
      },
      getAllAsync: async () => [],
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);

    expect(statements.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS sync_health"))).toBe(
      true,
    );
    expect(statements.at(-1)).toContain("PRAGMA user_version = 6");
  });

  test("keeps secure deletion enabled for an existing v6 profile", async () => {
    let execs = 0;
    const db = {
      getFirstAsync: async () => ({ user_version: 6 }),
      execAsync: async () => {
        execs += 1;
      },
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);

    expect(execs).toBe(1);
  });

  test("moves legacy source credentials to SecureStore before scrubbing SQLite", async () => {
    const sourceKey = "registry:secure-source";
    const secret = "credential-that-must-leave-sqlite";
    const statements: string[] = [];
    let replacementJson: string | null = null;
    const db = {
      databasePath: "/private/native-migration-source-settings.db",
      getFirstAsync: async () => ({ user_version: 5 }),
      getAllAsync: async () => [
        {
          sourceKey,
          json: JSON.stringify({
            sourceKey,
            values: { accessToken: secret },
            updatedAt: 7,
          }),
        },
      ],
      execAsync: async (sql: string) => {
        statements.push(sql);
      },
      withExclusiveTransactionAsync: async (
        operation: (txn: { runAsync: (...args: unknown[]) => Promise<unknown> }) =>
          Promise<void>,
      ) => {
        await operation({
          runAsync: async (_sql: unknown, json: unknown) => {
            replacementJson = String(json);
            return {};
          },
        });
      },
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);

    expect(replacementJson).not.toContain(secret);
    const marker = decodeMobileSourceSettingsVaultMarker(replacementJson!);
    expect(marker).not.toBeNull();
    expect(
      await createMobileSourceSettingsVault(db.databasePath).get(
        marker!.ref,
        sourceKey,
      ),
    ).toEqual({
      sourceKey,
      values: { accessToken: secret },
      updatedAt: 7,
    });
    expect(statements).toContain("PRAGMA wal_checkpoint(TRUNCATE);");
    // The VACUUM rewrites the whole file, which would run behind the splash
    // screen. It is owed to an idle task instead, recorded durably so an
    // interrupted upgrade still retries it.
    expect(statements).not.toContain("VACUUM;");
    expect(statements).toContain("PRAGMA application_id = 1");
    expect(statements.at(-1)).toContain("PRAGMA user_version = 6");
    expect(isDeferredNativeDatabaseVacuumPending()).toBe(true);

    await runDeferredNativeDatabaseVacuum(db);
    expect(statements).toContain("VACUUM;");
    expect(statements).toContain("PRAGMA application_id = 0");
    expect(isDeferredNativeDatabaseVacuumPending()).toBe(false);
  });

  test("retries an interrupted plaintext vacuum on the next launch", async () => {
    const statements: string[] = [];
    const db = {
      getFirstAsync: async (sql: string) =>
        sql.includes("application_id")
          ? { application_id: 1 }
          : { user_version: 6 },
      execAsync: async (sql: string) => {
        statements.push(sql);
      },
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);

    // Already at the current schema version: nothing but the pragma runs, yet
    // the owed cleanup is still picked up.
    expect(statements).toEqual(["PRAGMA secure_delete = ON;"]);
    expect(isDeferredNativeDatabaseVacuumPending()).toBe(true);

    await runDeferredNativeDatabaseVacuum(db);
    expect(statements).toContain("VACUUM;");
    expect(isDeferredNativeDatabaseVacuumPending()).toBe(false);
  });

  test("keeps the vacuum owed when it fails", async () => {
    const db = {
      getFirstAsync: async (sql: string) =>
        sql.includes("application_id")
          ? { application_id: 1 }
          : { user_version: 6 },
      execAsync: async (sql: string) => {
        if (sql === "VACUUM;") throw new Error("disk full");
      },
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);
    await runDeferredNativeDatabaseVacuum(db);

    expect(isDeferredNativeDatabaseVacuumPending()).toBe(true);
  });
});
