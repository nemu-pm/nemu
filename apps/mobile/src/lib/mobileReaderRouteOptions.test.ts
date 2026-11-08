import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
  acquireMobileReaderHostBackground,
  acquireMobileReaderHostGestureLock,
  isMobileReaderRouteSegments,
  mobileSourcesStackContainerBackground,
  mobileReaderScreenOptions,
  resetMobileReaderHostBackgroundForTesting,
  resetMobileReaderHostGestureLocksForTesting,
} from "./mobileReaderRouteOptions";

describe("mobile reader route options", () => {
  test("names the reader route as expo-router derives it from the file tree", () => {
    // app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx
    expect(MOBILE_READER_ROUTE_NAME).toBe(
      "[registryId]/[sourceId]/[mangaId]/[chapterId]",
    );
  });

  test("gives the reader no pop gesture at all", () => {
    expect(MOBILE_READER_STACK_GESTURE_OPTIONS).toEqual({
      fullScreenGestureEnabled: false,
      gestureEnabled: false,
    });
  });

  test("keeps the iOS 26 full-screen back swipe on for every other screen", () => {
    expect(MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS).toEqual({
      fullScreenGestureEnabled: true,
      gestureEnabled: true,
    });
  });

  test("locks the host screen's pop gesture while any reader is mounted", () => {
    resetMobileReaderHostGestureLocksForTesting();
    const calls: unknown[] = [];
    const setOptions = (options: unknown) => calls.push(options);

    const releaseFirst = acquireMobileReaderHostGestureLock(setOptions);
    expect(calls).toEqual([MOBILE_READER_STACK_GESTURE_OPTIONS]);

    // A chapter switch mounts the next reader before the previous unmounts.
    const releaseSecond = acquireMobileReaderHostGestureLock(setOptions);
    releaseFirst();
    expect(calls).toEqual([
      MOBILE_READER_STACK_GESTURE_OPTIONS,
      MOBILE_READER_STACK_GESTURE_OPTIONS,
    ]);

    releaseSecond();
    expect(calls.at(-1)).toEqual(MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS);

    // Releasing twice is a no-op.
    releaseSecond();
    expect(calls.length).toBe(3);
  });

  test("tolerates a missing parent navigator", () => {
    resetMobileReaderHostGestureLocksForTesting();
    const release = acquireMobileReaderHostGestureLock(undefined);
    expect(() => release()).not.toThrow();
  });

  test("only the status bar follows the reader chrome", () => {
    const shown = mobileReaderScreenOptions({ showControls: true });
    const hidden = mobileReaderScreenOptions({ showControls: false });
    expect(shown.statusBarHidden).toBe(false);
    expect(hidden.statusBarHidden).toBe(true);
    expect(shown.statusBarStyle).toBe("light");
    // A light page background (白色) takes dark glyphs.
    expect(mobileReaderScreenOptions({ showControls: true, lightPage: true }).statusBarStyle).toBe("dark");
    expect(shown.statusBarAnimation).toBe("fade");
    // Immersive reading: the home indicator hides with the chrome.
    expect(shown.autoHideHomeIndicator).toBe(false);
    expect(hidden.autoHideHomeIndicator).toBe(true);
    // Toggling the chrome must never re-set gesture options: they are declared
    // on the route, and a re-set from inside the screen races the pop gesture.
    for (const options of [shown, hidden]) {
      expect(Object.keys(options).sort()).toEqual([
        "autoHideHomeIndicator",
        "statusBarAnimation",
        "statusBarHidden",
        "statusBarStyle",
      ]);
    }
  });

  test("the reader screen paints its page background behind its content (a chapter switch's card corners)", () => {
    expect(mobileReaderScreenOptions({ showControls: true, backgroundColor: "#ffffff" }).contentStyle).toEqual({
      backgroundColor: "#ffffff",
    });
    const appDir = path.join(import.meta.dir, "../..");
    const layout = readFileSync(path.join(appDir, "app/sources/_layout.tsx"), "utf8");
    expect(layout).not.toContain('contentStyle: { backgroundColor: "#000000" }');
    expect(layout).toContain("contentStyle: { backgroundColor: readerBackgroundColor }");
  });

  test("the host screen takes the page background while a reader is mounted; the latest wins, the last restores", () => {
    resetMobileReaderHostBackgroundForTesting();
    const calls: string[] = [];
    const set = (options: { contentStyle: { backgroundColor: string } }) => calls.push(options.contentStyle.backgroundColor);
    const first = acquireMobileReaderHostBackground(set, "#ffffff", "#000000");
    // router.replace: the next chapter's reader mounts before this one unmounts.
    const second = acquireMobileReaderHostBackground(set, "#fefefe", "#000000");
    first();
    expect(calls).toEqual(["#ffffff", "#fefefe", "#fefefe"]);
    second();
    expect(calls[calls.length - 1]).toBe("#000000");
    second();
    expect(calls.length).toBe(4);
  });
});

describe("sources stack container background", () => {
  const readerSegments = ["sources", "[registryId]", "[sourceId]", "[mangaId]", "[chapterId]"];

  test("recognises the reader route from expo-router's segments", () => {
    expect(isMobileReaderRouteSegments(readerSegments)).toBe(true);
    expect(isMobileReaderRouteSegments(["sources", "[registryId]", "[sourceId]", "[mangaId]"])).toBe(false);
    expect(isMobileReaderRouteSegments(["(tabs)", "library"])).toBe(false);
    expect(isMobileReaderRouteSegments(["[registryId]", "[sourceId]", "[mangaId]", "[chapterId]"])).toBe(false);
    expect(isMobileReaderRouteSegments([])).toBe(false);
  });

  test("is the reader's page background while the reader is on top (a chapter switch's card corners)", () => {
    expect(
      mobileSourcesStackContainerBackground({
        segments: readerSegments,
        readerBackgroundColor: "#ffffff",
        appBackgroundColor: "#090a0d",
      }),
    ).toBe("#ffffff");
  });

  test("stays the app's background on manga detail", () => {
    expect(
      mobileSourcesStackContainerBackground({
        segments: ["sources", "[registryId]", "[sourceId]", "[mangaId]"],
        readerBackgroundColor: "#ffffff",
        appBackgroundColor: "#090a0d",
      }),
    ).toBe("#090a0d");
  });

  test("the sources stack takes it through its navigation theme", () => {
    const layout = readFileSync(path.join(import.meta.dir, "../../app/sources/_layout.tsx"), "utf8");
    expect(layout).toContain("mobileSourcesStackContainerBackground(");
    expect(layout).toContain("<ThemeProvider value={navigationTheme}>");
  });
});
