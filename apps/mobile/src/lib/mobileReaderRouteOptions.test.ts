import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS,
  mobileReaderScreenOptions,
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

  test("keeps edge-swipe back on every other screen while opting out of the iOS 26 full-screen pop", () => {
    expect(MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS).toEqual({
      fullScreenGestureEnabled: false,
      gestureEnabled: true,
    });
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
