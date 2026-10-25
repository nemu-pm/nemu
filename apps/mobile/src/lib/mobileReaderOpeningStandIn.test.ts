import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  mobileReaderStandInKey,
  mobileReaderStandInMatches,
  MOBILE_READER_STAND_IN_FADE_MS,
  peekMobileReaderStandIn,
  rememberMobileReaderStandIn,
  resetMobileReaderStandInsForTesting,
  resolveMobileReaderStandInFade,
} from "./mobileReaderOpeningStandIn";

const window = { width: 1426, height: 1003 };
const key = mobileReaderStandInKey({ registryId: "r", sourceId: "s", mangaId: "m", chapterId: "c37" });
const page = (id: string, x = 400) => ({
  id,
  uri: `https://example.test/${id}.jpg`,
  rect: { x, y: 0, width: 626, height: 1003 },
});

describe("reader opening stand-in", () => {
  beforeEach(() => resetMobileReaderStandInsForTesting());

  test("remembers what a chapter shows at rest, for the same window only", () => {
    rememberMobileReaderStandIn(key, { pages: [page("p0")], window });
    expect(peekMobileReaderStandIn(key, window)?.pages.map((p) => p.id)).toEqual(["p0"]);
    expect(peekMobileReaderStandIn(key, { width: 1003, height: 1426 })).toBeNull();
    expect(peekMobileReaderStandIn(mobileReaderStandInKey({ registryId: "r", sourceId: "s", mangaId: "m", chapterId: "c38" }), window)).toBeNull();
  });

  test("off-screen pages, data URIs and empty measures are dropped; nothing usable forgets the chapter", () => {
    rememberMobileReaderStandIn(key, { pages: [page("p0")], window });
    rememberMobileReaderStandIn(key, {
      pages: [page("p1", 1426 + 400), { ...page("p2"), uri: "data:image/png;base64,AAAA" }, { ...page("p3"), rect: { x: 0, y: 0, width: 0, height: 0 } }],
      window,
    });
    expect(peekMobileReaderStandIn(key, window)).toBeNull();
  });

  test("matches only the very pages the reader lands on", () => {
    rememberMobileReaderStandIn(key, { pages: [page("p1", 87), page("p2", 713)], window });
    const standIn = peekMobileReaderStandIn(key, window)!;
    expect(mobileReaderStandInMatches(standIn, ["p2", "p1"])).toBe(true);
    expect(mobileReaderStandInMatches(standIn, ["p1"])).toBe(false);
    expect(mobileReaderStandInMatches(standIn, ["p3", "p4"])).toBe(false);
  });

  test("the cross-fade: the zoom's last 300 ms, ending at the landing", () => {
    // Zoom started at 1000 for 550 ms: lands at 1550; fade 1250 → 1550.
    expect(resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1010, nowMs: 1040 })).toEqual({
      delayMs: 210,
      durationMs: MOBILE_READER_STAND_IN_FADE_MS,
    });
    expect(MOBILE_READER_STAND_IN_FADE_MS).toBe(300);
  });

  test("ready mid-zoom: a 300 ms fade from that moment; ready after the landing: none", () => {
    expect(resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1400, nowMs: 1400 })).toEqual({
      delayMs: 0,
      durationMs: 300,
    });
    expect(resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1600, nowMs: 1600 })).toBeNull();
  });

  test("route wiring: the stand-in sits over the reader and under the cover, cross-fading with it", () => {
    const route = readFileSync(
      path.join(import.meta.dir, "../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
      "utf8",
    );
    const reader = route.indexOf("<ReaderScreen />");
    const standIn = route.indexOf("{standIn && standInMounted ? (");
    const cover = route.indexOf("<ZoomTarget\n");
    expect(reader).toBeGreaterThan(0);
    expect(standIn).toBeGreaterThan(reader);
    expect(cover).toBeGreaterThan(standIn);
    expect(route).toContain("opacity: 1 - opacity.value");
    expect(route).toContain("onStarted={coverReveal.onZoomStarted}");
  });
});
