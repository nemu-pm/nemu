import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  formatMobileChapterProgressStatus,
  getMobileChapterProgressAccessory,
  getMobileChapterProgressTone,
} from "./mobileChapterProgress";
import { getMobileStrings } from "./mobileI18n";

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
      ratio: 1,
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

describe("surfaces showing a chapter's page read it from the reader's choice", () => {
  const read = (relative: string) =>
    readFileSync(path.join(import.meta.dir, "..", "components", relative), "utf8");
  test.each([
    "explore/MobileExploreChapterRow.tsx",
    "explore/MobileContinueReadingCarousel.tsx",
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
