import { describe, expect, test } from "bun:test";
import { mobilePoseScrollHoldStart, mobilePoseScrollHoldTrim } from "./mobilePoseScrollHold";

// The recorded repro: the Duo Library (one book, a Continue Reading card)
// scrolled ~90pt under a 100pt adjusted top inset; the content is just taller
// than the viewport flat and shrinks ~120pt when the covers fit a pane.
const viewportHeight = 660;
const insetTop = 100;
const insetBottom = 30;
const flat = { offsetY: -insetTop + 90, insetTop, insetBottom, viewportHeight, contentHeight: 680 };

function maxOffset(contentHeight: number) {
  return contentHeight + insetBottom - viewportHeight;
}

describe("Library scroll hold across a fold", () => {
  test("the repro: unheld, the folded content clamps the offset to the top", () => {
    expect(maxOffset(560)).toBeLessThan(flat.offsetY);
  });

  test("a scrolled list is held: the offset stays reachable however far the content shrinks", () => {
    const extra = mobilePoseScrollHoldStart(flat);
    expect(maxOffset(560 + extra)).toBeGreaterThanOrEqual(flat.offsetY);
    expect(maxOffset(0 + extra)).toBeGreaterThanOrEqual(flat.offsetY);
  });

  test("a list at its top needs no hold", () => {
    expect(mobilePoseScrollHoldStart({ ...flat, offsetY: -insetTop })).toBe(0);
  });

  test("settled: trimmed to exactly what keeps the offset, which stays reachable", () => {
    const extra = mobilePoseScrollHoldStart(flat);
    const trimmed = mobilePoseScrollHoldTrim({ ...flat, contentHeight: 560 + extra }, extra);
    expect(trimmed).toBeGreaterThan(0);
    expect(trimmed).toBeLessThan(extra);
    expect(maxOffset(560 + trimmed)).toBeGreaterThanOrEqual(flat.offsetY);
    expect(maxOffset(560 + trimmed - 1)).toBeLessThan(flat.offsetY);
  });

  test("unfolded again: the content reaches the offset by itself, the hold is gone", () => {
    expect(mobilePoseScrollHoldTrim({ ...flat, contentHeight: 680 + 40 }, 40)).toBe(0);
  });

  test("scrolling back up melts the hold, never past what the offset needs", () => {
    const trimmed = mobilePoseScrollHoldTrim({ ...flat, contentHeight: 560 + 100 }, 100);
    const higher = mobilePoseScrollHoldTrim({ ...flat, offsetY: flat.offsetY - 40, contentHeight: 560 + trimmed }, trimmed);
    expect(higher).toBe(Math.max(0, trimmed - 40));
  });
});
