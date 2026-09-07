import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime alpha helper; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { nemuColorWithAlpha } from "@/design/colorAlpha";
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
      successSoft: "rgba(32,164,100,0.09)",
      primary: "#3b6df6",
      primarySoft: "rgba(59,109,246,0.09)",
      warning: "#c2801a",
      warningSoft: "rgba(194,128,26,0.14)",
      sourceGlass: "#f8fafc",
      border: "#dbe3ef",
      mutedForeground: "#6b7280",
      foreground: "#111827",
    } as Parameters<typeof getMobileChapterRowPalette>[1];

    expect(getMobileChapterRowPalette("read", tokens)).toEqual({
      backgroundColor: tokens.successSoft,
      borderColor: nemuColorWithAlpha(tokens.success, 0.19),
      titleColor: tokens.mutedForeground,
    });
    expect(getMobileChapterRowPalette("progress", tokens)).toEqual({
      backgroundColor: tokens.primarySoft,
      borderColor: nemuColorWithAlpha(tokens.primary, 0.19),
      titleColor: tokens.foreground,
    });
    // Web tints new chapters amber, keeping the primary tint for the cell the
    // reader is actually in the middle of.
    expect(getMobileChapterRowPalette("new", tokens)).toEqual({
      backgroundColor: tokens.warningSoft,
      borderColor: nemuColorWithAlpha(tokens.warning, 0.19),
      titleColor: tokens.foreground,
    });
    // Unread cells are a plain surface on web - no accent, no marker.
    expect(getMobileChapterRowPalette("default", tokens)).toEqual({
      backgroundColor: tokens.sourceGlass,
      borderColor: tokens.border,
      titleColor: tokens.foreground,
    });
  });
});

// The components pull in react-native, which cannot load under the Bun test
// runner, so these are source-parity assertions in the style of the other
// mobile layout tests.
function readComponent(name: string): string {
  return readFileSync(path.join(import.meta.dir, "../components", name), "utf8");
}

describe("mobile chapter cell web parity", () => {
  const cell = readComponent("MobileChapterCell.tsx");
  const accessory = readComponent("MobileChapterProgressAccessory.tsx");

  test("unread chapters carry no marker", () => {
    // Web's `<ChapterProgress>` renders nothing for unread chapters and the
    // cell has no badge of its own.
    expect(cell).not.toContain("unreadDot");
    expect(cell).toContain("showChevron={false}");
  });

  test("read chapters keep the muted title instead of a washed-out cell", () => {
    // Web only recolors the title (`.chapter-cell-read .chapter-cell-title`);
    // the cell surface and the check glyph stay at full strength.
    expect(cell).toContain("opacity: chapterDisabled ? 0.72 : 1,");
    expect(cell).not.toContain("0.55");
    expect(cell).toContain("color: cellPalette.titleColor");
  });

  test("still announces the new and progress states", () => {
    expect(cell).toContain("chapterPresentation.isNew ? strings.common.new : null");
    expect(cell).toContain("progressLabel,");
  });

  test("trailing accessory mirrors the web check glyph and ring", () => {
    expect(accessory).toContain('name="checkmark-circle-outline"');
    expect(accessory).not.toContain('name="checkmark-circle"');
    // Label then ring, right-aligned, matching web's `flex items-center gap-2`.
    expect(accessory).toContain("{accessory.page}/{accessory.total}");
    expect(accessory).toContain('justifyContent: "flex-end"');
    expect(accessory).toContain("flexShrink: 0");
  });
});
