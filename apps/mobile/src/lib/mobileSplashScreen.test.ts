import { beforeEach, describe, expect, test } from "bun:test";
import {
  claimMobileSplashHide,
  holdMobileLaunchRevealForImage,
  MOBILE_SPLASH_CONTENT_TIMEOUT_MS,
  registerMobileSplashForceHide,
  releaseMobileSplashHideClaim,
  startMobileSplashSafetyCap,
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

describe("launch screen safety cap", () => {
  beforeEach(() => resetMobileLaunchContentReadyForTests());

  test("counts from the given JS start and force-hides when the root never took over", async () => {
    let forced = 0;
    registerMobileSplashForceHide(() => {
      forced += 1;
    });
    // JS started (almost) a whole cap ago: only the remainder is left.
    startMobileSplashSafetyCap(Date.now() - MOBILE_SPLASH_CONTENT_TIMEOUT_MS + 20);
    expect(isMobileLaunchContentReady()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(isMobileLaunchContentReady()).toBe(true);
    expect(forced).toBe(1);
    expect(claimMobileSplashHide()).toBe(false);
  });

  test("a root that claimed the hide first is not force-hidden", async () => {
    let forced = 0;
    registerMobileSplashForceHide(() => {
      forced += 1;
    });
    startMobileSplashSafetyCap(Date.now() - MOBILE_SPLASH_CONTENT_TIMEOUT_MS);
    expect(claimMobileSplashHide()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(isMobileLaunchContentReady()).toBe(true);
    expect(forced).toBe(0);
  });

  test("the cap releases the content through image holds and wakes the root", async () => {
    let woke = 0;
    subscribeMobileLaunchContentReady(() => {
      woke += 1;
      // The root's listener claims the hide synchronously.
      claimMobileSplashHide();
    });
    let forced = 0;
    registerMobileSplashForceHide(() => {
      forced += 1;
    });
    holdMobileLaunchRevealForImage();
    startMobileSplashSafetyCap(Date.now() - MOBILE_SPLASH_CONTENT_TIMEOUT_MS);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(woke).toBe(1);
    expect(forced).toBe(0);
  });

  test("a force-hide registered after expiry runs at once; a failed reveal hands the hide to it", async () => {
    startMobileSplashSafetyCap(Date.now() - MOBILE_SPLASH_CONTENT_TIMEOUT_MS);
    await new Promise((resolve) => setTimeout(resolve, 20));
    let forced = 0;
    registerMobileSplashForceHide(() => {
      forced += 1;
    });
    expect(forced).toBe(1);
    resetMobileLaunchContentReadyForTests();
    registerMobileSplashForceHide(() => {
      forced += 1;
    });
    startMobileSplashSafetyCap(Date.now() - MOBILE_SPLASH_CONTENT_TIMEOUT_MS);
    expect(claimMobileSplashHide()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(forced).toBe(1);
    releaseMobileSplashHideClaim();
    expect(forced).toBe(2);
  });
});
