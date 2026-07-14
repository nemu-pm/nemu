import { describe, expect, test } from "bun:test";
import {
  canonicalizeSyncSnapshotRecords,
  countSyncSnapshotRows,
  completeSyncSnapshot,
  consistentSyncGeneration,
  decideSyncGeneration,
  estimateSyncSnapshotRowBytes,
  fetchAllSyncSnapshotPages,
  fetchBoundedSyncSnapshotPages,
  measureSyncSnapshotRows,
  planSyncSnapshotPagination,
  SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
  SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT,
  SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT,
  SYNC_SNAPSHOT_TOTAL_ROW_LIMIT,
} from "./sync-generation";

describe("sync generation helpers", () => {
  test("accepts only a complete single-generation snapshot set", () => {
    expect(
      consistentSyncGeneration(
        { generation: 3 },
        { generation: 3 },
        { generation: 3 },
      ),
    ).toBe(3);
    expect(consistentSyncGeneration({ generation: 3 }, undefined)).toBeNull();
    expect(
      consistentSyncGeneration({ generation: 3 }, { generation: 4 }),
    ).toBeNull();
  });

  test("initializes legacy generation zero without deleting local data", () => {
    expect(decideSyncGeneration(null, 0)).toBe("initialize");
  });

  test("resets unversioned or older local state for a newer generation", () => {
    expect(decideSyncGeneration(null, 2)).toBe("reset");
    expect(decideSyncGeneration(1, 2)).toBe("reset");
  });

  test("makes a lost reset response retry idempotent and rejects delayed rows", () => {
    expect(decideSyncGeneration(2, 2)).toBe("current");
    expect(decideSyncGeneration(2, 1)).toBe("stale");
  });

  test("waits for every page and rejects a generation race sentinel", () => {
    const page = [
      { kind: "generation" as const, generation: 4 },
      { kind: "row" as const, generation: 4, row: { id: "a" } },
    ];
    expect(completeSyncSnapshot(page, 4, "CanLoadMore")).toBeNull();
    expect(completeSyncSnapshot(page, 4, "Exhausted")).toEqual([{ id: "a" }]);
    expect(
      completeSyncSnapshot(
        [{ kind: "generation", generation: 5 }],
        4,
        "Exhausted",
      ),
    ).toBeNull();
  });

  test("plans foreground pagination within shared and per-resource budgets", () => {
    const resources = [
      {
        key: "libraryItems" as const,
        rowCount: 10,
        estimatedBytes: 100,
        status: "Exhausted",
      },
      {
        key: "chapterProgress" as const,
        rowCount: 20,
        estimatedBytes: 200,
        status: "CanLoadMore",
      },
    ];
    expect(
      countSyncSnapshotRows([
        { kind: "generation", generation: 1 },
        { kind: "row", generation: 1, row: "a" },
      ]),
    ).toBe(1);
    expect(planSyncSnapshotPagination(resources, 128)).toEqual({
      status: "load-more",
      key: "chapterProgress",
      numItems: 128,
      totalRows: 30,
      totalEstimatedBytes: 300,
    });
  });

  test("accepts exact exhausted limits and rejects one more or pending-at-limit", () => {
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT,
          estimatedBytes: 0,
          status: "Exhausted",
        },
        {
          key: "libraryItems",
          rowCount:
            SYNC_SNAPSHOT_TOTAL_ROW_LIMIT - SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT,
          estimatedBytes: 0,
          status: "Exhausted",
        },
      ]),
    ).toEqual({
      status: "complete",
      totalRows: SYNC_SNAPSHOT_TOTAL_ROW_LIMIT,
      totalEstimatedBytes: 0,
    });
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT,
          estimatedBytes: 0,
          status: "CanLoadMore",
        },
      ]),
    ).toMatchObject({ status: "budget-exceeded", key: "chapterProgress" });
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: 0,
          estimatedBytes: SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
          status: "Exhausted",
        },
        {
          key: "libraryItems",
          rowCount: 0,
          estimatedBytes:
            SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT -
            SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT +
            1,
          status: "Exhausted",
        },
      ]),
    ).toMatchObject({ status: "budget-exceeded", key: "total" });
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT + 1,
          estimatedBytes: 0,
          status: "Exhausted",
        },
      ]),
    ).toMatchObject({ status: "budget-exceeded" });
  });

  test("measures deterministic JSON UTF-8 with a retained-memory safety charge", () => {
    expect(estimateSyncSnapshotRowBytes("")).toBe(68);
    expect(estimateSyncSnapshotRowBytes("a")).toBe(70);
    expect(estimateSyncSnapshotRowBytes("😀")).toBe(76);
    expect(estimateSyncSnapshotRowBytes("\ud800")).toBe(80);
    expect(
      measureSyncSnapshotRows([
        { kind: "generation", generation: 1 },
        { kind: "row", generation: 1, row: "a" },
        { kind: "row", generation: 1, row: "😀" },
      ]),
    ).toEqual({ rowCount: 2, estimatedBytes: 146 });
  });

  test("accepts exact foreground byte limits and rejects one more byte", () => {
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: 0,
          estimatedBytes: SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
          status: "Exhausted",
        },
        {
          key: "libraryItems",
          rowCount: 0,
          estimatedBytes:
            SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT -
            SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
          status: "Exhausted",
        },
      ]),
    ).toEqual({
      status: "complete",
      totalRows: 0,
      totalEstimatedBytes: SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT,
    });
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: 1,
          estimatedBytes: SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT + 1,
          status: "Exhausted",
        },
      ]),
    ).toMatchObject({ status: "budget-exceeded", key: "chapterProgress" });
    expect(
      planSyncSnapshotPagination([
        {
          key: "chapterProgress",
          rowCount: 1,
          estimatedBytes: SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
          status: "CanLoadMore",
        },
      ]),
    ).toMatchObject({ status: "budget-exceeded", key: "chapterProgress" });
  });

  test("bounded one-shot fetch shares its budget and rejects generation races", async () => {
    const rowBytes = estimateSyncSnapshotRowBytes(1);
    const budget = {
      usedRows: SYNC_SNAPSHOT_TOTAL_ROW_LIMIT - 1,
      usedEstimatedBytes: SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT - rowBytes,
    };
    const exact = await fetchBoundedSyncSnapshotPages(
      8,
      async ({ numItems }) => ({
        generation: 8,
        page: [
          { kind: "generation", generation: 8 },
          { kind: "row", generation: 8, row: numItems },
        ],
        continueCursor: "done",
        isDone: true,
      }),
      budget,
    );
    expect(exact).toEqual({ status: "complete", rows: [1] });
    expect(budget.usedRows).toBe(SYNC_SNAPSHOT_TOTAL_ROW_LIMIT);
    expect(budget.usedEstimatedBytes).toBe(
      SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT,
    );

    let called = false;
    expect(
      await fetchBoundedSyncSnapshotPages(
        8,
        async () => {
          called = true;
          throw new Error("must not fetch");
        },
        budget,
      ),
    ).toEqual({ status: "budget-exceeded" });
    expect(called).toBe(false);

    const raceBudget = { usedRows: 0, usedEstimatedBytes: 0 };
    expect(
      await fetchBoundedSyncSnapshotPages(
        8,
        async () => ({
          generation: 9,
          page: [{ kind: "generation", generation: 9 }],
          continueCursor: "",
          isDone: true,
        }),
        raceBudget,
      ),
    ).toEqual({ status: "generation-changed" });
    expect(raceBudget.usedRows).toBe(0);
    expect(raceBudget.usedEstimatedBytes).toBe(0);
  });

  test("bounded one-shot fetch fails closed at one estimated byte over budget", async () => {
    const largeRow = { payload: "x".repeat(256 * 1024) };
    const largeRowBytes = estimateSyncSnapshotRowBytes(largeRow);
    const fetchLargeRow = async () => ({
      generation: 8,
      page: [
        { kind: "generation" as const, generation: 8 },
        { kind: "row" as const, generation: 8, row: largeRow },
      ],
      continueCursor: "done",
      isDone: true,
    });
    const exactBudget = {
      usedRows: 0,
      usedEstimatedBytes:
        SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT - largeRowBytes,
    };
    expect(
      await fetchBoundedSyncSnapshotPages(8, fetchLargeRow, exactBudget),
    ).toEqual({ status: "complete", rows: [largeRow] });
    expect(exactBudget.usedEstimatedBytes).toBe(
      SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT,
    );

    const oneByteOverBudget = {
      usedRows: 0,
      usedEstimatedBytes:
        SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT - largeRowBytes + 1,
    };
    expect(
      await fetchBoundedSyncSnapshotPages(8, fetchLargeRow, oneByteOverBudget),
    ).toEqual({ status: "budget-exceeded" });
    expect(oneByteOverBudget.usedEstimatedBytes).toBe(
      SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT - largeRowBytes + 1,
    );
  });

  test("assembles deterministic small pages before exposing rows", async () => {
    const pages = [
      { rows: ["a", "b"], cursor: "second", done: false },
      { rows: ["c"], cursor: "done", done: true },
    ];
    const cursors: Array<string | null> = [];
    const result = await fetchAllSyncSnapshotPages(
      7,
      async ({ cursor }) => {
        cursors.push(cursor);
        const next = pages[cursors.length - 1]!;
        return {
          generation: 7,
          page: [
            { kind: "generation", generation: 7 },
            ...next.rows.map((row) => ({
              kind: "row" as const,
              generation: 7,
              row,
            })),
          ],
          continueCursor: next.cursor,
          isDone: next.done,
        };
      },
      2,
    );
    expect(cursors).toEqual([null, "second"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("rejects a generation change between one-shot pages", async () => {
    let page = 0;
    const result = await fetchAllSyncSnapshotPages(
      2,
      async () => {
        page += 1;
        const generation = page === 1 ? 2 : 3;
        return {
          generation,
          page: [{ kind: "generation", generation }],
          continueCursor: `page-${page}`,
          isDone: page === 2,
        };
      },
      1,
    );
    expect(result).toBeNull();
  });

  test("canonicalizes a duplicate whose winner crosses a page boundary", () => {
    expect(
      canonicalizeSyncSnapshotRecords(
        [
          { id: "a", updatedAt: 1, removed: false },
          { id: "b", updatedAt: 3, removed: false },
          { id: "a", updatedAt: 2, removed: true },
        ],
        (row) => row.id,
        (row) => row.removed,
      ),
    ).toEqual([
      { id: "a", updatedAt: 2, removed: true },
      { id: "b", updatedAt: 3, removed: false },
    ]);
  });

  test("matches server tie semantics for duplicate snapshot rows", () => {
    const first = { id: "a", value: "first", updatedAt: 9, removed: false };
    const second = { id: "a", value: "second", updatedAt: 9, removed: false };
    const tombstone = {
      id: "a",
      value: "removed",
      updatedAt: 9,
      removed: true,
    };
    expect(
      canonicalizeSyncSnapshotRecords(
        [first, second],
        (row) => row.id,
        (row) => row.removed,
      ),
    ).toEqual([first]);
    expect(
      canonicalizeSyncSnapshotRecords(
        [first, second, tombstone],
        (row) => row.id,
        (row) => row.removed,
      ),
    ).toEqual([tombstone]);
  });
});
