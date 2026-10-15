import { beforeEach, describe, expect, test } from "bun:test";
import {
  isMobileLaunchContentReady,
  markMobileLaunchContentReady,
  resetMobileLaunchContentReadyForTests,
  shouldHideMobileSplashScreen,
  subscribeMobileLaunchContentReady,
} from "./mobileSplashScreen";

describe("mobile splash screen", () => {
  test("hides only once the root has laid out and the first content is ready", () => {
    expect(shouldHideMobileSplashScreen({ rootLaidOut: false, splashHidden: false, contentReady: true })).toBe(false);
    expect(shouldHideMobileSplashScreen({ rootLaidOut: true, splashHidden: false, contentReady: false })).toBe(false);
    expect(shouldHideMobileSplashScreen({ rootLaidOut: true, splashHidden: true, contentReady: true })).toBe(false);
    expect(shouldHideMobileSplashScreen({ rootLaidOut: true, splashHidden: false, contentReady: true })).toBe(true);
  });
});

describe("launch content readiness", () => {
  beforeEach(() => resetMobileLaunchContentReadyForTests());

  test("notifies once, the first time the content is marked ready", () => {
    let calls = 0;
    const unsubscribe = subscribeMobileLaunchContentReady(() => {
      calls += 1;
    });
    expect(isMobileLaunchContentReady()).toBe(false);
    markMobileLaunchContentReady();
    markMobileLaunchContentReady();
    expect(isMobileLaunchContentReady()).toBe(true);
    expect(calls).toBe(1);
    unsubscribe();
  });

  test("an unsubscribed listener is not called", () => {
    let called = false;
    subscribeMobileLaunchContentReady(() => {
      called = true;
    })();
    markMobileLaunchContentReady();
    expect(called).toBe(false);
  });
});
