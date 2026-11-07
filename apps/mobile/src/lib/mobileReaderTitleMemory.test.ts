import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_READER_TITLE_RESIZE_MS,
  mobileReaderTitleContentKey,
  mobileReaderTitleLabelsFinal,
  mobileReaderTitleTransition,
  mobileReaderTitleWidthAt,
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

  test("one transition drives width and cross-fade; first, hidden or held set at once", () => {
    const t = (currentWidth: number | null, nextWidth: number, contentChanged: boolean, visible = true, reduceMotion = false) =>
      mobileReaderTitleTransition({ currentWidth, nextWidth, contentChanged, visible, reduceMotion });
    // Cold: "Fetching pages" → "1 / 10" while shown: width and fade together.
    expect(t(180, 150, true)).toEqual({ kind: "animate", fromWidth: 180, toWidth: 150, crossFade: true });
    // The same width, new text: still a cross-fade (no width step to take).
    expect(t(150, 150, true)).toEqual({ kind: "animate", fromWidth: 150, toWidth: 150, crossFade: true });
    // 9 / 10 → 10 / 10: a resize only (tabular digits: only a new digit count resizes).
    expect(t(150, 157, false)).toEqual({ kind: "animate", fromWidth: 150, toWidth: 157, crossFade: false });
    expect(t(150, 150.2, false)).toEqual({ kind: "none" });
    expect(t(null, 150, true)).toEqual({ kind: "set", width: 150 });
    expect(t(180, 150, true, false)).toEqual({ kind: "set", width: 150 });
    // Reduce Motion: the width at once, the cross-fade kept.
    expect(t(180, 150, false, true, true)).toEqual({ kind: "set", width: 150 });
    expect(t(180, 150, true, true, true)).toEqual({ kind: "animate", fromWidth: 150, toWidth: 150, crossFade: true });
    expect(MOBILE_READER_TITLE_RESIZE_MS).toBe(200);
  });

  test("the width follows the same eased progress as the fade (no jump frame)", () => {
    expect(mobileReaderTitleWidthAt(180, 150, 0)).toBe(180);
    expect(mobileReaderTitleWidthAt(180, 150, 0.5)).toBe(165);
    expect(mobileReaderTitleWidthAt(180, 150, 1)).toBe(150);
    expect(mobileReaderTitleWidthAt(180, 150, 1.2)).toBe(150);
  });

  test("the width is the content's natural width within the slot's range", () => {
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 160.3, minWidth: 120, maxWidth: 300 })).toBe(160.5);
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 60, minWidth: 120, maxWidth: 300 })).toBe(120);
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 500, minWidth: 120, maxWidth: 300 })).toBe(300);
    expect(resolveMobileReaderTitleCapsuleWidth({ natural: 0, minWidth: 120, maxWidth: 300 })).toBeNull();
  });

  test("the capsule's width and its texts' opacities read one progress; the text sits above the glass, unclipped", () => {
    const source = readFileSync(path.join(import.meta.dir, "../components/reader/ReaderTitleCapsule.tsx"), "utf8");
    expect(source).toContain("progress.value = withTiming(1, { duration: MOBILE_READER_TITLE_RESIZE_MS, easing: TITLE_EASING });");
    expect(source).toContain("width: mobileReaderTitleWidthAt(fromWidth.value, toWidth.value, progress.value)");
    expect(source).toContain("if (fadingId.value === id) return { opacity: progress.value };");
    expect(source).toContain("if (fadingId.value === id) return { opacity: 1 - progress.value };");
    expect(source).toContain("childrenAboveMaterial={TITLE_TEXT_ABOVE_MATERIAL}");
    const swift = readFileSync(path.join(import.meta.dir, "../../modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift"), "utf8");
    expect(swift).toContain("childHost.insertSubview(childComponentView, at: index)");
    expect(swift).toContain("overlayView.alpha = visible ? 1 : 0");
    expect(swift).toContain("overlayView.transform = visible ? .identity : dematerializedTransform");
    expect(swift).toContain('Constant("glassChildrenAboveMaterialAvailable") { true }');
    const reader = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");
    expect(reader.match(/<ReaderTitleCapsule\b/g)?.length).toBe(1);
    expect(reader).toContain("const readerTitleCapsuleVisible = readerChromeShown && !readerOpeningChromeTransparent;");
    // Page numbers keep their width digit for digit.
    expect(reader).toMatch(/readerCapsuleSubtitle: \{[^}]*fontVariant: \["tabular-nums"\]/);
  });
});
