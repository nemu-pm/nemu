import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  computeCandidateMatch,
  computeMultiDhash,
  findBestSecondaryMatch,
} from "../../src/lib/dual-reader/hash";
import { shouldMarkMissing } from "../../src/lib/dual-reader/pages";

type Meta = {
  caseId: string;
  primary: { files: string[] };
  secondary: { files: string[] };
  canonical: { primaryToSecondary_0based: number[] };
};

type MappingFile = {
  type: "primaryToSecondary_0based" | "primaryToSecondaryOrNull_0based" | "primaryToSecondary_match_v1";
  primaryCount: number;
  secondaryCount: number;
  mapping: Array<number | null | MappingEntry>;
};

type MappingEntry =
  | { kind: "single"; index: number }
  | { kind: "split"; index: number; side: "left" | "right" }
  | { kind: "merge"; indices: [number, number]; order?: "normal" | "swap" };

type NormalizedEntry =
  | { kind: "single"; index: number }
  | { kind: "split"; index: number; side: "left" | "right" }
  | { kind: "merge"; indices: [number, number]; order: "normal" | "swap" }
  | null;

function normalizeEntry(entry: number | null | MappingEntry | undefined): NormalizedEntry {
  if (entry == null) return null;
  if (typeof entry === "number") return { kind: "single", index: entry };
  if (entry.kind === "single") return { kind: "single", index: entry.index };
  if (entry.kind === "split") return { kind: "split", index: entry.index, side: entry.side };
  if (entry.kind === "merge") {
    const order = entry.order ?? "normal";
    return { kind: "merge", indices: entry.indices, order };
  }
  return null;
}

function entriesEqual(a: NormalizedEntry, b: NormalizedEntry): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "single") return a.index === (b as any).index;
  if (a.kind === "split") {
    return a.index === (b as any).index && a.side === (b as any).side;
  }
  const bMerge = b as { indices: [number, number]; order: "normal" | "swap" };
  return a.indices[0] === bMerge.indices[0] && a.indices[1] === bMerge.indices[1] && a.order === bMerge.order;
}

async function listFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => !f.startsWith(".")).sort();
}

function chooseFiles(metaFiles: string[], dirFiles: string[]): string[] {
  if (!metaFiles || metaFiles.length === 0) return dirFiles;
  const dirSet = new Set(dirFiles);
  const missing = metaFiles.some((f) => !dirSet.has(f));
  return missing ? dirFiles : metaFiles;
}

function getCandidateDistances(input: {
  primaryHash: { full: { h: bigint; v: bigint } };
  secondaryHashes: Array<{
    full: { h: bigint; v: bigint };
    left?: { h: bigint; v: bigint };
    right?: { h: bigint; v: bigint };
    top?: { h: bigint; v: bigint };
    bottom?: { h: bigint; v: bigint };
    center?: { h: bigint; v: bigint };
  }>;
  expectedIndex: number;
  windowSize: number;
  deviationBias: number;
  variantPenalty: number;
  fullThreshold: number;
}) {
  const start = Math.max(0, Math.trunc(input.expectedIndex) - input.windowSize);
  const end = Math.min(input.secondaryHashes.length - 1, Math.trunc(input.expectedIndex) + input.windowSize);
  const results: Array<{ index: number; distance: number; score: number }> = [];
  for (let i = start; i <= end; i++) {
    const candidate = input.secondaryHashes[i]!;
    const { distance: dist } = computeCandidateMatch(input.primaryHash.full, candidate, {
      variantPenalty: input.variantPenalty,
      fullThreshold: input.fullThreshold,
    });
    const score = dist + input.deviationBias * Math.abs(i - input.expectedIndex);
    results.push({ index: i, distance: dist, score });
  }
  return results;
}

function minDistanceToSecondary(primaryHash: { full: { h: bigint; v: bigint } }, candidate: {
  full: { h: bigint; v: bigint };
  left?: { h: bigint; v: bigint };
  right?: { h: bigint; v: bigint };
  top?: { h: bigint; v: bigint };
  bottom?: { h: bigint; v: bigint };
  center?: { h: bigint; v: bigint };
}, opts: { variantPenalty: number; fullThreshold: number }): number {
  return computeCandidateMatch(primaryHash.full, candidate, opts).distance;
}

function estimateInitialDrift(
  primaryHashes: Array<{ full: { h: bigint; v: bigint } }>,
  secondaryHashes: Array<{
    full: { h: bigint; v: bigint };
    left?: { h: bigint; v: bigint };
    right?: { h: bigint; v: bigint };
    top?: { h: bigint; v: bigint };
    bottom?: { h: bigint; v: bigint };
    center?: { h: bigint; v: bigint };
  }>,
  opts: { maxDrift: number; sampleCount: number; variantPenalty: number; fullThreshold: number }
): number {
  let bestDrift = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let drift = -opts.maxDrift; drift <= opts.maxDrift; drift++) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < Math.min(primaryHashes.length, opts.sampleCount); i++) {
      const idx = i + drift;
      if (idx < 0 || idx >= secondaryHashes.length) continue;
      total += minDistanceToSecondary(primaryHashes[i]!, secondaryHashes[idx]!, opts);
      count += 1;
    }
    if (count === 0) continue;
    const avg = total / count;
    if (avg < bestScore) {
      bestScore = avg;
      bestDrift = drift;
    }
  }
  return bestDrift;
}

function scoreDrift(
  primaryHashes: Array<{ full: { h: bigint; v: bigint } }>,
  secondaryHashes: Array<{
    full: { h: bigint; v: bigint };
    left?: { h: bigint; v: bigint };
    right?: { h: bigint; v: bigint };
    top?: { h: bigint; v: bigint };
    bottom?: { h: bigint; v: bigint };
    center?: { h: bigint; v: bigint };
  }>,
  drift: number,
  sampleCount: number,
  opts: { variantPenalty: number; fullThreshold: number }
): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < Math.min(primaryHashes.length, sampleCount); i++) {
    const idx = i + drift;
    if (idx < 0 || idx >= secondaryHashes.length) continue;
      total += minDistanceToSecondary(primaryHashes[i]!, secondaryHashes[idx]!, opts);
    count += 1;
  }
  if (count === 0) return Number.POSITIVE_INFINITY;
  return total / count;
}

async function main() {
  const caseDir = process.argv[2];
  if (!caseDir) {
    console.error("Usage: bun scripts/dual-reader/eval-dhash-drift.ts <caseDir>");
    process.exit(2);
  }

  const metaPath = path.join(caseDir, "meta.json");
  const meta = JSON.parse(await readFile(metaPath, "utf8")) as Meta;
  const mappingPath = path.join(caseDir, "mapping.json");
  let mappingFile: MappingFile | null = null;
  try {
    mappingFile = JSON.parse(await readFile(mappingPath, "utf8")) as MappingFile;
  } catch {
    mappingFile = null;
  }

  const primaryDir = path.join(caseDir, "primary");
  const secondaryDir = path.join(caseDir, "secondary");
  const pFiles = chooseFiles(meta.primary.files, await listFiles(primaryDir));
  const sFiles = chooseFiles(meta.secondary.files, await listFiles(secondaryDir));

  console.log(`[dual-reader] eval case: ${meta.caseId}`);
  console.log(`[dual-reader] primary=${pFiles.length} secondary=${sFiles.length}`);

  const pHashes = await Promise.all(
    pFiles.map(async (f) => {
      const img = sharp(await readFile(path.join(primaryDir, f)));
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return computeMultiDhash(
        { data, width: info.width, height: info.height, channels: info.channels },
        { split: true, centerCropRatio: 0.7 }
      );
    }),
  );

  const sHashes = await Promise.all(
    sFiles.map(async (f) => {
      const img = sharp(await readFile(path.join(secondaryDir, f)));
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return computeMultiDhash(
        { data, width: info.width, height: info.height, channels: info.channels },
        { split: true, centerCropRatio: 0.7 }
      );
    }),
  );

  const window = 4;
  const baseThreshold = 40; // strict match threshold
  const softThreshold = 72; // allow matches if they are clearly best
  const adaptiveDelta = 25; // allow higher distances if recent matches are high
  const deviationBias = 1; // penalize jumping away from expectedIndex unless hash distance improves
  const minDistanceGap = 6;
  const variantPenalty = 20;
  const fullThreshold = 20;
  const splitMargin = 8;
  const splitPenalty = 4;
  const mergePenalty = 6;
  const primarySpreadThreshold = 24;
  const secondarySpreadThreshold = 24;
  const missingDistance = 45;
  const missingGap = 10;
  const debug = process.env.DUAL_READ_DEBUG === "1";
  const debugPageRaw = process.env.DUAL_READ_DEBUG_PAGE;
  const debugPage = debugPageRaw ? Number.parseInt(debugPageRaw, 10) : null;
  const acceptedDistances: number[] = [];

  const median = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
    }
    return sorted[mid]!;
  };

  const driftSampleCount = 3;
  if (debug) {
    const driftScores = [];
    for (let d = -2; d <= 2; d++) {
      driftScores.push({
        drift: d,
        score: scoreDrift(pHashes, sHashes, d, driftSampleCount, { variantPenalty, fullThreshold }),
      });
    }
    console.log(`[dual-reader] debug drift scores`, driftScores);
  }
  let drift = 0;
  const predicted: Array<NormalizedEntry> = [];

  for (let i = 0; i < pHashes.length; i++) {
    const expected = i + drift;
    if (debug && (debugPage === null || debugPage === i)) {
      const candidates = getCandidateDistances({
        primaryHash: pHashes[i]!,
        secondaryHashes: sHashes,
        expectedIndex: expected,
        windowSize: window,
        deviationBias,
        variantPenalty,
        fullThreshold,
      });
      console.log(`[dual-reader] debug page=${i} expected=${expected}`, candidates);
    }
    const match = findBestSecondaryMatch({
      primaryHash: pHashes[i]!,
      secondaryHashes: sHashes,
      expectedIndex: expected,
      windowSize: window,
      deviationBias,
      variantPenalty,
      fullThreshold,
      splitMargin: splitMargin,
      splitPenalty: splitPenalty,
      mergePenalty: mergePenalty,
      primarySpreadThreshold,
      secondarySpreadThreshold,
    });
    let predictedEntry: NormalizedEntry | null = null;
    let predictedIndex: number | null = null;
    if (match) {
      const best = match.best;
      const secondBestDistance = match.secondBest?.distance ?? Number.POSITIVE_INFINITY;
      const recentMedian = acceptedDistances.length > 0 ? median(acceptedDistances) : null;
      const adaptiveThreshold =
        recentMedian === null ? baseThreshold : Math.max(baseThreshold, recentMedian + adaptiveDelta);
      let accept = best.distance <= adaptiveThreshold;
      if (!accept && best.distance <= softThreshold) {
        const gapOk = secondBestDistance - best.distance >= minDistanceGap;
        const medianOk = recentMedian === null ? true : best.distance <= recentMedian + adaptiveDelta;
        accept = gapOk && medianOk;
      }
      if (accept) {
        const missing = shouldMarkMissing({
          bestDistance: best.distance,
          secondBestDistance,
          missingDistance,
          missingGap,
        });
        if (!missing) {
          predictedIndex = best.bestIndex;
          acceptedDistances.push(best.distance);
          if (best.kind === 'single') {
            predictedEntry = { kind: 'single', index: best.index };
          } else if (best.kind === 'split') {
            predictedEntry = { kind: 'split', index: best.index, side: best.side };
          } else {
            predictedEntry = {
              kind: 'merge',
              indices: [best.indexA, best.indexB],
              order: best.order,
            };
          }
        }
      }
    }
    predicted.push(predictedEntry);

    // Update drift only if it looks like a confident match.
    if (predictedIndex != null) {
      drift = predictedIndex - i;
    }
  }

  const expectedRaw = mappingFile?.mapping ?? meta.canonical.primaryToSecondary_0based;
  const expected = expectedRaw.map((entry) => normalizeEntry(entry as MappingEntry | number | null));
  const ok =
    expected.length === predicted.length &&
    expected.every((entry, i) => entriesEqual(entry, predicted[i] ?? null));
  console.log(`[dual-reader] predicted primary->secondary (0based): ${JSON.stringify(predicted)}`);
  console.log(`[dual-reader] expected  primary->secondary (0based): ${JSON.stringify(expected)}`);
  console.log(`[dual-reader] match: ${ok ? "OK" : "MISMATCH"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
