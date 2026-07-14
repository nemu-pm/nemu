import { describe, expect, test } from "bun:test";
import type {
  AlignmentResult,
  DualReaderPlatformAdapter,
  DualReaderRgbaImage,
  LumaImage,
  SecondaryMatch,
} from "@nemu/core/dual-reader";
import {
  AUTO_ALIGN_WINDOW,
  buildAutoAlignCandidates,
  buildAutoAlignMatchOptions,
  buildMissingPlan,
  buildRenderPlanFromMatch,
  computeHashFromBytes,
  evaluateSecondaryMatch,
  median,
  requestAlignmentFromSamples,
} from "./mobileDualReaderRuntime";

function syntheticRgba(width: number, height: number, seed: number): DualReaderRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = (i * 7 + seed) % 256; // R
    data[i * 4 + 1] = (i * 13 + seed) % 256; // G
    data[i * 4 + 2] = (i * 3 + seed) % 256; // B
    data[i * 4 + 3] = 255; // A
  }
  return { data, width, height };
}

function fakeAdapter(): DualReaderPlatformAdapter {
  return {
    async decodeToRgba(bytes: Uint8Array): Promise<DualReaderRgbaImage> {
      // Use the first byte as a seed so different pages produce different pixels.
      const seed = bytes[0] ?? 1;
      return syntheticRgba(32, 32, seed);
    },
    async realizeSplit() {
      return null;
    },
    async realizeMerge() {
      return null;
    },
  };
}

function makeLuma(width: number, height: number, fill: number): LumaImage {
  return { data: new Uint8Array(width * height).fill(fill), width, height };
}

function fakeAlignmentResult(confidence = 0.9): AlignmentResult {
  return {
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: 1,
    dx: 0,
    dy: 0,
    confidence,
    score: 0,
    identityScore: 1,
    coverage: 1,
  };
}

describe("mobileDualReaderRuntime", () => {
  test("buildAutoAlignMatchOptions carries the web constants", () => {
    const opts = buildAutoAlignMatchOptions();
    expect(opts.windowSize).toBe(AUTO_ALIGN_WINDOW);
    expect(opts.deviationBias).toBe(1);
    expect(opts.splitMargin).toBe(8);
    expect(opts.mergePenalty).toBe(6);
  });

  test("median handles even/odd/empty", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([1, 3])).toBe(2);
    expect(median([1, 3, 9])).toBe(3);
  });

  describe("evaluateSecondaryMatch", () => {
    const single = (distance: number): SecondaryMatch => ({
      kind: "single",
      index: 0,
      bestIndex: 0,
      distance,
      score: 0,
      fullDistance: distance,
      variantDistance: 0,
      bestVariant: "full",
    });

    test("accepts a low-distance match with no history", () => {
      const res = evaluateSecondaryMatch({
        best: single(10),
        secondBestDistance: 30,
        acceptedDistances: [],
      });
      expect(res.accept).toBe(true);
      expect(res.missing).toBe(false);
    });

    test("rejects a distant match and marks missing when gap is small", () => {
      // best distance >= MISSING_DISTANCE (45) and gap <= MISSING_GAP (10).
      const res = evaluateSecondaryMatch({
        best: single(50),
        secondBestDistance: 55,
        acceptedDistances: [],
      });
      expect(res.missing).toBe(true);
      expect(res.accept).toBe(false);
    });

    test("soft-accepts within soft threshold when gap + median ok", () => {
      // base threshold 40; distance 55 > 40 so not base-accepted.
      // soft threshold 72; 55 <= 72. gap = 70-55 = 15 >= MIN_GAP(6). no history → medianOk.
      const res = evaluateSecondaryMatch({
        best: single(55),
        secondBestDistance: 70,
        acceptedDistances: [],
      });
      expect(res.accept).toBe(true);
    });

    test("adaptive threshold raises with accepted history", () => {
      // History median 30 → adaptive = max(40, 30+25)=55. distance 50 <= 55 → accept.
      const res = evaluateSecondaryMatch({
        best: single(50),
        secondBestDistance: 80,
        acceptedDistances: [20, 30, 40],
      });
      expect(res.accept).toBe(true);
    });
  });

  test("buildRenderPlanFromMatch maps each match kind", () => {
    const single: SecondaryMatch = {
      kind: "single", index: 3, bestIndex: 3, distance: 5, score: 0,
      fullDistance: 5, variantDistance: 0, bestVariant: "full",
    };
    const split: SecondaryMatch = {
      kind: "split", index: 2, side: "left", bestIndex: 2, distance: 5, score: 0,
      fullDistance: 5,
    };
    const merge: SecondaryMatch = {
      kind: "merge", indexA: 4, indexB: 5, order: "normal", bestIndex: 4, distance: 5, score: 0,
    };
    expect(buildRenderPlanFromMatch({ match: single, secondaryChapterId: "ch-s", driftDelta: 1 }))
      .toEqual({ kind: "single", secondaryChapterId: "ch-s", secondaryIndex: 3, driftDelta: 1 });
    expect(buildRenderPlanFromMatch({ match: split, secondaryChapterId: "ch-s", driftDelta: 1 }))
      .toEqual({ kind: "split", secondaryChapterId: "ch-s", secondaryIndex: 2, side: "left", driftDelta: 1 });
    expect(buildRenderPlanFromMatch({ match: merge, secondaryChapterId: "ch-s", driftDelta: 1 }))
      .toEqual({ kind: "merge", secondaryChapterId: "ch-s", secondaryIndices: [4, 5], order: "normal", driftDelta: 1 });
  });

  test("buildMissingPlan produces a missing plan", () => {
    expect(buildMissingPlan({ secondaryChapterId: "ch-s", driftDelta: 0 }))
      .toEqual({ kind: "missing", secondaryChapterId: "ch-s", driftDelta: 0 });
  });

  test("computeHashFromBytes returns a hash + downsampled sample", async () => {
    const adapter = fakeAdapter();
    const { hash, sample } = await computeHashFromBytes({
      bytes: new Uint8Array([7]),
      adapter,
      sampleMax: 16,
    });
    expect(hash.full.h).toEqual({
      high: expect.any(Number),
      low: expect.any(Number),
    });
    expect(sample.width).toBeLessThanOrEqual(16);
    expect(sample.height).toBeLessThanOrEqual(16);
    expect(sample.data.length).toBe(sample.width * sample.height);
  });

  test("requestAlignmentFromSamples builds split/merge luma before running", async () => {
    const primary = makeLuma(16, 16, 10);
    const secondary = makeLuma(16, 16, 20);
    const secondaryB = makeLuma(16, 16, 30);
    let captured: LumaImage | null = null;
    const runAlignment = async (input: { secondary: LumaImage }) => {
      captured = input.secondary;
      return fakeAlignmentResult();
    };

    // single: secondary passed as-is.
    await requestAlignmentFromSamples({
      primarySample: primary,
      secondarySample: secondary,
      plan: { kind: "single", secondaryChapterId: "ch-s", secondaryIndex: 0, driftDelta: 0 },
      runAlignment,
    });
    expect(captured!.width).toBe(16);

    // split: secondary width halved.
    await requestAlignmentFromSamples({
      primarySample: primary,
      secondarySample: secondary,
      plan: { kind: "split", secondaryChapterId: "ch-s", secondaryIndex: 0, side: "left", driftDelta: 0 },
      runAlignment,
    });
    expect(captured!.width).toBe(8);

    // merge: secondary widths concatenated.
    await requestAlignmentFromSamples({
      primarySample: primary,
      secondarySample: secondary,
      secondarySampleB: secondaryB,
      plan: { kind: "merge", secondaryChapterId: "ch-s", secondaryIndices: [0, 1], order: "normal", driftDelta: 0 },
      runAlignment,
    });
    expect(captured!.width).toBe(32);

    // merge without secondaryB throws.
    await expect(
      requestAlignmentFromSamples({
        primarySample: primary,
        secondarySample: secondary,
        plan: { kind: "merge", secondaryChapterId: "ch-s", secondaryIndices: [0, 1], order: "normal", driftDelta: 0 },
        runAlignment,
      }),
    ).rejects.toThrow(/merge/);
  });
});

describe("buildAutoAlignCandidates", () => {
  test("lists the current page first then expands outward within the window", () => {
    expect(buildAutoAlignCandidates({ currentIndex: 5, pageCount: 20 })).toEqual([
      5, 4, 6, 3, 7, 2, 8, 1, 9,
    ]);
  });

  test("clamps the window at the start of the chapter", () => {
    expect(buildAutoAlignCandidates({ currentIndex: 1, pageCount: 20 })).toEqual([
      1, 0, 2, 3, 4, 5,
    ]);
  });

  test("clamps the window at the end of the chapter", () => {
    expect(buildAutoAlignCandidates({ currentIndex: 18, pageCount: 20 })).toEqual([
      18, 17, 19, 16, 15, 14,
    ]);
  });

  test("returns every page when the chapter is smaller than the window", () => {
    expect(buildAutoAlignCandidates({ currentIndex: 1, pageCount: 3 })).toEqual([
      1, 0, 2,
    ]);
  });

  test("returns an empty list for a non-positive page count", () => {
    expect(buildAutoAlignCandidates({ currentIndex: 0, pageCount: 0 })).toEqual([]);
  });

  test("clamps an out-of-range current index into bounds", () => {
    expect(buildAutoAlignCandidates({ currentIndex: 100, pageCount: 4 })).toEqual([
      3, 2, 1, 0,
    ]);
  });

  test("honors a custom window size", () => {
    expect(
      buildAutoAlignCandidates({ currentIndex: 5, pageCount: 20, windowSize: 1 }),
    ).toEqual([5, 4, 6]);
    expect(AUTO_ALIGN_WINDOW).toBe(4);
  });
});
