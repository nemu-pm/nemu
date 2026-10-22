import { expect, test } from "bun:test";
import { resolveMobileReaderRestorePosition, resolveMobileReaderRestoreSpot } from "./mobileReaderRestore";
const base = { progressLoading: false, pagesReady: true, restoreKey: "1:chapter:single", restoredKey: "", chapterPrefix: "1:chapter:", currentPageIndex: 0, savedPageIndex: 2, relayoutPageAnchor: null, pageCount: 39 };

test("cached pages never write page one before persisted progress arrives", () => {
  let routePage: number | undefined;
  const pending = resolveMobileReaderRestorePosition({ ...base, progressLoading: true, savedPageIndex: 0 });
  if (pending !== null) routePage = pending + 1;
  expect(routePage).toBeUndefined();
  const loaded = resolveMobileReaderRestorePosition(base);
  if (loaded !== null) routePage = loaded + 1;
  expect(routePage).toBe(3);
});
test("geometry changes preserve the current chapter anchor rather than older progress", () => {
  expect(resolveMobileReaderRestorePosition({ ...base, restoredKey: "1:chapter:old-geometry", currentPageIndex: 8 })).toBe(8);
  expect(resolveMobileReaderRestorePosition({ ...base, restoredKey: "1:chapter:old-geometry", currentPageIndex: 8, relayoutPageAnchor: 7 })).toBe(7);
});
test("completed restoration and unavailable pages do not repeat route writes", () => {
  expect(resolveMobileReaderRestorePosition({ ...base, restoredKey: base.restoreKey })).toBeNull();
  expect(resolveMobileReaderRestorePosition({ ...base, pagesReady: false })).toBeNull();
});

// QA v3 (SPY×FAMILY, Tower of God): reopening landed on the top of the toolbar
// counter's page. The cached page list placed the reader on its saved spot
// (page 8, 70% in); the counter (page at the screen's centre) then showed 9
// and the reader echoed it into the route; the network page list (a new
// fetchedAt) re-ran the opening restore, which took the route page at its top.
test("a page-list refresh keeps the held spot, not the route echo of the counter page", () => {
  const saved = { pageIndex: 8, fraction: 0.7 };
  const opening = resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: true, heldSpot: null, routePageIndex: null, saved,
  });
  expect(opening).toEqual(saved);
  // The old behaviour: route page 9 (≠ saved page 8) → page 9 at its top.
  expect(resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: true, heldSpot: null, routePageIndex: 9, saved,
  })).toEqual({ pageIndex: 9, fraction: 0 });
  // The refresh re-places on the spot the reader holds.
  expect(resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: true, heldSpot: opening, routePageIndex: 9, saved,
  })).toEqual({ pageIndex: 8, fraction: 0.7 });
  // ...including where the reader has since rested.
  expect(resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: true, heldSpot: { pageIndex: 12, fraction: 0.35 }, routePageIndex: 13, saved,
  })).toEqual({ pageIndex: 12, fraction: 0.35 });
});
test("restore spot: explicit route pages and paged reading", () => {
  const saved = { pageIndex: 8, fraction: 0.7 };
  // The route echo of the saved page keeps the spot.
  expect(resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: true, heldSpot: null, routePageIndex: 8, saved,
  })).toEqual(saved);
  // Paged reading has no in-page spot.
  expect(resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: false, heldSpot: { pageIndex: 4, fraction: 0.5 }, routePageIndex: null, saved,
  })).toEqual({ pageIndex: 4, fraction: 0 });
  expect(resolveMobileReaderRestoreSpot({
    pageCount: 23, scrollReading: true, heldSpot: null, routePageIndex: null, saved: null,
  })).toEqual({ pageIndex: 0, fraction: 0 });
});
