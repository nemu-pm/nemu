import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import { getMobileStrings } from "./mobileI18n";
import { buildMobileReaderMoreMenu, type MobileReaderMoreMenuInput } from "./mobileReaderMoreMenu";

const strings = getMobileStrings("en");
const chapter = (id: string, chapterNumber: number): ChapterSummary => ({ id, chapterNumber });

function menu(overrides: Partial<MobileReaderMoreMenuInput> = {}) {
  return buildMobileReaderMoreMenu({
    strings,
    previousChapter: chapter("c11", 11),
    nextChapter: chapter("c13", 13),
    pagesStatus: "ready",
    pageCount: 20,
    completed: false,
    saving: false,
    showPlugins: true,
    ...overrides,
  });
}

const item = (sections: ReturnType<typeof menu>, id: string) =>
  sections.flatMap((section) => section.items).find((entry) => entry.id === id);

describe("reader ⋯ menu", () => {
  test("three native sections: chapters, this chapter, reader", () => {
    const sections = menu();
    expect(sections.map((section) => section.id)).toEqual(["chapters", "chapter", "reader"]);
    expect(sections.map((section) => section.items.map((entry) => entry.id))).toEqual([
      ["previous-chapter", "next-chapter"],
      ["reload-chapter", "mark-complete"],
      ["reader-settings", "reader-plugins"],
    ]);
    for (const entry of sections.flatMap((section) => section.items)) {
      expect(entry.systemImage.length).toBeGreaterThan(0);
      expect(entry.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  test("chapter items name the chapter they open and disable at either end", () => {
    const sections = menu({ nextChapter: null });
    const previous = item(sections, "previous-chapter")!;
    expect(previous.disabled).toBe(false);
    expect(previous.subtitle).toContain("11");
    expect(previous.accessibilityLabel).toContain("11");
    const next = item(sections, "next-chapter")!;
    expect(next.disabled).toBe(true);
    expect(next.subtitle).toBeUndefined();
    expect(next.accessibilityLabel).toBe(strings.reader.noNextChapter);
  });

  test("reload waits for an in-flight fetch; it stays available after an error", () => {
    expect(item(menu({ pagesStatus: "loading", pageCount: 0 }), "reload-chapter")!.disabled).toBe(true);
    expect(item(menu({ pagesStatus: "idle", pageCount: 0 }), "reload-chapter")!.disabled).toBe(true);
    expect(item(menu({ pagesStatus: "error", pageCount: 0 }), "reload-chapter")!.disabled).toBe(false);
    expect(item(menu(), "reload-chapter")!.disabled).toBe(false);
  });

  test("mark complete: only with pages, never twice, and says when it is done", () => {
    expect(item(menu(), "mark-complete")).toMatchObject({ title: strings.reader.markComplete, disabled: false });
    expect(item(menu({ pagesStatus: "error", pageCount: 0 }), "mark-complete")!.disabled).toBe(true);
    expect(item(menu({ saving: true }), "mark-complete")).toMatchObject({ title: strings.reader.savingProgress, disabled: true });
    expect(item(menu({ completed: true }), "mark-complete")).toMatchObject({
      title: strings.reader.markedComplete,
      systemImage: "checkmark.circle.fill",
      disabled: true,
    });
  });

  test("Plugins appears under the same condition as the settings sheet's row", () => {
    expect(item(menu({ showPlugins: false }), "reader-plugins")).toBeUndefined();
    expect(item(menu({ showPlugins: false }), "reader-settings")).toBeDefined();
  });

  test("every locale has the menu strings", () => {
    for (const language of ["en", "zh", "ja"] as const) {
      const localized = getMobileStrings(language).reader;
      for (const key of ["moreActions", "moreActionsHint", "reloadChapter", "readerSettingsMenu", "readerPluginsMenu"] as const) {
        expect(localized[key].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
