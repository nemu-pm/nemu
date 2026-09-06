import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
  acquireMobileReaderHostGestureLock,
  mobileReaderScreenOptions,
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
    expect(shown.statusBarAnimation).toBe("fade");
    // Toggling the chrome must never re-set gesture options: they are declared
    // on the route, and a re-set from inside the screen races the pop gesture.
    for (const options of [shown, hidden]) {
      expect(Object.keys(options).sort()).toEqual([
        "statusBarAnimation",
        "statusBarHidden",
        "statusBarStyle",
      ]);
    }
  });
});
