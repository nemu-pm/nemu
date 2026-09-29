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
  readerCapsuleTitleLabels,
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

  test("is unknown (null) instead of exposing the route manga id", () => {
    expect(getMobileReaderTitle(entry("   "), "fallback-id")).toBeNull();
    expect(getMobileReaderTitle(null, "fallback-id")).toBeNull();
    expect(
      getMobileReaderTitle(entry("opaque-id"), "opaque-id", "opaque-id", "opaque-id"),
    ).toBeNull();
  });

  test("uses source metadata title before the route title", () => {
    expect(
      getMobileReaderTitle(null, "/manga/example", "Saibai Cheat", "Route"),
    ).toBe("Saibai Cheat");
    expect(getMobileReaderTitle(entry("Library"), "/manga/example", "Source")).toBe(
      "Library",
    );
  });

  test("falls back to the route title when the source title is unknown", () => {
    expect(
      getMobileReaderTitle(null, "hanako-57356", null, " 地縛少年 花子くん "),
    ).toBe("地縛少年 花子くん");
    expect(getMobileReaderTitle(null, "hanako-57356", "  ", "Route")).toBe(
      "Route",
    );
  });

  test("skips URL/path-like source titles", () => {
    expect(
      getMobileReaderTitle(null, "id", "https://example.com/manga/1", "Route"),
    ).toBe("Route");
  });
});

describe("reader capsule labels", () => {
  const base = {
    chapterTitle: "Chapter 1",
    pageCountLabel: "8 / 42",
    pagesPending: false,
    fetchingPagesLabel: "Fetching pages",
  };

  test("title over chapter · position when the manga title is known", () => {
    expect(readerCapsuleTitleLabels({ ...base, mangaTitle: "花子くん" })).toEqual({
      title: "花子くん",
      subtitle: "Chapter 1 · 8 / 42",
    });
    expect(
      readerCapsuleTitleLabels({ ...base, mangaTitle: "花子くん", pagesPending: true }),
    ).toEqual({ title: "花子くん", subtitle: "Chapter 1 · Fetching pages" });
  });

  test("leads with the chapter line while the title is unknown", () => {
    expect(readerCapsuleTitleLabels({ ...base, mangaTitle: null })).toEqual({
      title: "Chapter 1",
      subtitle: "8 / 42",
    });
    expect(
      readerCapsuleTitleLabels({
        ...base,
        mangaTitle: null,
        pageCountLabel: null,
      }),
    ).toEqual({ title: "Chapter 1", subtitle: "" });
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
