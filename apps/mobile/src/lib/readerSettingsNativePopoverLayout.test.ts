import { describe, expect, test } from "bun:test";
import {
  READER_SETTINGS_POPOVER_WIDTH,
  readerSettingsNativeContentHeight,
  readerSettingsNativePresentation,
  readerSettingsPopoverAvailableHeight,
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
    // Two-page section (2 rows + spacing) + notebook, plugins, complete rows.
    expect(readerSettingsNativeContentHeight(full) - minimal).toBe(52 * 2 + 20 + 52 * 3);
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
    const presentation = readerSettingsNativePresentation({ ...full, showNotebookPane: false }, { availableHeight: available, regularWidth: true });
    expect(presentation.kind).toBe("popover");
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
    const rows = { ...full, showNotebookPane: false };
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
