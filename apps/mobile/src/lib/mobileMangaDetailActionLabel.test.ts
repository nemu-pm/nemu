import { describe, expect, test } from "bun:test";
import { getMobileMangaDetailActionLabel as label } from "./mobileMangaDetailActionLabel";
const action = { label: "Continue Chapter 1", compactLabel: "Continue", fontScale: 1 };

describe("detail continuation label", () => {
  test("uses the measured button budget, including icon and padding", () => {
    expect(label({ ...action, buttonWidth: 130 })).toBe("Continue");
    expect(label({ ...action, buttonWidth: 191 })).toBe("Continue");
    expect(label({ ...action, buttonWidth: 192 })).toBe(action.label);
    expect(label({ ...action, buttonWidth: 320 })).toBe(action.label);
  });
  test("responds to font scale and the hero's maximum multiplier", () => {
    expect(label({ ...action, buttonWidth: 261, fontScale: 1.5 })).toBe("Continue");
    expect(label({ ...action, buttonWidth: 262, fontScale: 1.5 })).toBe(action.label);
    expect(label({ ...action, buttonWidth: 332, fontScale: 3 })).toBe(action.label);
  });
  test("leaves start reading and unmeasured buttons unchanged", () => {
    expect(label({ label: "Start reading", buttonWidth: 130, fontScale: 1 })).toBe("Start reading");
    expect(label({ ...action, buttonWidth: 0 })).toBe(action.label);
    expect(label({ ...action, buttonWidth: NaN })).toBe(action.label);
  });
  test("uses provided localized copy without modifying chapter or a11y text", () => {
    expect(label({ ...action, label: "第1話 から続ける", compactLabel: "続きを読む", buttonWidth: 130 })).toBe("続きを読む");
    expect(label({ ...action, label: "继续 第1话", compactLabel: "继续阅读", buttonWidth: 130 })).toBe("继续阅读");
  });
});

import {
  getMobileMangaDetailActionPresentation as present,
  getMobileMangaDetailActionTextBudget,
  getMobileMangaDetailPrimaryButtonWidth as buttonWidth,
} from "./mobileMangaDetailActionLabel";
import { getMobileDetailHeroCopyLayout, MOBILE_DETAIL_HERO_METRICS } from "./mobileMangaDetailTagLayout";
import { MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH as MAX } from "./mobileMangaDetailPresentation";

/** Natural 13pt semibold widths (Roboto / SF, rounded up). */
const widths: Record<string, number> = {
  "Start reading": 86,
  "Continue Chapter 12": 126,
  Continue: 58,
  "読み始める": 66,
  "第12話 から続ける": 112,
  "続きを読む": 66,
};

/** Mirror of the hero: in-copy geometry decides, as in MobileMangaDetailSurface. */
function heroPresentation(surfaceWidth: number, label: string, compactLabel: string | undefined, secondaryCount: number, minimumTouchTarget = 48) {
  const compact = surfaceWidth < MOBILE_DETAIL_HERO_METRICS.compactRowWidth;
  const copy = getMobileDetailHeroCopyLayout({
    surfaceWidth, fontScale: 1, compact, hasAuthors: true, hasTagRow: true, maxTitleLines: compact ? 4 : 3,
  });
  const copyButtonWidth = buttonWidth({ rowWidth: surfaceWidth - copy.coverWidth - (compact ? 12 : 14), secondaryCount, maxWidth: MAX, minimumTouchTarget });
  const belowButtonWidth = buttonWidth({ rowWidth: surfaceWidth, secondaryCount, maxWidth: MAX, fullRow: compact && secondaryCount > 1, minimumTouchTarget });
  const result = present({
    label, compactLabel, labelWidth: widths[label], compactLabelWidth: compactLabel ? widths[compactLabel] : undefined,
    requestedPlacement: "copy", copyButtonWidth, belowButtonWidth, wrap: false, fontScale: 1,
  });
  return { result, button: result.placement === "copy" ? copyButtonWidth : belowButtonWidth };
}

describe("detail primary action never truncates", () => {
  const cases: [string, string | undefined, number][] = [
    ["Start reading", undefined, 1],
    ["Continue Chapter 12", "Continue", 1],
    ["Continue Chapter 12", "Continue", 2],
    ["読み始める", undefined, 1],
    ["第12話 から続ける", "続きを読む", 1],
  ];
  test("hero widths 300–460 (narrow flat split pane → Duo book pane) always fit one line", () => {
    for (const target of [44, 48]) {
      for (let surface = 300; surface <= 460; surface += 4) {
        for (const [label, compactLabel, secondaryCount] of cases) {
          const { result, button } = heroPresentation(surface, label, compactLabel, secondaryCount, target);
          expect(result.lines).toBe(1);
          expect(widths[result.label] + 2).toBeLessThanOrEqual(getMobileMangaDetailActionTextBudget(button));
        }
      }
    }
  });
  test("icon actions reserve their touch-target width (Android 48dp)", () => {
    expect(buttonWidth({ rowWidth: 200, secondaryCount: 1, maxWidth: MAX })).toBe(200 - 46);
    expect(buttonWidth({ rowWidth: 200, secondaryCount: 1, maxWidth: MAX, minimumTouchTarget: 48 })).toBe(200 - 58);
    // Pixel Fold flat leading pane, measured: 274dp hero row, a "Continue" pill
    // of 98dp beside one 48dp icon — the short label no longer fits there.
    expect(heroPresentation(274, "Continue Chapter 12", "Continue", 1).result.placement).toBe("below");
  });
  test("prefers the full label in the copy column, then the short label there, then the row below", () => {
    // Wide Duo book pane: everything fits in the copy column.
    expect(heroPresentation(400, "Continue Chapter 12", "Continue", 1).result).toEqual({ placement: "copy", label: "Continue Chapter 12", lines: 1 });
    // Pixel Fold flat leading pane (~296pt row): the short label stays in the copy column.
    expect(heroPresentation(296, "Continue Chapter 12", "Continue", 1).result).toEqual({ placement: "copy", label: "Continue", lines: 1 });
    // "Start reading" has no short form: the row moves below the cover instead of "Start r…".
    expect(heroPresentation(296, "Start reading", undefined, 1).result).toEqual({ placement: "below", label: "Start reading", lines: 1 });
  });
  test("unmeasured labels keep the requested placement and the budget rule", () => {
    expect(present({
      label: "Continue Chapter 12", compactLabel: "Continue", requestedPlacement: "copy",
      copyButtonWidth: 150, belowButtonWidth: 300, wrap: false, fontScale: 1,
    })).toEqual({ placement: "copy", label: "Continue", lines: 1 });
  });
  test("large text wraps and never moves the row on its own", () => {
    expect(present({
      label: "Start reading", labelWidth: 170, requestedPlacement: "below",
      copyButtonWidth: 0, belowButtonWidth: 140, wrap: true, fontScale: 2,
    })).toEqual({ placement: "below", label: "Start reading", lines: undefined });
  });
  test("a width where nothing fits on one line wraps rather than truncating", () => {
    expect(present({
      label: "Start reading", labelWidth: 86, requestedPlacement: "copy",
      copyButtonWidth: 90, belowButtonWidth: 100, wrap: false, fontScale: 1,
    })).toEqual({ placement: "below", label: "Start reading", lines: undefined });
  });
});
