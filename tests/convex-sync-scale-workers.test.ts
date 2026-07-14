import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import {
  retargetLibraryItem,
  retargetLibraryItemPage,
} from "../convex/history";
import { cascadeLibraryItemMemberships } from "../convex/library";

type RegisteredMutationHandler = (
  ctx: unknown,
  args: Record<string, unknown>,
) => Promise<null>;

function handlerOf(value: unknown): RegisteredMutationHandler {
  return (value as { _handler: RegisteredMutationHandler })._handler;
}

const retargetPage = handlerOf(retargetLibraryItemPage);
const startRetarget = handlerOf(retargetLibraryItem);
const cascadeMemberships = handlerOf(cascadeLibraryItemMemberships);

function activeRetargetLibraryRows(generation = 2) {
  const historyRetargetLock = {
    sourceLibraryItemId: "source-item",
    targetLibraryItemId: "target-item",
    updatedAt: 10,
  };
  return [
    {
      _id: "library-source",
      userId: "account-a",
      syncGeneration: generation,
      libraryItemId: "source-item",
      historyRetargetLock,
    },
    {
      _id: "library-target",
      userId: "account-a",
      syncGeneration: generation,
      libraryItemId: "target-item",
      historyRetargetLock,
    },
  ];
}

describe("Convex bounded sync workers", () => {
  test("treats an offline-only missing source or target as a safe no-op", async () => {
    for (const missing of ["source", "target"] as const) {
      let libraryQuery = 0;
      let scheduled = 0;
      const source = activeRetargetLibraryRows()[0];
      const target = activeRetargetLibraryRows()[1];
      const ctx = {
        auth: {
          getUserIdentity: async () => ({ subject: "account-a" }),
        },
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () => {
                if (table === "sync_generations") return [{ generation: 2 }];
                const rows = libraryQuery++ === 0 ? [source] : [target];
                return missing === "source" && rows[0] === source ||
                  missing === "target" && rows[0] === target
                  ? []
                  : rows;
              },
            }),
          }),
          patch: async () => {
            throw new Error("missing-item retarget must not patch");
          },
        },
        scheduler: {
          runAfter: async () => {
            scheduled += 1;
          },
        },
      };

      await expect(startRetarget(ctx, {
        expectedUserId: "account-a",
        sourceLibraryItemId: "source-item",
        targetLibraryItemId: "target-item",
        updatedAt: 10,
        generation: 2,
      })).resolves.toBeNull();
      expect(scheduled).toBe(0);
    }
  });

  test("retargets at most one history page and durably schedules the remainder", async () => {
    const rows = Array.from({ length: 129 }, (_, index) => ({
      _id: `chapter-${index}`,
      userId: "account-a",
      syncGeneration: 2,
      libraryItemId: "source-item",
      updatedAt: index === 0 ? 12 : 1,
    }));
    const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
    const scheduled: Array<{ name: string; args: Record<string, unknown> }> = [];
    const libraryRows = activeRetargetLibraryRows();
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () =>
              table === "sync_generations"
                ? [{ generation: 2 }]
                : table === "library_items"
                  ? libraryRows
                  : [],
            take: async (limit: number) => rows.slice(0, limit),
          }),
        }),
        patch: async (id: string, value: Record<string, unknown>) => {
          patches.push({ id, value });
        },
      },
      scheduler: {
        runAfter: async (
          _delay: number,
          fn: Parameters<typeof getFunctionName>[0],
          args: Record<string, unknown>,
        ) => {
          scheduled.push({ name: getFunctionName(fn), args });
        },
      },
    };

    await retargetPage(ctx, {
      userId: "account-a",
      generation: 2,
      sourceLibraryItemId: "source-item",
      targetLibraryItemId: "target-item",
      updatedAt: 10,
      phase: "chapter_progress",
    });

    expect(patches).toHaveLength(128);
    expect(patches[0]).toEqual({
      id: "chapter-0",
      value: { libraryItemId: "target-item", updatedAt: 12 },
    });
    expect(patches[1]).toEqual({
      id: "chapter-1",
      value: { libraryItemId: "target-item", updatedAt: 10 },
    });
    expect(scheduled).toEqual([
      {
        name: "history:retargetLibraryItemPage",
        args: {
          userId: "account-a",
          generation: 2,
          sourceLibraryItemId: "source-item",
          targetLibraryItemId: "target-item",
          updatedAt: 10,
          phase: "chapter_progress",
        },
      },
    ]);
  });

  test("aborts an old-generation history worker without touching hidden rows", async () => {
    let patches = 0;
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({ collect: async () => [{ generation: 3 }] }),
        }),
        patch: async () => {
          patches += 1;
        },
      },
    };

    await retargetPage(ctx, {
      userId: "account-a",
      generation: 2,
      sourceLibraryItemId: "source-item",
      targetLibraryItemId: "target-item",
      updatedAt: 10,
      phase: "chapter_progress",
    });
    expect(patches).toBe(0);
  });

  test("membership cascade preserves newer rows and compacts older duplicates", async () => {
    const pageRows = [
      {
        _id: "old",
        syncGeneration: 2,
        collectionId: "collection-old",
        libraryItemId: "item",
        updatedAt: 5,
      },
      {
        _id: "new",
        syncGeneration: 2,
        collectionId: "collection-new",
        libraryItemId: "item",
        updatedAt: 20,
      },
    ];
    const matches = [
      [pageRows[0], { ...pageRows[0], _id: "duplicate", updatedAt: 4 }],
      [pageRows[1]],
    ];
    let collectionQuery = 0;
    const patched: string[] = [];
    const deleted: string[] = [];
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () => {
              if (table === "sync_generations") return [{ generation: 2 }];
              return matches[collectionQuery++] ?? [];
            },
            paginate: async () => ({
              page: pageRows,
              isDone: true,
              continueCursor: "done",
            }),
          }),
        }),
        patch: async (id: string) => {
          patched.push(id);
        },
        delete: async (id: string) => {
          deleted.push(id);
        },
      },
      scheduler: { runAfter: async () => undefined },
    };

    await cascadeMemberships(ctx, {
      userId: "account-a",
      generation: 2,
      libraryItemId: "item",
      removedAt: 10,
    });

    expect(deleted).toEqual(["duplicate"]);
    expect(patched).toEqual(["old"]);
  });
});
