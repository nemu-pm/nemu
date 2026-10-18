import { describe, expect, test } from "bun:test";
import { save, saveBatch } from "../convex/history";

type Row = Record<string, unknown> & { _id: string };
type RegisteredMutationHandler = (
  ctx: unknown,
  args: Record<string, unknown>,
) => Promise<unknown>;

function handlerOf(value: unknown): RegisteredMutationHandler {
  return (value as { _handler: RegisteredMutationHandler })._handler;
}

const saveHandler = handlerOf(save);
const saveBatchHandler = handlerOf(saveBatch);

/** Just enough of Convex's db for the history mutations: indexed equality reads and writes. */
function memoryDb(seed: Record<string, Omit<Row, "_id">[]> = {}) {
  let nextId = 0;
  const tables: Record<string, Row[]> = {
    sync_generations: [{ _id: "generation", userId: "account-a", generation: 1 }],
  };
  for (const [table, rows] of Object.entries(seed)) {
    tables[table] = rows.map((row) => ({ _id: `${table}-${nextId++}`, ...row }));
  }
  const writes: string[] = [];
  const find = (id: string) =>
    Object.values(tables)
      .flat()
      .find((row) => row._id === id);
  const db = {
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build?: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
      ) => {
        const conditions: Array<[string, unknown]> = [];
        const q = {
          eq: (field: string, value: unknown) => {
            conditions.push([field, value]);
            return q;
          },
        };
        build?.(q);
        return {
          collect: async () =>
            (tables[table] ?? []).filter((row) =>
              conditions.every(([field, value]) => row[field] === value),
            ),
        };
      },
    }),
    insert: async (table: string, value: Record<string, unknown>) => {
      const _id = `${table}-${nextId++}`;
      (tables[table] ??= []).push({ _id, ...value });
      writes.push(`insert ${table}`);
      return _id;
    },
    // Like Convex, a patch never changes a document a handler already read.
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = { ...find(id)! };
      for (const [key, field] of Object.entries(value)) {
        if (field === undefined) delete row[key];
        else row[key] = field;
      }
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((candidate) => candidate._id === id);
        if (index >= 0) rows[index] = row;
      }
      writes.push(`patch ${id}`);
    },
    delete: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) rows.splice(index, 1);
      }
      writes.push(`delete ${id}`);
    },
  };
  return {
    tables,
    writes,
    ctx: {
      auth: { getUserIdentity: async () => ({ subject: "account-a" }) },
      db,
    },
  };
}

const KEY = {
  registryId: "registry",
  sourceId: "source",
  sourceMangaId: "manga",
};

function item(
  sourceChapterId: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...KEY,
    sourceChapterId,
    progress: 0,
    total: 20,
    completed: false,
    lastReadAt: 0,
    ...values,
  };
}

const FENCE = { expectedUserId: "account-a", generation: 1 };

function chapterRow(sourceChapterId: string, values: Record<string, unknown>) {
  return {
    userId: "account-a",
    syncGeneration: 1,
    ...KEY,
    sourceChapterId,
    progress: 0,
    total: 20,
    completed: false,
    lastReadAt: 0,
    ...values,
  };
}

function summaryRow(values: Record<string, unknown>) {
  return { userId: "account-a", syncGeneration: 1, ...KEY, ...values };
}

const readRow = (sourceChapterId: string, lastReadAt: number) =>
  chapterRow(sourceChapterId, {
    progress: 19,
    completed: true,
    lastReadAt,
    updatedAt: lastReadAt,
  });

describe("history.save with Mark as Unread", () => {
  test("a reset clears the stored pages and moves the summary back", async () => {
    const { ctx, tables } = memoryDb({
      chapter_progress: [readRow("c1", 500), readRow("c2", 900)],
      manga_progress: [
        summaryRow({
          lastReadAt: 900,
          lastReadSourceChapterId: "c2",
          lastReadChapterNumber: 2,
          updatedAt: 900,
        }),
      ],
    });
    await saveHandler(ctx, {
      ...FENCE,
      ...item("c2", { total: 0, resetAt: 2_000, updatedAt: 2_000 }),
    });

    const c2 = tables.chapter_progress!.find((row) => row.sourceChapterId === "c2");
    expect(c2).toMatchObject({
      progress: 0,
      total: 0,
      completed: false,
      lastReadAt: 0,
      resetAt: 2_000,
      updatedAt: 2_000,
    });
    expect(tables.manga_progress).toHaveLength(1);
    expect(tables.manga_progress![0]).toMatchObject({
      lastReadAt: 500,
      lastReadSourceChapterId: "c1",
      updatedAt: 2_000,
    });
  });

  test("a whole-work reset batch clears the summary once", async () => {
    const { ctx, tables } = memoryDb({
      chapter_progress: [readRow("c1", 500), readRow("c2", 900)],
      manga_progress: [
        summaryRow({
          libraryItemId: "item",
          lastReadAt: 900,
          lastReadSourceChapterId: "c2",
          lastReadChapterTitle: "Two",
          updatedAt: 900,
        }),
      ],
    });
    await saveBatchHandler(ctx, {
      ...FENCE,
      items: ["c1", "c2"].map((id) =>
        item(id, { total: 0, resetAt: 2_000, updatedAt: 2_000 }),
      ),
    });
    const summary = tables.manga_progress![0]!;
    expect(summary.lastReadAt).toBe(0);
    expect(summary.updatedAt).toBe(2_000);
    expect(summary.libraryItemId).toBe("item");
    expect("lastReadSourceChapterId" in summary).toBe(false);
    expect("lastReadChapterTitle" in summary).toBe(false);
  });

  test("an older client cannot bring the pages back", async () => {
    const { ctx, tables, writes } = memoryDb({
      chapter_progress: [
        chapterRow("c2", { resetAt: 2_000, updatedAt: 2_000, total: 0 }),
      ],
      manga_progress: [summaryRow({ lastReadAt: 0, updatedAt: 2_000 })],
    });
    // Its pre-reset pages, and its high-water echo of the reset row's clock.
    for (const updatedAt of [900, 2_000]) {
      await saveHandler(ctx, {
        ...FENCE,
        ...item("c2", { progress: 19, completed: true, lastReadAt: 900, updatedAt }),
      });
    }
    expect(tables.chapter_progress![0]).toMatchObject({
      progress: 0,
      completed: false,
      lastReadAt: 0,
      resetAt: 2_000,
    });
    expect(tables.manga_progress![0]).toMatchObject({ lastReadAt: 0 });
    expect("lastReadSourceChapterId" in tables.manga_progress![0]!).toBe(false);
    // The discarded writes changed nothing, so nothing was written.
    expect(writes).toEqual([]);
  });

  test("reading after the reset counts and becomes the last read event", async () => {
    const { ctx, tables } = memoryDb({
      chapter_progress: [
        chapterRow("c2", { resetAt: 2_000, updatedAt: 2_000, total: 0 }),
      ],
      manga_progress: [summaryRow({ lastReadAt: 0, updatedAt: 2_000 })],
    });
    // An older client sends no reset clock; its write is newer than the reset.
    await saveHandler(ctx, {
      ...FENCE,
      ...item("c2", { progress: 3, lastReadAt: 2_500, updatedAt: 2_500 }),
    });
    expect(tables.chapter_progress![0]).toMatchObject({
      progress: 3,
      total: 20,
      lastReadAt: 2_500,
      resetAt: 2_000,
      updatedAt: 2_500,
    });
    expect(tables.manga_progress![0]).toMatchObject({
      lastReadAt: 2_500,
      lastReadSourceChapterId: "c2",
    });
  });

  test("a stale reset loses to a newer one and leaves the summary alone", async () => {
    const { ctx, tables } = memoryDb({
      chapter_progress: [
        chapterRow("c2", {
          progress: 4,
          lastReadAt: 3_500,
          resetAt: 3_000,
          updatedAt: 3_500,
        }),
      ],
      manga_progress: [
        summaryRow({ lastReadAt: 3_500, lastReadSourceChapterId: "c2", updatedAt: 3_500 }),
      ],
    });
    await saveHandler(ctx, {
      ...FENCE,
      ...item("c2", { total: 0, resetAt: 2_000, updatedAt: 2_000 }),
    });
    expect(tables.chapter_progress![0]).toMatchObject({
      progress: 4,
      resetAt: 3_000,
      updatedAt: 3_500,
    });
    expect(tables.manga_progress![0]).toMatchObject({
      lastReadAt: 3_500,
      lastReadSourceChapterId: "c2",
    });
  });

  test("a repeated reset is idempotent", async () => {
    const { ctx, tables, writes } = memoryDb({
      chapter_progress: [readRow("c2", 900)],
      manga_progress: [
        summaryRow({ lastReadAt: 900, lastReadSourceChapterId: "c2", updatedAt: 900 }),
      ],
    });
    const reset = { ...FENCE, ...item("c2", { total: 0, resetAt: 2_000, updatedAt: 2_000 }) };
    await saveHandler(ctx, reset);
    const after = structuredClone(tables);
    writes.length = 0;
    await saveHandler(ctx, reset);
    expect(tables).toEqual(after);
    expect(writes).toEqual([]);
  });

  test("a reset for a chapter the server never saw does not invent a summary", async () => {
    const { ctx, tables } = memoryDb();
    await saveHandler(ctx, {
      ...FENCE,
      ...item("c9", { total: 0, resetAt: 2_000, updatedAt: 2_000 }),
    });
    expect(tables.chapter_progress).toHaveLength(1);
    expect(tables.manga_progress ?? []).toHaveLength(0);
  });

  test("rejects an invalid reset clock", async () => {
    const { ctx } = memoryDb();
    await expect(
      saveHandler(ctx, {
        ...FENCE,
        ...item("c1", { resetAt: Number.MAX_SAFE_INTEGER, updatedAt: 2_000 }),
      }),
    ).rejects.toThrow();
  });

  test("saves without the field behave as before", async () => {
    const { ctx, tables } = memoryDb({
      chapter_progress: [readRow("c1", 900)],
    });
    await saveHandler(ctx, {
      ...FENCE,
      ...item("c1", { progress: 2, lastReadAt: 1_000, updatedAt: 1_000 }),
    });
    expect(tables.chapter_progress![0]).toMatchObject({
      progress: 19,
      completed: true,
      lastReadAt: 1_000,
      updatedAt: 1_000,
    });
    expect("resetAt" in tables.chapter_progress![0]!).toBe(false);
    expect(tables.manga_progress![0]).toMatchObject({
      lastReadAt: 1_000,
      lastReadSourceChapterId: "c1",
    });
  });
});
