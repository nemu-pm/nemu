import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearSyncServerTimeObservation,
  MAX_SYNC_CLOCK_FUTURE_SKEW_MS,
  observeSyncServerTime,
} from "./sync-clock";
import {
  mergeChapterProgressSnapshot,
  toCloudHistorySaveInput,
  toCloudLibrarySaveInput,
} from "./sync";

describe("outbound sync clock repair", () => {
  beforeEach(() => clearSyncServerTimeObservation());
  afterEach(() => clearSyncServerTimeObservation());

  test("repairs poisoned library, source-link, and history clocks before upload", () => {
    const serverNow = 1_700_000_000_000;
    const poisoned = serverNow + MAX_SYNC_CLOCK_FUTURE_SKEW_MS + 1;
    observeSyncServerTime(serverNow);

    const library = toCloudLibrarySaveInput(
      {
        libraryItemId: "library",
        metadata: { title: "Title" },
        inLibrary: true,
        createdAt: poisoned,
        updatedAt: poisoned,
      },
      [
        {
          id: "registry:source:manga",
          libraryItemId: "library",
          registryId: "registry",
          sourceId: "source",
          sourceMangaId: "manga",
          createdAt: poisoned,
          updatedAt: poisoned,
        },
      ],
    );
    expect(library.createdAt).toBe(0);
    expect(library.updatedAt).toBe(0);
    expect(library.sources[0]).toMatchObject({ createdAt: 0, updatedAt: 0 });

    const history = toCloudHistorySaveInput({
      id: "history",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      sourceChapterId: "chapter",
      progress: 1,
      total: 10,
      completed: false,
      lastReadAt: poisoned,
      updatedAt: poisoned,
    });
    expect(history).toMatchObject({ lastReadAt: 0, updatedAt: 0 });
  });

  test("durably surfaces local-only progress clock repairs", () => {
    const serverNow = 1_700_000_000_000;
    const poisoned = serverNow + MAX_SYNC_CLOCK_FUTURE_SKEW_MS + 1;
    observeSyncServerTime(serverNow);
    const local = {
      id: "history",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      sourceChapterId: "chapter",
      progress: 1,
      total: 10,
      completed: false,
      lastReadAt: poisoned,
      updatedAt: poisoned,
    };

    const result = mergeChapterProgressSnapshot([local], []);
    expect(result.progress[0]).toMatchObject({ lastReadAt: 0, updatedAt: 0 });
    expect(result.changed).toEqual(result.progress);
    expect(result.localWinners).toEqual(result.progress);
  });
});
