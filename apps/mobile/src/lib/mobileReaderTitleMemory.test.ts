import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_READER_TITLE_RESIZE_MS,
  mobileReaderTitleContentKey,
  mobileReaderTitleLabelsFinal,
  mobileReaderTitleWidthChange,
  peekMobileReaderTitleLabels,
  rememberMobileReaderTitleLabels,
  resetMobileReaderTitleMemoryForTesting,
  resolveMobileReaderTitleCapsuleWidth,
  resolveMobileReaderTitleLabels,
  type MobileReaderTitleLabels,
} from "./mobileReaderTitleMemory";

const fetching: MobileReaderTitleLabels = {
  title: "Frieren",
  subtitle: "Ch.37 · Fetching pages",
  compact: false,
  pageCountLabel: null,
};
const settled: MobileReaderTitleLabels = {
  title: "Frieren",
  subtitle: "Ch.37 · 1 / 10",
  compact: false,
  pageCountLabel: "1 / 10",
};

beforeEach(() => resetMobileReaderTitleMemoryForTesting());

describe("reader title capsule: a reopen shows its final labels from the first frame", () => {
  test("remembered settled labels stand in until the reader's own are final", () => {
    rememberMobileReaderTitleLabels("ch37", settled);
    const remembered = peekMobileReaderTitleLabels("ch37");
    expect(resolveMobileReaderTitleLabels({ live: fetching, final: false, remembered })).toEqual({ labels: settled, seeded: true });
    // Final: its own (the same spot restored: the same labels, so no change).
    expect(resolveMobileReaderTitleLabels({ live: settled, final: true, remembered })).toEqual({ labels: settled, seeded: false });
    expect(mobileReaderTitleContentKey(settled)).toBe(mobileReaderTitleContentKey(remembered!));
  });

  test("a first open shows its own labels (Fetching pages)", () => {
    expect(resolveMobileReaderTitleLabels({ live: fetching, final: false, remembered: null })).toEqual({ labels: fetching, seeded: false });
  });

  test("final once pages are in and the spot is restored, or the chapter did not load", () => {
    expect(mobileReaderTitleLabelsFinal({ pagesStatus: "loading", pageCount: 0, restoreComplete: false })).toBe(false);
    expect(mobileReaderTitleLabelsFinal({ pagesStatus: "idle", pageCount: 0, restoreComplete: false })).toBe(false);
    expect(mobileReaderTitleLabelsFinal({ pagesStatus: "ready", pageCount: 10, restoreComplete: false })).toBe(false);
    expect(mobileReaderTitleLabelsFinal({ pagesStatus: "ready", pageCount: 10, restoreComplete: true })).toBe(true);
    expect(mobileReaderTitleLabelsFinal({ pagesStatus: "error", pageCount: 0, restoreComplete: false })).toBe(true);
  });

  test("the memory is per chapter and bounded", () => {
    for (let i = 0; i < 20; i += 1) rememberMobileReaderTitleLabels(`ch${i}`, { ...settled, subtitle: `Ch.${i} · 1 / 10` });
    expect(peekMobileReaderTitleLabels("ch0")).toBeNull();
    expect(peekMobileReaderTitleLabels("ch19")?.subtitle).toBe("Ch.19 · 1 / 10");
  });
});

describe("reader title capsule: a text change resizes around the centre, never in one frame", () => {
  test("loading → page count cross-fades; a page number moving on alone only resizes", () => {
    expect(mobileReaderTitleContentKey(fetching)).not.toBe(mobileReaderTitleContentKey(settled));
    const next = { ...settled, subtitle: "Ch.37 · 2 / 10", pageCountLabel: "2 / 10" };
    expect(mobileReaderTitleContentKey(next)).toBe(mobileReaderTitleContentKey(settled));
  });

  test("a shown capsule animates a new width; first, hidden, held or Reduce Motion set it at once", () => {
    expect(mobileReaderTitleWidthChange({ previous: 180, next: 150, visible: true, reduceMotion: false })).toBe("animate");
    expect(mobileReaderTitleWidthChange({ previous: null, next: 150, visible: true, reduceMotion: false })).toBe("set");
    expect(mobileReaderTitleWidthChange({ previous: 180, next: 150, visible: false, reduceMotion: false })).toBe("set");
    expect(mobileReaderTitleWidthChange({ previous: 180, next: 150, visible: true, reduceMotion: true })).toBe("set");
    expect(mobileReaderTitleWidthChange({ previous: 180, next: 180.2, visible: true, reduceMotion: false })).toBe("none");
    expect(MOBILE_READER_TITLE_RESIZE_MS).toBe(200);
  });

  test("the width is the content's natural width within the slot's range", () => {
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 160.3, minWidth: 120, maxWidth: 300 })).toBe(160.5);
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 60, minWidth: 120, maxWidth: 300 })).toBe(120);
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 500, minWidth: 120, maxWidth: 300 })).toBe(300);
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 0, minWidth: 120, maxWidth: 300 })).toBeNull();
  });

  test("the capsule's width is animated on the UI thread and its content cross-fades", () => {
    const source = readFileSync(path.join(import.meta.dir, "../components/reader/ReaderTitleCapsule.tsx"), "utf8");
    expect(source).toContain("withTiming(next, { duration: MOBILE_READER_TITLE_RESIZE_MS, easing: TITLE_EASING })");
    expect(source).toContain("Easing.bezier(...READER_CHROME_MATERIAL_CURVE)");
    expect(source).toContain("entering={crossFade && content.id > 0 ? TITLE_FADE_IN : undefined}");
    expect(source).toContain("exiting={crossFade ? TITLE_FADE_OUT : undefined}");
    const reader = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");
    expect(reader.match(/<ReaderTitleCapsule\b/g)?.length).toBe(2);
    expect(reader).toContain("const readerTitleCapsuleVisible = readerChromeShown && !readerOpeningChromeTransparent;");
  });
});
