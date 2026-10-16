import { describe, expect, test } from "bun:test";
import {
  READER_SETTINGS_POPOVER_WIDTH,
  READER_SETTINGS_SHEET_BAR,
  readerSettingsNativeContentHeight,
  readerSettingsNativeSheetEstimatedHeight,
  readerSettingsNativePresentation,
  readerSettingsPopoverAvailableHeight,
  readerNotebookSheetMaxHeight,
  readerSettingsSheetDetentCap,
} from "./readerSettingsNativePopoverLayout";

const full = {
  twoPageSupported: true,
  showPagePairingControls: true,
  scrolling: false,
  showPlugins: true,
  showMarkComplete: true,
  showNotebookPane: true,
};

describe("native reader settings presentation", () => {
  test("counts every row it shows", () => {
    const minimal = readerSettingsNativeContentHeight({
      twoPageSupported: false,
      showPagePairingControls: false,
      scrolling: false,
      showPlugins: false,
      showMarkComplete: false,
    });
    // Page layout (layout, pairing, footer) and page fit (fit, footer), two
    // more sections; Laptop Mode (header, choice, footer, a section); plugins
    // and mark complete rows.
    expect(readerSettingsNativeContentHeight(full) - minimal)
      .toBe(52 * 2 + 36 + 52 + 36 + 20 * 2 + (28 + 52 + 36 + 20) + 52 * 2);
    // No Orientation Lock row on an iPhone or the Duo outer display.
    expect(readerSettingsNativeContentHeight({ ...full, showOrientationLock: false }))
      .toBe(readerSettingsNativeContentHeight(full) - 52);
  });

  test("spoiler protection reserves one more row without changing other settings", () => {
    expect(readerSettingsNativeContentHeight({ ...full, showThumbnailSpoilers: true })
      - readerSettingsNativeContentHeight(full)).toBe(52);
  });

  test("Duo notebook: a 455pt pane cannot hold the Form, so it becomes a sheet", () => {
    const available = readerSettingsPopoverAvailableHeight({
      anchor: { y: 26, height: 44 },
      bounds: { height: 951 },
      safeInsets: { top: 82, bottom: 34 },
      panes: [{ height: 455.5 }, { height: 455.5 }],
    });
    expect(available).toBe(455.5 - 32);
    expect(readerSettingsNativePresentation(full, { availableHeight: available, regularWidth: true })).toEqual({ kind: "sheet" });
  });

  test("Duo flat landscape and book: the popover fits below the capsule row", () => {
    const available = readerSettingsPopoverAvailableHeight({
      anchor: { y: 26, height: 44 },
      bounds: { height: 669 },
      safeInsets: { top: 82, bottom: 34 },
    });
    expect(available).toBe(669 - 34 - 70 - 16);
    // The full Form (cover pairing, plugins, mark complete) is taller than the
    // space below the capsule row; a single-page Form without those rows
    // still fits.
    const lean = { ...full, showPagePairingControls: false, showNotebookPane: false, showPlugins: false, showMarkComplete: false };
    const presentation = readerSettingsNativePresentation(lean, { availableHeight: available, regularWidth: true });
    expect(presentation.kind).toBe("popover");
    expect(readerSettingsNativePresentation({ ...full, showNotebookPane: false }, { availableHeight: available, regularWidth: true }).kind).toBe("sheet");
    if (presentation.kind === "popover") {
      expect(presentation.width).toBe(READER_SETTINGS_POPOVER_WIDTH);
      expect(presentation.height).toBeLessThanOrEqual(available);
    }
  });

  test("never a popover taller than its space", () => {
    for (const available of [0, 200, 400, 600, Number.NaN]) {
      const presentation = readerSettingsNativePresentation({ ...full, scrolling: true }, { availableHeight: available, regularWidth: true });
      if (presentation.kind === "popover") expect(presentation.height).toBeLessThanOrEqual(available);
    }
  });

  test("compact width is always a sheet, even when the popover would fit", () => {
    // iPhone Duo closed (outer display 466×678): the settings button sits at
    // the bottom trailing corner with ~500pt above it — enough for the Form,
    // but a compact window presents it as a sheet.
    const duoClosed = readerSettingsPopoverAvailableHeight({
      anchor: { y: 600, height: 44 },
      bounds: { height: 678 },
      safeInsets: { top: 0, bottom: 34 },
    });
    const rows = { ...full, twoPageSupported: false, showNotebookPane: false, showOrientationLock: false };
    expect(readerSettingsNativeContentHeight(rows)).toBeLessThanOrEqual(duoClosed);
    expect(readerSettingsNativePresentation(rows, { availableHeight: duoClosed, regularWidth: false })).toEqual({
      kind: "sheet",
    });
    // iPhone 17 Pro portrait and landscape.
    for (const availableHeight of [760, 300, Number.POSITIVE_INFINITY]) {
      expect(readerSettingsNativePresentation(rows, { availableHeight, regularWidth: false })).toEqual({ kind: "sheet" });
    }
  });

  test("regular width keeps the popover when it fits", () => {
    const presentation = readerSettingsNativePresentation(
      { ...full, showNotebookPane: false },
      { availableHeight: 900, regularWidth: true },
    );
    expect(presentation.kind).toBe("popover");
  });
});

describe("compact-width reader settings sheet", () => {
  const phone = {
    twoPageSupported: false,
    showPagePairingControls: false,
    scrolling: false,
    showPlugins: true,
    showMarkComplete: true,
  };

  test("first-frame estimate is the rows under the title bar, well short of a full-height sheet", () => {
    const estimate = readerSettingsNativeSheetEstimatedHeight(phone);
    expect(estimate).toBe(readerSettingsNativeContentHeight(phone) + READER_SETTINGS_SHEET_BAR);
    // iPhone Air (912pt tall): the phone's rows need about half the screen.
    expect(estimate).toBeLessThan(912 * 0.6);
  });

  test("grows with the rows shown (scroll mode adds the page-width slider)", () => {
    expect(readerSettingsNativeSheetEstimatedHeight({ ...phone, scrolling: true })).toBeGreaterThan(
      readerSettingsNativeSheetEstimatedHeight(phone),
    );
  });
});

describe("settings sheet half folded like a laptop", () => {
  test("the cap keeps the sheet's top level with the bottom pane on the iPhone Duo", () => {
    // Inner display 951pt tall, fold 455.5–495.5, bottom inset 34, 8pt floating gutter.
    const max = readerNotebookSheetMaxHeight({ paneHeight: 455.5, bottomInset: 34 });
    expect(max).toBe(413);
    expect(951 - 34 - 8 - max).toBeGreaterThanOrEqual(495);
  });

  test("a Form that could reach past the fold gets exactly the cap; a short one keeps fitting", () => {
    const estimatedHeight = readerSettingsNativeSheetEstimatedHeight(full);
    expect(readerSettingsSheetDetentCap({ estimatedHeight, maxHeight: 413 })).toBe(413);
    expect(readerSettingsSheetDetentCap({ estimatedHeight: 200, maxHeight: 413 })).toBe(0);
    // Close to the cap: the estimate may be short of the measured Form.
    expect(readerSettingsSheetDetentCap({ estimatedHeight: 380, maxHeight: 413 })).toBe(413);
  });

  test("no fold, no cap", () => {
    expect(readerSettingsSheetDetentCap({ estimatedHeight: 900, maxHeight: null })).toBe(0);
    expect(readerSettingsSheetDetentCap({ estimatedHeight: 900, maxHeight: Number.NaN })).toBe(0);
    expect(readerNotebookSheetMaxHeight({ paneHeight: 20, bottomInset: 34 })).toBe(0);
  });
});
