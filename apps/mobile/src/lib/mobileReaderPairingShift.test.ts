import { describe, expect, test } from "bun:test";
import {
  mobileReaderPairingShiftKey,
  mobileReaderPairingShifted,
  normalizeMobileReaderPairingShifts,
  toggleMobileReaderPairingShift,
} from "./mobileReaderPairingShift";

describe("shift by one page", () => {
  const key = mobileReaderPairingShiftKey("r", "s", "m");

  test("a chapter keeps its own choice; an unshifted chapter takes the manga's latest", () => {
    let shifts = toggleMobileReaderPairingShift({}, key, "c1");
    expect(mobileReaderPairingShifted(shifts[key], "c1")).toBe(true);
    expect(mobileReaderPairingShifted(shifts[key], "c2")).toBe(true);
    shifts = toggleMobileReaderPairingShift(shifts, key, "c2");
    expect(mobileReaderPairingShifted(shifts[key], "c2")).toBe(false);
    expect(mobileReaderPairingShifted(shifts[key], "c1")).toBe(true);
    expect(mobileReaderPairingShifted(shifts[key], "c3")).toBe(false);
    expect(mobileReaderPairingShifted(undefined, "c1")).toBe(false);
  });

  test("other manga are not affected", () => {
    const shifts = toggleMobileReaderPairingShift({}, key, "c1");
    expect(mobileReaderPairingShifted(shifts[mobileReaderPairingShiftKey("r", "s", "other")], "c1")).toBe(false);
  });

  test("saved values are sanitized", () => {
    expect(normalizeMobileReaderPairingShifts({ a: { shift: "yes", chapters: { c: true, d: 1 } }, b: 3 }))
      .toEqual({ a: { shift: false, chapters: { c: true } } });
    expect(normalizeMobileReaderPairingShifts(null)).toEqual({});
  });
});
