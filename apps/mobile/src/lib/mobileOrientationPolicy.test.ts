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
  test("an older binary (no foldableDevice) calls a phone-sized iPhone a phone only after the hinge timeout", () => {
    expect(decide({ layout: null })).toBe("unknown");
    expect(decide({ probeElapsed: false })).toBe("unknown");
    expect(decide({})).toBe("phone");
    // Before iOS 27.1 there is no foldable iPhone.
    expect(decide({ layout: { ...iphone, supported: false }, probeElapsed: false })).toBe("phone");
  });

  test("the device info decides, without a timeout", () => {
    // Native: the display is an ordinary iPhone's.
    expect(decide({ layout: { ...iphone, foldableDevice: false }, probeElapsed: false })).toBe("phone");
    // Native: the display is a foldable's, before any hinge report.
    expect(decide({ layout: { ...duoInner, hinge: undefined, divisions: [], foldableDevice: true }, probeElapsed: false })).toBe("foldable");
    expect(decide({ layout: null, nativeFoldable: true })).toBe("foldable");
    expect(decide({ layout: { ...iphone, foldableDevice: undefined }, nativeFoldable: true })).toBe("foldable");
    // The constant may be read before the display is known: false alone is not "phone".
    expect(decide({ layout: null, nativeFoldable: false })).toBe("unknown");
  });

  test("a cold launch on the inner display whose hinge is late is never a phone", () => {
    const silentInner: MobileWindowLayout = { ...duoInner, hinge: undefined, divisions: [] };
    expect(decide({ layout: silentInner })).toBe("unknown");
    expect(decide({ layout: { ...silentInner, width: 951, height: 669 } })).toBe("unknown");
    // Even a stale "phone" or a native "false" does not hold a window this wide portrait.
    expect(decide({ layout: silentInner, previous: "phone" })).toBe("unknown");
    expect(decide({ layout: { ...silentInner, foldableDevice: false } })).toBe("unknown");
    // The outer display is wider than any iPhone too.
    expect(decide({ layout: { ...duoOuter, hinge: undefined } })).toBe("unknown");
    // The hinge reports later: foldable.
    expect(decide({ layout: { ...silentInner, hinge: "fullyOpen" }, previous: "unknown" })).toBe("foldable");
    expect(decide({ layout: { ...silentInner, hinge: "fullyOpen" }, previous: "phone" })).toBe("foldable");
  });

  test("a Pro Max is still a phone", () => {
    const proMax: MobileWindowLayout = { ...iphone, width: 440, height: 956, foldableDevice: false };
    expect(decide({ layout: proMax, probeElapsed: false })).toBe("phone");
    expect(decide({ layout: { ...proMax, width: 956, height: 440 }, probeElapsed: false })).toBe("phone");
  });

  test("the Duo is foldable from either display, and stays so", () => {
    expect(decide({ layout: duoOuter, probeElapsed: false })).toBe("foldable");
    expect(decide({ layout: { ...duoInner, hinge: undefined } })).toBe("foldable");
    expect(decide({ layout: { ...duoOuter, hinge: undefined }, previous: "foldable" })).toBe("foldable");
    expect(decide({ layout: { ...iphone, foldableDevice: false }, previous: "foldable" })).toBe("foldable");
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

  test("before the hinge reports, the window size tells the displays apart", () => {
    const silent = { divisions: [], hinge: undefined };
    // The inner display, either orientation, device known or not.
    for (const foldableDevice of [true, undefined]) {
      expect(mobileWindowOnInnerDisplay({ ...duoInner, ...silent, foldableDevice })).toBe(true);
      expect(mobileWindowOnInnerDisplay({ ...duoInner, ...silent, width: 951, height: 669, foldableDevice })).toBe(true);
      // The outer display.
      expect(mobileWindowOnInnerDisplay({ ...duoOuter, ...silent, foldableDevice })).toBe(false);
    }
    // A Pro Max is longer than 800pt but no wider than a phone.
    expect(mobileWindowOnInnerDisplay({ width: 440, height: 956, divisions: [] })).toBe(false);
    expect(mobileWindowOnInnerDisplay({ width: 440, height: 956, divisions: [], foldableDevice: false })).toBe(false);
    // Known not foldable (an iPad): never the Duo inner display.
    expect(mobileWindowOnInnerDisplay({ width: 1024, height: 1366, divisions: [], foldableDevice: false })).toBe(false);
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
