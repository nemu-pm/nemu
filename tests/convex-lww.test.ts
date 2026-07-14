import { describe, expect, test } from "bun:test";
import {
  canonicalizeLwwRecords,
  isAfterRemovalBarrier,
  maximumRemovalBarrier,
  mergeChapterProgressHighWater,
  newestLwwRecord,
  shouldApplyLww,
} from "../convex/lww";
import {
  currentSyncGenerationRows,
  nextSyncCleanupToken,
  nextSyncGeneration,
  resolveSyncClock,
  resolveSyncGeneration,
  storedSyncGeneration,
  SYNC_CLOCK_REQUIRED,
  SYNC_GENERATION_MISMATCH,
  SYNC_CLEANUP_TABLES,
  INVALID_SYNC_CLOCK,
  INVALID_SYNC_GENERATION,
  INVALID_SYNC_NUMBER,
  assertFiniteNumber,
  assertNonNegativeSafeInteger,
} from "../convex/syncGeneration";

describe("Convex logical last-write-wins ordering", () => {
  test("rejects stale and equal writes after a newer value", () => {
    expect(shouldApplyLww(200, 199)).toBe(false);
    expect(shouldApplyLww(200, 200)).toBe(false);
    expect(shouldApplyLww(200, 201)).toBe(true);
  });

  test("supports tombstone followed only by a strictly newer revival", () => {
    const tombstone = { updatedAt: 200, removed: true };
    expect(shouldApplyLww(tombstone.updatedAt, 199)).toBe(false);
    expect(shouldApplyLww(tombstone.updatedAt, 200)).toBe(false);
    expect(shouldApplyLww(tombstone.updatedAt, 201)).toBe(true);
  });

  test("selects the newest duplicate before applying a mutation", () => {
    const newest = newestLwwRecord([
      { id: "old", updatedAt: 100 },
      { id: "new", updatedAt: 300 },
      { id: "middle", updatedAt: 200 },
    ]);
    expect(newest?.id).toBe("new");
  });

  test("allows timestamped writes to migrate legacy clockless records", () => {
    expect(shouldApplyLww(undefined, 0)).toBe(true);
  });

  test("canonicalization keeps a tombstone when duplicate clocks tie", () => {
    const rows = canonicalizeLwwRecords(
      [
        { id: "same", updatedAt: 100, removed: false },
        { id: "same", updatedAt: 100, removed: true },
      ],
      (row) => row.id,
      (row) => row.removed,
    );
    expect(rows).toEqual([{ id: "same", updatedAt: 100, removed: true }]);
    expect(
      canonicalizeLwwRecords(
        [
          { id: "legacy", removed: true },
          { id: "legacy", removed: false },
        ],
        (row) => row.id,
        (row) => row.removed,
      ),
    ).toEqual([{ id: "legacy", removed: true }]);
  });

  test("a durable parent removal barrier rejects old and equal children", () => {
    expect(isAfterRemovalBarrier(200, 199)).toBe(false);
    expect(isAfterRemovalBarrier(200, 200)).toBe(false);
    expect(isAfterRemovalBarrier(200, 201)).toBe(true);
    expect(isAfterRemovalBarrier(undefined, 0)).toBe(true);
    expect(
      maximumRemovalBarrier([
        { lastRemovedAt: 200 },
        { lastRemovedAt: undefined },
        { lastRemovedAt: 150 },
      ]),
    ).toBe(200);
  });

  test("accepts older-clock chapter progress as a monotonic high-water update", () => {
    expect(
      mergeChapterProgressHighWater(
        {
          progress: 5,
          total: 10,
          completed: false,
          lastReadAt: 100,
          chapterTitle: "new metadata",
          updatedAt: 100,
        },
        {
          progress: 10,
          total: 12,
          completed: true,
          lastReadAt: 90,
          chapterTitle: "stale metadata",
          updatedAt: 90,
        },
      ),
    ).toEqual({
      progress: 10,
      total: 12,
      completed: true,
      lastReadAt: 100,
      chapterNumber: undefined,
      volumeNumber: undefined,
      chapterTitle: "new metadata",
      updatedAt: 100,
    });
  });

  test("joins equal-clock completion instead of rejecting it", () => {
    expect(
      mergeChapterProgressHighWater(
        {
          progress: 5,
          total: 10,
          completed: false,
          lastReadAt: 100,
          updatedAt: 100,
        },
        {
          progress: 5,
          total: 10,
          completed: true,
          lastReadAt: 100,
          updatedAt: 100,
        },
      ).completed,
    ).toBe(true);
  });
});

describe("Convex sync generation rollout", () => {
  test("allows legacy missing generation and clock only at generation zero", () => {
    expect(resolveSyncGeneration(0, undefined)).toBe(0);
    expect(resolveSyncClock(undefined, 0, 1234)).toBe(1234);
    expect(() => resolveSyncGeneration(1, undefined)).toThrow(
      SYNC_GENERATION_MISMATCH,
    );
    expect(() => resolveSyncClock(undefined, 1, 1234)).toThrow(
      SYNC_CLOCK_REQUIRED,
    );
  });

  test("rejects non-finite, fractional, negative, and overflowing clocks", () => {
    for (const invalid of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => resolveSyncClock(invalid, 0, 1234)).toThrow(
        INVALID_SYNC_CLOCK,
      );
    }
    expect(resolveSyncClock(Number.MAX_SAFE_INTEGER, 0, 1234)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  test("rejects malformed or overflowing generations", () => {
    expect(() => resolveSyncGeneration(0, Number.NaN)).toThrow(
      INVALID_SYNC_GENERATION,
    );
    expect(() => resolveSyncGeneration(-1, -1)).toThrow(
      INVALID_SYNC_GENERATION,
    );
    expect(() => nextSyncGeneration(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(
      INVALID_SYNC_GENERATION,
    );
  });

  test("rejects invalid numeric progress and metadata inputs", () => {
    expect(() => assertNonNegativeSafeInteger(Number.NaN, "progress")).toThrow(
      INVALID_SYNC_NUMBER,
    );
    expect(() => assertNonNegativeSafeInteger(-1, "total")).toThrow(
      INVALID_SYNC_NUMBER,
    );
    expect(assertNonNegativeSafeInteger(0, "progress")).toBe(0);
    expect(() => assertFiniteNumber(Number.POSITIVE_INFINITY, "chapter")).toThrow(
      INVALID_SYNC_NUMBER,
    );
    expect(assertFiniteNumber(1.5, "chapter")).toBe(1.5);
  });

  test("rejects stale clients after reset and advances only exact generation", () => {
    expect(nextSyncGeneration(0, undefined)).toBe(1);
    expect(nextSyncGeneration(1, 1)).toBe(2);
    expect(() => nextSyncGeneration(1, 0)).toThrow(
      SYNC_GENERATION_MISMATCH,
    );
    expect(() => resolveSyncGeneration(2, 1)).toThrow(
      SYNC_GENERATION_MISMATCH,
    );
  });

  test("treats legacy rows as gen-0 and excludes them after reset", () => {
    const rows = [
      { id: "legacy" },
      { id: "current", syncGeneration: 3 },
      { id: "stale", syncGeneration: 2 },
    ];
    expect(currentSyncGenerationRows(rows, 0).map((row) => row.id)).toEqual([
      "legacy",
    ]);
    expect(currentSyncGenerationRows(rows, 3).map((row) => row.id)).toEqual([
      "current",
    ]);
    expect(storedSyncGeneration(0)).toBeUndefined();
    expect(storedSyncGeneration(3)).toBe(3);
  });

  test("continues bounded cleanup across every synced table", () => {
    const visited: string[] = [];
    let token: {
      table: (typeof SYNC_CLEANUP_TABLES)[number];
    } | null = {
      table: SYNC_CLEANUP_TABLES[0],
    };
    while (token) {
      visited.push(token.table);
      token = nextSyncCleanupToken(token, false);
    }
    expect(visited).toEqual(SYNC_CLEANUP_TABLES);
  });

  test("repeats a full cleanup bucket before advancing", () => {
    const token = { table: "chapter_progress" as const };
    expect(nextSyncCleanupToken(token, true)).toEqual(token);
    expect(nextSyncCleanupToken(token, false)).toEqual({
      table: "manga_progress",
    });
  });
});
