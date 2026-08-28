import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import {
  HISTORY_RETARGET_LEASE_MS,
  HISTORY_RETARGET_MAX_RECOVERY_ATTEMPTS,
  recoverRetargetLibraryItem,
  retargetLibraryItem,
  retargetLibraryItemPage,
} from "../convex/history";
import {
  cascadeLibraryItemMemberships,
  LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS,
  LIBRARY_MEMBERSHIP_CASCADE_MAX_RECOVERY_ATTEMPTS,
  recoverLibraryItemMembershipCascade,
  remove as removeLibraryItem,
} from "../convex/library";
import {
  cascadeRemovedItems,
  COLLECTION_CASCADE_LEASE_MS,
  recoverRemovedItemsCascade,
  remove as removeCollection,
} from "../convex/collections";

type RegisteredMutationHandler = (
  ctx: unknown,
  args: Record<string, unknown>,
) => Promise<unknown>;

function handlerOf(value: unknown): RegisteredMutationHandler {
  return (value as { _handler: RegisteredMutationHandler })._handler;
}

const retargetPage = handlerOf(retargetLibraryItemPage);
const recoverRetarget = handlerOf(recoverRetargetLibraryItem);
const startRetarget = handlerOf(retargetLibraryItem);
const cascadeMemberships = handlerOf(cascadeLibraryItemMemberships);
const recoverMemberships = handlerOf(recoverLibraryItemMembershipCascade);
const removeLibrary = handlerOf(removeLibraryItem);
const cascadeCollectionItems = handlerOf(cascadeRemovedItems);
const recoverCollectionItems = handlerOf(recoverRemovedItemsCascade);
const removeCollectionHandler = handlerOf(removeCollection);

function activeRemovalCascade(
  operationId = "operation-a",
  overrides: Record<string, unknown> = {},
) {
  return {
    removedAt: 10,
    operationId,
    operationVersion: 1,
    status: "active",
    leaseExpiresAt: Date.now() + LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS,
    recoveryAttempts: 0,
    ...overrides,
  };
}

function activeRetargetLibraryRows(
  generation = 2,
  lockOverrides: Record<string, unknown> = {},
) {
  const historyRetargetLock = {
    sourceLibraryItemId: "source-item",
    targetLibraryItemId: "target-item",
    updatedAt: 10,
    ...lockOverrides,
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
    const libraryRows = activeRetargetLibraryRows(2, {
      operationId: "operation-a",
      leaseExpiresAt: Date.now() + HISTORY_RETARGET_LEASE_MS,
      recoveryAttempts: 0,
    });
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
      operationId: "operation-a",
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
          operationId: "operation-a",
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

  test("fences a stale page worker after a newer operation takes over", async () => {
    let libraryQuery = 0;
    let patches = 0;
    let scheduled = 0;
    const [source, target] = activeRetargetLibraryRows(2, {
      operationId: "operation-new",
      leaseExpiresAt: Date.now() + HISTORY_RETARGET_LEASE_MS,
      recoveryAttempts: 0,
    });
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () => {
              if (table === "sync_generations") return [{ generation: 2 }];
              if (table === "library_items") {
                return libraryQuery++ === 0 ? [source] : [target];
              }
              throw new Error("stale worker must not query history rows");
            },
            take: async () => {
              throw new Error("stale worker must not query history rows");
            },
          }),
        }),
        patch: async () => {
          patches += 1;
        },
      },
      scheduler: {
        runAfter: async () => {
          scheduled += 1;
        },
      },
    };

    await retargetPage(ctx, {
      userId: "account-a",
      generation: 2,
      sourceLibraryItemId: "source-item",
      targetLibraryItemId: "target-item",
      updatedAt: 10,
      operationId: "operation-old",
      phase: "chapter_progress",
    });

    expect(patches).toBe(0);
    expect(scheduled).toBe(0);
  });

  test("takes over an expired retarget lease with a distinct operation id", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      let libraryQuery = 0;
      const [source, target] = activeRetargetLibraryRows(2, {
        operationId: "operation-old",
        leaseExpiresAt: 999,
        recoveryAttempts: 3,
      });
      const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
      const scheduled: Array<{
        delay: number;
        name: string;
        args: Record<string, unknown>;
      }> = [];
      const ctx = {
        auth: {
          getUserIdentity: async () => ({ subject: "account-a" }),
        },
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () => {
                if (table === "sync_generations") return [{ generation: 2 }];
                return libraryQuery++ === 0 ? [source] : [target];
              },
            }),
          }),
          patch: async (id: string, value: Record<string, unknown>) => {
            patches.push({ id, value });
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
      };

      await startRetarget(ctx, {
        expectedUserId: "account-a",
        sourceLibraryItemId: "source-item",
        targetLibraryItemId: "target-item",
        updatedAt: 10,
        generation: 2,
      });

      expect(patches).toHaveLength(2);
      const lock = patches[0]?.value.historyRetargetLock as Record<
        string,
        unknown
      >;
      expect(lock.operationId).not.toBe("operation-old");
      expect(lock.leaseExpiresAt).toBe(1_000 + HISTORY_RETARGET_LEASE_MS);
      expect(lock.recoveryAttempts).toBe(0);
      expect(patches[1]?.value.historyRetargetLock).toEqual(lock);
      expect(scheduled.map(({ delay, name }) => ({ delay, name }))).toEqual([
        { delay: 0, name: "history:retargetLibraryItemPage" },
        {
          delay: HISTORY_RETARGET_LEASE_MS,
          name: "history:recoverRetargetLibraryItem",
        },
      ]);
      expect(scheduled[0]?.args.operationId).toBe(lock.operationId);
      expect(scheduled[1]?.args.operationId).toBe(lock.operationId);
    } finally {
      Date.now = originalNow;
    }
  });

  test("watchdog renews an expired lease and restarts from an idempotent page", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      let libraryQuery = 0;
      const [source, target] = activeRetargetLibraryRows(2, {
        operationId: "operation-a",
        leaseExpiresAt: 999,
        recoveryAttempts: 1,
      });
      const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
      const scheduled: Array<{ delay: number; name: string }> = [];
      const ctx = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () => {
                if (table === "sync_generations") return [{ generation: 2 }];
                return libraryQuery++ === 0 ? [source] : [target];
              },
            }),
          }),
          patch: async (id: string, value: Record<string, unknown>) => {
            patches.push({ id, value });
          },
        },
        scheduler: {
          runAfter: async (
            delay: number,
            fn: Parameters<typeof getFunctionName>[0],
          ) => {
            scheduled.push({ delay, name: getFunctionName(fn) });
          },
        },
      };

      await recoverRetarget(ctx, {
        userId: "account-a",
        generation: 2,
        sourceLibraryItemId: "source-item",
        targetLibraryItemId: "target-item",
        updatedAt: 10,
        operationId: "operation-a",
      });

      expect(patches).toHaveLength(2);
      for (const patch of patches) {
        expect(patch.value.historyRetargetLock).toMatchObject({
          operationId: "operation-a",
          leaseExpiresAt: 1_000 + HISTORY_RETARGET_LEASE_MS,
          recoveryAttempts: 2,
        });
      }
      expect(scheduled).toEqual([
        { delay: 0, name: "history:retargetLibraryItemPage" },
        {
          delay: HISTORY_RETARGET_LEASE_MS,
          name: "history:recoverRetargetLibraryItem",
        },
      ]);
    } finally {
      Date.now = originalNow;
    }
  });

  test("watchdog releases its locks after bounded recovery attempts", async () => {
    const originalNow = Date.now;
    const originalError = console.error;
    Date.now = () => 1_000;
    console.error = () => undefined;
    try {
      let libraryQuery = 0;
      const [source, target] = activeRetargetLibraryRows(2, {
        operationId: "operation-a",
        leaseExpiresAt: 999,
        recoveryAttempts: HISTORY_RETARGET_MAX_RECOVERY_ATTEMPTS,
      });
      const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
      let scheduled = 0;
      const ctx = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () => {
                if (table === "sync_generations") return [{ generation: 2 }];
                return libraryQuery++ === 0 ? [source] : [target];
              },
            }),
          }),
          patch: async (id: string, value: Record<string, unknown>) => {
            patches.push({ id, value });
          },
        },
        scheduler: {
          runAfter: async () => {
            scheduled += 1;
          },
        },
      };

      await recoverRetarget(ctx, {
        userId: "account-a",
        generation: 2,
        sourceLibraryItemId: "source-item",
        targetLibraryItemId: "target-item",
        updatedAt: 10,
        operationId: "operation-a",
      });

      expect(patches).toEqual([
        { id: "library-source", value: { historyRetargetLock: undefined } },
        { id: "library-target", value: { historyRetargetLock: undefined } },
      ]);
      expect(scheduled).toBe(0);
    } finally {
      Date.now = originalNow;
      console.error = originalError;
    }
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
    const patched: Array<{ id: string; value: Record<string, unknown> }> = [];
    const deleted: string[] = [];
    const libraryItem = {
      _id: "library-parent",
      userId: "account-a",
      syncGeneration: 2,
      libraryItemId: "item",
      inLibrary: false,
      updatedAt: 10,
      lastRemovedAt: 10,
      membershipRemovalCascade: activeRemovalCascade(),
    };
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () => {
              if (table === "sync_generations") return [{ generation: 2 }];
              if (table === "library_items") return [libraryItem];
              return matches[collectionQuery++] ?? [];
            },
            paginate: async () => ({
              page: pageRows,
              isDone: true,
              continueCursor: "done",
            }),
          }),
        }),
        patch: async (id: string, value: Record<string, unknown>) => {
          patched.push({ id, value });
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
      operationId: "operation-a",
    });

    expect(deleted).toEqual(["duplicate"]);
    expect(patched[0]).toEqual({
      id: "old",
      value: { removed: true, updatedAt: 10 },
    });
    expect(patched[1]).toMatchObject({
      id: "library-parent",
      value: {
        membershipRemovalCascade: {
          operationId: "operation-a",
          status: "completed",
        },
      },
    });
  });

  test("merge removal transfers cloud-only memberships before tombstoning the source", async () => {
    const sourceMembership = {
      _id: "source-membership",
      userId: "account-a",
      syncGeneration: 2,
      collectionId: "cloud-only",
      libraryItemId: "source-item",
      addedAt: 4,
      updatedAt: 20,
      removed: false,
    };
    const sourceItem = {
      _id: "library-source",
      userId: "account-a",
      syncGeneration: 2,
      libraryItemId: "source-item",
      inLibrary: false,
      updatedAt: 10,
      lastRemovedAt: 10,
      membershipRemovalCascade: activeRemovalCascade("operation-a", {
        mergeTargetLibraryItemId: "target-item",
      }),
    };
    const targetItem = {
      _id: "library-target",
      userId: "account-a",
      syncGeneration: 2,
      libraryItemId: "target-item",
      inLibrary: true,
      updatedAt: 12,
    };
    const collection = {
      _id: "collection",
      userId: "account-a",
      syncGeneration: 2,
      collectionId: "cloud-only",
      name: "Cloud only",
      createdAt: 1,
      updatedAt: 15,
      removed: false,
    };
    let libraryQuery = 0;
    let membershipQuery = 0;
    const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; value: Record<string, unknown> }> = [];
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () => {
              if (table === "sync_generations") return [{ generation: 2 }];
              if (table === "library_items") {
                return libraryQuery++ === 0 ? [sourceItem] : [targetItem];
              }
              if (table === "collections") return [collection];
              if (table === "collection_items") {
                return membershipQuery++ === 0 ? [sourceMembership] : [];
              }
              return [];
            },
            paginate: async () => ({
              page: [sourceMembership],
              isDone: true,
              continueCursor: "done",
            }),
          }),
        }),
        patch: async (id: string, value: Record<string, unknown>) => {
          patches.push({ id, value });
        },
        insert: async (table: string, value: Record<string, unknown>) => {
          inserts.push({ table, value });
        },
        delete: async () => undefined,
      },
      scheduler: { runAfter: async () => undefined },
    };

    await cascadeMemberships(ctx, {
      userId: "account-a",
      generation: 2,
      libraryItemId: "source-item",
      mergeTargetLibraryItemId: "target-item",
      removedAt: 10,
      operationId: "operation-a",
    });

    expect(inserts).toEqual([
      {
        table: "collection_items",
        value: {
          userId: "account-a",
          syncGeneration: 2,
          collectionId: "cloud-only",
          libraryItemId: "target-item",
          addedAt: 4,
          updatedAt: 20,
          removed: false,
        },
      },
    ]);
    expect(patches[0]).toEqual({
      id: "source-membership",
      value: { removed: true, updatedAt: 20 },
    });
    expect(patches.at(-1)).toMatchObject({
      id: "library-source",
      value: {
        membershipRemovalCascade: {
          operationId: "operation-a",
          status: "completed",
        },
      },
    });
  });

  test("merge removal refuses to delete when the survivor is missing", async () => {
    let writes = 0;
    const ctx = {
      auth: {
        getUserIdentity: async () => ({ subject: "account-a" }),
      },
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () =>
              table === "sync_generations" ? [{ generation: 2 }] : [],
          }),
        }),
        patch: async () => {
          writes += 1;
        },
        insert: async () => {
          writes += 1;
        },
        delete: async () => {
          writes += 1;
        },
      },
      scheduler: {
        runAfter: async () => {
          writes += 1;
        },
      },
    };

    await expect(
      removeLibrary(ctx, {
        expectedUserId: "account-a",
        generation: 2,
        libraryItemId: "source-item",
        mergeTargetLibraryItemId: "target-item",
        updatedAt: 10,
      }),
    ).rejects.toThrow("merge target is missing or removed");
    expect(writes).toBe(0);
  });

  test("merge cascade operation ownership includes the exact survivor", async () => {
    let childQueries = 0;
    let writes = 0;
    const sourceItem = {
      _id: "library-source",
      userId: "account-a",
      syncGeneration: 2,
      libraryItemId: "source-item",
      inLibrary: false,
      updatedAt: 10,
      lastRemovedAt: 10,
      membershipRemovalCascade: activeRemovalCascade("operation-a", {
        mergeTargetLibraryItemId: "target-a",
      }),
    };
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            collect: async () => {
              if (table === "sync_generations") return [{ generation: 2 }];
              if (table === "library_items") return [sourceItem];
              childQueries += 1;
              return [];
            },
            paginate: async () => {
              childQueries += 1;
              return { page: [], isDone: true, continueCursor: "done" };
            },
          }),
        }),
        patch: async () => {
          writes += 1;
        },
      },
      scheduler: {
        runAfter: async () => {
          writes += 1;
        },
      },
    };

    await cascadeMemberships(ctx, {
      userId: "account-a",
      generation: 2,
      libraryItemId: "source-item",
      mergeTargetLibraryItemId: "target-b",
      removedAt: 10,
      operationId: "operation-a",
    });

    expect(childQueries).toBe(0);
    expect(writes).toBe(0);
  });

  test("fences stale library and collection cascade workers", async () => {
    for (const kind of ["library", "collection"] as const) {
      let childQueries = 0;
      let patches = 0;
      let scheduled = 0;
      const parent = {
        _id: `${kind}-parent`,
        userId: "account-a",
        syncGeneration: 2,
        libraryItemId: "item",
        collectionId: "collection",
        inLibrary: false,
        removed: true,
        updatedAt: 10,
        lastRemovedAt: 10,
        membershipRemovalCascade: activeRemovalCascade("operation-new"),
      };
      const ctx = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () => {
                if (table === "sync_generations") return [{ generation: 2 }];
                if (table === "library_items" || table === "collections") {
                  return [parent];
                }
                childQueries += 1;
                return [];
              },
              paginate: async () => {
                childQueries += 1;
                return { page: [], isDone: true, continueCursor: "done" };
              },
            }),
          }),
          patch: async () => {
            patches += 1;
          },
        },
        scheduler: {
          runAfter: async () => {
            scheduled += 1;
          },
        },
      };

      if (kind === "library") {
        await cascadeMemberships(ctx, {
          userId: "account-a",
          generation: 2,
          libraryItemId: "item",
          removedAt: 10,
          operationId: "operation-old",
        });
      } else {
        await cascadeCollectionItems(ctx, {
          userId: "account-a",
          collectionId: "collection",
          generation: 2,
          updatedAt: 10,
          operationId: "operation-old",
        });
      }

      expect(childQueries).toBe(0);
      expect(patches).toBe(0);
      expect(scheduled).toBe(0);
    }
  });

  test("adopts a pre-lease library continuation into a fresh durable operation", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      const parent = {
        _id: "library-parent",
        userId: "account-a",
        syncGeneration: 2,
        libraryItemId: "item",
        inLibrary: false,
        updatedAt: 10,
        lastRemovedAt: 10,
      };
      const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
      const scheduled: Array<{
        delay: number;
        name: string;
        args: Record<string, unknown>;
      }> = [];
      const ctx = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () =>
                table === "sync_generations" ? [{ generation: 2 }] : [parent],
              paginate: async () => {
                throw new Error("legacy adoption must restart from page zero");
              },
            }),
          }),
          patch: async (id: string, value: Record<string, unknown>) => {
            patches.push({ id, value });
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
      };

      await cascadeMemberships(ctx, {
        userId: "account-a",
        generation: 2,
        libraryItemId: "item",
        removedAt: 10,
      });

      const lock = patches[0]?.value.membershipRemovalCascade as Record<
        string,
        unknown
      >;
      expect(lock).toMatchObject({
        removedAt: 10,
        status: "active",
        recoveryAttempts: 0,
        leaseExpiresAt: 1_000 + LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS,
      });
      expect(scheduled.map(({ delay, name }) => ({ delay, name }))).toEqual([
        { delay: 0, name: "library:cascadeLibraryItemMemberships" },
        {
          delay: LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS,
          name: "library:recoverLibraryItemMembershipCascade",
        },
      ]);
      expect(scheduled[0]?.args.operationId).toBe(lock.operationId);
      expect(scheduled[1]?.args.operationId).toBe(lock.operationId);
    } finally {
      Date.now = originalNow;
    }
  });

  test("idempotent remove reuses one live operation and takes over an expired lease distinctly", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      for (const expired of [false, true]) {
        const existingLock = activeRemovalCascade("operation-old", {
          leaseExpiresAt: expired ? 999 : 2_000,
          recoveryAttempts: expired ? 2 : 0,
        });
        const parent = {
          _id: "library-parent",
          userId: "account-a",
          syncGeneration: 2,
          libraryItemId: "item",
          inLibrary: false,
          updatedAt: 10,
          lastRemovedAt: 10,
          membershipRemovalCascade: existingLock,
        };
        const patches: Array<Record<string, unknown>> = [];
        const scheduled: Array<Record<string, unknown>> = [];
        const ctx = {
          auth: {
            getUserIdentity: async () => ({ subject: "account-a" }),
          },
          db: {
            query: (table: string) => ({
              withIndex: () => ({
                collect: async () =>
                  table === "sync_generations" ? [{ generation: 2 }] : [parent],
              }),
            }),
            patch: async (_id: string, value: Record<string, unknown>) => {
              patches.push(value);
            },
            delete: async () => undefined,
          },
          scheduler: {
            runAfter: async (
              _delay: number,
              _fn: Parameters<typeof getFunctionName>[0],
              args: Record<string, unknown>,
            ) => {
              scheduled.push(args);
            },
          },
        };

        await removeLibrary(ctx, {
          expectedUserId: "account-a",
          generation: 2,
          libraryItemId: "item",
          updatedAt: 10,
        });

        const scheduledOperationIds = new Set(
          scheduled.map((args) => args.operationId),
        );
        expect(scheduled).toHaveLength(2);
        expect(scheduledOperationIds.size).toBe(1);
        if (expired) {
          const replacement = patches[0]
            ?.membershipRemovalCascade as Record<string, unknown>;
          expect(replacement.operationId).not.toBe("operation-old");
          expect(replacement.operationVersion).toBe(2);
          expect(replacement.recoveryAttempts).toBe(0);
          expect(scheduledOperationIds).toEqual(
            new Set([replacement.operationId]),
          );
        } else {
          expect(patches).toHaveLength(0);
          expect(scheduledOperationIds).toEqual(new Set(["operation-old"]));
        }
      }
    } finally {
      Date.now = originalNow;
    }
  });

  test("idempotent collection removal reuses a live operation and skips completed work", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      for (const completed of [false, true]) {
        const membershipRemovalCascade = activeRemovalCascade("operation-a",
          completed
            ? { status: "completed", finishedAt: 900 }
            : { leaseExpiresAt: 2_000 },
        );
        const parent = {
          _id: "collection-parent",
          userId: "account-a",
          syncGeneration: 2,
          collectionId: "collection",
          name: "Reading",
          removed: true,
          createdAt: 1,
          updatedAt: 10,
          lastRemovedAt: 10,
          membershipRemovalCascade,
        };
        const patches: Array<Record<string, unknown>> = [];
        const scheduled: Array<Record<string, unknown>> = [];
        const ctx = {
          auth: {
            getUserIdentity: async () => ({ subject: "account-a" }),
          },
          db: {
            query: (table: string) => ({
              withIndex: () => ({
                collect: async () =>
                  table === "sync_generations" ? [{ generation: 2 }] : [parent],
              }),
            }),
            patch: async (_id: string, value: Record<string, unknown>) => {
              patches.push(value);
            },
            delete: async () => undefined,
          },
          scheduler: {
            runAfter: async (
              _delay: number,
              _fn: Parameters<typeof getFunctionName>[0],
              args: Record<string, unknown>,
            ) => {
              scheduled.push(args);
            },
          },
        };

        await removeCollectionHandler(ctx, {
          expectedUserId: "account-a",
          generation: 2,
          collectionId: "collection",
          updatedAt: 10,
        });

        expect(patches).toHaveLength(0);
        if (completed) {
          expect(scheduled).toHaveLength(0);
        } else {
          expect(scheduled).toHaveLength(2);
          expect(new Set(scheduled.map((args) => args.operationId))).toEqual(
            new Set(["operation-a"]),
          );
        }
      }
    } finally {
      Date.now = originalNow;
    }
  });

  test("library watchdog restarts expired work and terminally fences exhaustion", async () => {
    const originalNow = Date.now;
    const originalError = console.error;
    Date.now = () => 1_000;
    console.error = () => undefined;
    try {
      for (const exhausted of [false, true]) {
        const parent = {
          _id: "library-parent",
          userId: "account-a",
          syncGeneration: 2,
          libraryItemId: "item",
          inLibrary: false,
          updatedAt: 10,
          lastRemovedAt: 10,
          membershipRemovalCascade: activeRemovalCascade("operation-a", {
            leaseExpiresAt: 999,
            recoveryAttempts: exhausted
              ? LIBRARY_MEMBERSHIP_CASCADE_MAX_RECOVERY_ATTEMPTS
              : 1,
          }),
        };
        const patches: Array<Record<string, unknown>> = [];
        const scheduled: Array<{ delay: number; name: string }> = [];
        const ctx = {
          db: {
            query: (table: string) => ({
              withIndex: () => ({
                collect: async () =>
                  table === "sync_generations" ? [{ generation: 2 }] : [parent],
              }),
            }),
            patch: async (_id: string, value: Record<string, unknown>) => {
              patches.push(value);
            },
          },
          scheduler: {
            runAfter: async (
              delay: number,
              fn: Parameters<typeof getFunctionName>[0],
            ) => {
              scheduled.push({ delay, name: getFunctionName(fn) });
            },
          },
        };

        await recoverMemberships(ctx, {
          userId: "account-a",
          generation: 2,
          libraryItemId: "item",
          removedAt: 10,
          operationId: "operation-a",
        });

        const lock = patches[0]?.membershipRemovalCascade as Record<
          string,
          unknown
        >;
        if (exhausted) {
          expect(lock).toMatchObject({
            operationId: "operation-a",
            status: "exhausted",
            recoveryAttempts:
              LIBRARY_MEMBERSHIP_CASCADE_MAX_RECOVERY_ATTEMPTS + 1,
            finishedAt: 1_000,
          });
          expect(lock.leaseExpiresAt).toBeUndefined();
          expect(scheduled).toHaveLength(0);
        } else {
          expect(lock).toMatchObject({
            operationId: "operation-a",
            status: "active",
            recoveryAttempts: 2,
            leaseExpiresAt: 1_000 + LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS,
          });
          expect(scheduled).toEqual([
            { delay: 0, name: "library:cascadeLibraryItemMemberships" },
            {
              delay: LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS,
              name: "library:recoverLibraryItemMembershipCascade",
            },
          ]);
        }
      }
    } finally {
      Date.now = originalNow;
      console.error = originalError;
    }
  });

  test("collection cascade is generation-fenced, completes, and recovers by operation id", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      let membershipReads = 0;
      const parent = {
        _id: "collection-parent",
        userId: "account-a",
        syncGeneration: 2,
        collectionId: "collection",
        removed: true,
        updatedAt: 10,
        lastRemovedAt: 10,
        membershipRemovalCascade: activeRemovalCascade("operation-a"),
      };
      const member = {
        _id: "membership",
        userId: "account-a",
        syncGeneration: 2,
        collectionId: "collection",
        libraryItemId: "item",
        updatedAt: 5,
      };
      const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
      const ctx = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () => {
                if (table === "sync_generations") return [{ generation: 2 }];
                if (table === "collections") return [parent];
                membershipReads += 1;
                return [member];
              },
              paginate: async () => ({
                page: [member],
                isDone: true,
                continueCursor: "done",
              }),
            }),
          }),
          patch: async (id: string, value: Record<string, unknown>) => {
            patches.push({ id, value });
          },
          delete: async () => undefined,
        },
        scheduler: { runAfter: async () => undefined },
      };

      await cascadeCollectionItems(ctx, {
        userId: "account-a",
        collectionId: "collection",
        generation: 2,
        updatedAt: 10,
        operationId: "operation-a",
      });

      expect(membershipReads).toBe(1);
      expect(patches[0]).toEqual({
        id: "membership",
        value: { removed: true, updatedAt: 10 },
      });
      expect(patches[1]).toMatchObject({
        id: "collection-parent",
        value: {
          membershipRemovalCascade: {
            operationId: "operation-a",
            status: "completed",
          },
        },
      });

      const expiredParent = {
        ...parent,
        membershipRemovalCascade: activeRemovalCascade("operation-b", {
          leaseExpiresAt: 999,
          recoveryAttempts: 0,
        }),
      };
      const recoveryPatches: Array<Record<string, unknown>> = [];
      const scheduled: Array<{ delay: number; name: string }> = [];
      const recoveryCtx = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              collect: async () =>
                table === "sync_generations"
                  ? [{ generation: 2 }]
                  : [expiredParent],
            }),
          }),
          patch: async (_id: string, value: Record<string, unknown>) => {
            recoveryPatches.push(value);
          },
        },
        scheduler: {
          runAfter: async (
            delay: number,
            fn: Parameters<typeof getFunctionName>[0],
          ) => {
            scheduled.push({ delay, name: getFunctionName(fn) });
          },
        },
      };
      await recoverCollectionItems(recoveryCtx, {
        userId: "account-a",
        collectionId: "collection",
        generation: 2,
        updatedAt: 10,
        operationId: "operation-b",
      });
      expect(recoveryPatches[0]?.membershipRemovalCascade).toMatchObject({
        operationId: "operation-b",
        recoveryAttempts: 1,
        leaseExpiresAt: 1_000 + COLLECTION_CASCADE_LEASE_MS,
      });
      expect(scheduled).toEqual([
        { delay: 0, name: "collections:cascadeRemovedItems" },
        {
          delay: COLLECTION_CASCADE_LEASE_MS,
          name: "collections:recoverRemovedItemsCascade",
        },
      ]);

      let oldGenerationParentReads = 0;
      await cascadeCollectionItems(
        {
          db: {
            query: (table: string) => ({
              withIndex: () => ({
                collect: async () => {
                  if (table === "sync_generations") return [{ generation: 3 }];
                  oldGenerationParentReads += 1;
                  return [];
                },
              }),
            }),
          },
        },
        {
          userId: "account-a",
          collectionId: "collection",
          generation: 2,
          updatedAt: 10,
          operationId: "operation-a",
        },
      );
      expect(oldGenerationParentReads).toBe(0);
    } finally {
      Date.now = originalNow;
    }
  });
});
