import { describe, it } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { computeMultiDhash, findBestSecondaryMatch } from './hash';
import { shouldMarkMissing } from './pages';

type Meta = {
  caseId: string;
  primary: { files: string[] };
  secondary: { files: string[] };
  canonical: { primaryToSecondary_0based: number[] };
};

type MappingFile = {
  type: 'primaryToSecondary_0based' | 'primaryToSecondaryOrNull_0based' | 'primaryToSecondary_match_v1';
  primaryCount: number;
  secondaryCount: number;
  mapping: Array<number | null | MappingEntry>;
};

type MappingEntry =
  | { kind: 'single'; index: number }
  | { kind: 'split'; index: number; side: 'left' | 'right' }
  | { kind: 'merge'; indices: [number, number]; order?: 'normal' | 'swap' };

type NormalizedEntry =
  | { kind: 'single'; index: number }
  | { kind: 'split'; index: number; side: 'left' | 'right' }
  | { kind: 'merge'; indices: [number, number]; order: 'normal' | 'swap' }
  | null;

function normalizeEntry(entry: number | null | MappingEntry | undefined): NormalizedEntry {
  if (entry == null) return null;
  if (typeof entry === 'number') return { kind: 'single', index: entry };
  if (entry.kind === 'single') return { kind: 'single', index: entry.index };
  if (entry.kind === 'split') return { kind: 'split', index: entry.index, side: entry.side };
  if (entry.kind === 'merge') {
    const order = entry.order ?? 'normal';
    return { kind: 'merge', indices: entry.indices, order };
  }
  return null;
}

function entriesEqual(a: NormalizedEntry, b: NormalizedEntry): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'single') return a.index === (b as any).index;
  if (a.kind === 'split') return a.index === (b as any).index && a.side === (b as any).side;
  const bMerge = b as { indices: [number, number]; order: 'normal' | 'swap' };
  return a.indices[0] === bMerge.indices[0] && a.indices[1] === bMerge.indices[1] && a.order === bMerge.order;
}

function entriesEquivalent(expected: NormalizedEntry, predicted: NormalizedEntry, allowDerived: boolean): boolean {
  if (entriesEqual(expected, predicted)) return true;
  if (!allowDerived || expected == null || predicted == null) return false;
  if (expected.kind !== 'single') return false;
  if (predicted.kind === 'split') return predicted.index === expected.index;
  if (predicted.kind === 'merge') return predicted.indices.includes(expected.index);
  return false;
}

async function listFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => !f.startsWith('.')).sort();
}

function chooseFiles(metaFiles: string[], dirFiles: string[]): string[] {
  if (!metaFiles || metaFiles.length === 0) return dirFiles;
  const dirSet = new Set(dirFiles);
  const missing = metaFiles.some((f) => !dirSet.has(f));
  return missing ? dirFiles : metaFiles;
}

async function loadCase(caseDir: string) {
  const metaPath = path.join(caseDir, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as Meta;
  const mappingPath = path.join(caseDir, 'mapping.json');
  let mappingFile: MappingFile | null = null;
  try {
    mappingFile = JSON.parse(await readFile(mappingPath, 'utf8')) as MappingFile;
  } catch {
    mappingFile = null;
  }

  const primaryDir = path.join(caseDir, 'primary');
  const secondaryDir = path.join(caseDir, 'secondary');
  const pFiles = chooseFiles(meta.primary.files, await listFiles(primaryDir));
  const sFiles = chooseFiles(meta.secondary.files, await listFiles(secondaryDir));

  const expectedRaw = mappingFile?.mapping ?? meta.canonical.primaryToSecondary_0based;
  const expected = expectedRaw.map((entry) => normalizeEntry(entry as MappingEntry | number | null));

  const allowDerived = !mappingFile || mappingFile.type !== 'primaryToSecondary_match_v1';
  return { caseId: meta.caseId, primaryDir, secondaryDir, pFiles, sFiles, expected, allowDerived };
}

async function evaluateCase(caseDir: string) {
  const { caseId, primaryDir, secondaryDir, pFiles, sFiles, expected, allowDerived } = await loadCase(caseDir);

  const pHashes = await Promise.all(
    pFiles.map(async (f) => {
      const img = sharp(await readFile(path.join(primaryDir, f)));
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return computeMultiDhash(
        { data, width: info.width, height: info.height, channels: info.channels },
        { split: true, centerCropRatio: 0.7 }
      );
    })
  );

  const sHashes = await Promise.all(
    sFiles.map(async (f) => {
      const img = sharp(await readFile(path.join(secondaryDir, f)));
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return computeMultiDhash(
        { data, width: info.width, height: info.height, channels: info.channels },
        { split: true, centerCropRatio: 0.7 }
      );
    })
  );

  const window = 4;
  const baseThreshold = 40;
  const softThreshold = 72;
  const adaptiveDelta = 25;
  const deviationBias = 1;
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

  let drift = 0;
  const predicted: NormalizedEntry[] = [];

  for (let i = 0; i < pHashes.length; i++) {
    const expectedIndex = i + drift;
    const match = findBestSecondaryMatch({
      primaryHash: pHashes[i]!,
      secondaryHashes: sHashes,
      expectedIndex,
      windowSize: window,
      deviationBias,
      variantPenalty,
      fullThreshold,
      splitMargin,
      splitPenalty,
      mergePenalty,
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
            predictedEntry = { kind: 'merge', indices: [best.indexA, best.indexB], order: best.order };
          }
        }
      }
    }

    predicted.push(predictedEntry);
    if (predictedIndex != null) {
      drift = predictedIndex - i;
    }
  }

  const ok =
    expected.length === predicted.length &&
    expected.every((entry, i) => entriesEquivalent(entry, predicted[i] ?? null, allowDerived));

  if (!ok) {
    const mismatch = expected.findIndex((entry, i) => !entriesEquivalent(entry, predicted[i] ?? null, allowDerived));
    throw new Error(
      `[dual-reader] mismatch in ${caseId} at index ${mismatch}: expected=${JSON.stringify(
        expected[mismatch]
      )} predicted=${JSON.stringify(predicted[mismatch])}`
    );
  }
}

describe('dual-reader dhash datasets', () => {
  it('matches bundled synthetic cases', async () => {
    const root = path.resolve('tests/fixtures/dual-reader/dhash');
    const caseDir = path.join(root, 'case_rawkuma_vs_copymanga_ch1');
    const syntheticDir = path.join(caseDir, 'synthetic');
    const entries = await readdir(syntheticDir, { withFileTypes: true });
    const caseDirs = [caseDir];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(syntheticDir, entry.name);
      caseDirs.push(dir);
    }

    for (const dir of caseDirs) {
      await evaluateCase(dir);
    }
  }, 20000);
});
