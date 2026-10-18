import { describe, expect, test } from "bun:test";
import {
  MobileReaderPageAnalysisQueue,
  mobileReaderPageAnalysisCacheName,
  mobileReaderPageAnalysisOrder,
  normalizeMobileReaderPageFeatures,
  parseMobileReaderPageAnalysisCache,
  serializeMobileReaderPageAnalysisCache,
  type MobileReaderPageFeatures,
} from "./mobileReaderPageAnalysis";

const features = (width = 700): MobileReaderPageFeatures => ({
  width,
  height: 1000,
  marginL: 0.08,
  marginR: 0.03,
  edgeL: [1, 0.9],
  edgeR: [1, 1],
  edgeColor: "#ffffff",
  chroma: 0,
});

describe("page analysis", () => {
  test("measures nearest first, ahead before behind", () => {
    expect(mobileReaderPageAnalysisOrder(10, 4, 2, 3)).toEqual([4, 5, 3, 6, 2, 7]);
    expect(mobileReaderPageAnalysisOrder(3, 0, 6, 24)).toEqual([0, 1, 2]);
    expect(mobileReaderPageAnalysisOrder(0, 0)).toEqual([]);
  });

  test("rejects measurements that do not hold together", () => {
    expect(normalizeMobileReaderPageFeatures(features())).toEqual(features());
    expect(normalizeMobileReaderPageFeatures({ ...features(), width: 0 })).toBeNull();
    expect(normalizeMobileReaderPageFeatures({ ...features(), edgeL: ["x"] })).toBeNull();
    expect(normalizeMobileReaderPageFeatures({ ...features(), edgeColor: "red" })?.edgeColor).toBe("#000000");
    expect(normalizeMobileReaderPageFeatures(null)).toBeNull();
    // Colour is optional (older binaries) and clamped.
    const { chroma: _chroma, ...withoutChroma } = features();
    void _chroma;
    expect(normalizeMobileReaderPageFeatures(withoutChroma)?.chroma).toBeNull();
    expect(normalizeMobileReaderPageFeatures({ ...features(), chroma: 3 })?.chroma).toBe(1);
  });

  test("the chapter cache round-trips and ignores other versions", () => {
    const entries = new Map([["p1", features()], ["p2", features(1400)]]);
    expect(parseMobileReaderPageAnalysisCache(serializeMobileReaderPageAnalysisCache(entries))).toEqual(entries);
    expect(parseMobileReaderPageAnalysisCache('{"v":0,"pages":{"p1":{}}}').size).toBe(0);
    // Caches from before colour was measured are measured again.
    const v1 = JSON.stringify({ v: 1, pages: { p1: features() } });
    expect(parseMobileReaderPageAnalysisCache(v1).size).toBe(0);
    expect(parseMobileReaderPageAnalysisCache("not json").size).toBe(0);
    expect(mobileReaderPageAnalysisCacheName("a")).not.toBe(mobileReaderPageAnalysisCacheName("b"));
    expect(mobileReaderPageAnalysisCacheName("a")).toMatch(/^[0-9a-f]{16}$/);
  });

  test("the queue measures each page once and skips cached ones", async () => {
    const analyzed: string[] = [];
    const results: string[] = [];
    const queue = new MobileReaderPageAnalysisQueue(
      async (uri) => {
        analyzed.push(uri);
        return features();
      },
      (id) => results.push(id),
    );
    queue.markDone(["cached"]);
    const job = (id: string, file: string | null) => ({ id, resolveFile: async () => file });
    await queue.run([job("cached", "file:///c"), job("a", "file:///a"), job("missing", null)]);
    await queue.run([job("a", "file:///a"), job("missing", "file:///m")]);
    expect(analyzed).toEqual(["file:///a", "file:///m"]);
    expect(results).toEqual(["a", "missing"]);
  });

  test("a new run replaces the previous one", async () => {
    const analyzed: string[] = [];
    let release: (() => void) | null = null;
    const queue = new MobileReaderPageAnalysisQueue(async (uri) => {
      analyzed.push(uri);
      return features();
    }, () => undefined);
    const first = queue.run([
      { id: "slow", resolveFile: () => new Promise<string>((resolve) => { release = () => resolve("file:///slow"); }) },
      { id: "never", resolveFile: async () => "file:///never" },
    ]);
    const second = queue.run([{ id: "b", resolveFile: async () => "file:///b" }]);
    release!();
    await Promise.all([first, second]);
    expect(analyzed).toEqual(["file:///b"]);
  });
});
