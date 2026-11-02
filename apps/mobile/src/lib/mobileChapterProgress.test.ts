import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_CHAPTER_PROGRESS_MAX_RATIO,
  formatMobileChapterProgressStatus,
  getMobileChapterProgressAccessory,
  getMobileChapterProgressTone,
} from "./mobileChapterProgress";
import { getMobileStrings } from "./mobileI18n";
import { buildMobileReaderProgressRecords } from "./mobileReaderProgressTarget";

describe("mobile chapter progress accessory", () => {
  test("shows completed state before page progress", () => {
    expect(
      getMobileChapterProgressAccessory({
        completed: true,
        progress: 0,
        total: 0,
      })
    ).toEqual({ status: "completed" });
  });

  test("shows locked state before unread progress", () => {
    expect(
      getMobileChapterProgressAccessory(
        {
          completed: false,
          progress: 0,
          total: 0,
        },
        { locked: true }
      )
    ).toEqual({ status: "locked" });

    expect(
      getMobileChapterProgressAccessory(
        {
          completed: true,
          progress: 8,
          total: 8,
        },
        { locked: true }
      )
    ).toEqual({ status: "completed" });
  });

  test("treats zero and invalid progress as unread", () => {
    expect(
      getMobileChapterProgressAccessory({
        completed: false,
        progress: 0,
        total: 12,
      })
    ).toEqual({ status: "unread" });
    expect(
      getMobileChapterProgressAccessory({
        completed: false,
        progress: 4,
        total: 0,
      })
    ).toEqual({ status: "unread" });
    expect(getMobileChapterProgressAccessory(undefined)).toEqual({ status: "unread" });
  });

  test("returns bounded progress state for in-progress chapters", () => {
    expect(
      getMobileChapterProgressAccessory({
        completed: false,
        progress: 3.8,
        total: 10.2,
      })
    ).toEqual({
      status: "progress",
      page: 4,
      total: 10,
      ratio: 0.4,
    });

    expect(
      getMobileChapterProgressAccessory({
        completed: false,
        progress: 12,
        total: 10,
      })
    ).toEqual({
      status: "progress",
      page: 10,
      total: 10,
      ratio: MOBILE_CHAPTER_PROGRESS_MAX_RATIO,
    });
  });

  test("formats status labels for row accessibility", () => {
    const strings = getMobileStrings("en");

    expect(
      formatMobileChapterProgressStatus({ status: "locked" }, strings)
    ).toBe("Locked chapter");
    expect(
      formatMobileChapterProgressStatus({ status: "completed" }, strings)
    ).toBe("Marked complete");
    expect(
      formatMobileChapterProgressStatus(
        { status: "progress", page: 3, total: 10, ratio: 0.3 },
        strings
      )
    ).toBe("Page 3 of 10");
    expect(formatMobileChapterProgressStatus({ status: "unread" }, strings)).toBeNull();
  });

  test("uses web-matching tones for chapter progress accessories", () => {
    expect(getMobileChapterProgressTone({ status: "completed" })).toBe("success");
    expect(
      getMobileChapterProgressTone({
        status: "progress",
        page: 3,
        total: 10,
        ratio: 0.3,
      }),
    ).toBe("primary");
    expect(getMobileChapterProgressTone({ status: "locked" })).toBe(
      "mutedForeground",
    );
    expect(getMobileChapterProgressTone({ status: "unread" })).toBe(
      "mutedForeground",
    );
  });
});

describe("chapter row page: where the reader opens", () => {
  const synced = (overrides: Record<string, unknown> = {}) => ({
    completed: false,
    progress: 109,
    total: 149,
    lastReadAt: 9_000,
    ...overrides,
  });
  const local = (overrides: Record<string, unknown> = {}) => ({
    sourceIndex: 40,
    fraction: 0.3,
    total: 149,
    savedAt: 10_000,
    progressAt: 9_000,
    ...overrides,
  });

  test("this device's spot: its page, and the bar from the same number", () => {
    // Chapter 632 on the Duo: resumes at p41, high-water p110 (a slider jump).
    expect(getMobileChapterProgressAccessory(synced(), { local: local() })).toEqual({
      status: "progress",
      page: 41,
      total: 149,
      ratio: 41 / 149,
    });
    const en = getMobileStrings("en");
    expect(
      formatMobileChapterProgressStatus(getMobileChapterProgressAccessory(synced(), { local: local() }), en),
    ).toBe("Page 41 of 149");
  });

  test("no local spot (or one read past elsewhere): the synced high-water page", () => {
    const highWater = { status: "progress" as const, page: 110, total: 149, ratio: 110 / 149 };
    expect(getMobileChapterProgressAccessory(synced())).toEqual(highWater);
    expect(getMobileChapterProgressAccessory(synced(), { local: null })).toEqual(highWater);
    expect(
      getMobileChapterProgressAccessory(synced({ lastReadAt: 60_000 }), { local: local() }),
    ).toEqual(highWater);
  });

  test("completed with a re-read spot: the re-read page", () => {
    expect(
      getMobileChapterProgressAccessory(synced({ completed: true, progress: 148 }), {
        local: local({ sourceIndex: 20, reread: true }),
      }),
    ).toEqual({ status: "progress", page: 21, total: 149, ratio: 21 / 149 });
  });

  test("the counter's page saved with the spot: the row and bar name it (restore keeps the anchor)", () => {
    // Anchor p40 (index 39), the counter showed p41 (index 40).
    const spot = local({ sourceIndex: 39, fraction: 0.62, counterSourceIndex: 40 });
    expect(getMobileChapterProgressAccessory(synced(), { local: spot })).toEqual({
      status: "progress",
      page: 41,
      total: 149,
      ratio: 41 / 149,
    });
    expect(
      formatMobileChapterProgressStatus(
        getMobileChapterProgressAccessory(synced(), { local: spot }),
        getMobileStrings("en"),
      ),
    ).toBe("Page 41 of 149");
    // Saved before the counter page was recorded: the anchor page.
    expect(getMobileChapterProgressAccessory(synced(), { local: local({ sourceIndex: 39 }) })).toEqual({
      status: "progress",
      page: 40,
      total: 149,
      ratio: 40 / 149,
    });
  });

  test("a re-read spot names the counter's page", () => {
    expect(
      getMobileChapterProgressAccessory(synced({ completed: true, progress: 148 }), {
        local: local({ sourceIndex: 19, reread: true, counterSourceIndex: 20 }),
      }),
    ).toEqual({ status: "progress", page: 21, total: 149, ratio: 21 / 149 });
  });

  test("completed without a re-read spot: completed (the reader opens at page 1)", () => {
    const completed = synced({ completed: true, progress: 148 });
    expect(getMobileChapterProgressAccessory(completed)).toEqual({ status: "completed" });
    // The spot left by finishing it, and a re-read spot on the last page.
    expect(
      getMobileChapterProgressAccessory(completed, { local: local({ sourceIndex: 140 }) }),
    ).toEqual({ status: "completed" });
    expect(
      getMobileChapterProgressAccessory(completed, { local: local({ sourceIndex: 148, reread: true }) }),
    ).toEqual({ status: "completed" });
  });
});

describe("an unfinished chapter on its last page never draws a full pie", () => {
  // The rows draw `ratio` as a pie that fills clockwise; a full one reads as
  // read. The reader leaves a chapter on its last page without completing it
  // whenever it did not page forward onto it, so these rows say "Page N of N"
  // yet must keep a visible open wedge.
  const open = (accessory: ReturnType<typeof getMobileChapterProgressAccessory>) => {
    expect(accessory.status).toBe("progress");
    if (accessory.status !== "progress") return;
    expect(accessory.page).toBe(accessory.total);
    expect(accessory.ratio).toBeLessThanOrEqual(0.9);
  };
  const lastPageWrite = (pageCount: number) =>
    buildMobileReaderProgressRecords({
      target: {
        chapterId: "ch-4",
        chapter: { chapterNumber: 4 },
        pageCount,
        savedProgress: null,
      },
      sourceRef: { registryId: "r", sourceId: "s", sourceMangaId: "m" },
      complete: false,
      displayIndex: pageCount - 1,
      mode: "rtl",
      updatedAt: 5_000,
    }).chapterProgress;

  test("opened at its end (Previous chapter, a scrubber jump, a resume): the synced page", () => {
    const written = lastPageWrite(20);
    expect(written).toMatchObject({ progress: 19, total: 20, completed: false });
    open(getMobileChapterProgressAccessory(written));
  });

  test("a two-page chapter left on page 2", () => {
    open(getMobileChapterProgressAccessory(lastPageWrite(2)));
  });

  test("this device's counter on the last page (scroll reading, the anchor a page above)", () => {
    open(
      getMobileChapterProgressAccessory(
        { completed: false, progress: 47, total: 49, lastReadAt: 9_000 },
        {
          local: {
            sourceIndex: 47,
            fraction: 0.8,
            counterSourceIndex: 48,
            total: 49,
            savedAt: 10_000,
            progressAt: 9_000,
          },
        },
      ),
    );
  });

  test("a re-read spot whose counter is on the last page", () => {
    open(
      getMobileChapterProgressAccessory(
        { completed: true, progress: 48, total: 49, lastReadAt: 9_000 },
        {
          local: {
            sourceIndex: 47,
            fraction: 0.8,
            counterSourceIndex: 48,
            total: 49,
            savedAt: 10_000,
            progressAt: 9_000,
            reread: true,
          },
        },
      ),
    );
  });

  test("short of the end the pie still follows the page", () => {
    expect(getMobileChapterProgressAccessory({ completed: false, progress: 4, total: 20 })).toEqual({
      status: "progress",
      page: 5,
      total: 20,
      ratio: 0.25,
    });
  });
});

describe("surfaces showing a chapter's page read it from the reader's choice", () => {
  const read = (relative: string) =>
    readFileSync(path.join(import.meta.dir, "..", "components", relative), "utf8");
  test.each([
    "explore/MobileExploreChapterRow.tsx",
    "MobileChapterCell.tsx",
  ])("%s passes this device's resume spot", (file) => {
    const source = read(file);
    expect(source).toContain("useMobileReaderResumePosition(");
    expect(source).toMatch(/getMobileChapterProgressAccessory\([^)]*local: localResume/);
  });
  test("the classic accessory takes the same spot", () => {
    expect(read("MobileChapterProgressAccessory.tsx")).toContain(
      "getMobileChapterProgressAccessory(progress, { locked, local })",
    );
  });
});
