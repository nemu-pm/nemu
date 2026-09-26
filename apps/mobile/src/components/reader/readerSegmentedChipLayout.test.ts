import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileStrings } from "@/lib/mobileI18n";
import { readerSegmentedChipLabelLayout } from "./readerSegmentedChipLayout";

describe("reader segmented chip label layout", () => {
  test("Android labels span the chip instead of shrink-wrapping", () => {
    expect(readerSegmentedChipLabelLayout("android")).toEqual({
      alignSelf: "stretch",
      textAlign: "center",
    });
  });

  test("iOS and web keep the existing layout", () => {
    expect(readerSegmentedChipLabelLayout("ios")).toBeNull();
    expect(readerSegmentedChipLabelLayout("web")).toBeNull();
  });

  test("the chip row applies it to every label", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "ReaderSegmentedChipRow.tsx"),
      "utf8",
    );

    expect(source).toContain("readerSegmentedChipLabelLayout(Platform.OS)");
    expect(source).toContain("style={[styles.chipLabel, chipLabelLayout]}");
    expect(source).toContain("numberOfLines={1}");
  });

  test("every reading-mode label fits a third of the narrowest reader panel", () => {
    // 320dp phone - 2 x 12dp panel inset - 2 x 14dp padding - 2 x 8dp gaps,
    // split three ways, minus the chip's 2 x 8dp padding: ~68dp of label room.
    // At 13sp a CJK/kana glyph is ~13dp; a medium Latin glyph is < 9dp.
    const labelRoomDp = (320 - 24 - 28 - 16) / 3 - 16;
    for (const language of ["en", "zh", "ja"] as const) {
      const reader = getMobileStrings(language).reader;
      for (const label of [reader.rtl, reader.ltr, reader.scroll]) {
        const widestGuessDp = [...label].reduce(
          (width, glyph) => width + (glyph.codePointAt(0)! >= 0x2e80 ? 13 : 9),
          0,
        );
        expect({ language, label, fits: widestGuessDp <= labelRoomDp }).toEqual({
          language,
          label,
          fits: true,
        });
      }
    }
  });
});
