import { describe, expect, test } from "bun:test";
import {
  MOBILE_LIBRARY_OPTIONS_SHEET_METRICS as M,
  getMobileCloudSignOutNativeSheetHeight,
  getMobileLibraryOptionsFooterLines,
  getMobileLibraryOptionsNativeSheetHeight,
} from "./mobileLibraryOptionsSheetLayout";
import { mobileStringsEn } from "./mobileI18n.en";
import { mobileStringsJa } from "./mobileI18n.ja";

describe("getMobileLibraryOptionsFooterLines", () => {
  test("no footer, no lines", () => {
    expect(getMobileLibraryOptionsFooterLines("", 402)).toBe(0);
  });

  test("the two-action footer wraps past two lines on a phone and grows with Dynamic Type", () => {
    const text = mobileStringsEn.sourceManga.addOptionsDescription;
    const phone = getMobileLibraryOptionsFooterLines(text, 402);
    expect(phone).toBeGreaterThanOrEqual(3);
    expect(getMobileLibraryOptionsFooterLines(text, 402, 1.5)).toBeGreaterThan(phone);
    expect(getMobileLibraryOptionsFooterLines(text, 540)).toBeLessThanOrEqual(phone);
  });

  test("CJK text counts a full em a character", () => {
    const text = mobileStringsJa.sourceManga.addOptionsDescriptionAddOnly;
    expect(getMobileLibraryOptionsFooterLines(text, 402)).toBe(Math.ceil((Array.from(text).length * 13) / (402 - 72)));
  });
});

describe("getMobileLibraryOptionsNativeSheetHeight", () => {
  test("fits the chrome, rows, section gap and footer", () => {
    const height = getMobileLibraryOptionsNativeSheetHeight({ sections: [1, 1], footerLines: 2, maxHeight: 900 });
    expect(height).toBe(M.chrome + M.formTop + 2 * M.row + M.sectionGap + 2 * M.footerLine + M.footerPadding + M.bottom);
  });

  test("grows rows and footer with Dynamic Type", () => {
    const base = getMobileLibraryOptionsNativeSheetHeight({ sections: [2], footerLines: 2, maxHeight: 900 });
    const large = getMobileLibraryOptionsNativeSheetHeight({ sections: [2], footerLines: 2, fontScale: 1.5, maxHeight: 900 });
    expect(large).toBeGreaterThan(base);
  });

  test("never taller than the room it has, never shorter than 240", () => {
    expect(getMobileLibraryOptionsNativeSheetHeight({ sections: [2], footerLines: 2, fontScale: 3, maxHeight: 400 })).toBe(400);
    expect(getMobileLibraryOptionsNativeSheetHeight({ sections: [8], footerLines: 0, maxHeight: 100 })).toBe(240);
  });

  test("a tight form (rows under the bar) is shorter by the band it drops", () => {
    const loose = getMobileLibraryOptionsNativeSheetHeight({ sections: [1, 1], footerLines: 2, maxHeight: 900 });
    const tight = getMobileLibraryOptionsNativeSheetHeight({ sections: [1, 1], footerLines: 2, maxHeight: 900, tightTop: true });
    expect(loose - tight).toBe(50);
  });
});

describe("library options sheet without a home indicator", () => {
  test("an iPhone SE (no bottom inset) gets room under the footnote; a phone with one is unchanged", () => {
    const base = { sections: [2], footerLines: 2, maxHeight: 800, tightTop: true };
    const withIndicator = getMobileLibraryOptionsNativeSheetHeight({ ...base, bottomInset: 34 });
    const homeButton = getMobileLibraryOptionsNativeSheetHeight({ ...base, bottomInset: 0 });
    expect(homeButton - withIndicator).toBe(M.minBottomRoom - M.bottom);
    expect(getMobileLibraryOptionsNativeSheetHeight(base)).toBe(withIndicator);
  });
});

describe("getMobileCloudSignOutNativeSheetHeight", () => {
  const base = {
    question: "Choose what happens to your data on this device.",
    choiceDetails: ["You can sign back in anytime to sync again.", "Your cloud data will stay safe."],
    errorDetail: null,
    maxHeight: 900,
  };

  test("a narrow sheet (wrapped text) is taller than a wide one", () => {
    const wide = getMobileCloudSignOutNativeSheetHeight({ ...base, sheetWidth: 650 });
    const narrow = getMobileCloudSignOutNativeSheetHeight({ ...base, sheetWidth: 400 });
    expect(narrow).toBeGreaterThan(wide);
  });

  test("a failure adds its group; Dynamic Type grows the sheet", () => {
    const plain = getMobileCloudSignOutNativeSheetHeight({ ...base, sheetWidth: 650 });
    const failed = getMobileCloudSignOutNativeSheetHeight({ ...base, sheetWidth: 650, errorDetail: "The network connection was lost." });
    const large = getMobileCloudSignOutNativeSheetHeight({ ...base, sheetWidth: 650, fontScale: 1.4 });
    expect(failed - plain).toBeGreaterThan(2 * M.row);
    expect(large).toBeGreaterThan(plain);
  });

  test("a choice's secondary text counts at most two lines; capped by the room it has", () => {
    const long = getMobileCloudSignOutNativeSheetHeight({
      ...base,
      sheetWidth: 400,
      choiceDetails: ["x ".repeat(200), "y"],
    });
    const two = getMobileCloudSignOutNativeSheetHeight({
      ...base,
      sheetWidth: 400,
      choiceDetails: ["x ".repeat(40), "y"],
    });
    expect(long).toBe(two);
    expect(getMobileCloudSignOutNativeSheetHeight({ ...base, sheetWidth: 400, maxHeight: 260 })).toBe(260);
  });
});
