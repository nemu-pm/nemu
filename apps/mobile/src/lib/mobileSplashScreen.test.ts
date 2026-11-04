import { beforeEach, describe, expect, test } from "bun:test";
import {
  claimMobileSplashHide,
  MOBILE_SPLASH_CONTENT_TIMEOUT_MS,
  registerMobileSplashForceHide,
  releaseMobileSplashHideClaim,
  startMobileSplashSafetyCap,
  holdMobileLaunchLayout,
  isMobileLaunchContentReady,
  isMobileLaunchLayoutSettled,
  markMobileLaunchContentReady,
  resetMobileLaunchContentReadyForTests,
  shouldHideMobileSplashScreen,
  subscribeMobileLaunchContentReady,
} from "./mobileSplashScreen";

describe("mobile splash screen", () => {
  test("hides only once the root has laid out and the first content is ready", () => {
    const ready = { rootLaidOut: true, splashHidden: false, contentReady: true, layoutSettled: true };
    expect(shouldHideMobileSplashScreen({ ...ready, rootLaidOut: false })).toBe(false);
    expect(shouldHideMobileSplashScreen({ ...ready, contentReady: false })).toBe(false);
    expect(shouldHideMobileSplashScreen({ ...ready, splashHidden: true })).toBe(false);
    expect(shouldHideMobileSplashScreen({ ...ready, layoutSettled: false })).toBe(false);
    expect(shouldHideMobileSplashScreen(ready)).toBe(true);
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

describe("launch layout holds", () => {
  beforeEach(() => resetMobileLaunchContentReadyForTests());

  test("settled only once every hold is released, waking the root then", () => {
    let woke = 0;
    subscribeMobileLaunchContentReady(() => {
      woke += 1;
    });
    const releaseWindow = holdMobileLaunchLayout();
    const releaseViewport = holdMobileLaunchLayout();
    expect(isMobileLaunchLayoutSettled()).toBe(false);
    releaseWindow();
    releaseWindow();
    expect(isMobileLaunchLayoutSettled()).toBe(false);
    expect(woke).toBe(0);
    releaseViewport();
    expect(isMobileLaunchLayoutSettled()).toBe(true);
    expect(woke).toBe(1);
  });

  test("no hold once the launch screen is lifted", () => {
    expect(claimMobileSplashHide()).toBe(true);
    holdMobileLaunchLayout();
    expect(isMobileLaunchLayoutSettled()).toBe(true);
  });

  test("the safety cap releases a hold that never settled and wakes the root", async () => {
    let woke = 0;
    markMobileLaunchContentReady();
    subscribeMobileLaunchContentReady(() => {
      woke += 1;
    });
    holdMobileLaunchLayout();
    startMobileSplashSafetyCap(Date.now() - MOBILE_SPLASH_CONTENT_TIMEOUT_MS);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(isMobileLaunchLayoutSettled()).toBe(true);
    expect(woke).toBe(1);
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

  test("the cap releases the content and wakes the root", async () => {
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
