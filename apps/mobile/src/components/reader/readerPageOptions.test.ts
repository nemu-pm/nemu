import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileStrings } from "@/lib/mobileI18n";
import { readerSpreadModeFootnote } from "./readerPageOptions";

describe("page layout footnote", () => {
  const en = getMobileStrings("en");

  test("Two Pages with no spread showing says why one page shows", () => {
    expect(readerSpreadModeFootnote("double", en, false)).toBe(
      "Showing one page for now because the screen is taller than it is wide.",
    );
    expect(readerSpreadModeFootnote("double", en, true)).toBe(en.reader.pageLayoutFootnoteDouble);
    // Without the flag: what the option does (a spread shows or is not known).
    expect(readerSpreadModeFootnote("double", en)).toBe(en.reader.pageLayoutFootnoteDouble);
  });

  test("never for Automatic or Single Page", () => {
    expect(readerSpreadModeFootnote("auto", en, false)).toBe(en.reader.pageLayoutFootnoteAuto);
    expect(readerSpreadModeFootnote("single", en, false)).toBe(en.reader.pageLayoutFootnoteSingle);
  });

  test("the copy in every language", () => {
    expect(getMobileStrings("zh").reader.pageLayoutFootnoteDoubleShowingSingle).toBe(
      "当前屏幕高度大于宽度，暂时单页显示。",
    );
    expect(getMobileStrings("ja").reader.pageLayoutFootnoteDoubleShowingSingle).toBe(
      "画面が横より縦に長いため、いまは1ページずつ表示しています。",
    );
  });

  test("both settings sheets pass whether a spread shows now", () => {
    for (const file of ["ReaderSettingsNativePopover.ios.tsx", "ReaderDisplaySettingsPopover.tsx"]) {
      const source = readFileSync(path.join(import.meta.dir, file), "utf8");
      expect(source).toContain("readerSpreadModeFootnote(spreadMode, strings, isTwoPageMode)");
    }
    const screen = readFileSync(path.join(import.meta.dir, "../../screens/ReaderScreen.tsx"), "utf8");
    // A spread showing right now (the pose's, the chapter's page count).
    expect(screen).toContain("const readerSettingsTwoPage = !bilingualOverrides && readerPoseWithoutSheet.spread && pageCount > 1;");
    expect(screen.match(/isTwoPageMode=\{readerSettingsTwoPage\}/g)?.length).toBe(2);
  });
});
