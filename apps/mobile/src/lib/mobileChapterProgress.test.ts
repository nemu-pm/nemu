import { describe, expect, test } from "bun:test";
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
      page: 3,
      total: 10,
      ratio: 0.3,
    });

    expect(
      getMobileChapterProgressAccessory({
        completed: false,
        progress: 12,
        total: 10,
      })
    ).toEqual({
      status: "progress",
      page: 12,
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
