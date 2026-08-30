import { describe, expect, test } from "bun:test";
import type {
  ChapterSummary,
  LibraryEntry,
  LocalChapterProgress,
  LocalMangaProgress,
  LocalSourceLink,
  ReadingMode,
} from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  chapterDirectionLabel,
  chapterFromState,
  mergeMobileReaderChapterFallback,
  formatChapterAccessibilityLabel,
  formatReaderLoadedPages,
  formatReaderStageAccessibilityLabel,
  firstParam,
  mobileReaderSettingsActionStateFromAction,
  pluginValueText,
  readerSourceLinkReference,
} from "./mobileReaderFormat";
import type { ReaderSettingsAction, ReaderState } from "./mobileReaderTypes";

// Minimal strings fixture — only the `reader.*` keys the helpers under test
// touch. Cast through `unknown` so we don't have to materialize the full
// (large) MobileStrings shape for a unit test.
const strings = {
  reader: {
    stageAccessibility: "Page {{page}} — {{action}}",
    pageValue: "{{page}} / {{total}}",
    pageLoadedOne: "Loaded {{count}} page",
    pageLoadedOther: "Loaded {{count}} pages",
    previousChapter: "Previous",
    nextChapter: "Next",
    chapterAccessibility: "{{direction}}: {{chapter}}",
    pluginValueOn: "On",
    pluginValueOff: "Off",
    pluginValueSimpleJapanese: "Simple Japanese",
    pluginValueAppLanguage: "App language",
    pluginValueDefault: "Default",
  },
} as unknown as MobileStrings;

function makeState(overrides: Partial<ReaderState> = {}): ReaderState {
  return {
    entry: null,
    sourceLink: null,
    chapterProgress: null,
    mangaProgress: null,
    ...overrides,
  };
}

describe("firstParam", () => {
  test("returns the first element of an array", () => {
    expect(firstParam(["a", "b"])).toBe("a");
  });
  test("returns empty string for an empty array", () => {
    expect(firstParam([])).toBe("");
  });
  test("returns the value for a plain string", () => {
    expect(firstParam("x")).toBe("x");
  });
  test("returns empty string for undefined", () => {
    expect(firstParam(undefined)).toBe("");
  });
});

describe("mobileReaderSettingsActionStateFromAction", () => {
  test("all flags false for null", () => {
    const state = mobileReaderSettingsActionStateFromAction(null);
    expect(state.changingReadingMode).toBe(false);
    expect(state.changingScrollWidth).toBe(false);
    expect(state.changingTwoPageMode).toBe(false);
    expect(state.changingPagePairingMode).toBe(false);
    expect(state.changingPageImageProcessing).toBe(false);
  });

  test.each([
    ["reading-mode", "changingReadingMode"],
    ["scroll-width", "changingScrollWidth"],
    ["two-page-mode", "changingTwoPageMode"],
    ["page-pairing-mode", "changingPagePairingMode"],
    ["page-image-processing", "changingPageImageProcessing"],
  ] as [ReaderSettingsAction, keyof ReturnType<typeof mobileReaderSettingsActionStateFromAction>][])(
    "%s sets only its own flag",
    (action, flag) => {
      const state = mobileReaderSettingsActionStateFromAction(action);
      expect(state[flag]).toBe(true);
    },
  );
});

describe("readerSourceLinkReference", () => {
  test("builds a link with a stable id and zeroed timestamps", () => {
    const link = readerSourceLinkReference("reg", "src", "manga-1");
    expect(link.id).toBe("reg:src:manga-1");
    expect(link.libraryItemId).toBe("");
    expect(link.registryId).toBe("reg");
    expect(link.sourceId).toBe("src");
    expect(link.sourceMangaId).toBe("manga-1");
    expect(link.createdAt).toBe(0);
    expect(link.updatedAt).toBe(0);
  });
});

describe("chapterFromState", () => {
  const chapterProgress: LocalChapterProgress = {
    id: "reg:src:manga-1:c1",
    registryId: "reg",
    sourceId: "src",
    sourceMangaId: "manga-1",
    chapterId: "c1",
    chapterTitle: "Progress Title",
    chapterNumber: 5,
    volumeNumber: 2,
    lastReadAt: 1,
    completed: false,
    updatedAt: 1,
  } as unknown as LocalChapterProgress;

  test("uses chapter progress when present", () => {
    const chapter = chapterFromState("c1", makeState({ chapterProgress }));
    expect(chapter).toEqual({
      id: "c1",
      title: "Progress Title",
      chapterNumber: 5,
      volumeNumber: 2,
    });
  });

  test("uses source link latest chapter when it matches the id", () => {
    const latest: ChapterSummary = {
      id: "c2",
      title: "Latest",
      chapterNumber: 9,
    };
    const sourceLink = {
      latestChapter: latest,
    } as unknown as LocalSourceLink;
    expect(chapterFromState("c2", makeState({ sourceLink }))).toEqual(latest);
  });

  test("uses manga progress when its last-read chapter matches", () => {
    const mangaProgress = {
      lastReadSourceChapterId: "c3",
      lastReadChapterTitle: "Manga Title",
      lastReadChapterNumber: 7,
      lastReadVolumeNumber: 1,
    } as unknown as LocalMangaProgress;
    expect(chapterFromState("c3", makeState({ mangaProgress }))).toEqual({
      id: "c3",
      title: "Manga Title",
      chapterNumber: 7,
      volumeNumber: 1,
    });
  });

  test("keeps opaque chapter ids out of presentation data", () => {
    expect(chapterFromState("c4", makeState())).toEqual({
      id: "c4",
    });
  });

  test("uses friendly route metadata before exposing an opaque chapter id", () => {
    expect(
      chapterFromState("opaque-chapter-id", makeState(), {
        id: "opaque-chapter-id",
        title: " Chapter 9 ",
        chapterNumber: 9,
      }),
    ).toEqual({
      id: "opaque-chapter-id",
      title: "Chapter 9",
      chapterNumber: 9,
    });
  });

  test("replaces cached raw-id titles while preserving richer state", () => {
    const sourceLink = {
      latestChapter: {
        id: "opaque-chapter-id",
        title: "opaque-chapter-id",
        lang: "en",
      },
    } as unknown as LocalSourceLink;
    expect(
      chapterFromState("opaque-chapter-id", makeState({ sourceLink }), {
        id: "opaque-chapter-id",
        title: "The Beginning",
        chapterNumber: 1,
      }),
    ).toEqual({
      id: "opaque-chapter-id",
      title: "The Beginning",
      chapterNumber: 1,
      lang: "en",
    });
  });

  test("sanitizes refreshed source chapters with the same route fallback", () => {
    expect(
      mergeMobileReaderChapterFallback(
        "opaque-chapter-id",
        {
          id: "opaque-chapter-id",
          title: "opaque-chapter-id",
          chapterNumber: 32,
        },
        {
          id: "opaque-chapter-id",
          title: "The Beginning",
          volumeNumber: 7,
        },
      ),
    ).toEqual({
      id: "opaque-chapter-id",
      title: "The Beginning",
      chapterNumber: 32,
      volumeNumber: 7,
    });
  });
});

describe("formatReaderStageAccessibilityLabel", () => {
  test("returns the action unchanged when there are no pages", () => {
    expect(
      formatReaderStageAccessibilityLabel(0, 0, "manga" as ReadingMode, "Tap", strings),
    ).toBe("Tap");
  });

  test("interpolates the page value and action", () => {
    expect(
      formatReaderStageAccessibilityLabel(0, 10, "manga" as ReadingMode, "Open", strings),
    ).toBe("Page 1 / 10 — Open");
  });
});

describe("formatReaderLoadedPages", () => {
  test("uses the singular template for one page", () => {
    expect(formatReaderLoadedPages(1, strings)).toBe("Loaded 1 page");
  });
  test("uses the plural template otherwise", () => {
    expect(formatReaderLoadedPages(3, strings)).toBe("Loaded 3 pages");
  });
});

describe("chapterDirectionLabel", () => {
  test("previous", () => {
    expect(chapterDirectionLabel("previous", strings)).toBe("Previous");
  });
  test("next", () => {
    expect(chapterDirectionLabel("next", strings)).toBe("Next");
  });
});

describe("formatChapterAccessibilityLabel", () => {
  test("combines direction and chapter title", () => {
    const chapter: ChapterSummary = { id: "c1", title: "Vol.1 Ch.5" };
    expect(
      formatChapterAccessibilityLabel("next", chapter, strings),
    ).toBe("Next: Vol.1 Ch.5");
  });
});

describe("pluginValueText", () => {
  test("boolean true → On", () => {
    expect(pluginValueText(true, strings)).toBe("On");
  });
  test("boolean false → Off", () => {
    expect(pluginValueText(false, strings)).toBe("Off");
  });
  test("number → percent", () => {
    expect(pluginValueText(42, strings)).toBe("42%");
  });
  test('"jlpt" → Simple Japanese', () => {
    expect(pluginValueText("jlpt", strings)).toBe("Simple Japanese");
  });
  test('"app" → App language', () => {
    expect(pluginValueText("app", strings)).toBe("App language");
  });
  test("empty string → Default", () => {
    expect(pluginValueText("   ", strings)).toBe("Default");
  });
  test("non-empty string → itself", () => {
    expect(pluginValueText("custom", strings)).toBe("custom");
  });
  test("null/undefined → Default", () => {
    expect(pluginValueText(null, strings)).toBe("Default");
    expect(pluginValueText(undefined, strings)).toBe("Default");
  });
});

// Silence unused-import lint in the fixture helper surface.
void (null as unknown as LibraryEntry);
