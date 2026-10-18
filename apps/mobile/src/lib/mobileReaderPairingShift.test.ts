import { describe, expect, test } from "bun:test";
import {
  mobileReaderPairingShiftFor,
  mobileReaderPairingShiftKey,
  mobileReaderPairingShifted,
  normalizeMobileReaderPairingShifts,
  toggleMobileReaderPairingShift,
} from "./mobileReaderPairingShift";

describe("shift by one page", () => {
  const key = mobileReaderPairingShiftKey("r", "s", "m");

  test("a chapter's choice stays with that chapter", () => {
    const shifts = toggleMobileReaderPairingShift({}, key, "c1", [null, "c2"]);
    expect(mobileReaderPairingShifted(shifts[key], "c1")).toBe(true);
    expect(mobileReaderPairingShifted(shifts[key], "c2")).toBe(false);
    expect(mobileReaderPairingShiftFor(shifts[key], "c2")).toEqual({ shift: false, fallbackShift: false });
    expect(mobileReaderPairingShifted(undefined, "c1")).toBe(false);
  });

  test("the same correction on two neighbouring chapters becomes the manga's default for chapters without a choice", () => {
    let shifts = toggleMobileReaderPairingShift({}, key, "c1", [null, "c2"]);
    shifts = toggleMobileReaderPairingShift(shifts, key, "c2", ["c1", "c3"]);
    expect(shifts[key]?.learned).toBe(true);
    // The learned default only flips spreads the fixed rule decided.
    expect(mobileReaderPairingShiftFor(shifts[key], "c3")).toEqual({ shift: false, fallbackShift: true });
    expect(mobileReaderPairingShifted(shifts[key], "c3")).toBe(true);
    // Chapters with their own choice keep it whole.
    expect(mobileReaderPairingShiftFor(shifts[key], "c2")).toEqual({ shift: true, fallbackShift: false });
  });

  test("corrections on chapters that are not neighbours teach nothing", () => {
    let shifts = toggleMobileReaderPairingShift({}, key, "c1", [null, "c2"]);
    shifts = toggleMobileReaderPairingShift(shifts, key, "c5", ["c4", "c6"]);
    expect(shifts[key]?.learned).toBeUndefined();
    expect(mobileReaderPairingShifted(shifts[key], "c3")).toBe(false);
  });

  test("a manual choice beats the learned default, and undoing it twice unlearns it", () => {
    let shifts = toggleMobileReaderPairingShift({}, key, "c1", [null, "c2"]);
    shifts = toggleMobileReaderPairingShift(shifts, key, "c2", ["c1", "c3"]);
    // c3 reads shifted by the learned default; the reader turns it off.
    shifts = toggleMobileReaderPairingShift(shifts, key, "c3", ["c2", "c4"]);
    expect(mobileReaderPairingShiftFor(shifts[key], "c3")).toEqual({ shift: false, fallbackShift: false });
    expect(shifts[key]?.learned).toBe(true);
    shifts = toggleMobileReaderPairingShift(shifts, key, "c4", ["c3", "c5"]);
    expect(shifts[key]?.learned).toBeUndefined();
    expect(mobileReaderPairingShifted(shifts[key], "c5")).toBe(false);
  });

  test("other manga are not affected", () => {
    const shifts = toggleMobileReaderPairingShift({}, key, "c1");
    expect(mobileReaderPairingShifted(shifts[mobileReaderPairingShiftKey("r", "s", "other")], "c1")).toBe(false);
  });

  test("saved values are sanitized; the old manga-wide latest choice no longer carries", () => {
    expect(normalizeMobileReaderPairingShifts({ a: { shift: true, chapters: { c: true, d: 1 } }, b: 3 }))
      .toEqual({ a: { chapters: { c: true } } });
    expect(normalizeMobileReaderPairingShifts({ a: { learned: true } })).toEqual({ a: { chapters: {}, learned: true } });
    expect(normalizeMobileReaderPairingShifts(null)).toEqual({});
    const legacy = normalizeMobileReaderPairingShifts({ [key]: { shift: true, chapters: { c1: true } } });
    expect(mobileReaderPairingShifted(legacy[key], "c2")).toBe(false);
  });
});
