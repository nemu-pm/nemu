import { describe, expect, test } from "bun:test";
import {
  createFittedSheetHostMetricsCache,
  FITTED_SHEET_SIDE_INSET,
  fittedSheetDetentForPage,
  fittedSheetGuessHostMetrics,
  fittedSheetMeasureFrame,
  fittedSheetPresentation,
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

describe("React Native pages in a fitted sheet", () => {
  const window = { width: 420, height: 912 };

  test("before a sheet presented: floating on glass (inset, scaled), else full width", () => {
    expect(fittedSheetGuessHostMetrics({ window, floating: true })).toEqual({ width: 404, scale: 404 / 420 });
    expect(fittedSheetGuessHostMetrics({ window, floating: false })).toEqual({ width: 420, scale: 1 });
  });

  test("a page h tall on a sheet drawn at scale s needs the detent h / s", () => {
    expect(fittedSheetDetentForPage(295.34, 404 / 420)).toBe(308);
    expect(fittedSheetDetentForPage(295.3, 1)).toBe(296);
    // A bogus scale never shrinks the page.
    expect(fittedSheetDetentForPage(100, 0)).toBe(100);
    expect(fittedSheetDetentForPage(100, 2)).toBe(100);
  });

  test("the host's placeholder frame (1×0 before layout) is not learned as the sheet width", () => {
    const cache = createFittedSheetHostMetricsCache();
    const guess = fittedSheetGuessHostMetrics({ window, floating: true });
    expect(cache.learn(window, { width: 1 }, guess)).toBe(true);
    expect(cache.get(window)?.width).toBe(404);
    // The real width, then the same again: one change.
    expect(cache.learn(window, { width: 390 }, guess)).toBe(true);
    expect(cache.learn(window, { width: 390 }, guess)).toBe(false);
    expect(cache.learn(window, { width: 0 }, guess)).toBe(false);
    expect(cache.get(window)).toEqual({ width: 390, scale: guess.scale });
    // Per window size: a rotation starts from the guess.
    expect(cache.get({ width: 912, height: 420 })).toBeUndefined();
  });

  test("where the sheet floats, its large detent (full width, unscaled) is not learned", () => {
    const cache = createFittedSheetHostMetricsCache();
    const guess = fittedSheetGuessHostMetrics({ window, floating: true });
    expect(cache.learn(window, { width: 420 }, guess)).toBe(true);
    expect(cache.learn(window, { scale: 1 }, guess)).toBe(false);
    expect(cache.get(window)).toEqual(guess);
    // A sheet that never floats (landscape, iPad) learns scale 1 and its width.
    const wide = { width: 912, height: 420 };
    const flat = fittedSheetGuessHostMetrics({ window: wide, floating: false });
    expect(cache.learn(wide, { width: 700, scale: 1 }, flat)).toBe(true);
    expect(cache.get(wide)).toEqual({ width: 700, scale: 1 });
  });

  test("presents only once the page on top is measured at the current width, then holds while re-measuring", () => {
    const closed = { presented: false, detent: 0 };
    const measured = { plugins: { width: 404, height: 295.3 } };
    expect(
      fittedSheetPresentation({ visible: true, page: "plugins", pageWidth: 404, measured: {}, scale: 1, current: closed }),
    ).toEqual(closed);
    // Measured at another width: still waiting.
    expect(
      fittedSheetPresentation({ visible: true, page: "plugins", pageWidth: 390, measured, scale: 1, current: closed }),
    ).toEqual(closed);
    const up = fittedSheetPresentation({ visible: true, page: "plugins", pageWidth: 404, measured, scale: 1, current: closed });
    expect(up).toEqual({ presented: true, detent: 296 });
    // Up, a page being re-measured keeps the last detent.
    expect(
      fittedSheetPresentation({ visible: true, page: "plugins", pageWidth: 390, measured, scale: 1, current: up }),
    ).toEqual(up);
    expect(
      fittedSheetPresentation({ visible: false, page: "plugins", pageWidth: 404, measured, scale: 1, current: up }),
    ).toEqual({ presented: false, detent: 296 });
  });
});
