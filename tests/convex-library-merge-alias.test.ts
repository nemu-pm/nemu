import { describe, expect, test } from "bun:test";
import { addItems } from "../convex/collections";
import { retargetLibraryItem } from "../convex/history";
import { save as saveLibraryItem, remove as removeLibraryItem } from "../convex/library";
import {
  LIBRARY_MERGE_ALIAS_CYCLE,
  LIBRARY_MERGE_ALIAS_LIMIT,
  resolveLibraryMergeAlias,
} from "../convex/libraryMerge";

type Row = Record<string, unknown> & { _id: string };
type RegisteredMutationHandler = (
  ctx: unknown,
  args: Record<string, unknown>,
) => Promise<unknown>;

function handlerOf(value: unknown): RegisteredMutationHandler {
  return (value as { _handler: RegisteredMutationHandler })._handler;
}

const saveLibrary = handlerOf(saveLibraryItem);
const removeLibrary = handlerOf(removeLibraryItem);
const addCollectionItems = handlerOf(addItems);
const retargetHistory = handlerOf(retargetLibraryItem);

function libraryRow(
  libraryItemId: string,
  options: {
    id?: string;
    updatedAt?: number;
    inLibrary?: boolean;
    mergedIntoLibraryItemId?: string;
    membershipRemovalCascade?: Record<string, unknown>;
  } = {},
): Row {
  return {
    _id: options.id ?? `library-${libraryItemId}`,
    userId: "account-a",
    syncGeneration: 2,
    libraryItemId,
    metadata: { title: libraryItemId },
    inLibrary: options.inLibrary ?? true,
    createdAt: 1,
    updatedAt: options.updatedAt ?? 10,
    ...(options.inLibrary === false ? { lastRemovedAt: options.updatedAt ?? 10 } : {}),
    ...(options.mergedIntoLibraryItemId === undefined
      ? {}
      : { mergedIntoLibraryItemId: options.mergedIntoLibraryItemId }),
    ...(options.membershipRemovalCascade === undefined
      ? {}
      : { membershipRemovalCascade: options.membershipRemovalCascade }),
  };
}

function createCtx(initialRows: Record<string, Row[]>) {
  const rows = new Map(
    Object.entries(initialRows).map(([table, values]) => [table, [...values]]),
  );
  const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; value: Row }> = [];
  const deletes: string[] = [];
  const scheduled: Array<{ args: Record<string, unknown> }> = [];
  let insertSequence = 0;

  const db = {
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build: (q: {
          eq: (field: string, value: unknown) => unknown;
        }) => unknown,
      ) => {
        const filters = new Map<string, unknown>();
        const q = {
          eq(field: string, value: unknown) {
            filters.set(field, value);
            return q;
          },
        };
        build(q);
        return {
          collect: async () =>
            (rows.get(table) ?? []).filter((row) =>
              [...filters].every(([field, value]) => row[field] === value),
            ),
        };
      },
    }),
    patch: async (id: string, value: Record<string, unknown>) => {
      patches.push({ id, value });
      for (const tableRows of rows.values()) {
        const row = tableRows.find((candidate) => candidate._id === id);
        if (row) Object.assign(row, value);
      }
    },
    insert: async (table: string, value: Record<string, unknown>) => {
      const row = { ...value, _id: `insert-${insertSequence++}` } as Row;
      const tableRows = rows.get(table) ?? [];
      tableRows.push(row);
      rows.set(table, tableRows);
      inserts.push({ table, value: row });
      return row._id;
    },
    delete: async (id: string) => {
      deletes.push(id);
      for (const [table, tableRows] of rows) {
        rows.set(
          table,
          tableRows.filter((candidate) => candidate._id !== id),
        );
      }
    },
  };

  return {
    ctx: {
      auth: {
        getUserIdentity: async () => ({ subject: "account-a" }),
      },
      db,
      scheduler: {
        runAfter: async (
          _delay: number,
          _fn: unknown,
          args: Record<string, unknown>,
        ) => {
          scheduled.push({ args });
        },
      },
    },
    rows,
    patches,
    inserts,
    deletes,
    scheduled,
  };
}

function generationRow(): Row {
  return { _id: "generation", userId: "account-a", generation: 2 };
}

describe("Convex durable library merge aliases", () => {
  test("resolves a finite chain to its active terminal survivor", async () => {
    const { ctx } = createCtx({
      sync_generations: [generationRow()],
      library_items: [
        libraryRow("a", { inLibrary: false, mergedIntoLibraryItemId: "b" }),
        libraryRow("b", { inLibrary: false, mergedIntoLibraryItemId: "c" }),
        libraryRow("c"),
      ],
    });

    await expect(
      resolveLibraryMergeAlias(ctx as never, "account-a", 2, "a"),
    ).resolves.toMatchObject({
      libraryItemId: "c",
      chain: ["a", "b", "c"],
      item: { libraryItemId: "c", inLibrary: true },
    });
  });

  test("rejects alias cycles without writing", async () => {
    const { ctx, patches, inserts, deletes } = createCtx({
      sync_generations: [generationRow()],
      library_items: [
        libraryRow("a", { inLibrary: false, mergedIntoLibraryItemId: "b" }),
        libraryRow("b", { inLibrary: false, mergedIntoLibraryItemId: "a" }),
      ],
    });

    await expect(
      resolveLibraryMergeAlias(ctx as never, "account-a", 2, "a"),
    ).rejects.toThrow(LIBRARY_MERGE_ALIAS_CYCLE);
    expect([...patches, ...inserts, ...deletes]).toEqual([]);
  });

  test("honors a caller's stricter alias traversal budget", async () => {
    const { ctx } = createCtx({
      sync_generations: [generationRow()],
      library_items: [
        libraryRow("a", { inLibrary: false, mergedIntoLibraryItemId: "b" }),
        libraryRow("b", { inLibrary: false, mergedIntoLibraryItemId: "c" }),
        libraryRow("c"),
      ],
    });

    await expect(
      resolveLibraryMergeAlias(ctx as never, "account-a", 2, "a", {
        maxHops: 1,
      }),
    ).rejects.toThrow(LIBRARY_MERGE_ALIAS_LIMIT);
  });

  test("blocks stale active saves even when their clock beats the alias", async () => {
    const alias = libraryRow("source", {
      id: "source-alias",
      updatedAt: 10,
      inLibrary: false,
      mergedIntoLibraryItemId: "target",
    });
    const staleActiveDuplicate = libraryRow("source", {
      id: "source-stale-active",
      updatedAt: 9_999,
    });
    const { ctx, rows, patches, inserts, deletes } = createCtx({
      sync_generations: [generationRow()],
      library_items: [alias, staleActiveDuplicate, libraryRow("target")],
    });

    await expect(
      saveLibrary(ctx, {
        expectedUserId: "account-a",
        generation: 2,
        libraryItemId: "source",
        metadata: { title: "stale offline title" },
        createdAt: 1,
        updatedAt: 10_000,
        sources: [],
      }),
    ).resolves.toBeNull();

    expect(deletes).toEqual(["source-stale-active"]);
    expect(patches).toEqual([]);
    expect(inserts).toEqual([]);
    expect(rows.get("library_items")).toContain(alias);
  });

  test("redirects stale collection membership adds through the terminal alias", async () => {
    const { ctx, inserts } = createCtx({
      sync_generations: [generationRow()],
      library_items: [
        libraryRow("a", { inLibrary: false, mergedIntoLibraryItemId: "b" }),
        libraryRow("b", { inLibrary: false, mergedIntoLibraryItemId: "c" }),
        libraryRow("c"),
      ],
      collections: [
        {
          _id: "collection-favorites",
          userId: "account-a",
          syncGeneration: 2,
          collectionId: "favorites",
          name: "Favorites",
          createdAt: 1,
          updatedAt: 5,
          removed: false,
        },
      ],
      collection_items: [],
    });

    await expect(
      addCollectionItems(ctx, {
        expectedUserId: "account-a",
        generation: 2,
        collectionId: "favorites",
        libraryItemIds: ["a", "b", "c"],
        updatedAt: 20,
      }),
    ).resolves.toBeNull();

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "collection_items",
      value: {
        collectionId: "favorites",
        libraryItemId: "c",
        removed: false,
      },
    });
  });

  test("retargets history to the terminal survivor of an alias chain", async () => {
    const { ctx, patches, scheduled } = createCtx({
      sync_generations: [generationRow()],
      library_items: [
        libraryRow("source"),
        libraryRow("b", { inLibrary: false, mergedIntoLibraryItemId: "c" }),
        libraryRow("c"),
      ],
    });

    await expect(
      retargetHistory(ctx, {
        expectedUserId: "account-a",
        generation: 2,
        sourceLibraryItemId: "source",
        targetLibraryItemId: "b",
        updatedAt: 20,
      }),
    ).resolves.toBeNull();

    expect(patches).toHaveLength(2);
    expect(patches.every(({ value }) =>
      (value.historyRetargetLock as Record<string, unknown>)
        .targetLibraryItemId === "c",
    )).toBe(true);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.every(({ args }) => args.targetLibraryItemId === "c"))
      .toBe(true);
  });

  test("makes a repeated merge to an intermediate alias idempotent", async () => {
    const completedLock = {
      removedAt: 10,
      operationId: "operation-a",
      operationVersion: 1,
      status: "completed",
      recoveryAttempts: 0,
      mergeTargetLibraryItemId: "c",
    };
    const { ctx, patches, inserts, scheduled } = createCtx({
      sync_generations: [generationRow()],
      library_items: [
        libraryRow("a", {
          inLibrary: false,
          mergedIntoLibraryItemId: "b",
          membershipRemovalCascade: completedLock,
        }),
        libraryRow("b", { inLibrary: false, mergedIntoLibraryItemId: "c" }),
        libraryRow("c"),
      ],
    });

    await expect(
      removeLibrary(ctx, {
        expectedUserId: "account-a",
        generation: 2,
        libraryItemId: "a",
        mergeTargetLibraryItemId: "b",
        updatedAt: 10,
      }),
    ).resolves.toBeUndefined();

    expect(patches).toEqual([]);
    expect(inserts).toEqual([]);
    expect(scheduled).toEqual([]);
  });
});
