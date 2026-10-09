import { describe, expect, test } from "bun:test";
import {
  mobileReaderFilmstripItemSize,
  mobileReaderFilmstripOffset,
  mobileReaderFilmstripOrder,
  mobileReaderNotebookPaneBase,
  mobileReaderNotebookPaneMotion,
  mobileReaderNotebookReveal,
  mobileReaderPageRevealed,
  mobileReaderTrackpadLayout,
  mobileReaderTrackpadProgress,
  mobileReaderTrackpadStep,
  mobileReaderTrackpadSwipe,
  normalizeMobileReaderNotebookPanePreference,
  READER_FILMSTRIP_GAP,
  READER_NOTEBOOK_HANDLE_HIT,
  resolveMobileReaderNotebookPane,
} from "./mobileReaderNotebookPane";

const resolve = (overrides: Partial<Parameters<typeof resolveMobileReaderNotebookPane>[0]> = {}) =>
  resolveMobileReaderNotebookPane({
    preference: "automatic",
    paged: true,
    override: null,
    ...overrides,
  });

describe("notebook pane: which state", () => {
  test("automatic is the controls console: the lower half carries the reading controls", () => {
    expect(resolve()).toBe("filmstrip");
    expect(mobileReaderNotebookPaneBase("automatic")).toBe("filmstrip");
  });

  test("explicit preferences win in paged mode", () => {
    expect(resolve({ preference: "filmstrip" })).toBe("filmstrip");
    expect(resolve({ preference: "trackpad" })).toBe("trackpad");
  });

  test("scroll mode flows through both panes whatever the preference", () => {
    for (const preference of ["automatic", "trackpad", "filmstrip"] as const) {
      expect(resolve({ preference, paged: false })).toBe("continuous");
    }
  });

  test("session choices (expand, collapse) override the preference", () => {
    expect(resolve({ override: "filmstrip" })).toBe("filmstrip");
    expect(resolve({ preference: "filmstrip", override: "trackpad" })).toBe("trackpad");
  });

  test("unknown stored values fall back to automatic, including the retired study desk", () => {
    expect(normalizeMobileReaderNotebookPanePreference("filmstrip")).toBe("filmstrip");
    expect(normalizeMobileReaderNotebookPanePreference("continuous")).toBe("automatic");
    expect(normalizeMobileReaderNotebookPanePreference("studyDesk")).toBe("automatic");
    expect(normalizeMobileReaderNotebookPanePreference(undefined)).toBe("automatic");
  });
});

describe("notebook pane: trackpad", () => {
  test("halves follow the reading direction", () => {
    expect(mobileReaderTrackpadStep("left", true)).toBe("next");
    expect(mobileReaderTrackpadStep("right", true)).toBe("previous");
    expect(mobileReaderTrackpadStep("left", false)).toBe("previous");
    expect(mobileReaderTrackpadStep("right", false)).toBe("next");
  });

  test("Duo notebook pane (669 × 421.5): inset pad split in two, handle centred on top", () => {
    const layout = mobileReaderTrackpadLayout({ width: 669, height: 421.5 });
    expect(layout.pad).toEqual({ x: 12, y: 12, width: 645, height: 397.5 });
    expect(layout.halves.left.width + layout.halves.right.width).toBe(645);
    expect(layout.halves.right.x).toBe(12 + 322.5);
    expect(Math.abs(layout.handle.x + layout.handle.width / 2 - 334.5)).toBeLessThanOrEqual(0.5);
    expect(layout.handleHit.height).toBe(READER_NOTEBOOK_HANDLE_HIT);
    // Indicator sits above the hairline, both inside the pad.
    expect(layout.indicator.y + layout.indicator.height).toBeLessThanOrEqual(layout.progress.y);
    expect(layout.progress.y + layout.progress.height).toBeLessThan(layout.pad.y + layout.pad.height);
  });

  test("degenerate panes never produce negative boxes", () => {
    const layout = mobileReaderTrackpadLayout({ width: 0, height: 0 });
    expect(layout.pad.width).toBe(0);
    expect(layout.progress.width).toBe(0);
  });

  test("swipes drag the page like the pager; up expands; short drags stay taps", () => {
    expect(mobileReaderTrackpadSwipe({ dx: -80, dy: 5, rtl: false })).toBe("next");
    expect(mobileReaderTrackpadSwipe({ dx: 80, dy: 5, rtl: false })).toBe("previous");
    expect(mobileReaderTrackpadSwipe({ dx: 80, dy: -5, rtl: true })).toBe("next");
    expect(mobileReaderTrackpadSwipe({ dx: -80, dy: 0, rtl: true })).toBe("previous");
    expect(mobileReaderTrackpadSwipe({ dx: 4, dy: -90, rtl: true })).toBe("expand");
    expect(mobileReaderTrackpadSwipe({ dx: 4, dy: 90, rtl: true })).toBeNull();
    expect(mobileReaderTrackpadSwipe({ dx: 12, dy: 3, rtl: false })).toBeNull();
  });

  test("progress fills from the reading-start edge", () => {
    expect(mobileReaderTrackpadProgress({ pageIndex: 0, pageCount: 4, rtl: true })).toEqual({ fraction: 0.25, from: "right" });
    expect(mobileReaderTrackpadProgress({ pageIndex: 3, pageCount: 4, rtl: false })).toEqual({ fraction: 1, from: "left" });
    expect(mobileReaderTrackpadProgress({ pageIndex: 0, pageCount: 0, rtl: false }).fraction).toBe(0);
  });
});

describe("notebook pane: spoiler-safe filmstrip", () => {
  test("reveals pages read before, pages shown now and the current page — never beyond", () => {
    const base = { pageCount: 40, currentIndex: 5, openedAtIndex: null, completed: false, visited: new Set<number>() };
    const fresh = mobileReaderNotebookReveal(base);
    expect(fresh.through).toBe(-1);
    expect(mobileReaderPageRevealed(5, fresh)).toBe(true);
    expect(mobileReaderPageRevealed(4, fresh)).toBe(false);
    expect(mobileReaderPageRevealed(6, fresh)).toBe(false);
    // Opened at page 13 (0-based 12): everything up to it was read before.
    const resumed = mobileReaderNotebookReveal({ ...base, openedAtIndex: 12, currentIndex: 12 });
    expect(mobileReaderPageRevealed(0, resumed)).toBe(true);
    expect(mobileReaderPageRevealed(12, resumed)).toBe(true);
    expect(mobileReaderPageRevealed(13, resumed)).toBe(false);
    // A jump to page 28 does not reveal the pages it skipped.
    const jumped = mobileReaderNotebookReveal({ ...base, currentIndex: 27, visited: new Set([5, 6, 7]) });
    expect(mobileReaderPageRevealed(27, jumped)).toBe(true);
    expect(mobileReaderPageRevealed(7, jumped)).toBe(true);
    expect(mobileReaderPageRevealed(20, jumped)).toBe(false);
    expect(mobileReaderPageRevealed(39, mobileReaderNotebookReveal({ ...base, completed: true }))).toBe(true);
    expect(mobileReaderNotebookReveal({ ...base, openedAtIndex: 99 }).through).toBe(39);
    expect(mobileReaderNotebookReveal({ ...base, pageCount: 0 }).through).toBe(-1);
    expect(mobileReaderPageRevealed(-1, resumed)).toBe(false);
  });

  test("thumbnails keep the page aspect, clamped", () => {
    expect(mobileReaderFilmstripItemSize(150)).toEqual({ width: 92, height: 132, stride: 92 + READER_FILMSTRIP_GAP });
    expect(mobileReaderFilmstripItemSize(20).height).toBe(72);
    expect(mobileReaderFilmstripItemSize(900).height).toBe(168);
  });

  test("right-to-left strips put page 1 on the right and centre the current page", () => {
    expect(mobileReaderFilmstripOrder(4, true)).toEqual([3, 2, 1, 0]);
    expect(mobileReaderFilmstripOrder(3, false)).toEqual([0, 1, 2]);
    const common = { count: 40, stride: 100, itemWidth: 92, viewportWidth: 600, padding: 16 };
    expect(mobileReaderFilmstripOffset({ ...common, index: 0, rtl: false })).toBe(0);
    expect(mobileReaderFilmstripOffset({ ...common, index: 10, rtl: false })).toBe(16 + 1000 + 46 - 300);
    const contentMax = 16 * 2 + 40 * 100 - READER_FILMSTRIP_GAP - 600;
    expect(mobileReaderFilmstripOffset({ ...common, index: 0, rtl: true })).toBe(contentMax);
  });
});

describe("notebook pane: motion", () => {
  const timing = { fadeInMs: 220, fadeOutMs: 180, reduceMotionFadeMs: 150 };
  test("expanding rises, collapsing settles, Reduce Motion fades", () => {
    expect(mobileReaderNotebookPaneMotion({ from: "trackpad", to: "filmstrip", reduceMotion: false, ...timing })).toMatchObject({ kind: "spring", dy: 18 });
    expect(mobileReaderNotebookPaneMotion({ from: "filmstrip", to: "trackpad", reduceMotion: false, ...timing })).toMatchObject({ kind: "spring", dy: -10 });
    expect(mobileReaderNotebookPaneMotion({ from: "trackpad", to: "filmstrip", reduceMotion: true, ...timing })).toEqual({ kind: "fade", durationMs: 150 });
    expect(mobileReaderNotebookPaneMotion({ from: null, to: "trackpad", reduceMotion: false, ...timing })).toEqual({ kind: "none" });
  });
});
