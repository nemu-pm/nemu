import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isMobileReaderStripReanchor,
  nextMobileReaderStripUserMoved,
  shouldTakeMobileReaderStripCrossing,
  type MobileReaderStripCrossingGateEvent,
} from "./mobileReaderStripCrossingGate";

const reader = readFileSync(path.join(import.meta.dir, "..", "screens/ReaderScreen.tsx"), "utf8");

function slice(start: string, end: string) {
  const from = reader.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = reader.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return reader.slice(from, to);
}

/** Replays gate events and reports whether a backward crossing would be taken. */
function backwardAfter(events: MobileReaderStripCrossingGateEvent[]): boolean {
  const moved = events.reduce(nextMobileReaderStripUserMoved, false);
  return shouldTakeMobileReaderStripCrossing("backward", moved);
}

describe("seamless crossing gate: back into the previous chapter only by the reader", () => {
  test("a chapter opened at page 1 stays there through the previous chapter's splice", () => {
    // Open at p1 → previous chapter spliced in front → the offset read in the old
    // terms lands in it: no crossing (scroll and paged alike).
    expect(backwardAfter([{ kind: "open" }])).toBe(false);
    expect(backwardAfter([{ kind: "open" }, { kind: "re-anchor" }])).toBe(false);
    // A gesture before the splice does not carry over it.
    expect(backwardAfter([{ kind: "open" }, { kind: "user-gesture" }, { kind: "re-anchor" }])).toBe(false);
  });

  test("a drag, swipe or turn after the splice may cross back", () => {
    expect(backwardAfter([{ kind: "open" }, { kind: "re-anchor" }, { kind: "user-gesture" }])).toBe(true);
    expect(backwardAfter([{ kind: "open" }, { kind: "user-gesture" }])).toBe(true);
  });

  test("forward crossings are never held", () => {
    expect(shouldTakeMobileReaderStripCrossing("forward", false)).toBe(true);
    expect(shouldTakeMobileReaderStripCrossing("forward", true)).toBe(true);
  });

  test("a re-anchor is the open chapter moving in the joined frames, not a crossing", () => {
    expect(isMobileReaderStripReanchor(null, { chapterId: "c38", base: 0 })).toBe(false);
    expect(isMobileReaderStripReanchor({ chapterId: "c38", base: 0 }, { chapterId: "c38", base: 10 })).toBe(true);
    expect(isMobileReaderStripReanchor({ chapterId: "c38", base: 10 }, { chapterId: "c38", base: 10 })).toBe(false);
    // Crossed into another chapter: its base differs, but that is the crossing.
    expect(isMobileReaderStripReanchor({ chapterId: "c38", base: 10 }, { chapterId: "c37", base: 0 })).toBe(false);
  });
});

describe("ReaderScreen wiring of the crossing gate", () => {
  test("the gesture flag is set by drags, swipes and turns", () => {
    expect(slice("const beginReaderUserScroll = useCallback(", "const readerStripCrossedIntoRef")).toContain(
      'noteReaderStripGate({ kind: "user-gesture" })',
    );
    expect(slice("const stepReaderPage = useCallback(", "readerPagedEdgeRef.current && readerPagedStepRef")).toContain(
      'noteReaderStripGate({ kind: "user-gesture" })',
    );
    expect(slice("const stepReaderScrollScreen = useCallback(", "readerContinuousScreenStep(")).toContain(
      'noteReaderStripGate({ kind: "user-gesture" })',
    );
    expect(
      slice("const stepContinuousReaderAccessibility = useCallback(", "readerContinuousAccessibilityAction("),
    ).toContain('noteReaderStripGate({ kind: "user-gesture" })');
  });

  test("opening and every same-chapter re-base clear it", () => {
    expect(reader).toMatch(
      /readerStripUserScrolledRef\.current = false;\s*noteReaderStripGate\(\{ kind: "open" \}\);\s*\}, \[noteReaderStripGate, readerScrollMountKey\]\);/,
    );
    // Scroll mode: the bridge moved with the chapter still open (prepend, head drop).
    expect(
      slice("const readerStripPlacementRef = useRef", "readerStripBridgeMovingRef.current = true;"),
    ).toMatch(/previous\.bridge\.indexBase === readerStripBridge\.indexBase[\s\S]*noteReaderStripGate\(\{ kind: "re-anchor" \}\)/);
    // Paged: the frame base moved with the chapter still open.
    expect(slice("const readerPagedAnchorRef = useRef", "/** The frame the reader rests on")).toMatch(
      /isMobileReaderStripReanchor\(readerPagedAnchorRef\.current, next\)\) \{\s*noteReaderStripGate\(\{ kind: "re-anchor" \}\);/,
    );
  });

  test("scroll mode: an ungated backward crossing is neither a crossing nor a page", () => {
    const handler = slice("const onGalleryScrollingVisiblePageChange = useCallback(", "const onGalleryScrollingPageLayout");
    const gate = handler.indexOf("shouldTakeMobileReaderStripCrossing(crossing.direction, readerStripUserMovedRef.current)");
    const cross = handler.indexOf("crossIntoReaderStripSegmentRef.current(crossing)");
    const page = handler.indexOf("onScrollingVisiblePageChange(local)");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(cross);
    expect(handler.slice(gate, cross)).toMatch(/return;\s*\}/);
    expect(cross).toBeLessThan(page);
  });

  test("paged: an ungated backward settle stays on the open chapter's page", () => {
    const handler = slice("const onReaderMomentumEnd = (", "const nextFrameIndex = settledFrameIndex");
    const gate = handler.indexOf("shouldTakeMobileReaderStripCrossing(crossing.direction, readerStripUserMovedRef.current)");
    const land = handler.indexOf("landOnReaderPagedFrameRef.current(crossing");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(land);
    expect(handler.slice(gate, land)).toMatch(/scrollToPageIndex\(clampedPageIndex, false\);\s*return;/);
  });
});
