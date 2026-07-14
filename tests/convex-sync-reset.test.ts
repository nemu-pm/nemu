import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { beginSyncReset } from "../convex/syncReset";

describe("Convex sync reset", () => {
  test("advances once and durably schedules cleanup of the hidden snapshot", async () => {
    const deleted: string[] = [];
    const patched: Array<{ id: string; value: Record<string, unknown> }> = [];
    const scheduled: Array<{
      delay: number;
      name: string;
      args: Record<string, unknown>;
    }> = [];
    const rows = [
      { _id: "current", generation: 3 },
      { _id: "duplicate", generation: 1 },
    ];
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({ collect: async () => rows }),
        }),
        delete: async (id: string) => {
          deleted.push(id);
        },
        patch: async (id: string, value: Record<string, unknown>) => {
          patched.push({ id, value });
        },
        insert: async () => {
          throw new Error("unexpected insert");
        },
      },
      scheduler: {
        runAfter: async (
          delay: number,
          fn: Parameters<typeof getFunctionName>[0],
          args: Record<string, unknown>,
        ) => {
          scheduled.push({ delay, name: getFunctionName(fn), args });
        },
      },
    } as never;

    await expect(beginSyncReset(ctx, "account-a", 3)).resolves.toEqual({
      generation: 4,
      cleanupToken: { table: "library_items" },
    });
    expect(deleted).toEqual(["duplicate"]);
    expect(patched).toHaveLength(1);
    expect(patched[0]).toMatchObject({
      id: "current",
      value: { generation: 4 },
    });
    expect(patched[0]?.value.updatedAt).toBeNumber();
    expect(scheduled).toEqual([
      {
        delay: 0,
        name: "sync:cleanupOldRows",
        args: {
          userId: "account-a",
          targetGeneration: 4,
          cleanupToken: { table: "library_items" },
        },
      },
    ]);
  });
});
