import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getReaderOpeningLoadingLayout,
  holdReaderOpeningWindow,
  isReaderChapterSwitchMount,
  readerOpeningLoadingFades,
  resolveReaderOpeningLoading,
  retainReaderRouteMount,
  READER_OPENING_LOADING_DELAY_MS,
  READER_OPENING_LOADING_MIN_VISIBLE_MS,
  READER_OPENING_LOADING_SPINNER_GAP,
  READER_OPENING_LOADING_SPINNER_SIZE,
} from "./readerOpeningLoading";

const route = readFileSync(
  path.join(import.meta.dir, "../../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
  "utf8",
);
const reader = readFileSync(path.join(import.meta.dir, "../../screens/ReaderScreen.tsx"), "utf8");

describe("readerOpeningLoading", () => {
  test("the durations are the tuned ones", () => {
    expect(READER_OPENING_LOADING_DELAY_MS).toBe(300);
    expect(READER_OPENING_LOADING_MIN_VISIBLE_MS).toBe(400);
  });

  test("waits on the reader background until the delay has passed", () => {
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: null, now: 1000 })).toEqual({
      phase: "waiting",
      showInMs: 300,
    });
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: null, now: 1250 })).toEqual({
      phase: "waiting",
      showInMs: 50,
    });
  });

  test("a page ready within the delay skips the loading screen", () => {
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 1000, now: 1000 })).toEqual({
      phase: "leave",
      skipped: true,
    });
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 1299, now: 1299 })).toEqual({
      phase: "leave",
      skipped: true,
    });
    // Ready before the opening started (the reader mounts ahead of a zoom's landing).
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 900, now: 1000 })).toEqual({
      phase: "leave",
      skipped: true,
    });
  });

  test("not ready by the delay: shown, with no end until the page is ready", () => {
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: null, now: 1300 })).toEqual({
      phase: "shown",
      shownAt: 1300,
      leaveInMs: null,
    });
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: null, now: 9000 })).toEqual({
      phase: "shown",
      shownAt: 1300,
      leaveInMs: null,
    });
  });

  test("once shown it stays its minimum, counted from when it showed", () => {
    // Ready just as it showed: up until 1300 + 400.
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 1300, now: 1300 })).toEqual({
      phase: "shown",
      shownAt: 1300,
      leaveInMs: 400,
    });
    // Ready 100 ms in: 300 ms more.
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 1400, now: 1400 })).toEqual({
      phase: "shown",
      shownAt: 1300,
      leaveInMs: 300,
    });
    // At the minimum: leave.
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 1400, now: 1700 })).toEqual({
      phase: "leave",
      skipped: false,
    });
  });

  test("a page ready past the minimum leaves at once", () => {
    expect(resolveReaderOpeningLoading({ openedAt: 1000, readyAt: 2500, now: 2500 })).toEqual({
      phase: "leave",
      skipped: false,
    });
  });

  test("the durations can be tuned per call", () => {
    expect(
      resolveReaderOpeningLoading({ openedAt: 0, readyAt: 150, now: 150, delayMs: 100, minVisibleMs: 200 }),
    ).toEqual({ phase: "shown", shownAt: 100, leaveInMs: 150 });
  });

  test("Reduce Motion keeps the fades, shorter", () => {
    const usual = readerOpeningLoadingFades(false);
    const reduced = readerOpeningLoadingFades(true);
    expect(reduced.inMs).toBeLessThan(usual.inMs);
    expect(reduced.outMs).toBeLessThan(usual.outMs);
    expect(reduced.inMs).toBeGreaterThan(0);
    // Unknown is the usual fades (the fades never move anything).
    expect(readerOpeningLoadingFades(null)).toEqual(usual);
  });

  test("the cover sits on the window's centre, the spinner below it, on every display", () => {
    const check = (input: Parameters<typeof getReaderOpeningLoadingLayout>[0]) => {
      const { cover, spinner } = getReaderOpeningLoadingLayout(input);
      const { width, height } = input;
      expect(Math.abs(cover.x + cover.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(cover.y + cover.height / 2 - height / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(spinner.x + spinner.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(spinner.y - (cover.y + cover.height)).toBeCloseTo(READER_OPENING_LOADING_SPINNER_GAP, -0.5);
      expect(spinner.height).toBe(READER_OPENING_LOADING_SPINNER_SIZE);
      // 2:3, smaller than the page-sized landing it replaces, the spinner on screen.
      expect(Math.abs(cover.height - (cover.width * 3) / 2)).toBeLessThanOrEqual(1);
      expect(cover.width).toBeLessThanOrEqual(width / 2 + 0.5);
      expect(cover.height).toBeLessThan(height * 0.6 + 1);
      expect(spinner.y + spinner.height).toBeLessThan(height);
      return cover;
    };
    // iPhone portrait.
    expect(check({ width: 402, height: 874 }).width).toBe(201);
    // Duo inner portrait, inner landscape (book posture included).
    expect(check({ width: 669, height: 951 }).width).toBe(335);
    expect(check({ width: 951, height: 669 }).width).toBe(250);
    // Duo outer, portrait and landscape.
    expect(check({ width: 466, height: 678 }).width).toBe(233);
    expect(check({ width: 678, height: 466 }).width).toBe(169);
    // A large window: capped, not page-sized.
    expect(check({ width: 1024, height: 1366 }).width).toBe(360);
  });

  test("the cover scales with the window: a Duo inner display's is larger than a phone's", () => {
    const phone = getReaderOpeningLoadingLayout({ width: 402, height: 874 }).cover.width;
    const inner = getReaderOpeningLoadingLayout({ width: 669, height: 951 }).cover.width;
    const innerLandscape = getReaderOpeningLoadingLayout({ width: 951, height: 669 }).cover.width;
    expect(inner).toBeGreaterThan(phone * 1.5);
    expect(innerLandscape).toBeGreaterThan(phone);
  });

  test("the opening holds its first window through small changes, not a new shape", () => {
    const first = { width: 951, height: 669 };
    expect(holdReaderOpeningWindow(null, first)).toBe(first);
    // A bar hiding, a size settling after the push: held, nothing moves.
    expect(holdReaderOpeningWindow(first, { width: 951, height: 700 })).toBe(first);
    expect(holdReaderOpeningWindow(first, { width: 880, height: 669 })).toBe(first);
    // A rotation or a fold: the new window.
    expect(holdReaderOpeningWindow(first, { width: 669, height: 951 })).toEqual({ width: 669, height: 951 });
    expect(holdReaderOpeningWindow(first, { width: 466, height: 678 })).toEqual({ width: 466, height: 678 });
    expect(holdReaderOpeningWindow(first, { width: 678, height: 466 })).toEqual({ width: 678, height: 466 });
    // No window yet (0×0): the first real one.
    expect(holdReaderOpeningWindow({ width: 0, height: 0 }, first)).toBe(first);
  });

  test("safe areas never reach the loading layout: it cannot move when they change", () => {
    expect(route).toContain("getReaderOpeningLoadingLayout(openingWindow)");
    expect(route).toMatch(/holdReaderOpeningWindow\(openingWindowRef\.current, \{\s*width: window\.width,\s*height: window\.height,/);
  });

  test("a reader route mounted while another is mounted is a chapter switch", () => {
    expect(isReaderChapterSwitchMount()).toBe(false);
    const release = retainReaderRouteMount();
    expect(isReaderChapterSwitchMount()).toBe(true);
    const next = retainReaderRouteMount();
    release();
    release();
    expect(isReaderChapterSwitchMount()).toBe(true);
    next();
    expect(isReaderChapterSwitchMount()).toBe(false);
  });

  test("the route holds the HUD until the overlay's fade ends; the reader shows it then", () => {
    expect(route).toContain("const [chapterSwitch] = useState(() => !zoom && isReaderChapterSwitchMount());");
    expect(route).toContain("<ReaderOpeningHudHeldContext.Provider value={!openingDone}>");
    expect(route).toContain("setOpeningDone(true);");
    expect(route).toContain("<ActivityIndicator color={mobileReaderPageStatusColor(backdropColor)} />");
    // No cap fades the cover onto a half-built reader any more.
    expect(route).not.toContain("COVER_SCROLL_HOLD_MAX_MS");
    expect(route).not.toContain("armCap(");
    expect(reader).toContain(
      "const showControls = MOBILE_READER_QA_CHROME || (showControlsState && !readerOpeningHudHeld);",
    );
    // Any request for the HUD while it is held is the way out: it releases it.
    expect(reader).toContain("if (readerOpeningHudHeldRef.current && next !== false) {");
    expect(reader).toContain("readerZoomEntryRef.current.releaseHud();");
  });
});
