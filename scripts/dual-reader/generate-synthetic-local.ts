import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { computeDhash, dhashDistance } from '../../src/lib/dual-reader/hash';

type BaseMeta = {
  caseId: string;
  primary: { files: string[]; count: number };
  secondary: { files: string[]; count: number };
  canonical: { primaryToSecondary_0based: number[] };
};

type SyntheticEntry = {
  id: string;
  primaryDir: string;
  secondaryDir: string;
  note: string;
};

type MappingEntry =
  | { kind: 'single'; index: number }
  | { kind: 'split'; index: number; side: 'left' | 'right' }
  | { kind: 'merge'; indices: [number, number]; order?: 'normal' | 'swap' };

function zeroPad(n: number, width = 4) {
  return String(n).padStart(width, '0');
}

async function writeMergedHorizontal(leftFile: string, rightFile: string, outFile: string) {
  const left = sharp(await readFile(leftFile));
  const right = sharp(await readFile(rightFile));
  const lm = await left.metadata();
  const rm = await right.metadata();
  const lh = lm.height ?? 1800;
  const rh = rm.height ?? 1800;
  const targetH = Math.max(lh, rh);

  const leftBuf = await left.resize({ height: targetH }).toBuffer();
  const rightBuf = await right.resize({ height: targetH }).toBuffer();
  const leftMeta = await sharp(leftBuf).metadata();
  const rightMeta = await sharp(rightBuf).metadata();
  const lw = leftMeta.width ?? 1200;
  const rw = rightMeta.width ?? 1200;

  await sharp({
    create: { width: lw + rw, height: targetH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: leftBuf, top: 0, left: 0 },
      { input: rightBuf, top: 0, left: lw },
    ])
    .jpeg({ quality: 90 })
    .toFile(outFile);
}

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function makeNoiseBuffer(width: number, height: number, seed: number): Buffer {
  const rng = makeRng(seed);
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(rng() * 256);
  }
  return data;
}

async function writeSyntheticNoise(outFile: string, width: number, height: number, seed: number) {
  const data = makeNoiseBuffer(width, height, seed);
  await sharp(data, { raw: { width, height, channels: 3 } }).toFile(outFile);
}

async function computeDhashFromFile(filePath: string) {
  const img = sharp(await readFile(filePath));
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return computeDhash({ data, width: info.width, height: info.height, channels: info.channels });
}

async function writeMeta(
  outDir: string,
  base: BaseMeta,
  caseId: string,
  primaryFiles: string[],
  secondaryFiles: string[]
) {
  const meta = {
    ...base,
    caseId,
    primary: { ...base.primary, files: primaryFiles, count: primaryFiles.length },
    secondary: { ...base.secondary, files: secondaryFiles, count: secondaryFiles.length },
    synthetic: [],
  };
  await writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function main() {
  const root = path.resolve('testdata/dual-reader/dhash/case_rawkuma_vs_copymanga_ch1');
  const baseMeta = JSON.parse(await readFile(path.join(root, 'meta.json'), 'utf8')) as BaseMeta;
  const pDir = path.join(root, 'primary');
  const sDir = path.join(root, 'secondary');
  const pFiles = baseMeta.primary.files;
  const sFiles = baseMeta.secondary.files;
  const canonical = baseMeta.canonical.primaryToSecondary_0based;

  const synthRoot = path.join(root, 'synthetic');
  await ensureDir(synthRoot);

  let syntheticEntries: SyntheticEntry[] = [];
  try {
    const raw = await readFile(path.join(root, 'synthetic.json'), 'utf8');
    syntheticEntries = JSON.parse(raw) as SyntheticEntry[];
  } catch {
    syntheticEntries = [];
  }

  const addEntry = (entry: SyntheticEntry) => {
    if (!syntheticEntries.some((e) => e.id === entry.id)) {
      syntheticEntries.push(entry);
    }
  };

  // 6) primary spreads (merge pairs) vs secondary single pages
  {
    const id = 'merge_primary_pairs';
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, 'primary');
    const outS = path.join(outDir, 'secondary');
    await ensureDir(outP);
    await ensureDir(outS);

    const mergedFiles: string[] = [];
    for (let i = 0; i < pFiles.length; i += 2) {
      const left = path.join(pDir, pFiles[i]!);
      const right = pFiles[i + 1] ? path.join(pDir, pFiles[i + 1]!) : null;
      const outName = `${zeroPad(mergedFiles.length + 1)}.jpg`;
      const outPath = path.join(outP, outName);
      if (right) {
        await writeMergedHorizontal(left, right, outPath);
      } else {
        await writeFile(outPath, await readFile(left));
      }
      mergedFiles.push(outName);
    }

    for (const f of pFiles) {
      await writeFile(path.join(outS, f), await readFile(path.join(pDir, f)));
    }

    const mapping: MappingEntry[] = mergedFiles.map((_, idx) => {
      const a = idx * 2;
      const b = a + 1;
      if (b < pFiles.length) {
        return { kind: 'merge', indices: [a, b], order: 'normal' };
      }
      return { kind: 'single', index: a };
    });

    await writeFile(
      path.join(outDir, 'mapping.json'),
      JSON.stringify(
        {
          type: 'primaryToSecondary_match_v1',
          primaryCount: mergedFiles.length,
          secondaryCount: pFiles.length,
          mapping,
          note: 'Primary pages are merged pairs (spreads); secondary remains single pages.',
        },
        null,
        2
      ),
      'utf8'
    );
    await writeMeta(outDir, baseMeta, `${baseMeta.caseId}/${id}`, mergedFiles, pFiles);
    addEntry({
      id,
      primaryDir: `synthetic/${id}/primary`,
      secondaryDir: `synthetic/${id}/secondary`,
      note: 'Primary merges pairs into spreads; secondary stays single pages.',
    });
  }

  // 7) secondary spreads (merge pairs) vs primary single pages
  {
    const id = 'split_secondary_pairs';
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, 'primary');
    const outS = path.join(outDir, 'secondary');
    await ensureDir(outP);
    await ensureDir(outS);

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const mergedSecondary: string[] = [];
    for (let i = 0; i < pFiles.length; i += 2) {
      const left = path.join(pDir, pFiles[i]!);
      const right = pFiles[i + 1] ? path.join(pDir, pFiles[i + 1]!) : null;
      const outName = `${zeroPad(mergedSecondary.length + 1)}.jpg`;
      const outPath = path.join(outS, outName);
      if (right) {
        await writeMergedHorizontal(left, right, outPath);
      } else {
        await writeFile(outPath, await readFile(left));
      }
      mergedSecondary.push(outName);
    }

    const mapping: MappingEntry[] = pFiles.map((_, idx) => {
      const spreadIndex = Math.floor(idx / 2);
      const hasPair = idx + 1 < pFiles.length;
      if (!hasPair && idx === pFiles.length - 1 && pFiles.length % 2 === 1) {
        return { kind: 'single', index: spreadIndex };
      }
      return {
        kind: 'split',
        index: spreadIndex,
        side: idx % 2 === 0 ? 'left' : 'right',
      };
    });

    await writeFile(
      path.join(outDir, 'mapping.json'),
      JSON.stringify(
        {
          type: 'primaryToSecondary_match_v1',
          primaryCount: pFiles.length,
          secondaryCount: mergedSecondary.length,
          mapping,
          note: 'Secondary merges pairs into spreads; primary stays single pages.',
        },
        null,
        2
      ),
      'utf8'
    );
    await writeMeta(outDir, baseMeta, `${baseMeta.caseId}/${id}`, pFiles, mergedSecondary);
    addEntry({
      id,
      primaryDir: `synthetic/${id}/primary`,
      secondaryDir: `synthetic/${id}/secondary`,
      note: 'Secondary merges pairs into spreads; primary stays single pages.',
    });
  }

  // 8) duplicate secondary pages (1,1,2,2,...)
  {
    const id = 'duplicate_secondary_pages';
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, 'primary');
    const outS = path.join(outDir, 'secondary');
    await ensureDir(outP);
    await ensureDir(outS);

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const mapping: MappingEntry[] = [];
    const secondaryFiles: string[] = [];
    for (let i = 0; i < pFiles.length; i++) {
      const src = path.join(pDir, pFiles[i]!);
      const outNameA = `${zeroPad(i * 2 + 1)}.jpg`;
      const outNameB = `${zeroPad(i * 2 + 2)}.jpg`;
      await writeFile(path.join(outS, outNameA), await readFile(src));
      await writeFile(path.join(outS, outNameB), await readFile(src));
      secondaryFiles.push(outNameA, outNameB);
      mapping.push({ kind: 'single', index: i * 2 });
    }

    await writeFile(
      path.join(outDir, 'mapping.json'),
      JSON.stringify(
        {
          type: 'primaryToSecondary_match_v1',
          primaryCount: pFiles.length,
          secondaryCount: pFiles.length * 2,
          mapping,
          note: 'Secondary duplicates each primary page (1,1,2,2,...).',
        },
        null,
        2
      ),
      'utf8'
    );
    await writeMeta(outDir, baseMeta, `${baseMeta.caseId}/${id}`, pFiles, secondaryFiles);
    addEntry({
      id,
      primaryDir: `synthetic/${id}/primary`,
      secondaryDir: `synthetic/${id}/secondary`,
      note: 'Secondary duplicates each page (1,1,2,2,...).',
    });
  }

  // 9) swapped secondary pairs (2,1,4,3,...)
  {
    const id = 'swap_secondary_pairs';
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, 'primary');
    const outS = path.join(outDir, 'secondary');
    await ensureDir(outP);
    await ensureDir(outS);

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const mapping: MappingEntry[] = new Array(pFiles.length);
    const secondaryFiles: string[] = [];
    let outIndex = 1;
    for (let i = 0; i < pFiles.length; i += 2) {
      const first = pFiles[i]!;
      const second = pFiles[i + 1];
      if (second) {
        const nameA = `${zeroPad(outIndex++)}.jpg`;
        const nameB = `${zeroPad(outIndex++)}.jpg`;
        await writeFile(path.join(outS, nameA), await readFile(path.join(pDir, second)));
        await writeFile(path.join(outS, nameB), await readFile(path.join(pDir, first)));
        secondaryFiles.push(nameA, nameB);
        mapping[i] = { kind: 'single', index: i + 1 };
        mapping[i + 1] = { kind: 'single', index: i };
      } else {
        const name = `${zeroPad(outIndex++)}.jpg`;
        await writeFile(path.join(outS, name), await readFile(path.join(pDir, first)));
        secondaryFiles.push(name);
        mapping[i] = { kind: 'single', index: i };
      }
    }

    await writeFile(
      path.join(outDir, 'mapping.json'),
      JSON.stringify(
        {
          type: 'primaryToSecondary_match_v1',
          primaryCount: pFiles.length,
          secondaryCount: pFiles.length,
          mapping,
          note: 'Secondary swaps adjacent pairs (2,1,4,3,...).',
        },
        null,
        2
      ),
      'utf8'
    );
    await writeMeta(outDir, baseMeta, `${baseMeta.caseId}/${id}`, pFiles, secondaryFiles);
    addEntry({
      id,
      primaryDir: `synthetic/${id}/primary`,
      secondaryDir: `synthetic/${id}/secondary`,
      note: 'Secondary swaps adjacent pairs (2,1,4,3,...).',
    });
  }

  // 10) missing secondary page replaced with unrelated noise
  {
    const id = 'missing_secondary_page_noise';
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, 'primary');
    const outS = path.join(outDir, 'secondary');
    await ensureDir(outP);
    await ensureDir(outS);

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const missingIndex = Math.min(2, Math.max(0, sFiles.length - 1));
    const missingPrimaries = canonical
      .map((idx, i) => (idx === missingIndex ? i : -1))
      .filter((idx) => idx >= 0);
    const primaryHashes = await Promise.all(
      missingPrimaries.map((i) => computeDhashFromFile(path.join(pDir, pFiles[i]!)))
    );
    let noiseSeed = 4242;
    let bestSeed = noiseSeed;
    let bestMinDistance = -1;
    const src = path.join(sDir, sFiles[missingIndex]!);
    const meta0 = await sharp(await readFile(src)).metadata();
    const w = meta0.width ?? 1200;
    const h = meta0.height ?? 1800;
    for (let attempt = 0; attempt < 256; attempt++) {
      const seed = noiseSeed + attempt;
      const buffer = makeNoiseBuffer(w, h, seed);
      const noiseHash = computeDhash({ data: buffer, width: w, height: h, channels: 3 });
      const minDistance = primaryHashes.reduce(
        (min, hash) => Math.min(min, dhashDistance(noiseHash, hash)),
        Number.POSITIVE_INFINITY
      );
      if (minDistance > bestMinDistance) {
        bestMinDistance = minDistance;
        bestSeed = seed;
      }
      if (minDistance >= 70) break;
    }
    for (let i = 0; i < sFiles.length; i++) {
      const src = path.join(sDir, sFiles[i]!);
      const dst = path.join(outS, sFiles[i]!);
      if (i !== missingIndex) {
        await writeFile(dst, await readFile(src));
        continue;
      }
      const meta0 = await sharp(await readFile(src)).metadata();
      const w = meta0.width ?? 1200;
      const h = meta0.height ?? 1800;
      await writeSyntheticNoise(dst, w, h, bestSeed);
    }

    const mapping: Array<number | null> = canonical.map((idx) => (idx === missingIndex ? null : idx));

    await writeFile(
      path.join(outDir, 'mapping.json'),
      JSON.stringify(
        {
          type: 'primaryToSecondaryOrNull_0based',
          primaryCount: pFiles.length,
          secondaryCount: sFiles.length,
          mapping,
          note: 'Secondary page replaced with unrelated noise; primaries that mapped there should be null.',
        },
        null,
        2
      ),
      'utf8'
    );
    await writeMeta(outDir, baseMeta, `${baseMeta.caseId}/${id}`, pFiles, sFiles);
    addEntry({
      id,
      primaryDir: `synthetic/${id}/primary`,
      secondaryDir: `synthetic/${id}/secondary`,
      note: 'Secondary page replaced with unrelated noise (missing-page detection).',
    });
  }

  await writeFile(path.join(root, 'synthetic.json'), JSON.stringify(syntheticEntries, null, 2), 'utf8');
  console.log('[dual-reader] synthetic datasets updated');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
