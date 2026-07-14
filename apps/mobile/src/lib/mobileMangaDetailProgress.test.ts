import { describe, expect, test } from "bun:test";
import {
  makeChapterProgressId,
  makeMangaProgressId,
  type InstalledSource,
  type LocalChapterProgress,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import {
  findMobileMangaProgressForSource,
  loadMobileChapterProgressForSourceChapter,
  loadMobileChapterProgressForSource,
} from "./mobileMangaDetailProgress";

function sourceLink(overrides: Partial<LocalSourceLink> = {}): LocalSourceLink {
  return {
    id: "aidoku-community:registry-id:blue-lock",
    libraryItemId: "book",
    registryId: "aidoku-community",
    sourceId: "registry-id",
    sourceMangaId: "blue-lock",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function installedSource(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:registry-id",
    registryId: "aidoku-community",
    sourceId: "manifest.id",
    version: 1,
    ...overrides,
  };
}

function mangaProgress(sourceId: string): LocalMangaProgress {
  return {
    id: makeMangaProgressId("aidoku-community", sourceId, "blue-lock"),
    registryId: "aidoku-community",
    sourceId,
    sourceMangaId: "blue-lock",
    libraryItemId: "book",
    lastReadAt: 100,
    lastReadSourceChapterId: "c2",
    updatedAt: 100,
  };
}

function chapterProgress(sourceId: string, chapterId: string): LocalChapterProgress {
  return {
    id: makeChapterProgressId("aidoku-community", sourceId, "blue-lock", chapterId),
    registryId: "aidoku-community",
    sourceId,
    sourceMangaId: "blue-lock",
    sourceChapterId: chapterId,
    libraryItemId: "book",
    progress: 4,
    total: 10,
    completed: false,
    lastReadAt: 100,
    updatedAt: 100,
  };
}

describe("mobile manga detail progress aliases", () => {
  test("finds manga progress saved under an installed source alias", () => {
    const source = sourceLink();
    const progress = mangaProgress("manifest.id");

    expect(
      findMobileMangaProgressForSource(
        source,
        [installedSource()],
        new Map([[progress.id, progress]]),
      ),
    ).toBe(progress);
  });

  test("loads chapter progress saved under an installed source alias", async () => {
    const observed: Array<{ registryId: string; sourceId: string; mangaId: string }> = [];
    const aliasProgress = chapterProgress("manifest.id", "c2");

    const result = await loadMobileChapterProgressForSource(
      {
        async getMangaChapterProgress(registryId, sourceId, mangaId) {
          observed.push({ registryId, sourceId, mangaId });
          const progress: Record<string, LocalChapterProgress> =
            sourceId === "manifest.id" ? { c2: aliasProgress } : {};
          return progress;
        },
      },
      sourceLink(),
      [installedSource()],
    );

    expect(result).toEqual({ c2: aliasProgress });
    expect(observed).toEqual([
      {
        registryId: "aidoku-community",
        sourceId: "registry-id",
        mangaId: "blue-lock",
      },
      {
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        mangaId: "blue-lock",
      },
    ]);
  });

  test("keeps direct chapter progress ahead of alias rows", async () => {
    const direct = chapterProgress("registry-id", "c2");
    const alias = chapterProgress("manifest.id", "c2");

    const result = await loadMobileChapterProgressForSource(
      {
        async getMangaChapterProgress(_registryId, sourceId) {
          const progress: Record<string, LocalChapterProgress> =
            sourceId === "registry-id"
              ? { c2: direct }
              : sourceId === "manifest.id"
                ? { c2: alias }
                : {};
          return progress;
        },
      },
      sourceLink(),
      [installedSource()],
    );

    expect(result.c2).toBe(direct);
  });

  test("loads a single chapter progress row across aliases", async () => {
    const aliasProgress = chapterProgress("manifest.id", "c2");

    const result = await loadMobileChapterProgressForSourceChapter(
      {
        async getMangaChapterProgress(_registryId, sourceId) {
          const progress: Record<string, LocalChapterProgress> =
            sourceId === "manifest.id"
              ? { c1: chapterProgress("manifest.id", "c1"), c2: aliasProgress }
              : {};
          return progress;
        },
      },
      sourceLink(),
      [installedSource()],
      "c2",
    );

    expect(result).toBe(aliasProgress);
  });
});
