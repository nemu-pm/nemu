import { describe, expect, test } from "bun:test";
import {
  clampMobileReaderPan,
  mobileReaderFitFrame,
  mobileReaderFitRestingOffset,
  mobileReaderPageFitMode,
  mobileReaderPanBound,
  mobileReaderPanStepTarget,
  mobileReaderPanClaim,
  normalizeReaderFitMode,
  normalizeReaderFitModes,
  readerFitModeForShape,
  readerFitRatio,
  withReaderFitMode,
} from "./mobileReaderFit";

const phonePortrait = { width: 402, height: 874 };
const phoneLandscape = { width: 874, height: 402 };
const RATIO = 1.5;

describe("reader fit frames", () => {
  test("fit page contains the page", () => {
    const portrait = mobileReaderFitFrame({ mode: "page", viewport: phonePortrait, ratio: RATIO });
    expect(portrait.width).toBe(402);
    expect(portrait.height).toBe(603);
    expect(portrait.overflowX || portrait.overflowY).toBe(false);
    const landscape = mobileReaderFitFrame({ mode: "page", viewport: phoneLandscape, ratio: RATIO });
    expect(landscape.height).toBe(402);
    expect(landscape.width).toBeCloseTo(268, 5);
    expect(landscape.overflowX || landscape.overflowY).toBe(false);
  });

  test("fit width spans the window and a tall page pans vertically", () => {
    const landscape = mobileReaderFitFrame({ mode: "width", viewport: phoneLandscape, ratio: RATIO });
    expect(landscape.width).toBe(874);
    expect(landscape.height).toBe(1311);
    expect(landscape.overflowX).toBe(false);
    expect(landscape.overflowY).toBe(true);
    const portrait = mobileReaderFitFrame({ mode: "width", viewport: phonePortrait, ratio: RATIO });
    expect(portrait.width).toBe(402);
    expect(portrait.overflowY).toBe(false);
  });

  test("fit height spans the window's height; a narrow window pans sideways", () => {
    const portrait = mobileReaderFitFrame({ mode: "height", viewport: phonePortrait, ratio: RATIO });
    expect(portrait.height).toBe(874);
    expect(portrait.width).toBeCloseTo(582.67, 1);
    expect(portrait.overflowX).toBe(true);
    expect(portrait.overflowY).toBe(false);
    const landscape = mobileReaderFitFrame({ mode: "height", viewport: phoneLandscape, ratio: RATIO });
    expect(landscape.overflowX || landscape.overflowY).toBe(false);
  });

  test("fill covers the window on both axes", () => {
    for (const viewport of [phonePortrait, phoneLandscape, { width: 669, height: 455.5 }, { width: 820, height: 1180 }]) {
      const frame = mobileReaderFitFrame({ mode: "fill", viewport, ratio: RATIO });
      expect(frame.width).toBeGreaterThanOrEqual(viewport.width - 1e-9);
      expect(frame.height).toBeGreaterThanOrEqual(viewport.height - 1e-9);
      expect(frame.height / frame.width).toBeCloseTo(RATIO, 9);
    }
    const portrait = mobileReaderFitFrame({ mode: "fill", viewport: phonePortrait, ratio: RATIO });
    expect(portrait.overflowX).toBe(true);
    expect(portrait.overflowY).toBe(false);
  });

  test("an unknown page size falls back to the common manga ratio", () => {
    expect(readerFitRatio(null)).toBe(1.45);
    expect(readerFitRatio({ width: 0, height: 100 })).toBe(1.45);
    expect(readerFitRatio({ width: 800, height: 1200 })).toBe(1.5);
    const frame = mobileReaderFitFrame({ mode: "width", viewport: phonePortrait, ratio: Number.NaN });
    expect(frame.height).toBeCloseTo(402 * 1.45, 5);
  });

  test("degenerate viewports never produce NaN", () => {
    const frame = mobileReaderFitFrame({ mode: "fill", viewport: { width: 0, height: Number.NaN }, ratio: RATIO });
    expect(Number.isFinite(frame.width)).toBe(true);
    expect(Number.isFinite(frame.height)).toBe(true);
  });
});

describe("resting offset and pan limits", () => {
  test("an overflowing page rests at its top, and at the reading-start edge", () => {
    const frame = { width: 582, height: 874 };
    const viewport = { width: 402, height: 874 };
    expect(mobileReaderFitRestingOffset({ frame, viewport, rtl: false })).toEqual({ x: 90, y: 0 });
    expect(mobileReaderFitRestingOffset({ frame, viewport, rtl: true })).toEqual({ x: -90, y: 0 });
    const tall = mobileReaderFitRestingOffset({ frame: { width: 874, height: 1311 }, viewport: phoneLandscape, rtl: false });
    expect(tall).toEqual({ x: 0, y: 454.5 });
  });

  test("a page that fits rests centred", () => {
    const rest = mobileReaderFitRestingOffset({ frame: { width: 300, height: 400 }, viewport: { width: 402, height: 874 }, rtl: true });
    expect(rest.x === 0).toBe(true);
    expect(rest.y === 0).toBe(true);
  });

  test("pan bound is the overflow of the scaled page, halved", () => {
    expect(mobileReaderPanBound(582, 402, 1)).toBe(90);
    expect(mobileReaderPanBound(402, 402, 1)).toBe(0);
    expect(mobileReaderPanBound(402, 402, 2)).toBe(201);
    // With the page as its own window this is the classic zoom bound.
    expect(mobileReaderPanBound(300, 300, 3)).toBe(300);
    expect(mobileReaderPanBound(100, 300, 2)).toBe(0);
  });

  test("clamps to the bound and ignores bad values", () => {
    expect(clampMobileReaderPan(500, 582, 402, 1)).toBe(90);
    expect(clampMobileReaderPan(-500, 582, 402, 1)).toBe(-90);
    expect(clampMobileReaderPan(30, 582, 402, 1)).toBe(30);
    expect(clampMobileReaderPan(30, 402, 402, 1)).toBe(0);
    expect(clampMobileReaderPan(Number.NaN, 582, 402, 1)).toBe(0);
  });
});

describe("pan claim at rest", () => {
  const base = { dx: 0, dy: 0, offsetX: 0, offsetY: 0, boundX: 90, boundY: 0 };

  test("waits inside the slop", () => {
    expect(mobileReaderPanClaim({ ...base, dx: 3, dy: 2 })).toBe("wait");
  });

  test("claims a sideways drag while the page can still move that way", () => {
    // Page rests at its left edge (offset +90): dragging left moves it, dragging right cannot.
    expect(mobileReaderPanClaim({ ...base, offsetX: 90, dx: -20 })).toBe("claim");
    expect(mobileReaderPanClaim({ ...base, offsetX: 90, dx: 20 })).toBe("yield");
    // Mid-way both directions move it.
    expect(mobileReaderPanClaim({ ...base, offsetX: 0, dx: 20 })).toBe("claim");
    expect(mobileReaderPanClaim({ ...base, offsetX: 0, dx: -20 })).toBe("claim");
    // At the far edge the drag turns the page.
    expect(mobileReaderPanClaim({ ...base, offsetX: -90, dx: -20 })).toBe("yield");
  });

  test("a sideways drag on a page with no sideways overflow always turns the page", () => {
    expect(mobileReaderPanClaim({ ...base, boundX: 0, boundY: 200, dx: 40, dy: 5 })).toBe("yield");
  });

  test("a vertical drag pans a tall page until its edge", () => {
    const tall = { dx: 0, dy: 0, offsetX: 0, offsetY: 454, boundX: 0, boundY: 454 };
    expect(mobileReaderPanClaim({ ...tall, dy: -30 })).toBe("claim");
    expect(mobileReaderPanClaim({ ...tall, dy: 30 })).toBe("yield");
    expect(mobileReaderPanClaim({ ...tall, offsetY: -454, dy: -30 })).toBe("yield");
  });
});

describe("a wide page alone in a portrait window", () => {
  const wide = { width: 1800, height: 1200 };
  const tall = { width: 800, height: 1200 };

  test("fits the height and pans instead of shrinking", () => {
    expect(mobileReaderPageFitMode({ mode: "page", single: true, viewport: phonePortrait, naturalSize: wide })).toBe(
      "height",
    );
    const frame = mobileReaderFitFrame({ mode: "height", viewport: phonePortrait, ratio: readerFitRatio(wide) });
    expect(frame.height).toBe(874);
    expect(frame.width).toBeCloseTo(1311, 5);
    expect(frame.overflowX).toBe(true);
    expect(frame.overflowY).toBe(false);
  });

  test("only pages wider than 1.2 : 1 count as wide", () => {
    const at = (width: number) =>
      mobileReaderPageFitMode({ mode: "page", single: true, viewport: phonePortrait, naturalSize: { width, height: 1000 } });
    expect(at(1200)).toBe("page");
    expect(at(1201)).toBe("height");
    expect(mobileReaderPageFitMode({ mode: "page", single: true, viewport: phonePortrait, naturalSize: tall })).toBe(
      "page",
    );
    expect(mobileReaderPageFitMode({ mode: "page", single: true, viewport: phonePortrait, naturalSize: null })).toBe(
      "page",
    );
  });

  test("spreads, landscape windows and explicit fits are unchanged", () => {
    expect(mobileReaderPageFitMode({ mode: "page", single: false, viewport: phonePortrait, naturalSize: wide })).toBe(
      "page",
    );
    expect(mobileReaderPageFitMode({ mode: "page", single: true, viewport: phoneLandscape, naturalSize: wide })).toBe(
      "page",
    );
    for (const mode of ["width", "height", "fill"] as const) {
      expect(mobileReaderPageFitMode({ mode, single: true, viewport: phonePortrait, naturalSize: wide })).toBe(mode);
    }
  });

  test("rests at the reading-start edge", () => {
    const frame = mobileReaderFitFrame({ mode: "height", viewport: phonePortrait, ratio: readerFitRatio(wide) });
    const bound = mobileReaderPanBound(frame.width, phonePortrait.width, 1);
    // Right-to-left shows the page's right edge (shifted left), left-to-right its left edge.
    expect(mobileReaderFitRestingOffset({ frame, viewport: phonePortrait, rtl: true }).x).toBeCloseTo(-bound, 5);
    expect(mobileReaderFitRestingOffset({ frame, viewport: phonePortrait, rtl: false }).x).toBeCloseTo(bound, 5);
  });
});

describe("tap turns pan a wide page first", () => {
  const bound = 450;
  const viewportWidth = 400;

  test("right-to-left: next pans towards the left edge in window steps, then turns", () => {
    let offset = -bound;
    const stops: number[] = [];
    for (;;) {
      const next = mobileReaderPanStepTarget({ offset, bound, viewportWidth, direction: "next", rtl: true });
      if (next === null) break;
      stops.push(next);
      offset = next;
    }
    expect(stops).toEqual([-90, 270, 450]);
  });

  test("left-to-right: next pans towards the right edge, then turns", () => {
    expect(mobileReaderPanStepTarget({ offset: bound, bound, viewportWidth, direction: "next", rtl: false })).toBe(90);
    expect(mobileReaderPanStepTarget({ offset: -bound, bound, viewportWidth, direction: "next", rtl: false })).toBeNull();
  });

  test("previous pans back towards the reading start, then turns", () => {
    expect(mobileReaderPanStepTarget({ offset: bound, bound, viewportWidth, direction: "previous", rtl: true })).toBe(
      90,
    );
    expect(
      mobileReaderPanStepTarget({ offset: -bound, bound, viewportWidth, direction: "previous", rtl: true }),
    ).toBeNull();
    expect(
      mobileReaderPanStepTarget({ offset: bound, bound, viewportWidth, direction: "previous", rtl: false }),
    ).toBeNull();
  });

  test("a last stretch shorter than a quarter window is taken in the same step", () => {
    // 434 pt of overflow against a 419 pt step: one tap reaches the far edge.
    expect(mobileReaderPanStepTarget({ offset: -217, bound: 217, viewportWidth: 466, direction: "next", rtl: true })).toBe(
      217,
    );
    expect(mobileReaderPanStepTarget({ offset: 217, bound: 217, viewportWidth: 466, direction: "next", rtl: true })).toBeNull();
  });

  test("a page with no sideways overflow always turns", () => {
    expect(mobileReaderPanStepTarget({ offset: 0, bound: 0, viewportWidth, direction: "next", rtl: true })).toBeNull();
    expect(mobileReaderPanStepTarget({ offset: Number.NaN, bound, viewportWidth, direction: "next", rtl: true })).toBeNull();
  });
});

describe("remembered fit modes", () => {
  test("defaults to fit page and ignores unknown values", () => {
    expect(normalizeReaderFitMode(undefined)).toBe("page");
    expect(normalizeReaderFitMode("zoom")).toBe("page");
    expect(normalizeReaderFitMode("fill")).toBe("fill");
    expect(readerFitModeForShape(undefined, "large")).toBe("page");
  });

  test("each window shape remembers its own choice", () => {
    let modes = withReaderFitMode({}, "wide", "width");
    modes = withReaderFitMode(modes, "large", "fill");
    expect(readerFitModeForShape(modes, "wide")).toBe("width");
    expect(readerFitModeForShape(modes, "large")).toBe("fill");
    expect(readerFitModeForShape(modes, "narrow")).toBe("page");
  });

  test("choosing the default removes the entry", () => {
    const modes = withReaderFitMode(withReaderFitMode({}, "wide", "height"), "wide", "page");
    expect(modes).toEqual({});
  });

  test("drops anything stored by other builds", () => {
    expect(normalizeReaderFitModes({ narrow: "width", wide: "stretch", phone: "fill", large: "page" })).toEqual({ narrow: "width" });
    expect(normalizeReaderFitModes(null)).toEqual({});
    expect(normalizeReaderFitModes("fill")).toEqual({});
  });
});
