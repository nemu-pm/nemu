import { beforeEach, describe, expect, test } from "bun:test";
import {
  holdMobileLaunchRevealForImage,
  isMobileLaunchContentReady,
  MOBILE_LAUNCH_IMAGE_HOLD_MS,
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

  test("the reveal waits for the images mounted under the launch screen", () => {
    let calls = 0;
    subscribeMobileLaunchContentReady(() => {
      calls += 1;
    });
    const first = holdMobileLaunchRevealForImage()!;
    const second = holdMobileLaunchRevealForImage()!;
    markMobileLaunchContentReady();
    expect(isMobileLaunchContentReady()).toBe(false);
    first();
    first(); // a second release counts once
    expect(isMobileLaunchContentReady()).toBe(false);
    second();
    expect(isMobileLaunchContentReady()).toBe(true);
    expect(calls).toBe(1);
    // Mounted after the reveal: nothing to hold.
    expect(holdMobileLaunchRevealForImage()).toBeNull();
  });

  test("an image released before the snapshot holds nothing", () => {
    holdMobileLaunchRevealForImage()!();
    markMobileLaunchContentReady();
    expect(isMobileLaunchContentReady()).toBe(true);
  });

  test("an image that never paints holds the reveal only up to the cap", async () => {
    holdMobileLaunchRevealForImage();
    markMobileLaunchContentReady();
    expect(isMobileLaunchContentReady()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, MOBILE_LAUNCH_IMAGE_HOLD_MS + 50));
    expect(isMobileLaunchContentReady()).toBe(true);
  });
});
