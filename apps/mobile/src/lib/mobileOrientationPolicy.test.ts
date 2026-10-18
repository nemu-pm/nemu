import { describe, expect, test } from "bun:test";
import {
  mobileDeviceFormFactor,
  mobileOrientationLock,
  mobileOrientationLockWaitsForTransition,
  mobileReaderOrientationLockAvailable,
  mobileReaderOrientationRequest,
  mobileWindowOnInnerDisplay,
} from "./mobileOrientationPolicy";
import type { MobileWindowLayout } from "./mobileWindowLayout";

const iphone: MobileWindowLayout = { width: 402, height: 874, supported: true, divisions: [], occlusions: [] };
const duoOuter: MobileWindowLayout = { width: 466, height: 678, supported: true, divisions: [], occlusions: [], hinge: "closed", fillsScreen: true };
const duoInner: MobileWindowLayout = {
  width: 669,
  height: 951,
  supported: true,
  divisions: [{ id: "division-0", x: 0, y: 455.5, width: 669, height: 40, active: false }],
  occlusions: [],
  hinge: "fullyOpen",
  fillsScreen: true,
};

const decide = (overrides: Partial<Parameters<typeof mobileDeviceFormFactor>[0]>) =>
  mobileDeviceFormFactor({ platform: "ios", isPad: false, layout: iphone, previous: "unknown", probeElapsed: true, ...overrides });

describe("device form factor", () => {
  test("an iPhone is a phone only once the observer has had time to report a hinge", () => {
    expect(decide({ layout: null })).toBe("unknown");
    expect(decide({ probeElapsed: false })).toBe("unknown");
    expect(decide({})).toBe("phone");
    // Before iOS 27.1 there is no foldable iPhone.
    expect(decide({ layout: { ...iphone, supported: false }, probeElapsed: false })).toBe("phone");
  });

  test("the Duo is foldable from either display, and stays so", () => {
    expect(decide({ layout: duoOuter, probeElapsed: false })).toBe("foldable");
    expect(decide({ layout: { ...duoInner, hinge: undefined } })).toBe("foldable");
    expect(decide({ layout: { ...duoOuter, hinge: undefined }, previous: "foldable" })).toBe("foldable");
  });

  test("iPad is a tablet; Android keeps its own behaviour", () => {
    expect(decide({ isPad: true })).toBe("tablet");
    expect(decide({ platform: "android" })).toBe("unknown");
  });
});

describe("orientation lock", () => {
  test("releasing the reader's portrait waits for Back to finish; taking it does not", () => {
    // The Duo outer display aborted when the scene rotated under the pop.
    expect(mobileOrientationLockWaitsForTransition("portrait", "default")).toBe(true);
    expect(mobileOrientationLockWaitsForTransition("default", "portrait")).toBe(false);
    expect(mobileOrientationLockWaitsForTransition("portrait", "portrait")).toBe(false);
    expect(mobileOrientationLockWaitsForTransition("default", "default")).toBe(false);
  });

  test("an iPhone is portrait everywhere, reader or not", () => {
    expect(mobileOrientationLock({ formFactor: "phone", readerWantsPortrait: false })).toBe("portrait");
  });

  test("Duo and iPad rotate unless the reader asks for portrait", () => {
    for (const formFactor of ["foldable", "tablet", "unknown"] as const) {
      expect(mobileOrientationLock({ formFactor, readerWantsPortrait: false })).toBe("default");
      expect(mobileOrientationLock({ formFactor, readerWantsPortrait: true })).toBe("portrait");
    }
  });

  test("the reader rotates on both Duo displays; only the Orientation Lock holds it", () => {
    const request = (userLock: boolean, sceneLockAvailable = true) =>
      mobileReaderOrientationRequest({ userLock, sceneLockAvailable });
    expect(request(false)).toEqual({ portrait: false, keepOrientation: false });
    // The lock keeps the scene's orientation (the outer display's mask, the inner display's scene lock).
    expect(request(true)).toEqual({ portrait: false, keepOrientation: true });
    // An older binary without the scene lock still asks for portrait.
    expect(request(true, false)).toEqual({ portrait: true, keepOrientation: false });
    // With the lock off the app-wide lock stays the device's own: a Duo rotates, an iPhone does not.
    expect(mobileOrientationLock({ formFactor: "foldable", readerWantsPortrait: request(false).portrait })).toBe("default");
    expect(mobileOrientationLock({ formFactor: "phone", readerWantsPortrait: request(false).portrait })).toBe("portrait");
  });

  test("tells the Duo inner display from the outer one", () => {
    expect(mobileWindowOnInnerDisplay(duoOuter)).toBe(false);
    expect(mobileWindowOnInnerDisplay(duoInner)).toBe(true);
    // Book or laptop before the fold region reports, and tent on the outer display.
    expect(mobileWindowOnInnerDisplay({ ...duoInner, divisions: [], hinge: "partiallyOpen" })).toBe(true);
    expect(mobileWindowOnInnerDisplay({ ...duoOuter, width: 678, height: 466, hinge: "partiallyOpen" })).toBe(false);
    // Fully open and flat, the inner display reports no fold.
    expect(mobileWindowOnInnerDisplay({ ...duoInner, divisions: [], hinge: "fullyOpen" })).toBe(true);
  });

  test("the Orientation Lock row shows everywhere but an ordinary iPhone, on both Duo displays", () => {
    expect(mobileReaderOrientationLockAvailable({ formFactor: "phone" })).toBe(false);
    expect(mobileReaderOrientationLockAvailable({ formFactor: "foldable" })).toBe(true);
    expect(mobileReaderOrientationLockAvailable({ formFactor: "tablet" })).toBe(true);
    expect(mobileReaderOrientationLockAvailable({ formFactor: "unknown" })).toBe(true);
    // The outer display no longer holds the reader portrait.
    expect(mobileReaderOrientationRequest({ userLock: false, sceneLockAvailable: true }).portrait).toBe(false);
  });
});
