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

  test("ready mid-zoom: the fade from that moment, ending by the landing + 50 ms", () => {
    // Lands at 1550: ready at 1400 → 1400..1600 (not 1400..1700).
    expect(resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1400, nowMs: 1400 })).toEqual({
      delayMs: 0,
      durationMs: 200,
    });
    // Ready in time, but the zoom's start reached JS late (now 1300): what is left of the window.
    expect(resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1100, nowMs: 1300 })).toEqual({
      delayMs: 0,
      durationMs: 300,
    });
    expect(resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1100, nowMs: 1450 })).toEqual({
      delayMs: 0,
      durationMs: 150,
    });
    // Build 9 #3: zoom 126 + 350 → lands 476; known at ~580 → a cut, not 580..880.
    expect(resolveMobileReaderStandInFade({ startedAtMs: 126, durationMs: 350, readyAtMs: 580, nowMs: 580 })).toEqual({
      delayMs: 0,
      durationMs: 0,
    });
    for (const nowMs of [1000, 1200, 1300, 1400, 1500, 1550, 1580, 1700]) {
      const plan = resolveMobileReaderStandInFade({ startedAtMs: 1000, durationMs: 550, readyAtMs: 1000, nowMs });
      expect(nowMs + plan.delayMs + plan.durationMs).toBeLessThanOrEqual(Math.max(1600, nowMs));
    }
  });

  test("route wiring: the stand-in sits over the reader and under the cover, cross-fading with it", () => {
    const route = readFileSync(
      path.join(import.meta.dir, "../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
      "utf8",
    );
    const reader = route.indexOf("<ReaderScreen />");
    const standIn = route.indexOf("{standIn && standInMounted ? (");
    const cover = route.indexOf("<ZoomTarget zoomId={zoomId} style={coverRect}>");
    expect(reader).toBeGreaterThan(0);
    expect(standIn).toBeGreaterThan(reader);
    expect(cover).toBeGreaterThan(standIn);
    expect(route).toContain("opacity: (1 - opacity.value) * standInOut.value");
    expect(route).toContain("onStarted={coverReveal.onZoomStarted}");
    // The hold's cap never cancels the armed cross-fade for a later one.
    const holdCap = route.slice(route.indexOf("const armHoldCap = useCallback"), route.indexOf("cancelAnimation(opacity);", route.indexOf("const armHoldCap = useCallback")));
    expect(holdCap).toContain("if (standInFadeArmedRef.current) return;");
  });

  test("native: only registered reader pages are kept decoded, in a bounded store (the stand-in reuses the reader's decode)", () => {
    const native = readFileSync(
      path.join(import.meta.dir, "../../modules/nemu-aidoku/ios/NemuReaderImageCacheLimits.m"),
      "utf8",
    );
    expect(native).toContain("@selector(addImageToCache:URL:size:scale:resizeMode:response:)");
    expect(native).toContain("[url hasPrefix:@\"file://\"]");
    // RCTImageCache's own key format (RCTCacheKeyForImage).
    expect(native).toContain('@"%@|%g|%g|%g|%lld"');
    expect(native).toContain("RCTSetImageCacheLimits(");
    // Bounded and opt-in: only URLs JS registered, never RCTImageCache itself.
    expect(native).toContain("NemuReaderRetainedURLLimit = 16;");
    expect(native).toContain("NemuReaderRetainedImageCountLimit = 8;");
    expect(native).toContain("NemuReaderRetainedImageCostLimit = 48 * 1024 * 1024;");
    expect(native).toContain("if (![_urls containsObject:url]) {");
    expect(native).toContain("UIApplicationDidReceiveMemoryWarningNotification");
    expect(native).not.toContain("addImageToCache:image forKey:");
    const swift = readFileSync(
      path.join(import.meta.dir, "../../modules/nemu-aidoku/ios/NemuAidokuModule.swift"),
      "utf8",
    );
    expect(swift).toContain('Function("retainReaderDecodedImage")');
    expect(swift).toContain('Notification.Name("NemuReaderRetainDecodedImage")');
    expect(native).toContain('@"NemuReaderRetainDecodedImage"');
    // Who registers: the stand-in, and paged reading's pages (never scroll strips).
    const route = readFileSync(
      path.join(import.meta.dir, "../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
      "utf8",
    );
    expect(route).toContain("retainDecoded\n                onLoad={() => onStandInPageLoad(page.id)}");
    const frame = readFileSync(path.join(import.meta.dir, "../components/reader/MobileReaderPageFrame.tsx"), "utf8");
    expect(frame).toContain("retainDecoded={quietLoading ? false : retainDecoded}");
  });
});
