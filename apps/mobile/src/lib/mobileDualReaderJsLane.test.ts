import { describe, expect, test } from "bun:test";
import {
  buildMergeLuma,
  buildSplitLuma,
  computeMultiDhash,
  downsampleToMax,
  toLuma,
  type DualReaderRgbaImage,
} from "@nemu/core/dual-reader";
import { makeSyntheticPage } from "../../../../packages/core/src/dual-reader/visual-alignment.fixtures";
import { isMobileDualReaderDecodeCancelledError } from "./mobileDualReaderDecodeScheduler";
import {
  DUAL_READER_ALIGN_MAX_SLICE_LABEL,
  DUAL_READER_HASH_MAX_SLICE_LABEL,
  yieldToDualReaderJsLane,
} from "./mobileDualReaderJsLane";
import {
  AUTO_ALIGN_CENTER_RATIO,
  computeHashFromBytes,
  requestAlignmentFromSamples,
} from "./mobileDualReaderRuntime";
import {
  getMobilePerformanceEntries,
  resetMobilePerformanceEntriesForTesting,
  setMobilePerformanceEnabledForTesting,
} from "./mobilePerformance";

function pageRgba(width: number, height: number, seed: number): DualReaderRgbaImage {
  const luma = makeSyntheticPage(width, height, seed).data;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const v = luma[i] ?? 0;
    data[i * 4] = v;
    data[i * 4 + 1] = (v + (i % 7)) & 255;
    data[i * 4 + 2] = (v * 3 + seed) & 255;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

const decoder = (rgba: DualReaderRgbaImage) => ({
  decodeToRgba: async () => rgba,
});

function withPerf<T>(fn: () => Promise<T>): Promise<T> {
  setMobilePerformanceEnabledForTesting(true);
  resetMobilePerformanceEntriesForTesting();
  return fn().finally(() => {
    setMobilePerformanceEnabledForTesting(null);
    resetMobilePerformanceEntriesForTesting();
  });
}

describe("dual-reader shared JS lane", () => {
  test("hands out one turn per macrotask, round-robin", async () => {
    const order: string[] = [];
    const job = async (name: string) => {
      for (let i = 0; i < 3; i += 1) {
        await yieldToDualReaderJsLane();
        order.push(name);
      }
    };
    await Promise.all([job("a"), job("b")]);
    expect(order).toEqual(["a", "b", "a", "b", "a", "b"]);
  });
});

describe("cooperative computeHashFromBytes", () => {
  test(
    "equals the sync pipeline and records dualReader.hash.maxSliceMs",
    () =>
      withPerf(async () => {
        const rgba = pageRgba(724, 1024, 41);
        const input = { data: rgba.data, width: rgba.width, height: rgba.height, channels: 4 as const };
        const luma = toLuma(input);
        const expected = {
          hash: computeMultiDhash(input, { split: true, centerCropRatio: AUTO_ALIGN_CENTER_RATIO, luma }),
          sample: downsampleToMax(luma, rgba.width, rgba.height, 512),
        };
        const got = await computeHashFromBytes({
          bytes: new Uint8Array([1]),
          adapter: decoder(rgba),
          sampleMax: 512,
          signal: new AbortController().signal,
        });
        expect(got).toEqual(expected);
        const entries = getMobilePerformanceEntries().filter(
          (e) => e.label === DUAL_READER_HASH_MAX_SLICE_LABEL,
        );
        expect(entries.length).toBe(1);
        const entry = entries[0]!;
        expect(entry.metadata?.outcome).toBe("ok");
        expect(entry.metadata?.phase).toBe("hash");
        expect(entry.metadata?.slices as number).toBeGreaterThan(1);
        expect(entry.metadata?.maxSliceMs as number).toBeLessThan(50);
      }),
    30_000,
  );

  test("abort cancels between slices with the decode-cancelled error", async () => {
    const rgba = pageRgba(724, 1024, 42);
    const controller = new AbortController();
    let turns = 0;
    const err = await computeHashFromBytes({
      bytes: new Uint8Array([1]),
      adapter: decoder(rgba),
      signal: controller.signal,
      cooperative: {
        sliceBudgetMs: 0,
        yieldToHost: async () => {
          turns += 1;
          if (turns === 2) controller.abort();
        },
      },
    }).catch((e: unknown) => e);
    expect(isMobileDualReaderDecodeCancelledError(err)).toBe(true);
    expect(turns).toBe(2);
  });
});

describe("cooperative split/merge build", () => {
  test(
    "split/merge secondaries equal the sync builders and record align slices",
    () =>
      withPerf(async () => {
        const a = makeSyntheticPage(362, 512, 51);
        const b = makeSyntheticPage(340, 500, 52);
        const captured: unknown[] = [];
        const runAlignment = async (input: { secondary: unknown }) => {
          captured.push(input.secondary);
          return { dx: 0, dy: 0, scale: 1, confidence: 0 } as never;
        };
        await requestAlignmentFromSamples({
          primarySample: a,
          secondarySample: a,
          plan: { kind: "split", secondaryChapterId: "s", secondaryIndex: 0, side: "right", driftDelta: 0 },
          runAlignment,
        });
        await requestAlignmentFromSamples({
          primarySample: a,
          secondarySample: a,
          secondarySampleB: b,
          plan: { kind: "merge", secondaryChapterId: "s", secondaryIndices: [0, 1], order: "swap", driftDelta: 0 },
          runAlignment,
        });
        expect(captured[0]).toEqual(buildSplitLuma(a, "right"));
        expect(captured[1]).toEqual(buildMergeLuma(a, b, "swap"));
        const phases = getMobilePerformanceEntries()
          .filter((e) => e.label === DUAL_READER_ALIGN_MAX_SLICE_LABEL)
          .map((e) => e.metadata?.phase);
        expect(phases).toEqual(["split", "merge"]);
      }),
    30_000,
  );

  test("abort before the build rejects with the decode-cancelled error", async () => {
    const a = makeSyntheticPage(64, 64, 53);
    const controller = new AbortController();
    controller.abort();
    let ran = false;
    const err = await requestAlignmentFromSamples({
      primarySample: a,
      secondarySample: a,
      plan: { kind: "split", secondaryChapterId: "s", secondaryIndex: 0, side: "left", driftDelta: 0 },
      runAlignment: async () => {
        ran = true;
        return {} as never;
      },
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isMobileDualReaderDecodeCancelledError(err)).toBe(true);
    expect(ran).toBe(false);
  });
});
