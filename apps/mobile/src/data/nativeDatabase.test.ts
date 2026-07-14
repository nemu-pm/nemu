import { describe, expect, test } from "bun:test";
import type { SQLiteDatabase } from "expo-sqlite";
import { migrateNativeDatabase } from "./nativeDatabase";

describe("native database migrations", () => {
  test("migrates a v4 profile to the account-scoped sync health schema", async () => {
    const statements: string[] = [];
    const db = {
      getFirstAsync: async () => ({ user_version: 4 }),
      execAsync: async (sql: string) => {
        statements.push(sql);
      },
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);

    expect(statements.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS sync_health"))).toBe(
      true,
    );
    expect(statements.at(-1)).toContain("PRAGMA user_version = 5");
  });

  test("does no migration work for an existing v5 profile", async () => {
    let execs = 0;
    const db = {
      getFirstAsync: async () => ({ user_version: 5 }),
      execAsync: async () => {
        execs += 1;
      },
    } as unknown as SQLiteDatabase;

    await migrateNativeDatabase(db);

    expect(execs).toBe(0);
  });
});
