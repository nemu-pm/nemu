import { describe, expect, test } from "bun:test";
import {
  FITTED_SHEET_SIDE_INSET,
  fittedSheetMeasureFrame,
  READER_PLUGIN_SHEET_LIST_PAGE,
  readerPluginSheetActivePage,
  readerPluginSheetPage,
} from "./mobileFittedSheet";

describe("fitted sheet measuring copy", () => {
  test("lays out at the inset sheet's width and the window's height", () => {
    // iPhone Air: a 420pt window, a 404pt-wide sheet below its large detent
    // (measured on iOS 26 / 27 simulator frames: 8pt each side).
    expect(fittedSheetMeasureFrame({ width: 420, height: 912 })).toEqual({ width: 404, height: 912 });
    expect(FITTED_SHEET_SIDE_INSET).toBe(8);
  });

  test("rounds to whole points and never goes negative", () => {
    expect(fittedSheetMeasureFrame({ width: 402.6, height: 873.4 })).toEqual({ width: 387, height: 873 });
    expect(fittedSheetMeasureFrame({ width: 10, height: -1 })).toEqual({ width: 0, height: 0 });
  });
});

describe("reader plugin sheet pages", () => {
  test("the list and each plugin are distinct measured pages", () => {
    expect(readerPluginSheetActivePage(null)).toBe(READER_PLUGIN_SHEET_LIST_PAGE);
    expect(readerPluginSheetActivePage("japanese-learning")).toBe(readerPluginSheetPage("japanese-learning"));
    // A plugin whose id happens to be the list's page name stays its own page.
    expect(readerPluginSheetPage(READER_PLUGIN_SHEET_LIST_PAGE)).not.toBe(READER_PLUGIN_SHEET_LIST_PAGE);
  });
});
