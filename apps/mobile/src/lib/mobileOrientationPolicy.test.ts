import { describe, expect, test } from "bun:test";
import {
  mobileDeviceFormFactor,
  mobileOrientationLock,
  mobileReaderOnPhoneSizedDisplay,
  mobileReaderOrientationLockAvailable,
  mobileReaderPortraitRequest,
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
  test("an iPhone is portrait everywhere, reader or not", () => {
    expect(mobileOrientationLock({ formFactor: "phone", readerWantsPortrait: false })).toBe("portrait");
  });

  test("Duo and iPad rotate unless the reader asks for portrait", () => {
    for (const formFactor of ["foldable", "tablet", "unknown"] as const) {
      expect(mobileOrientationLock({ formFactor, readerWantsPortrait: false })).toBe("default");
      expect(mobileOrientationLock({ formFactor, readerWantsPortrait: true })).toBe("portrait");
    }
  });

  test("the reader stays portrait on the Duo outer display and follows the switch inside", () => {
    const outer = mobileReaderOnPhoneSizedDisplay({ formFactor: "foldable", layout: duoOuter });
    const inner = mobileReaderOnPhoneSizedDisplay({ formFactor: "foldable", layout: duoInner });
    expect(outer).toBe(true);
    expect(inner).toBe(false);
    expect(mobileReaderPortraitRequest({ phoneSizedDisplay: outer, userLock: false })).toBe(true);
    expect(mobileReaderPortraitRequest({ phoneSizedDisplay: inner, userLock: false })).toBe(false);
    expect(mobileReaderPortraitRequest({ phoneSizedDisplay: inner, userLock: true })).toBe(true);
    // Book or laptop before the fold region reports, and tent on the outer display.
    expect(mobileReaderOnPhoneSizedDisplay({ formFactor: "foldable", layout: { ...duoInner, divisions: [], hinge: "partiallyOpen" } })).toBe(false);
    expect(mobileReaderOnPhoneSizedDisplay({ formFactor: "foldable", layout: { ...duoOuter, width: 678, height: 466, hinge: "partiallyOpen" } })).toBe(true);
    // Fully open and flat, the inner display reports no fold.
    expect(mobileReaderOnPhoneSizedDisplay({ formFactor: "foldable", layout: { ...duoInner, divisions: [], hinge: "fullyOpen", fillsScreen: true } })).toBe(false);
    // Split View on the inner display is not the outer display.
    expect(mobileReaderOnPhoneSizedDisplay({ formFactor: "foldable", layout: { ...duoInner, divisions: [], hinge: "fullyOpen", fillsScreen: false } })).toBe(false);
  });

  test("the Orientation Lock row shows everywhere but an ordinary iPhone, on both Duo displays", () => {
    expect(mobileReaderOrientationLockAvailable({ formFactor: "phone" })).toBe(false);
    expect(mobileReaderOrientationLockAvailable({ formFactor: "foldable" })).toBe(true);
    expect(mobileReaderOrientationLockAvailable({ formFactor: "tablet" })).toBe(true);
    expect(mobileReaderOrientationLockAvailable({ formFactor: "unknown" })).toBe(true);
    // The outer display still holds the reader portrait, switch or not.
    expect(mobileReaderPortraitRequest({ phoneSizedDisplay: true, userLock: false })).toBe(true);
  });
});
