import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import {
  READER_CHROME_PANEL_CONTENT_MIN_HEIGHT,
  READER_CHROME_PANEL_CORNER_RADIUS,
  READER_CHROME_PANEL_EDGE_GAP,
  READER_CHROME_PANEL_HORIZONTAL_INSET,
  READER_CHROME_PANEL_MIN_HEIGHT,
  READER_CHROME_PANEL_VERTICAL_PADDING,
  READER_CHROME_LOADING_OPACITY,
  READER_CHROME_POPOVER_GAP,
  getMobileReaderTitle,
  isReaderChromeLoading,
  readerChromePageCountLabel,
  readerChromeSettingsPopoverBottomOffset,
} from "./mobileReaderHeader";

function entry(title: string, overrideTitle?: string): LibraryEntry {
  return {
    item: {
      libraryItemId: "library-1",
      metadata: { title },
      inLibrary: true,
      overrides:
        overrideTitle === undefined
          ? undefined
          : { metadata: { title: overrideTitle } },
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [],
  };
}

describe("mobile reader header", () => {
  test("uses library metadata title", () => {
    expect(getMobileReaderTitle(entry("Frieren"), "source-id")).toBe("Frieren");
  });

  test("uses title overrides before base metadata", () => {
    expect(getMobileReaderTitle(entry("Base", "Override"), "source-id")).toBe(
      "Override",
    );
  });

  test("falls back to the route manga id when title is missing", () => {
    expect(getMobileReaderTitle(entry("   "), "fallback-id")).toBe(
      "fallback-id",
    );
    expect(getMobileReaderTitle(null, "fallback-id")).toBe("fallback-id");
  });

  test("uses source metadata title before the route manga id", () => {
    expect(
      getMobileReaderTitle(null, "/manga/example", "Saibai Cheat"),
    ).toBe("Saibai Cheat");
    expect(getMobileReaderTitle(entry("Library"), "/manga/example", "Source")).toBe(
      "Library",
    );
  });

  test("uses a friendly fallback before exposing the route manga id", () => {
    expect(
      getMobileReaderTitle(null, "opaque-manga-id", null, " Manga "),
    ).toBe("Manga");
  });

  test("ignores cached and source titles that only repeat the opaque id", () => {
    expect(
      getMobileReaderTitle(
        entry("opaque-manga-id"),
        "opaque-manga-id",
        "opaque-manga-id",
        "Manga",
      ),
    ).toBe("Manga");
  });
});

describe("reader chrome geometry", () => {
  test("both chrome panels resolve to one shared height", () => {
    // The top panel's two-line title block is 34pt; the bottom scrubber row
    // needs the 48pt Android slider touch target. The taller requirement wins
    // for both panels so the surfaces stay visually identical.
    const topContentHeight = 18 + 2 + 14;
    expect(topContentHeight).toBeLessThanOrEqual(
      READER_CHROME_PANEL_CONTENT_MIN_HEIGHT,
    );
    expect(READER_CHROME_PANEL_CONTENT_MIN_HEIGHT).toBe(48);
    expect(READER_CHROME_PANEL_MIN_HEIGHT).toBe(
      READER_CHROME_PANEL_CONTENT_MIN_HEIGHT +
        READER_CHROME_PANEL_VERTICAL_PADDING * 2,
    );
    expect(READER_CHROME_PANEL_MIN_HEIGHT).toBe(60);
  });

  test("pins the shared inset and corner radius", () => {
    expect(READER_CHROME_PANEL_HORIZONTAL_INSET).toBe(12);
    expect(READER_CHROME_PANEL_CORNER_RADIUS).toBe(22);
  });

  test("the settings popover clears the bottom chrome panel", () => {
    expect(readerChromeSettingsPopoverBottomOffset(34)).toBe(
      34 +
        READER_CHROME_PANEL_EDGE_GAP +
        READER_CHROME_PANEL_MIN_HEIGHT +
        READER_CHROME_POPOVER_GAP,
    );
    expect(readerChromeSettingsPopoverBottomOffset(0)).toBe(78);
  });

  test("treats a missing safe-area inset as zero", () => {
    expect(readerChromeSettingsPopoverBottomOffset(Number.NaN)).toBe(78);
    expect(readerChromeSettingsPopoverBottomOffset(-12)).toBe(78);
  });
});

describe("reader chrome loading state", () => {
  test("treats every non-ready page state as loading chrome", () => {
    expect(isReaderChromeLoading("loading")).toBe(true);
    expect(isReaderChromeLoading("error")).toBe(true);
    expect(isReaderChromeLoading("blocked")).toBe(true);
    expect(isReaderChromeLoading("ready")).toBe(false);
  });

  test("greys the chrome rather than hiding it", () => {
    expect(READER_CHROME_LOADING_OPACITY).toBeCloseTo(0.4);
  });

  test("hides the page counter until the page list resolves", () => {
    // No "— / —" placeholder: an unresolved chapter shows the ring spinner
    // alone, and the counter appears only once it can count something.
    expect(
      readerChromePageCountLabel({
        pagesStatus: "loading",
        pageNumber: 1,
        pageCount: 38,
      }),
    ).toBeNull();
    expect(
      readerChromePageCountLabel({
        pagesStatus: "error",
        pageNumber: 1,
        pageCount: 38,
      }),
    ).toBeNull();
    expect(
      readerChromePageCountLabel({
        pagesStatus: "ready",
        pageNumber: 0,
        pageCount: 0,
      }),
    ).toBeNull();
    expect(
      readerChromePageCountLabel({
        pagesStatus: "ready",
        pageNumber: 8,
        pageCount: 21,
      }),
    ).toBe("8 / 21");
  });
});
