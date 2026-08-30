import { describe, expect, test } from "bun:test";
import {
  canonicalizeLwwRecords,
  chapterProgressHighWaterValues,
  isAfterRemovalBarrier,
  maximumRemovalBarrier,
  mergeChapterProgressHighWater,
  newestLwwRecord,
  shouldApplyLww,
} from "../convex/lww";
import {
  chapterProgressNeedsPush,
  MAX_SYNC_CLOCK_FUTURE_SKEW_MS,
  mergeChapterProgressForSave,
  type LocalChapterProgress,
} from "../packages/core/src/sync";
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

  test("lets a valid write repair clocks poisoned by older clients", () => {
    expect(shouldApplyLww(Number.MAX_SAFE_INTEGER, 200)).toBe(true);
    expect(
      newestLwwRecord([
        { id: "poisoned", updatedAt: Number.MAX_SAFE_INTEGER },
        { id: "valid", updatedAt: 200 },
      ])?.id,
    ).toBe("valid");
    expect(
      maximumRemovalBarrier([
        { lastRemovedAt: Number.MAX_SAFE_INTEGER },
        { lastRemovedAt: 200 },
      ]),
    ).toBe(200);
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

  test("repairs poisoned chapter clocks while preserving high-water progress", () => {
    expect(
      mergeChapterProgressHighWater(
        {
          progress: 9,
          total: 10,
          completed: false,
          lastReadAt: Number.MAX_SAFE_INTEGER,
          chapterTitle: "poisoned",
          updatedAt: Number.MAX_SAFE_INTEGER,
        },
        {
          progress: 5,
          total: 10,
          completed: true,
          lastReadAt: 200,
          chapterTitle: "repaired",
          updatedAt: 200,
        },
      ),
    ).toEqual({
      progress: 9,
      total: 10,
      completed: true,
      lastReadAt: 200,
      chapterNumber: undefined,
      volumeNumber: undefined,
      chapterTitle: "repaired",
      updatedAt: 200,
    });
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

  test("rejects malformed, overflowing, and far-future clocks", () => {
    for (const invalid of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      1234 + MAX_SYNC_CLOCK_FUTURE_SKEW_MS + 1,
    ]) {
      expect(() => resolveSyncClock(invalid, 0, 1234)).toThrow(
        INVALID_SYNC_CLOCK,
      );
    }
    expect(
      resolveSyncClock(1234 + MAX_SYNC_CLOCK_FUTURE_SKEW_MS, 0, 1234),
    ).toBe(1234 + MAX_SYNC_CLOCK_FUTURE_SKEW_MS);
    expect(() => resolveSyncClock(Number.MAX_SAFE_INTEGER, 0, 1234)).toThrow(
      INVALID_SYNC_CLOCK,
    );
    expect(() => resolveSyncClock(1234, 0, Number.MAX_SAFE_INTEGER)).toThrow(
      INVALID_SYNC_CLOCK,
    );
  });

  test("rejects malformed or overflowing generations", () => {
    expect(() => resolveSyncGeneration(0, Number.NaN)).toThrow(
      INVALID_SYNC_GENERATION,
    );
    expect(() => resolveSyncGeneration(-1, -1)).toThrow(
      INVALID_SYNC_GENERATION,
    );
    expect(() =>
      nextSyncGeneration(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ).toThrow(INVALID_SYNC_GENERATION);
  });

  test("rejects invalid numeric progress and metadata inputs", () => {
    expect(() => assertNonNegativeSafeInteger(Number.NaN, "progress")).toThrow(
      INVALID_SYNC_NUMBER,
    );
    expect(() => assertNonNegativeSafeInteger(-1, "total")).toThrow(
      INVALID_SYNC_NUMBER,
    );
    expect(assertNonNegativeSafeInteger(0, "progress")).toBe(0);
    expect(() =>
      assertFiniteNumber(Number.POSITIVE_INFINITY, "chapter"),
    ).toThrow(INVALID_SYNC_NUMBER);
    expect(assertFiniteNumber(1.5, "chapter")).toBe(1.5);
  });

  test("rejects stale clients after reset and advances only exact generation", () => {
    expect(nextSyncGeneration(0, undefined)).toBe(1);
    expect(nextSyncGeneration(1, 1)).toBe(2);
    expect(() => nextSyncGeneration(1, 0)).toThrow(SYNC_GENERATION_MISMATCH);
    expect(() => resolveSyncGeneration(2, 1)).toThrow(SYNC_GENERATION_MISMATCH);
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

/**
 * The client and the server must resolve every chapter-progress merge the same
 * way. They used to hold two hand-maintained copies of the rule and had
 * already drifted: at an equal clock they disagreed about metadata ownership,
 * and only the server backfilled a field the other side was missing, so a
 * cloud row without a `chapterTitle` destroyed the local one permanently.
 *
 * `convex/lww.ts` now re-exports the canonical merge from `@nemu/core`, and
 * this table pins the property that actually matters: applying a push on the
 * server and applying the same pair on the client land on identical values.
 */
function progress(
  overrides: Partial<LocalChapterProgress>,
): LocalChapterProgress {
  return {
    id: "registry|source|manga|chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: "chapter",
    progress: 0,
    total: 0,
    completed: false,
    lastReadAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const mergeAgreementCases: {
  name: string;
  local: LocalChapterProgress;
  cloud: LocalChapterProgress;
}[] = [
  {
    name: "equal clocks with competing metadata",
    local: progress({
      progress: 5,
      total: 10,
      lastReadAt: 100,
      chapterTitle: "local",
      updatedAt: 100,
    }),
    cloud: progress({
      progress: 4,
      total: 10,
      lastReadAt: 100,
      chapterTitle: "cloud",
      updatedAt: 100,
    }),
  },
  {
    name: "equal clocks where the cloud row is missing metadata",
    local: progress({
      progress: 5,
      total: 10,
      lastReadAt: 100,
      chapterNumber: 12,
      volumeNumber: 2,
      chapterTitle: "local title",
      updatedAt: 100,
    }),
    cloud: progress({
      progress: 5,
      total: 10,
      lastReadAt: 100,
      updatedAt: 100,
    }),
  },
  {
    name: "local strictly newer",
    local: progress({
      progress: 9,
      total: 12,
      completed: true,
      lastReadAt: 300,
      chapterTitle: "local",
      updatedAt: 300,
    }),
    cloud: progress({
      progress: 3,
      total: 10,
      lastReadAt: 100,
      chapterTitle: "cloud",
      chapterNumber: 7,
      updatedAt: 100,
    }),
  },
  {
    name: "cloud strictly newer but with a lower high-water page",
    local: progress({
      progress: 20,
      total: 30,
      completed: true,
      lastReadAt: 500,
      chapterTitle: "local",
      updatedAt: 100,
    }),
    cloud: progress({
      progress: 2,
      total: 30,
      lastReadAt: 50,
      chapterTitle: "cloud",
      updatedAt: 400,
    }),
  },
  {
    name: "cloud strictly newer and missing metadata the local row has",
    local: progress({
      progress: 1,
      total: 10,
      lastReadAt: 100,
      chapterNumber: 3,
      volumeNumber: 1,
      chapterTitle: "local title",
      updatedAt: 100,
    }),
    cloud: progress({
      progress: 6,
      total: 10,
      lastReadAt: 200,
      updatedAt: 200,
    }),
  },
  {
    name: "both sides missing all metadata",
    local: progress({ progress: 1, total: 4, lastReadAt: 10, updatedAt: 10 }),
    cloud: progress({ progress: 2, total: 4, lastReadAt: 20, updatedAt: 20 }),
  },
];

describe("client and server chapter-progress merges agree", () => {
  for (const { name, local, cloud } of mergeAgreementCases) {
    test(name, () => {
      // Server: the stored cloud row receives the client's pushed values.
      const server = mergeChapterProgressHighWater(
        chapterProgressHighWaterValues(cloud),
        chapterProgressHighWaterValues(local),
      );
      // Client: the same pair, applied while consuming the cloud snapshot.
      const client = chapterProgressHighWaterValues(
        mergeChapterProgressForSave(local, cloud),
      );
      expect(client).toEqual(server);
    });

    test(`${name} converges after at most one extra push`, () => {
      const merged = mergeChapterProgressForSave(local, cloud);
      if (!chapterProgressNeedsPush(merged, cloud)) return;
      // The push the client schedules must produce a cloud row it no longer
      // wants to push, otherwise the two sides loop against each other.
      const pushed = mergeChapterProgressHighWater(
        chapterProgressHighWaterValues(cloud),
        chapterProgressHighWaterValues(merged),
      );
      const nextCloud: LocalChapterProgress = { ...cloud, ...pushed };
      const nextLocal = mergeChapterProgressForSave(merged, nextCloud);
      expect(chapterProgressNeedsPush(nextLocal, nextCloud)).toBe(false);
    });
  }

  test("never lets a cloud row without metadata erase the local value", () => {
    const local = progress({
      progress: 4,
      total: 10,
      lastReadAt: 100,
      chapterNumber: 12,
      volumeNumber: 2,
      chapterTitle: "Chapter 12",
      updatedAt: 100,
    });
    const cloud = progress({
      progress: 4,
      total: 10,
      lastReadAt: 100,
      updatedAt: 100,
    });
    const merged = mergeChapterProgressForSave(local, cloud);
    expect(merged.chapterTitle).toBe("Chapter 12");
    expect(merged.chapterNumber).toBe(12);
    expect(merged.volumeNumber).toBe(2);
    // ...and the backfill is re-pushed rather than left as silent divergence.
    expect(chapterProgressNeedsPush(merged, cloud)).toBe(true);
  });

  test("keeps the server authoritative when both sides have metadata", () => {
    const local = progress({ chapterTitle: "local", updatedAt: 100 });
    const cloud = progress({ chapterTitle: "cloud", updatedAt: 100 });
    const merged = mergeChapterProgressForSave(local, cloud);
    expect(merged.chapterTitle).toBe("cloud");
    expect(chapterProgressNeedsPush(merged, cloud)).toBe(false);
  });
});
