import { expect, test } from "bun:test";
import { resolveMobileReaderRestorePosition } from "./mobileReaderRestore";
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
