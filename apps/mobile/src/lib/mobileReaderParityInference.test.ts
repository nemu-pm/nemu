import { describe, expect, test } from "bun:test";
import {
  inferMobileReaderSegmentParity,
  mobileReaderEdgeContinuity,
  mobileReaderSideEvidence,
  type MobileReaderParityFeatures,
} from "./mobileReaderParityInference";

const flat = new Array(48).fill(1);
/** A scanned page: binding margin 8%, outer 3%. `side` = where it sat in the book. */
const page = (side: "left" | "right" | "none"): MobileReaderParityFeatures => ({
  width: 700,
  height: 1000,
  marginL: side === "right" ? 0.08 : 0.03,
  marginR: side === "left" ? 0.08 : 0.03,
  edgeL: flat,
  edgeR: flat,
});
/** Pages of a cover-alone RTL book from `start`: odd global indexes sit on the right. */
const book = (start: number, length: number) =>
  Array.from({ length }, (_, j) => page((start + j) % 2 === 1 ? "right" : "left"));

describe("automatic spread parity", () => {
  test("a binding margin on the left means the page sat on the right", () => {
    expect(mobileReaderSideEvidence(page("right"))).toBeGreaterThan(0.5);
    expect(mobileReaderSideEvidence(page("left"))).toBeLessThan(-0.5);
    expect(mobileReaderSideEvidence(page("none"))).toBe(0);
    expect(mobileReaderSideEvidence({ ...page("right"), width: 1500 })).toBe(0);
  });

  test("RTL: a chapter starting on a right-hand page pairs from its first page", () => {
    const pages = book(1, 8);
    expect(inferMobileReaderSegmentParity({
      segment: { start: 0, end: 8, wide: false }, featuresAt: (i) => pages[i], rtl: true,
    })).toBe(0);
  });

  test("RTL: a chapter starting on a left-hand page leaves it alone", () => {
    const pages = book(0, 8);
    expect(inferMobileReaderSegmentParity({
      segment: { start: 0, end: 8, wide: false }, featuresAt: (i) => pages[i], rtl: true,
    })).toBe(1);
  });

  test("LTR reads the left-hand page first", () => {
    // Left-hand pages at even indexes: an LTR book pairs (0,1)(2,3).
    const pages = Array.from({ length: 8 }, (_, j) => page(j % 2 === 0 ? "left" : "right"));
    expect(inferMobileReaderSegmentParity({
      segment: { start: 0, end: 8, wide: false }, featuresAt: (i) => pages[i], rtl: false,
    })).toBe(0);
  });

  test("abstains without evidence (web comics, pages not measured yet)", () => {
    const pages = Array.from({ length: 8 }, () => page("none"));
    expect(inferMobileReaderSegmentParity({
      segment: { start: 0, end: 8, wide: false }, featuresAt: (i) => pages[i], rtl: true,
    })).toBeNull();
    expect(inferMobileReaderSegmentParity({
      segment: { start: 0, end: 8, wide: false }, featuresAt: () => null, rtl: true,
    })).toBeNull();
  });

  test("a missing page changes parity where it was", () => {
    // Global book pages 1..20 with page 11 missing.
    const pages = [...book(1, 10), ...book(12, 10)];
    const parity = inferMobileReaderSegmentParity({
      segment: { start: 0, end: 20, wide: false }, featuresAt: (i) => pages[i], rtl: true,
    });
    expect(Array.isArray(parity)).toBe(true);
    const states = parity as ReadonlyArray<0 | 1>;
    expect(states[0]).toBe(0);
    expect(states[19]).toBe(1);
  });

  test("artwork running across the inner edges matches", () => {
    const art = Array.from({ length: 48 }, (_, i) => (i % 6 < 3 ? 0.2 : 0.6));
    const right = { ...page("none"), edgeL: art };
    const left = { ...page("none"), edgeR: art };
    expect(mobileReaderEdgeContinuity(right, left)).toBe(1);
    expect(mobileReaderEdgeContinuity(page("none"), page("none"))).toBe(0);
  });
});
