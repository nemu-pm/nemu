import { describe, expect, test } from "bun:test";
import {
  formatChapterLabel,
  formatChapterShort,
  formatChapterShortLabel,
  formatChapterTitle,
  formatContinueActionLabel,
} from "./formatChapter";
import { getMobileStrings } from "./mobileI18n";

describe("mobile chapter formatting", () => {
  test("matches web chapter title templates in English", () => {
    const strings = getMobileStrings("en");

    expect(formatChapterTitle({ id: "c12", chapterNumber: 12 }, strings)).toBe(
      "Chapter 12",
    );
    expect(formatChapterTitle({ id: "v2", volumeNumber: 2 }, strings)).toBe(
      "Volume 2",
    );
    expect(
      formatChapterTitle(
        { id: "v2c12", volumeNumber: 2, chapterNumber: 12 },
        strings,
      ),
    ).toBe("Vol.2 Ch.12");
    expect(formatChapterTitle({ id: "missing" }, strings)).toBe("Untitled");
  });

  test("localizes chapter title templates", () => {
    const zh = getMobileStrings("zh");
    const ja = getMobileStrings("ja");

    expect(formatChapterTitle({ id: "c12", chapterNumber: 12 }, zh)).toBe(
      "第12章",
    );
    expect(
      formatChapterTitle({ id: "v2c12", volumeNumber: 2, chapterNumber: 12 }, zh),
    ).toBe("第2卷 第12章");
    expect(formatChapterTitle({ id: "missing" }, zh)).toBe("无标题");

    expect(formatChapterTitle({ id: "c12", chapterNumber: 12 }, ja)).toBe(
      "第12話",
    );
    expect(
      formatChapterTitle({ id: "v2c12", volumeNumber: 2, chapterNumber: 12 }, ja),
    ).toBe("2巻 12話");
    expect(formatChapterTitle({ id: "missing" }, ja)).toBe("無題");
  });

  test("matches web short chapter templates for compact cards", () => {
    const en = getMobileStrings("en");
    const ja = getMobileStrings("ja");

    expect(formatChapterShort({ id: "c12", chapterNumber: 12 }, en)).toBe(
      "Ch.12",
    );
    expect(
      formatChapterShort({ id: "v2c12", volumeNumber: 2, chapterNumber: 12 }, en),
    ).toBe("Vol.2 Ch.12");
    expect(formatChapterShort({ id: "c12", chapterNumber: 12 }, ja)).toBe(
      "12話",
    );
  });

  test("truncates source titles in short chapter labels", () => {
    expect(
      formatChapterShort(
        { id: "special", title: "A Very Long Side Story Title" },
        getMobileStrings("en"),
      ),
    ).toBe("A Very Long Side…");
  });

  test("keeps source titles when no chapter numbers exist", () => {
    expect(
      formatChapterTitle(
        { id: "special", title: "Side Story" },
        getMobileStrings("zh"),
      ),
    ).toBe("Side Story");
  });
});

describe("chapter label fallbacks", () => {
  test("a numbered chapter never reads Untitled", () => {
    const en = getMobileStrings("en");
    expect(formatChapterLabel({ id: "c", chapterNumber: 132 }, en)).toBe("Chapter 132");
    expect(formatChapterLabel({ id: "c", volumeNumber: 1 }, en)).toBe("Volume 1");
    expect(formatChapterLabel({ id: "c", title: "Prologue" }, en)).toBe("Prologue");
    expect(formatChapterShortLabel({ id: "c", volumeNumber: 25, chapterNumber: 123 }, en)).toBe(
      "Vol.25 Ch.123",
    );
  });

  test("an id-only chapter has no label", () => {
    const en = getMobileStrings("en");
    expect(formatChapterLabel({ id: "57356/424746" }, en)).toBeNull();
    expect(formatChapterLabel({ id: "c", title: "   " }, en)).toBeNull();
    expect(formatChapterShortLabel({ id: "c" }, en)).toBeNull();
  });

  test("continue action falls back to plain Continue in every language", () => {
    for (const [language, expected] of [
      ["en", "Continue"],
      ["ja", getMobileStrings("ja").mangaDetail.continueReading],
      ["zh", getMobileStrings("zh").mangaDetail.continueReading],
    ] as const) {
      const strings = getMobileStrings(language);
      const label = formatContinueActionLabel({
        chapter: { id: "57356/424746" },
        isContinuation: true,
        strings,
        labels: strings.mangaDetail,
      });
      expect(label).toBe(expected);
      expect(label).not.toContain(strings.chapter.untitled);
    }
  });

  test("continue action names the chapter when it can", () => {
    const en = getMobileStrings("en");
    expect(
      formatContinueActionLabel({
        chapter: { id: "c", chapterNumber: 8 },
        isContinuation: true,
        strings: en,
        labels: en.mangaDetail,
      }),
    ).toBe("Continue Chapter 8");
    expect(
      formatContinueActionLabel({
        chapter: { id: "c", chapterNumber: 1 },
        isContinuation: false,
        strings: en,
        labels: en.sourceManga,
      }),
    ).toBe(en.sourceManga.startReading);
  });
});
