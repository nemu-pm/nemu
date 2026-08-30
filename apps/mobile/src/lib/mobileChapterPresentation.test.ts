import { describe, expect, test } from "bun:test";
import {
  getMobileChapterRowPalette,
  getMobileChapterPresentation,
  getMobileChapterVisualState,
  MOBILE_NEW_CHAPTER_WINDOW_MS,
} from "./mobileChapterPresentation";

describe("mobile chapter presentation", () => {
  const now = 1_700_000_000_000;

  test("marks unread locked chapters as locked", () => {
    expect(
      getMobileChapterPresentation(
        { id: "c1", locked: true },
        { completed: false, progress: 0 },
        now
      ).isLocked
    ).toBe(true);
  });

  test("lets completed locked chapters stay readable", () => {
    const presentation = getMobileChapterPresentation(
      { id: "c1", locked: true },
      { completed: true, progress: 12 },
      now
    );

    expect(presentation.isLocked).toBe(false);
    expect(presentation.isRead).toBe(true);
  });

  test("uses the web seven day window for new unread chapters", () => {
    expect(
      getMobileChapterPresentation(
        { id: "fresh", dateUploaded: now - MOBILE_NEW_CHAPTER_WINDOW_MS + 1 },
        null,
        now
      ).isNew
    ).toBe(true);
    expect(
      getMobileChapterPresentation(
        { id: "old", dateUploaded: now - MOBILE_NEW_CHAPTER_WINDOW_MS },
        null,
        now
      ).isNew
    ).toBe(false);
  });

  test("does not mark read chapters as new or in progress", () => {
    const presentation = getMobileChapterPresentation(
      { id: "c1", dateUploaded: now },
      { completed: true, progress: 8 },
      now
    );

    expect(presentation.isNew).toBe(false);
    expect(presentation.isInProgress).toBe(false);
  });

  test("prioritizes chapter visual states like the web chapter cell classes", () => {
    expect(
      getMobileChapterVisualState({
        isLocked: true,
        isRead: false,
        isNew: true,
        isInProgress: true,
      })
    ).toBe("locked");
    expect(
      getMobileChapterVisualState({
        isLocked: false,
        isRead: true,
        isNew: false,
        isInProgress: false,
      })
    ).toBe("read");
    expect(
      getMobileChapterVisualState({
        isLocked: false,
        isRead: false,
        isNew: true,
        isInProgress: true,
      })
    ).toBe("new");
    expect(
      getMobileChapterVisualState({
        isLocked: false,
        isRead: false,
        isNew: false,
        isInProgress: true,
      })
    ).toBe("progress");
  });

  test("maps completed and in-progress states to web-matching mobile row tones", () => {
    const tokens = {
      success: "#20a464",
      primary: "#3b6df6",
      sourceGlass: "#f8fafc",
      border: "#dbe3ef",
      mutedForeground: "#6b7280",
      foreground: "#111827",
    } as Parameters<typeof getMobileChapterRowPalette>[1];

    expect(getMobileChapterRowPalette("read", tokens)).toEqual({
      backgroundColor: `${tokens.success}16`,
      borderColor: `${tokens.success}30`,
      titleColor: tokens.mutedForeground,
    });
    expect(getMobileChapterRowPalette("progress", tokens)).toEqual({
      backgroundColor: `${tokens.primary}16`,
      borderColor: `${tokens.primary}30`,
      titleColor: tokens.foreground,
    });
  });
});
