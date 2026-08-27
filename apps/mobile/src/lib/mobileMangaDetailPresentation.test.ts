import { describe, expect, test } from "bun:test";
import type {
  ChapterSummary,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import {
  formatMobileMangaDetailChapterCount,
  getMobileMangaDetailContinueAction,
  getMobileMangaDetailEmptyChapterMessage,
  getMobileMangaDetailSourceTabBadge,
} from "./mobileMangaDetailPresentation";
import { getMobileStrings } from "./mobileI18n";

const en = getMobileStrings("en");
const zh = getMobileStrings("zh");

function sourceLink(overrides: Partial<LocalSourceLink> = {}): LocalSourceLink {
  return {
    id: "aidoku-community:en.example:blue-lock",
    libraryItemId: "item-1",
    registryId: "aidoku-community",
    sourceId: "en.example",
    sourceMangaId: "blue-lock",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function progress(chapterId: string | null): LocalMangaProgress | null {
  if (!chapterId) return null;
  return {
    id: "aidoku-community:en.example:blue-lock",
    registryId: "aidoku-community",
    sourceId: "en.example",
    sourceMangaId: "blue-lock",
    lastReadAt: 1,
    lastReadSourceChapterId: chapterId,
    lastReadChapterTitle: `Chapter ${chapterId}`,
    updatedAt: 1,
  };
}

const liveChapters: ChapterSummary[] = [
  { id: "c3", chapterNumber: 3 },
  { id: "c2", chapterNumber: 2 },
  { id: "c1", chapterNumber: 1 },
];

describe("mobile manga detail presentation", () => {
  test("formats selected source tab badges as web-style chapter counts", () => {
    expect(
      getMobileMangaDetailSourceTabBadge({
        source: sourceLink({
          latestChapter: { id: "c10", chapterNumber: 10 },
        }),
        chapterCount: 42,
        chapterCountIsLive: true,
        strings: en,
      }),
    ).toEqual({
      detail: "42 live chapters",
      text: "42",
      updated: false,
    });
  });

  test("falls back to latest chapter badges before chapter counts are known", () => {
    expect(
      getMobileMangaDetailSourceTabBadge({
        source: sourceLink({
          latestChapter: { id: "c10", chapterNumber: 10 },
        }),
        chapterCount: 0,
        chapterCountIsLive: false,
        strings: en,
      }),
    ).toEqual({
      detail: "Chapter 10",
      text: "Ch.10",
      updated: false,
    });
  });

  test("keeps latest chapter badges for selected sources before live counts load", () => {
    expect(
      getMobileMangaDetailSourceTabBadge({
        source: sourceLink({
          latestChapter: { id: "c10", chapterNumber: 10 },
        }),
        chapterCount: 1,
        chapterCountIsLive: false,
        strings: en,
      })?.text,
    ).toBe("Ch.10");
  });

  test("shows loaded unselected source chapter counts like the web selector", () => {
    expect(
      getMobileMangaDetailSourceTabBadge({
        source: sourceLink({
          latestChapter: { id: "c10", chapterNumber: 10 },
        }),
        chapterCount: 12,
        chapterCountIsLive: true,
        strings: en,
      }),
    ).toEqual({
      detail: "12 live chapters",
      text: "12",
      updated: false,
    });
  });

  test("keeps loaded zero chapter counts visible", () => {
    expect(
      getMobileMangaDetailSourceTabBadge({
        source: sourceLink({
          latestChapter: { id: "c10", chapterNumber: 10 },
        }),
        chapterCount: 0,
        chapterCountIsLive: true,
        strings: en,
      }),
    ).toEqual({
      detail: "0 live chapters",
      text: "0",
      updated: false,
    });
  });

  test("marks source tab badges as updated when latest exceeds acknowledgement", () => {
    expect(
      getMobileMangaDetailSourceTabBadge({
        source: sourceLink({
          latestChapter: { id: "c12", chapterNumber: 12 },
          updateAckChapter: { id: "c10", chapterNumber: 10 },
        }),
        chapterCount: 1,
        chapterCountIsLive: false,
        strings: en,
      })?.updated,
    ).toBe(true);
  });

  test("localizes source summary chapter count labels", () => {
    expect(formatMobileMangaDetailChapterCount(1, false, en)).toBe(
      "1 local chapter",
    );
    expect(formatMobileMangaDetailChapterCount(3, true, zh)).toBe(
      "3 个最新章节",
    );
  });

  test("shows the web-style no chapters message after a live source loads empty", () => {
    expect(
      getMobileMangaDetailEmptyChapterMessage({
        liveStatus: "ready",
        strings: en,
      }),
    ).toBe("No chapters");
  });

  test("keeps the refreshing detail visible while an empty chapter list is loading", () => {
    expect(
      getMobileMangaDetailEmptyChapterMessage({
        liveStatus: "loading",
        liveDetail: en.mangaDetail.refreshingSource,
        strings: en,
      }),
    ).toBe(en.mangaDetail.refreshingSource);
  });

  test("keeps the runtime requirement message for blocked empty chapter lists", () => {
    expect(
      getMobileMangaDetailEmptyChapterMessage({
        liveStatus: "blocked",
        strings: en,
      }),
    ).toBe(en.mangaDetail.nativeRuntimeRequired);
  });

  test("starts selected continue source from the oldest live chapter when progress is stale", () => {
    const source = sourceLink({ latestChapter: { id: "c3", chapterNumber: 3 } });

    expect(
      getMobileMangaDetailContinueAction({
        continueSource: source,
        selectedSource: source,
        selectedChapters: liveChapters,
        selectedChaptersLoaded: true,
        progress: progress("deleted"),
      }),
    ).toEqual({
      chapter: liveChapters[2],
      isContinuation: false,
    });
  });

  test("continues selected source progress when the live chapter still exists", () => {
    const source = sourceLink({ latestChapter: { id: "c3", chapterNumber: 3 } });

    expect(
      getMobileMangaDetailContinueAction({
        continueSource: source,
        selectedSource: source,
        selectedChapters: liveChapters,
        selectedChaptersLoaded: true,
        progress: progress("c2"),
      }),
    ).toEqual({
      chapter: liveChapters[1],
      isContinuation: true,
    });
  });

  test("does not fall back to stale latest metadata after the selected source loads empty chapters", () => {
    const source = sourceLink({ latestChapter: { id: "c3", chapterNumber: 3 } });

    expect(
      getMobileMangaDetailContinueAction({
        continueSource: source,
        selectedSource: source,
        selectedChapters: [],
        selectedChaptersLoaded: true,
        progress: progress("deleted"),
      }),
    ).toEqual({
      chapter: null,
      isContinuation: false,
    });
  });

  test("preserves non-selected source progress metadata until its chapters load", () => {
    const continueSource = sourceLink({
      id: "aidoku-community:en.example:blue-lock",
      latestChapter: { id: "c3", chapterNumber: 3 },
    });
    const selectedSource = sourceLink({
      id: "aidoku-community:en.other:blue-lock",
      sourceId: "en.other",
      latestChapter: { id: "o4", chapterNumber: 4 },
    });

    expect(
      getMobileMangaDetailContinueAction({
        continueSource,
        selectedSource,
        selectedChapters: liveChapters,
        progress: progress("c2"),
      }),
    ).toEqual({
      chapter: {
        id: "c2",
        title: "Chapter c2",
        chapterNumber: undefined,
        volumeNumber: undefined,
      },
      isContinuation: true,
    });
  });

  test("uses unselected continue source chapters when they have loaded", () => {
    const continueSource = sourceLink({
      id: "aidoku-community:en.example:blue-lock",
      latestChapter: { id: "stale-latest", chapterNumber: 99 },
    });
    const selectedSource = sourceLink({
      id: "aidoku-community:en.other:blue-lock",
      sourceId: "en.other",
      latestChapter: { id: "o4", chapterNumber: 4 },
    });

    expect(
      getMobileMangaDetailContinueAction({
        continueSource,
        selectedSource,
        selectedChapters: [],
        continueChapters: liveChapters,
        continueChaptersLoaded: true,
        progress: progress("deleted"),
      }),
    ).toEqual({
      chapter: liveChapters[2],
      isContinuation: false,
    });
  });

  test("continues unselected source progress when loaded chapters contain it", () => {
    const continueSource = sourceLink({
      id: "aidoku-community:en.example:blue-lock",
      latestChapter: { id: "c3", chapterNumber: 3 },
    });
    const selectedSource = sourceLink({
      id: "aidoku-community:en.other:blue-lock",
      sourceId: "en.other",
    });

    expect(
      getMobileMangaDetailContinueAction({
        continueSource,
        selectedSource,
        selectedChapters: [],
        continueChapters: liveChapters,
        continueChaptersLoaded: true,
        progress: progress("c2"),
      }),
    ).toEqual({
      chapter: liveChapters[1],
      isContinuation: true,
    });
  });
});
