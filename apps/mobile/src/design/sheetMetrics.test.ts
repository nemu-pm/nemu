import { describe, expect, it } from "bun:test";
import { nemuFontWeight } from "./fontWeights";
import { nemuMaterialTypeScale, resolveNemuSheetMetrics } from "./sheetMetrics";

describe("resolveNemuSheetMetrics", () => {
  it("keeps the approved iOS numbers and adds no iOS text overrides", () => {
    const ios = resolveNemuSheetMetrics("ios");
    expect(ios.title).toEqual({ fontSize: 16, lineHeight: 20, fontWeight: nemuFontWeight.semibold });
    expect(ios.actionRowMinHeight).toBe(44);
    expect(ios.optionRowMinHeight).toBe(48);
    expect(ios.rowIconSize).toBe(20);
    expect(ios.rowIconGap).toBe(12);
    for (const key of [
      "bodyTitle",
      "description",
      "rowLabel",
      "anchorTitle",
      "anchorSubtitle",
      "footnote",
      "sectionTitle",
      "sectionCaption",
      "listRowLayout",
      "twoLineRowLayout",
      "twoLineRowTitle",
      "twoLineRowSupporting",
      "textFieldMinHeight",
      "textFieldText",
      "checkbox",
      "radio",
    ] as const) {
      expect(ios[key]).toBeNull();
    }
  });

  it("uses Material 3 list and type metrics on Android", () => {
    const android = resolveNemuSheetMetrics("android");
    expect(android.title).toEqual(nemuMaterialTypeScale.titleLarge);
    expect(android.title).toEqual({ fontSize: 22, lineHeight: 28, fontWeight: nemuFontWeight.medium });
    expect(android.actionRowMinHeight).toBeGreaterThanOrEqual(56);
    expect(android.optionRowMinHeight).toBeGreaterThanOrEqual(56);
    expect(android.rowIconSize).toBe(24);
    expect(android.rowLabel).toEqual({ fontSize: 16, lineHeight: 24, fontWeight: nemuFontWeight.regular });
    expect(android.description).toEqual({ fontSize: 14, lineHeight: 20, fontWeight: nemuFontWeight.regular });
  });

  it("gives Android Material list rows, section type and visible selection controls", () => {
    const android = resolveNemuSheetMetrics("android");
    expect(android.listRowLayout).toEqual({ minHeight: 56, gap: 16 });
    expect(android.twoLineRowLayout?.minHeight).toBe(72);
    expect(android.sectionTitle).toEqual(nemuMaterialTypeScale.titleMedium);
    expect(android.sectionCaption).toEqual(nemuMaterialTypeScale.bodyMedium);
    expect(android.textFieldMinHeight).toBe(56);
    // An unchecked control must draw a real outline, never a hairline.
    expect(android.checkbox?.borderWidth).toBe(2);
    expect(android.checkbox?.size).toBe(18);
    expect(android.radio?.borderWidth).toBe(2);
    expect(android.radio?.size).toBe(20);
    expect(android.radio?.dotSize).toBe(10);
  });

  it("treats every non-Android platform like iOS", () => {
    expect(resolveNemuSheetMetrics("web")).toEqual(resolveNemuSheetMetrics("ios"));
  });
});
