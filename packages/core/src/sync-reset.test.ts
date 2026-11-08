import { describe, expect, test } from "bun:test";
import {
  chapterProgressHasReading,
  chapterProgressMarkedUnread,
  chapterProgressNeedsPush,
  chapterProgressReadingSurvivesMerge,
  chapterProgressWinnersForPush,
  latestChapterProgressReadEvent,
  mangaProgressAfterChapterReset,
  mapCloudChapterProgress,
  mergeChapterProgressForSave,
  mergeChapterProgressHighWater,
  mergeChapterProgressSnapshot,
  supportsChapterProgressIntraPageSync,
  supportsChapterProgressResetSync,
  toCloudHistorySaveInput,
  CHAPTER_PROGRESS_SYNC_VERSION,
  MAX_SYNC_CLOCK_FUTURE_SKEW_MS,
  type ChapterProgressHighWaterValues,
  type LocalChapterProgress,
  type LocalMangaProgress,
} from "./sync";

const IDENTITY = `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;

function row(
  overrides: Partial<LocalChapterProgress> = {},
): LocalChapterProgress {
  const chapter = overrides.sourceChapterId ?? "chapter";
  return {
    id: `registry:source:manga:${chapter}`,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: chapter,
    progress: 0,
    total: 20,
    completed: false,
    lastReadAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

/** The values a chapter row shows: what a reset must clear. */
function reading(value: ChapterProgressHighWaterValues) {
  return {
    progress: value.progress,
    total: value.total,
    completed: value.completed,
    lastReadAt: value.lastReadAt,
    resetAt: value.resetAt,
    intraPageProgress: value.intraPageProgress,
  };
}

const READ = row({ progress: 19, completed: true, lastReadAt: 900, updatedAt: 1_000 });
const RESET = chapterProgressMarkedUnread(READ, 2_000);

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

function fold(records: readonly LocalChapterProgress[]) {
  return records.reduce<ChapterProgressHighWaterValues | undefined>(
    (merged, record) => mergeChapterProgressHighWater(merged, record),
    undefined,
  )!;
}

describe("chapter progress reset clock", () => {
  test("records without the field merge exactly as before", () => {
    const merged = mergeChapterProgressHighWater(
      row({ progress: 4, total: 20, lastReadAt: 300, updatedAt: 300 }),
      row({ progress: 2, total: 21, completed: true, lastReadAt: 200, updatedAt: 400 }),
    );
    expect(merged).toEqual({
      progress: 4,
      total: 21,
      completed: true,
      lastReadAt: 300,
      chapterNumber: undefined,
      volumeNumber: undefined,
      chapterTitle: undefined,
      updatedAt: 400,
    });
    expect("resetAt" in merged).toBe(false);
  });

  test("Mark as Unread clears every page recorded before it, in either order", () => {
    const expected = {
      progress: 0,
      total: 0,
      completed: false,
      lastReadAt: 0,
      resetAt: 2_000,
      intraPageProgress: undefined,
    };
    expect(reading(mergeChapterProgressHighWater(READ, RESET))).toEqual(expected);
    expect(reading(mergeChapterProgressHighWater(RESET, READ))).toEqual(expected);
    expect(mergeChapterProgressHighWater(READ, RESET).updatedAt).toBe(2_000);
  });

  test("a pre-reset reader position is cleared with the pages", () => {
    const positioned = row({
      progress: 7,
      intraPageProgress: 0.5,
      intraPageContentIdentity: IDENTITY,
      updatedAt: 1_500,
    });
    const merged = mergeChapterProgressHighWater(positioned, RESET);
    expect(merged.intraPageProgress).toBeUndefined();
    expect(merged.intraPageContentIdentity).toBeUndefined();
  });

  test("metadata from the discarded side still backfills", () => {
    const titled = row({ ...READ, chapterTitle: "Prologue", chapterNumber: 1 });
    const bare = { ...RESET, chapterTitle: undefined, chapterNumber: undefined };
    const merged = mergeChapterProgressHighWater(titled, bare);
    expect(merged.chapterTitle).toBe("Prologue");
    expect(merged.chapterNumber).toBe(1);
    expect(merged.progress).toBe(0);
  });

  test("reading after the reset merges by high-water mark", () => {
    const afterOnResetDevice = { ...RESET, progress: 3, total: 20, lastReadAt: 2_100, updatedAt: 2_100 };
    const afterElsewhere = row({ progress: 5, lastReadAt: 2_200, updatedAt: 2_200, resetAt: 2_000 });
    const merged = mergeChapterProgressHighWater(afterOnResetDevice, afterElsewhere);
    expect(reading(merged)).toEqual({
      progress: 5,
      total: 20,
      completed: false,
      lastReadAt: 2_200,
      resetAt: 2_000,
      intraPageProgress: undefined,
    });
    expect(merged.updatedAt).toBe(2_200);
  });

  test("an old client's echo of the reset clock cannot resurrect", () => {
    // An old client merges the cloud reset by high-water mark (it drops the
    // unknown field) and pushes back its pages with the reset row's clock.
    const echo = row({ progress: 19, completed: true, lastReadAt: 900, updatedAt: 2_000 });
    const merged = mergeChapterProgressHighWater(RESET, echo);
    expect(reading(merged)).toEqual(reading(RESET));
    expect(chapterProgressReadingSurvivesMerge(RESET, echo)).toBe(false);
    // Anything older is dropped the same way.
    expect(chapterProgressReadingSurvivesMerge(RESET, READ)).toBe(false);
  });

  test("an old client writing after the reset counts (the residual window)", () => {
    const reread = row({ progress: 19, completed: true, lastReadAt: 2_500, updatedAt: 2_500 });
    expect(chapterProgressReadingSurvivesMerge(RESET, reread)).toBe(true);
    expect(mergeChapterProgressHighWater(RESET, reread)).toMatchObject({
      progress: 19,
      completed: true,
      resetAt: 2_000,
    });
  });

  test("the newer of two resets wins", () => {
    const older = chapterProgressMarkedUnread(READ, 2_000);
    const readBetween = { ...older, progress: 6, lastReadAt: 2_500, updatedAt: 2_500 };
    const newer = chapterProgressMarkedUnread(READ, 3_000);
    for (const [left, right] of [
      [readBetween, newer],
      [newer, readBetween],
    ]) {
      expect(reading(mergeChapterProgressHighWater(left, right))).toEqual({
        progress: 0,
        total: 0,
        completed: false,
        lastReadAt: 0,
        resetAt: 3_000,
        intraPageProgress: undefined,
      });
    }
  });

  test("concurrent devices converge whatever order the server sees them", () => {
    const history = [
      READ,
      row({ progress: 12, lastReadAt: 1_800, updatedAt: 1_800 }),
      // An old client's echo of the reset clock.
      row({ progress: 19, completed: true, lastReadAt: 900, updatedAt: 2_000 }),
      RESET,
      row({ progress: 2, total: 20, lastReadAt: 2_300, updatedAt: 2_300, resetAt: 2_000 }),
      row({ progress: 4, total: 20, lastReadAt: 2_200, updatedAt: 2_400, resetAt: 2_000 }),
    ];
    const outcomes = new Set(
      permutations(history).map((order) => JSON.stringify(reading(fold(order)))),
    );
    expect([...outcomes]).toEqual([
      JSON.stringify(
        reading({
          progress: 4,
          total: 20,
          completed: false,
          lastReadAt: 2_300,
          resetAt: 2_000,
          updatedAt: 2_400,
        }),
      ),
    ]);
  });

  test("merging is idempotent", () => {
    for (const record of [READ, RESET, { ...RESET, progress: 3, updatedAt: 2_100 }]) {
      const once = mergeChapterProgressHighWater(undefined, record);
      expect(mergeChapterProgressHighWater(once, record)).toEqual(once);
      expect(mergeChapterProgressHighWater(once, once)).toEqual(once);
    }
    const merged = mergeChapterProgressHighWater(READ, RESET);
    expect(mergeChapterProgressHighWater(merged, RESET)).toEqual(merged);
    expect(mergeChapterProgressHighWater(merged, READ)).toEqual(merged);
  });

  test("an invalid reset clock is ignored", () => {
    const poisoned = { ...RESET, resetAt: Number.MAX_SAFE_INTEGER };
    const merged = mergeChapterProgressHighWater(READ, poisoned);
    expect(merged.resetAt).toBeUndefined();
    expect(merged.completed).toBe(true);
    expect(mergeChapterProgressHighWater(undefined, { ...READ, resetAt: -1 }).resetAt).toBeUndefined();
  });

  test("a reset is never newer than the record carrying it", () => {
    const skewed = { ...RESET, updatedAt: 1_000 };
    expect(mergeChapterProgressHighWater(undefined, skewed).updatedAt).toBe(2_000);
  });
});

describe("local chapter saves and the reset", () => {
  test("the reset record is strictly newer than the stored row", () => {
    const future = row({ ...READ, updatedAt: Date.now() + 60_000 });
    const reset = chapterProgressMarkedUnread({
      ...future,
      intraPageProgress: 0.5,
      intraPageContentIdentity: IDENTITY,
    });
    expect(reset.resetAt).toBe(future.updatedAt + 1);
    expect(reset.updatedAt).toBe(reset.resetAt!);
    expect(reset.intraPageProgress).toBeUndefined();
    expect(chapterProgressHasReading(reset)).toBe(false);
    expect(mergeChapterProgressForSave(future, reset)).toMatchObject({
      progress: 0,
      completed: false,
      resetAt: reset.resetAt,
    });
  });

  test("a reader save without the field keeps the reset", () => {
    const stored = mergeChapterProgressForSave(READ, RESET);
    const readerSave = row({ progress: 2, lastReadAt: 2_500, updatedAt: 2_500 });
    const merged = mergeChapterProgressForSave(stored, readerSave);
    expect(merged).toMatchObject({ progress: 2, completed: false, resetAt: 2_000, updatedAt: 2_500 });
  });

  test("a cloud reset reaches a device that still holds the pages", () => {
    const result = mergeChapterProgressSnapshot([READ], [RESET]);
    expect(result.progress).toEqual([
      { ...RESET, libraryItemId: undefined },
    ]);
    expect(result.changed).toHaveLength(1);
    expect(result.localWinners).toEqual([]);
  });

  test("a stale cloud row does not undo a local reset", () => {
    const result = mergeChapterProgressSnapshot([RESET], [READ]);
    expect(result.progress[0]).toMatchObject({ progress: 0, completed: false, resetAt: 2_000 });
    // The server has not stored the reset yet.
    expect(result.localWinners).toHaveLength(1);
  });
});

describe("reset sync protocol", () => {
  test("the backend version opts clients in", () => {
    expect(CHAPTER_PROGRESS_SYNC_VERSION).toBe(2);
    expect(supportsChapterProgressResetSync(CHAPTER_PROGRESS_SYNC_VERSION)).toBe(true);
    // Older clients read the same field as the intra-page capability.
    expect(supportsChapterProgressIntraPageSync(CHAPTER_PROGRESS_SYNC_VERSION)).toBe(true);
    for (const version of [undefined, 1, 1.5, "2", Number.NaN]) {
      expect(supportsChapterProgressResetSync(version)).toBe(false);
    }
  });

  test("the field is sent only to a backend that accepts it", () => {
    expect("resetAt" in toCloudHistorySaveInput(RESET)).toBe(false);
    expect(toCloudHistorySaveInput(RESET, { includeResetState: true }).resetAt).toBe(2_000);
    expect(
      "resetAt" in
        toCloudHistorySaveInput(
          { ...RESET, resetAt: Date.now() + MAX_SYNC_CLOCK_FUTURE_SKEW_MS * 2 },
          { includeResetState: true },
        ),
    ).toBe(false);
  });

  test("cloud rows carry the field into local rows", () => {
    const [mapped] = mapCloudChapterProgress([RESET]);
    expect(mapped.resetAt).toBe(2_000);
    const [legacy] = mapCloudChapterProgress([READ]);
    expect("resetAt" in legacy).toBe(false);
  });

  test("an unstored reset is pushed until the server echoes it", () => {
    const cloudWithoutReset = row({ ...READ, updatedAt: 2_000 });
    expect(chapterProgressNeedsPush(RESET, cloudWithoutReset)).toBe(true);
    expect(chapterProgressNeedsPush(RESET, RESET)).toBe(false);
    expect(chapterProgressNeedsPush(RESET, chapterProgressMarkedUnread(READ, 1_500))).toBe(true);
  });

  test("a backend without the protocol is not pushed a reset forever", () => {
    // What an old backend stores after a reset push: the high-water pages
    // with the reset's clock.
    const oldBackendRow = row({ ...READ, updatedAt: 2_000 });
    expect(chapterProgressNeedsPush(RESET, oldBackendRow, { resetState: false })).toBe(false);
    const fresh = row({ sourceChapterId: "other", progress: 3, updatedAt: 3_000 });
    expect(
      chapterProgressWinnersForPush([RESET, fresh], [oldBackendRow], { resetState: false }),
    ).toEqual([fresh]);
    expect(
      chapterProgressWinnersForPush([RESET, fresh], [oldBackendRow], { resetState: true }),
    ).toEqual([RESET, fresh]);
  });
});

describe("the work's summary after Mark as Unread", () => {
  const summary: LocalMangaProgress = {
    id: "registry:source:manga",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    libraryItemId: "item",
    lastReadAt: 900,
    lastReadSourceChapterId: "c3",
    lastReadChapterNumber: 3,
    updatedAt: 1_000,
  };
  const c1 = row({ sourceChapterId: "c1", completed: true, chapterNumber: 1, lastReadAt: 500, updatedAt: 500 });
  const c2 = row({ sourceChapterId: "c2", progress: 4, chapterNumber: 2, lastReadAt: 700, updatedAt: 700 });
  const c3Reset = chapterProgressMarkedUnread(row({ sourceChapterId: "c3" }), 2_000);

  test("moves back to the newest chapter still read", () => {
    expect(
      mangaProgressAfterChapterReset(summary, [c1, c2, c3Reset], new Set(["c3"]), 2_000),
    ).toMatchObject({
      lastReadAt: 700,
      lastReadSourceChapterId: "c2",
      lastReadChapterNumber: 2,
      libraryItemId: "item",
      updatedAt: 2_000,
    });
  });

  test("is cleared when nothing is read any more", () => {
    const cleared = mangaProgressAfterChapterReset(
      summary,
      [chapterProgressMarkedUnread(c1, 2_000), chapterProgressMarkedUnread(c2, 2_000), c3Reset],
      new Set(["c1", "c2", "c3"]),
      2_000,
    );
    expect(cleared).toEqual({
      id: summary.id,
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      libraryItemId: "item",
      lastReadAt: 0,
      updatedAt: 2_000,
    });
  });

  test("stays when it is on a chapter that is still read", () => {
    expect(
      mangaProgressAfterChapterReset(summary, [c1, c2], new Set(["c1"]), 2_000),
    ).toBeNull();
    expect(mangaProgressAfterChapterReset(null, [c1], new Set(["c1"]), 2_000)).toBeNull();
  });

  test("picks one chapter deterministically on equal read events", () => {
    const a = row({ sourceChapterId: "a", progress: 1, lastReadAt: 700, updatedAt: 700 });
    const b = row({ sourceChapterId: "b", progress: 1, lastReadAt: 700, updatedAt: 700 });
    expect(latestChapterProgressReadEvent([a, b])?.sourceChapterId).toBe("b");
    expect(latestChapterProgressReadEvent([b, a])?.sourceChapterId).toBe("b");
    expect(latestChapterProgressReadEvent([c3Reset])).toBeUndefined();
  });
});
