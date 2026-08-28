import { describe, expect, test } from "bun:test";
import {
  chapterProgressIntraPageState,
  chapterProgressNeedsPush,
  mapCloudChapterProgress,
  mergeChapterProgressForSave,
  toCloudHistorySaveInput,
  type LocalChapterProgress,
} from "./sync";

const IDENTITY_A = `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;
const IDENTITY_B = `mobile-image:reader-page-state-v1:${"b".repeat(64)}`;

function progress(
  overrides: Partial<LocalChapterProgress> = {},
): LocalChapterProgress {
  return {
    id: "registry:source:manga:chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: "chapter",
    progress: 0,
    total: 1,
    completed: false,
    lastReadAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe("content-bound chapter intra-page progress", () => {
  test("accepts only an exact finite pair", () => {
    expect(
      chapterProgressIntraPageState({
        intraPageProgress: 0.5,
        intraPageContentIdentity: IDENTITY_A,
      }),
    ).toEqual({
      intraPageProgress: 0.5,
      intraPageContentIdentity: IDENTITY_A,
    });

    for (const candidate of [
      { intraPageProgress: -0.01, intraPageContentIdentity: IDENTITY_A },
      { intraPageProgress: 1.01, intraPageContentIdentity: IDENTITY_A },
      { intraPageProgress: Number.NaN, intraPageContentIdentity: IDENTITY_A },
      { intraPageProgress: 0.5, intraPageContentIdentity: undefined },
      {
        intraPageProgress: 0.5,
        intraPageContentIdentity: IDENTITY_A.toUpperCase(),
      },
    ]) {
      expect(chapterProgressIntraPageState(candidate)).toBeUndefined();
    }
  });

  test("round-trips canonical state and strips malformed state", () => {
    const canonical = progress({
      intraPageProgress: 0.625,
      intraPageContentIdentity: IDENTITY_A,
    });
    expect(toCloudHistorySaveInput(canonical)).toMatchObject({
      intraPageProgress: 0.625,
      intraPageContentIdentity: IDENTITY_A,
    });
    expect(
      mapCloudChapterProgress([toCloudHistorySaveInput(canonical)])[0],
    ).toMatchObject({
      intraPageProgress: 0.625,
      intraPageContentIdentity: IDENTITY_A,
    });

    const malformed = progress({
      intraPageProgress: 0.625,
      intraPageContentIdentity: "not-a-content-digest",
    });
    expect(toCloudHistorySaveInput(malformed)).not.toHaveProperty(
      "intraPageProgress",
    );
    expect(mergeChapterProgressForSave(undefined, malformed)).not.toHaveProperty(
      "intraPageContentIdentity",
    );
    expect(
      toCloudHistorySaveInput(canonical, { includeIntraPageState: false }),
    ).not.toHaveProperty("intraPageProgress");
  });

  test("keeps the pair atomic under LWW ownership and compatibility backfill", () => {
    const older = progress({
      intraPageProgress: 0.25,
      intraPageContentIdentity: IDENTITY_A,
      updatedAt: 100,
    });
    const newer = progress({
      intraPageProgress: 0.75,
      intraPageContentIdentity: IDENTITY_B,
      updatedAt: 200,
    });
    expect(mergeChapterProgressForSave(older, newer)).toMatchObject({
      intraPageProgress: 0.75,
      intraPageContentIdentity: IDENTITY_B,
    });

    const newerMissingHalf = progress({
      intraPageProgress: 0.9,
      intraPageContentIdentity: undefined,
      updatedAt: 300,
    });
    expect(mergeChapterProgressForSave(older, newerMissingHalf)).toMatchObject({
      intraPageProgress: 0.25,
      intraPageContentIdentity: IDENTITY_A,
    });
    expect(
      chapterProgressNeedsPush(
        older,
        progress({
          intraPageProgress: undefined,
          intraPageContentIdentity: undefined,
        }),
      ),
    ).toBe(true);
  });
});
