import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createMobileReaderScrollViewportStore,
  MOBILE_READER_PAGE_SPINNER_DELAY_MS,
  MOBILE_READER_PAGE_STATUS_COLOR_DARK,
  MOBILE_READER_PAGE_STATUS_COLOR_LIGHT,
  mobileReaderPageSpinnerCentre,
  mobileReaderPageStatusColor,
} from "./mobileReaderPageLoading";
import type { MobileReaderScrollLayout } from "./mobileReaderScrollLayout";

describe("page loading status colour", () => {
  test("grey on a light background, light grey on a dark one", () => {
    expect(mobileReaderPageStatusColor("#ffffff")).toBe(MOBILE_READER_PAGE_STATUS_COLOR_LIGHT);
    expect(mobileReaderPageStatusColor("#f0ead6")).toBe("#8e8e93");
    expect(mobileReaderPageStatusColor("#000000")).toBe(MOBILE_READER_PAGE_STATUS_COLOR_DARK);
    expect(mobileReaderPageStatusColor("#000000")).toBe("rgba(235,235,245,0.6)");
  });
  test("appears after 150ms", () => {
    expect(MOBILE_READER_PAGE_SPINNER_DELAY_MS).toBe(150);
  });
});

describe("scroll spinner placement", () => {
  const base = { contentOffset: 0, viewportHeight: 800, topPadding: 0 };
  test("a page wholly on screen: its centre", () => {
    expect(mobileReaderPageSpinnerCentre({ ...base, pageTop: 100, pageHeight: 400 })).toBe(200);
  });
  test("off screen: no spinner", () => {
    expect(mobileReaderPageSpinnerCentre({ ...base, pageTop: 900, pageHeight: 400 })).toBeNull();
    expect(mobileReaderPageSpinnerCentre({ ...base, contentOffset: 2000, pageTop: 100, pageHeight: 400 })).toBeNull();
    // Touching the edge exactly is not on screen.
    expect(mobileReaderPageSpinnerCentre({ ...base, pageTop: 800, pageHeight: 400 })).toBeNull();
  });
  test("taller than the screen: the middle of its part on screen (sticky)", () => {
    // Page 0..3000, screen shows 1000..1800 of it.
    expect(mobileReaderPageSpinnerCentre({ ...base, contentOffset: 1000, pageTop: 0, pageHeight: 3000 })).toBe(1400);
    // Its bottom 200pt on screen: the middle of those.
    expect(mobileReaderPageSpinnerCentre({ ...base, contentOffset: 2800, pageTop: 0, pageHeight: 3000 })).toBe(2900);
  });
  test("the top padding moves the page down on screen", () => {
    // Top at 100 + 50 padding on screen, bottom past the screen at 3150.
    expect(mobileReaderPageSpinnerCentre({ ...base, topPadding: 50, pageTop: 100, pageHeight: 3000 })).toBe(325);
  });
  test("a sliver on screen keeps the spinner inside the page", () => {
    expect(mobileReaderPageSpinnerCentre({ ...base, pageTop: 795, pageHeight: 400 })).toBe(10);
    expect(mobileReaderPageSpinnerCentre({ ...base, pageTop: 0, pageHeight: 8 })).toBe(4);
  });
});

describe("scroll viewport store", () => {
  const layout: MobileReaderScrollLayout = {
    heights: [1000, 1000, 1000, 1000],
    gaps: [0, 8, 8, 8],
    starts: [0, 1000, 2008, 3016],
    length: 4024,
  };
  test("only pages on screen get a spinner", () => {
    const store = createMobileReaderScrollViewportStore();
    store.setGeometry({ layout, segments: null, topPadding: 0, fallbackViewportHeight: 800 });
    const onScreen = () =>
      [0, 1, 2, 3].filter((index) => store.spinnerCentre({ kind: "page", index }) !== null);
    expect(onScreen()).toEqual([0]);
    store.setScroll(900, 800);
    expect(onScreen()).toEqual([0, 1]);
    // In the 8pt gap between pages 1 and 2 at the top.
    store.setScroll(2010, 800);
    expect(onScreen()).toEqual([2]);
    expect(store.spinnerCentre({ kind: "page", index: 9 })).toBeNull();
  });
  test("segments read their own frames", () => {
    const store = createMobileReaderScrollViewportStore(0);
    store.setGeometry({
      layout: null,
      segments: [{ offset: 0, height: 500 }, { offset: 500, height: 500 }],
      topPadding: 0,
      fallbackViewportHeight: 600,
    });
    expect(store.spinnerCentre({ kind: "segment", index: 0 })).toBe(250);
    expect(store.spinnerCentre({ kind: "segment", index: 1 })).toBe(50);
    expect(store.spinnerCentre({ kind: "page", index: 0 })).toBeNull();
  });
  test("notifies once per change", () => {
    const store = createMobileReaderScrollViewportStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.setScroll(10, 800);
    store.notify();
    store.notify();
    store.setScroll(10, 800);
    store.notify();
    expect(calls).toBe(1);
    unsubscribe();
  });
});

describe("unloaded pages (source)", () => {
  const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");
  test("no grey plate, no dark overlay, no loading text on a page", () => {
    const frame = read("../components/reader/MobileReaderPageFrame.tsx");
    expect(frame).not.toContain("rgba(0,0,0,0.58)");
    expect(frame).not.toContain("#1C1C1E");
    expect(frame).toContain("MobileReaderPageSpinner");
    // The label stays for VoiceOver, never as text on the page.
    expect(frame).toContain("accessibilityLabel={waiting ? strings.reader.pageImageLoading : undefined}");
    expect(frame).not.toMatch(/:\s*strings\.reader\.pageImageLoading\}/);
    const reader = read("../screens/ReaderScreen.tsx");
    expect(reader).not.toContain("MOBILE_READER_SCROLL_PLACEHOLDER_COLOR");
    expect(reader).not.toContain('galleryPagedMode ? readerPageBackground : "black"');
    const pane = read("../components/reader/ReaderBookSidePane.tsx");
    expect(pane).not.toContain("MOBILE_READER_SCROLL_PLACEHOLDER_COLOR");
  });
  test("the opening backdrop and the native curl use the setting", () => {
    const route = read("../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx");
    expect(route).not.toContain('backgroundColor: "#000000"');
    expect(route).toContain("mobileReaderPageBackgroundColor(pageBackground)");
    const module = read("../../modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    expect(module).toContain("view.pageBackground = color ?? .white");
  });
  test("the spinner is the native small ActivityIndicator", () => {
    const spinner = read("../components/reader/MobileReaderPageSpinner.tsx");
    expect(spinner).toContain('<ActivityIndicator color={color} size="small" />');
  });
});
