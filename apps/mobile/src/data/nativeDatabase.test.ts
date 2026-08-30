import { describe, expect, test } from "bun:test";
import type { SQLiteDatabase } from "expo-sqlite";
import { migrateNativeDatabase } from "./nativeDatabase";
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
    expect(statements).toContain("VACUUM;");
    expect(statements.at(-1)).toContain("PRAGMA user_version = 6");
  });
});
