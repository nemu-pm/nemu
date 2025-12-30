import { describe, it, expect } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  buildAlignmentImage,
  buildMergeLuma,
  buildSplitLuma,
  computeAlignmentTransform,
} from './visual-alignment';
import { buildAlignmentOptions } from './alignment-options';
import type { DhashInput } from './hash';

type MappingEntry =
  | number
  | null
  | { kind: 'split'; index: number; side: 'left' | 'right' }
  | { kind: 'merge'; indices: [number, number]; order?: 'normal' | 'swap' };

type MappingFile = {
  mapping: MappingEntry[];
};

type TransformParams = {
  scale: number;
  dx: number;
  dy: number;
  crop: { top: number; right: number; bottom: number; left: number };
  contrast: number;
  watermark: boolean;
  resample: boolean;
};
type SharpChannels = 1 | 2 | 3 | 4;

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randRange(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function clampChannels(value: number): SharpChannels {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

function makeTransformParams(rng: () => number, width: number, height: number): TransformParams {
  const scale = randRange(rng, 0.8, 1.2);
  const dx = randRange(rng, -0.2, 0.2) * width;
  const dy = randRange(rng, -0.2, 0.2) * height;
  const crop = {
    top: randRange(rng, 0, 0.08),
    right: randRange(rng, 0, 0.08),
    bottom: randRange(rng, 0, 0.08),
    left: randRange(rng, 0, 0.08),
  };
  return {
    scale,
    dx,
    dy,
    crop,
    contrast: randRange(rng, 0.9, 1.1),
    watermark: rng() > 0.4,
    resample: rng() > 0.4,
  };
}

async function loadImage(filePath: string): Promise<DhashInput> {
  const img = sharp(await readFile(filePath));
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function makeWatermarkSvg(width: number, height: number) {
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.05));
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="wm" width="${fontSize * 6}" height="${fontSize * 6}" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <text x="0" y="${fontSize}" font-size="${fontSize}" font-family="Arial" fill="white" fill-opacity="0.12">DUAL</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
    </svg>`
  );
}

async function transformImage(input: DhashInput, params: TransformParams): Promise<DhashInput> {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const channels = clampChannels(input.channels ?? 3);
  let image = sharp(input.data, { raw: { width, height, channels } }).removeAlpha();

  const insetTop = Math.round(params.crop.top * height);
  const insetRight = Math.round(params.crop.right * width);
  const insetBottom = Math.round(params.crop.bottom * height);
  const insetLeft = Math.round(params.crop.left * width);
  const innerW = Math.max(1, width - insetLeft - insetRight);
  const innerH = Math.max(1, height - insetTop - insetBottom);
  const resized = await image.resize(innerW, innerH).raw().toBuffer({ resolveWithObject: true });
  const padTop = Math.max(0, insetTop);
  const padLeft = Math.max(0, insetLeft);
  const padBottom = Math.max(0, height - padTop - resized.info.height);
  const padRight = Math.max(0, width - padLeft - resized.info.width);
  image = sharp(resized.data, {
    raw: { width: resized.info.width, height: resized.info.height, channels: clampChannels(resized.info.channels) },
  }).extend({
    top: padTop,
    left: padLeft,
    bottom: padBottom,
    right: padRight,
    background: { r: 255, g: 255, b: 255 },
  });

  const scaledW = Math.max(1, Math.round(width * params.scale));
  const scaledH = Math.max(1, Math.round(height * params.scale));
  const scaled = await image.resize(scaledW, scaledH).raw().toBuffer({ resolveWithObject: true });
  const offsetX = Math.round(params.dx);
  const offsetY = Math.round(params.dy);
  const cropX = Math.max(0, -offsetX);
  const cropY = Math.max(0, -offsetY);
  const dstX = Math.max(0, offsetX);
  const dstY = Math.max(0, offsetY);
  const visibleW = Math.min(scaled.info.width - cropX, width - dstX);
  const visibleH = Math.min(scaled.info.height - cropY, height - dstY);
  let compositeInput: { data: Buffer; width: number; height: number; channels: SharpChannels } | null = null;
  if (visibleW > 0 && visibleH > 0) {
    const cropped = await sharp(scaled.data, {
      raw: { width: scaled.info.width, height: scaled.info.height, channels: clampChannels(scaled.info.channels) },
    })
      .extract({ left: cropX, top: cropY, width: visibleW, height: visibleH })
      .raw()
      .toBuffer({ resolveWithObject: true });
    compositeInput = {
      data: cropped.data,
      width: cropped.info.width,
      height: cropped.info.height,
      channels: clampChannels(cropped.info.channels),
    };
  }

  image = sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  });
  if (compositeInput) {
    image = image.composite([
      {
        input: compositeInput.data,
        raw: { width: compositeInput.width, height: compositeInput.height, channels: compositeInput.channels },
        left: dstX,
        top: dstY,
      },
    ]);
  }

  if (params.resample) {
    const resW = Math.max(1, Math.round(width * 0.92));
    const resH = Math.max(1, Math.round(height * 0.92));
    image = image.resize(resW, resH).resize(width, height);
  }

  if (params.contrast !== 1) {
    const c = params.contrast;
    image = image.linear(c, -(128 * c - 128));
  }

  if (params.watermark) {
    image = image.composite([{ input: makeWatermarkSvg(width, height), blend: 'over' }]);
  }

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function makeNoise(width: number, height: number, seed: number): DhashInput {
  const rng = makeRng(seed);
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(rng() * 256);
  }
  return { data, width, height, channels: 3 };
}

async function loadMapping(dir: string): Promise<MappingFile> {
  const raw = await readFile(path.join(dir, 'mapping.json'), 'utf8');
  return JSON.parse(raw) as MappingFile;
}

async function listFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => !f.startsWith('.')).sort();
}

function chooseFiles(metaFiles: string[] | undefined, dirFiles: string[]): string[] {
  if (!metaFiles || metaFiles.length === 0) return dirFiles;
  const dirSet = new Set(dirFiles);
  const missing = metaFiles.some((f) => !dirSet.has(f));
  return missing ? dirFiles : metaFiles;
}

describe('dual-reader visual alignment', () => {
  it('recovers alignment on synthetic singles', async () => {
    const root = path.resolve('testdata/dual-reader/dhash/case_rawkuma_vs_copymanga_ch1/synthetic');
    const caseDir = path.join(root, 'insert_delete_from_primary_seed42');
    const meta = JSON.parse(await readFile(path.join(caseDir, 'meta.json'), 'utf8')) as {
      primary: { files: string[] };
      secondary: { files: string[] };
    };
    const primaryFiles = chooseFiles(meta.primary.files, await listFiles(path.join(caseDir, 'primary')));
    const secondaryFiles = chooseFiles(meta.secondary.files, await listFiles(path.join(caseDir, 'secondary')));
    const mapping = await loadMapping(caseDir);
    const rng = makeRng(42);

    let tested = 0;
    for (let i = 0; i < primaryFiles.length && tested < 4; i++) {
      const entry = mapping.mapping[i];
      if (entry == null || typeof entry !== 'number') continue;
      const primaryPath = path.join(caseDir, 'primary', primaryFiles[i]!);
      const secondaryPath = path.join(caseDir, 'secondary', secondaryFiles[entry]!);
      const primary = await loadImage(primaryPath);
      const secondary = await loadImage(secondaryPath);
      const params = makeTransformParams(rng, secondary.width, secondary.height);
      params.crop = { top: 0, right: 0, bottom: 0, left: 0 };
      params.watermark = false;
      params.resample = false;
      params.contrast = randRange(rng, 0.97, 1.03);
      const transformed = await transformImage(secondary, params);
      const expectedScale = (primary.width / secondary.width) / params.scale;
      const expectedDx = (-params.dx / params.scale) / primary.width;
      const expectedDy = (-params.dy / params.scale) / primary.height;
      const baseInput = {
        primary: buildAlignmentImage(primary),
        secondary: buildAlignmentImage(transformed),
        options: buildAlignmentOptions({ scaleWindow: 0.3, scaleStep: 0.003, fftMax: 256 }),
      };
      const variants = [
        { useScalePrior: false, fftPolicy: 'fixed' as const },
        { useScalePrior: false, fftPolicy: 'adaptive' as const },
        { useScalePrior: true, fftPolicy: 'fixed' as const },
      ];

      for (const variant of variants) {
        const result = computeAlignmentTransform({
          ...baseInput,
          options: buildAlignmentOptions({ ...baseInput.options, ...variant }),
        });
        expect(result.confidence).toBeGreaterThan(0.2);
        expect(result.score).toBeLessThan(result.identityScore);
        expect(Math.abs(result.scale - expectedScale)).toBeLessThan(0.12);
        expect(Math.abs(result.dx - expectedDx)).toBeLessThan(0.12);
        expect(Math.abs(result.dy - expectedDy)).toBeLessThan(0.12);
      }
      tested += 1;
    }
  }, 20000);

  it('handles split/merge transforms', async () => {
    const root = path.resolve('testdata/dual-reader/dhash/case_rawkuma_vs_copymanga_ch1/synthetic');
    const mergeDir = path.join(root, 'merge_primary_pairs');
    const splitDir = path.join(root, 'split_secondary_pairs');
    const rng = makeRng(84);

    const mergeMeta = JSON.parse(await readFile(path.join(mergeDir, 'meta.json'), 'utf8')) as {
      primary: { files: string[] };
      secondary: { files: string[] };
    };
    const mergePrimaryFiles = chooseFiles(mergeMeta.primary.files, await listFiles(path.join(mergeDir, 'primary')));
    const mergeSecondaryFiles = chooseFiles(mergeMeta.secondary.files, await listFiles(path.join(mergeDir, 'secondary')));
    const mergeMapping = await loadMapping(mergeDir);

    const mergeEntry = mergeMapping.mapping.find(
      (entry): entry is { kind: 'merge'; indices: [number, number]; order?: 'normal' | 'swap' } =>
        typeof entry === 'object' && entry != null && (entry as any).kind === 'merge'
    );
    if (mergeEntry) {
      const primaryPath = path.join(mergeDir, 'primary', mergePrimaryFiles[0]!);
      const secondaryAPath = path.join(mergeDir, 'secondary', mergeSecondaryFiles[mergeEntry.indices[0]]!);
      const secondaryBPath = path.join(mergeDir, 'secondary', mergeSecondaryFiles[mergeEntry.indices[1]]!);
      const primary = await loadImage(primaryPath);
      const secondaryARaw = await loadImage(secondaryAPath);
      const secondaryBRaw = await loadImage(secondaryBPath);
      const paramsA = makeTransformParams(rng, secondaryARaw.width, secondaryARaw.height);
      paramsA.crop = { top: 0, right: 0, bottom: 0, left: 0 };
      paramsA.watermark = false;
      paramsA.resample = false;
      paramsA.contrast = randRange(rng, 0.97, 1.03);
      const paramsB = makeTransformParams(rng, secondaryBRaw.width, secondaryBRaw.height);
      paramsB.crop = { top: 0, right: 0, bottom: 0, left: 0 };
      paramsB.watermark = false;
      paramsB.resample = false;
      paramsB.contrast = randRange(rng, 0.97, 1.03);
      const secondaryA = await transformImage(secondaryARaw, paramsA);
      const secondaryB = await transformImage(secondaryBRaw, paramsB);
      const merged = buildMergeLuma(buildAlignmentImage(secondaryA), buildAlignmentImage(secondaryB), mergeEntry.order ?? 'normal');
      const result = computeAlignmentTransform({
        primary: buildAlignmentImage(primary),
        secondary: merged,
        options: buildAlignmentOptions(),
      });
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.score).toBeLessThan(result.identityScore);
    }

    const splitMeta = JSON.parse(await readFile(path.join(splitDir, 'meta.json'), 'utf8')) as {
      primary: { files: string[] };
      secondary: { files: string[] };
    };
    const splitPrimaryFiles = chooseFiles(splitMeta.primary.files, await listFiles(path.join(splitDir, 'primary')));
    const splitSecondaryFiles = chooseFiles(splitMeta.secondary.files, await listFiles(path.join(splitDir, 'secondary')));
    const splitMapping = await loadMapping(splitDir);
    const splitEntry = splitMapping.mapping.find(
      (entry): entry is { kind: 'split'; index: number; side: 'left' | 'right' } =>
        typeof entry === 'object' && entry != null && (entry as any).kind === 'split'
    );
    if (splitEntry) {
      const primaryPath = path.join(splitDir, 'primary', splitPrimaryFiles[0]!);
      const secondaryPath = path.join(splitDir, 'secondary', splitSecondaryFiles[splitEntry.index]!);
      const primary = await loadImage(primaryPath);
      const secondaryRaw = await loadImage(secondaryPath);
      const params = makeTransformParams(rng, secondaryRaw.width, secondaryRaw.height);
      params.crop = { top: 0, right: 0, bottom: 0, left: 0 };
      params.watermark = false;
      params.resample = false;
      params.contrast = randRange(rng, 0.97, 1.03);
      const transformed = await transformImage(secondaryRaw, params);
      const split = buildSplitLuma(buildAlignmentImage(transformed), splitEntry.side);
      const result = computeAlignmentTransform({
        primary: buildAlignmentImage(primary),
        secondary: split,
        options: buildAlignmentOptions(),
      });
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.score).toBeLessThan(result.identityScore);
    }
  }, 20000);

  it('falls back on missing pages', async () => {
    const root = path.resolve('testdata/dual-reader/dhash/case_rawkuma_vs_copymanga_ch1/synthetic');
    const caseDir = path.join(root, 'insert_delete_from_primary_seed42');
    const meta = JSON.parse(await readFile(path.join(caseDir, 'meta.json'), 'utf8')) as {
      primary: { files: string[] };
    };
    const primaryFiles = chooseFiles(meta.primary.files, await listFiles(path.join(caseDir, 'primary')));
    const mapping = await loadMapping(caseDir);
    const missingIndex = mapping.mapping.findIndex((entry) => entry == null);
    if (missingIndex < 0) return;
    const primaryPath = path.join(caseDir, 'primary', primaryFiles[missingIndex]!);
    const primary = await loadImage(primaryPath);
    const noise = makeNoise(primary.width, primary.height, 123);
    const result = computeAlignmentTransform({
      primary: buildAlignmentImage(primary),
      secondary: buildAlignmentImage(noise),
      options: buildAlignmentOptions(),
    });
    expect(result.confidence).toBeLessThan(0.2);
    expect(result.scale).toBe(1);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
  });

  it('aborts when abortCheck triggers', () => {
    const noise = makeNoise(64, 64, 1337);
    const luma = buildAlignmentImage(noise);
    let calls = 0;
    expect(() =>
      computeAlignmentTransform({
        primary: luma,
        secondary: luma,
        options: buildAlignmentOptions({
          abortCheck: () => {
            calls += 1;
            if (calls > 0) throw new Error('abort');
          },
        }),
      })
    ).toThrow('abort');
  });
});
