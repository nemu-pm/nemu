import { describe, expect, test } from "bun:test";
import {
  MOBILE_OUTER_COVER_FALLBACK_BACKGROUND,
  mobileOuterCoverAfterCameraAccess,
  mobileOuterCoverBackgroundColor,
  mobileOuterCoverToggleVisible,
  shouldRunMobileOuterCover,
} from "./mobileOuterCover";
import type { MobileWindowLayout } from "./mobileWindowLayout";

const iphone: MobileWindowLayout = { width: 402, height: 874, supported: true, divisions: [], occlusions: [] };
const duoOuter: MobileWindowLayout = {
  width: 386,
  height: 678,
  supported: true,
  divisions: [],
  occlusions: [],
  hinge: "closed",
  fillsScreen: true,
};
const duoInnerFlat: MobileWindowLayout = {
  width: 871,
  height: 669,
  supported: true,
  divisions: [],
  occlusions: [],
  hinge: "fullyOpen",
  fillsScreen: true,
};
const duoInnerBook: MobileWindowLayout = {
  ...duoInnerFlat,
  hinge: "partiallyOpen",
  divisions: [{ id: "division-0", x: 415, y: 0, width: 40, height: 669, active: true }],
};
/** Partly open with no fold region and an outer-sized window: tent, on the outer display. */
const duoTent: MobileWindowLayout = { ...duoOuter, hinge: "partiallyOpen" };

const run = (overrides: Partial<Parameters<typeof shouldRunMobileOuterCover>[0]>) =>
  shouldRunMobileOuterCover({
    toggleVisible: true,
    enabled: true,
    readerFocused: true,
    appState: "active",
    layout: duoInnerFlat,
    ...overrides,
  });

describe("outer cover toggle visibility", () => {
  test("only where the binary and OS support it and the device reports a hinge", () => {
    expect(mobileOuterCoverToggleVisible({ nativeSupported: true, layout: duoInnerFlat })).toBe(true);
    // The hinge is reported on the outer display too.
    expect(mobileOuterCoverToggleVisible({ nativeSupported: true, layout: duoOuter })).toBe(true);
    expect(mobileOuterCoverToggleVisible({ nativeSupported: true, layout: iphone })).toBe(false);
    expect(mobileOuterCoverToggleVisible({ nativeSupported: true, layout: null })).toBe(false);
    // Older SDK / OS (or Android, web): never.
    expect(mobileOuterCoverToggleVisible({ nativeSupported: false, layout: duoInnerFlat })).toBe(false);
  });

  test("a fold region without a hinge report still counts", () => {
    expect(
      mobileOuterCoverToggleVisible({ nativeSupported: true, layout: { hinge: null, divisions: duoInnerBook.divisions } }),
    ).toBe(true);
  });
});

describe("when the outer cover runs", () => {
  test("toggle on, reader focused, foreground, open on the inner display", () => {
    expect(run({})).toBe(true);
    expect(run({ layout: duoInnerBook })).toBe(true);
  });

  test("the toggle: off by default means never", () => {
    expect(run({ enabled: false })).toBe(false);
    expect(run({ toggleVisible: false })).toBe(false);
  });

  test("the reader: closed, covered by another screen", () => {
    expect(run({ readerFocused: false })).toBe(false);
  });

  test("the app: background stops it, inactive (fold transition, Control Center) does not", () => {
    expect(run({ appState: "background" })).toBe(false);
    expect(run({ appState: "unknown" })).toBe(false);
    expect(run({ appState: "inactive" })).toBe(true);
  });

  test("the posture: folded closed, tent or unknown never run", () => {
    expect(run({ layout: duoOuter })).toBe(false);
    expect(run({ layout: duoTent })).toBe(false);
    expect(run({ layout: iphone })).toBe(false);
    expect(run({ layout: { ...duoInnerFlat, hinge: null } })).toBe(false);
  });

  test("not full-screen reading (Split View) does not run", () => {
    expect(run({ layout: { ...duoInnerFlat, fillsScreen: false } })).toBe(false);
    // Unknown counts as full screen, like the rest of the reader.
    expect(run({ layout: { ...duoInnerFlat, fillsScreen: undefined } })).toBe(true);
  });

  test("every switch must hold at once", () => {
    const cases = [
      { enabled: false },
      { readerFocused: false },
      { appState: "background" },
      { layout: duoOuter },
    ] as const;
    for (const overrides of cases) expect(run(overrides)).toBe(false);
  });
});

describe("outer cover background colour", () => {
  test("the cover-derived colour as #RRGGBB", () => {
    expect(mobileOuterCoverBackgroundColor({ r: 88, g: 121, b: 244 })).toBe("#5879f4");
    expect(mobileOuterCoverBackgroundColor({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(mobileOuterCoverBackgroundColor({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
  });

  test("rounds and clamps sampled channels", () => {
    expect(mobileOuterCoverBackgroundColor({ r: 12.6, g: -4, b: 300 })).toBe("#0d00ff");
  });

  test("black when there is no colour", () => {
    expect(MOBILE_OUTER_COVER_FALLBACK_BACKGROUND).toBe("#000000");
    expect(mobileOuterCoverBackgroundColor(null)).toBe("#000000");
    expect(mobileOuterCoverBackgroundColor(undefined)).toBe("#000000");
    expect(mobileOuterCoverBackgroundColor({ r: Number.NaN, g: 0, b: 0 })).toBe("#000000");
  });
});

describe("camera permission answer", () => {
  test("granted turns the toggle on; anything else snaps it back with the note", () => {
    expect(mobileOuterCoverAfterCameraAccess("granted")).toEqual({ enabled: true, deniedNote: false });
    expect(mobileOuterCoverAfterCameraAccess("denied")).toEqual({ enabled: false, deniedNote: true });
    expect(mobileOuterCoverAfterCameraAccess("restricted")).toEqual({ enabled: false, deniedNote: true });
    expect(mobileOuterCoverAfterCameraAccess("undetermined")).toEqual({ enabled: false, deniedNote: true });
  });
});
