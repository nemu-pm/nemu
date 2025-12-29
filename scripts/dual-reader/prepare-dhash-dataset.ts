import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type AidokuPage = { index: number; url: string };

function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to locate JSON array in output (len=${text.length})`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

function assertPages(x: unknown): AidokuPage[] {
  if (!Array.isArray(x)) throw new Error("pages JSON is not an array");
  for (const it of x) {
    if (typeof it !== "object" || it === null) throw new Error("pages item not object");
    const index = (it as any).index;
    const url = (it as any).url;
    if (typeof index !== "number" || typeof url !== "string") {
      throw new Error("pages item missing {index:number,url:string}");
    }
  }
  return x as AidokuPage[];
}

async function downloadTo(url: string, outFile: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outFile, buf);
}

function extFromUrl(url: string): string {
  const clean = url.split("?")[0]!;
  const ext = path.extname(clean).toLowerCase();
  return ext && ext.length <= 6 ? ext : ".img";
}

async function runAidokuPagesJson(sourceId: string, mangaKey: string, chapterKey: string) {
  const proc = Bun.spawnSync({
    cmd: ["aidoku", "test", "pages", "--json", sourceId, mangaKey, chapterKey],
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const out = proc.stdout.toString("utf8");
  const err = proc.stderr.toString("utf8");
  if (proc.exitCode !== 0) {
    throw new Error(`aidoku failed (${proc.exitCode})\nstdout:\n${out}\nstderr:\n${err}`);
  }
  const parsed = extractJsonArray(out);
  return assertPages(parsed);
}

async function getFirstNPages(
  opts: { sourceId: string; mangaKey: string; chapterKey: string; n: number },
): Promise<AidokuPage[]> {
  const pages = await runAidokuPagesJson(opts.sourceId, opts.mangaKey, opts.chapterKey);
  return pages.slice(0, opts.n);
}

async function writeSyntheticWatermark(inFile: string, outFile: string, text: string) {
  const img = sharp(await readFile(inFile));
  const meta = await img.metadata();
  const w = meta.width ?? 1200;
  const h = meta.height ?? 1800;

  const svg = `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font: 64px sans-serif; fill: rgba(255,255,255,0.28); }
  </style>
  <text x="40" y="${Math.max(80, Math.round(h * 0.10))}">${text}</text>
  <text x="40" y="${Math.max(160, Math.round(h * 0.90))}">${text}</text>
</svg>
`.trim();

  await sharp(await readFile(inFile))
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toFile(outFile);
}

async function writeSyntheticCrop(inFile: string, outFile: string, ratio: number) {
  const img = sharp(await readFile(inFile));
  const meta = await img.metadata();
  const w = meta.width ?? 1200;
  const h = meta.height ?? 1800;
  const dx = Math.max(1, Math.round(w * ratio));
  const dy = Math.max(1, Math.round(h * ratio));
  await img
    .extract({ left: dx, top: dy, width: Math.max(1, w - dx * 2), height: Math.max(1, h - dy * 2) })
    .toFile(outFile);
}

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function writeSyntheticNoise(outFile: string, width: number, height: number, seed: number) {
  const rng = makeRng(seed);
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(rng() * 256);
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toFile(outFile);
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

function zeroPad(n: number, width = 4) {
  return String(n).padStart(width, "0");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function main() {
  const root = path.resolve("testdata/dual-reader/dhash");
  const caseId = "case_rawkuma_vs_copymanga_ch1";
  const caseDir = path.join(root, caseId);

  const primary = {
    label: "ja.rawkuma",
    sourceId: "ja.rawkuma",
    mangaKey: "/manga/gal-no-jitensha-wo-naoshitara-natsukareta/",
    chapterKey: "/manga/gal-no-jitensha-wo-naoshitara-natsukareta/chapter-1.239625/",
  };
  const secondary = {
    label: "zh.copymanga",
    sourceId: "zh.copymanga",
    mangaKey: "banglameixiuhaozixingchehouwobeitachanshangle",
    chapterKey: "3e3604e8-d396-11f0-91a3-fa163e4baef8",
  };

  await mkdir(caseDir, { recursive: true });
  const pDir = path.join(caseDir, "primary");
  const sDir = path.join(caseDir, "secondary");
  await mkdir(pDir, { recursive: true });
  await mkdir(sDir, { recursive: true });

  const pPages = await getFirstNPages({ ...primary, n: 10 });
  const sPages = await getFirstNPages({ ...secondary, n: 10 });

  const pFiles: string[] = [];
  for (let i = 0; i < pPages.length; i++) {
    const page = pPages[i]!;
    const ext = extFromUrl(page.url);
    const file = `${zeroPad(i + 1)}${ext}`;
    const out = path.join(pDir, file);
    await downloadTo(page.url, out);
    pFiles.push(file);
  }

  const sFiles: string[] = [];
  for (let i = 0; i < sPages.length; i++) {
    const page = sPages[i]!;
    const ext = extFromUrl(page.url);
    const file = `${zeroPad(i + 1)}${ext}`;
    const out = path.join(sDir, file);
    await downloadTo(page.url, out);
    sFiles.push(file);
  }

  // Canonical mapping (1-based page numbers) provided by user.
  // For first 10 primary pages: 1->1, 2->2, 3->2, 4->3, 5->4, 6->5, 7->6, 8->7, 9->8, 10->9
  const canonicalPrimaryToSecondary_1based = [1, 2, 2, 3, 4, 5, 6, 7, 8, 9];
  const canonicalPrimaryToSecondary_0based = canonicalPrimaryToSecondary_1based.map((x) => x - 1);

  const meta = {
    caseId,
    createdAt: new Date().toISOString(),
    primary: { ...primary, files: pFiles, count: pFiles.length },
    secondary: { ...secondary, files: sFiles, count: sFiles.length },
    canonical: {
      primaryToSecondary_1based: canonicalPrimaryToSecondary_1based,
      primaryToSecondary_0based: canonicalPrimaryToSecondary_0based,
      note: "Meaning: primary page i maps to secondary page canonical[i-1]. Multiple primaries may map to the same secondary (merged spreads).",
    },
    synthetic: [] as Array<{ id: string; primaryDir: string; secondaryDir: string; note: string }>,
  };

  await writeFile(path.join(caseDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  // --- Synthetic variants (small, deterministic) ---
  const synthRoot = path.join(caseDir, "synthetic");
  await mkdir(synthRoot, { recursive: true });

  // 1) watermark secondary
  {
    const id = "watermark_secondary";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    // copy primary as-is
    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }
    // watermark secondary
    for (const f of sFiles) {
      await writeSyntheticWatermark(path.join(sDir, f), path.join(outS, f), "DUAL-READ SYNTH");
    }
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Secondary pages watermarked (robustness test)." });
  }

  // 2) crop primary slightly
  {
    const id = "crop_primary_5pct";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    for (const f of pFiles) {
      await writeSyntheticCrop(path.join(pDir, f), path.join(outP, f), 0.05);
    }
    for (const f of sFiles) {
      await writeFile(path.join(outS, f), await readFile(path.join(sDir, f)));
    }
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Primary pages cropped 5% border (robustness test)." });
  }

  // 3) insert an extra “credit” page at the start of secondary (simulates scanlator page)
  {
    const id = "insert_secondary_credit_page";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    // credit page = merged(secondary[1], secondary[1]) to keep it "image-like" and stable
    const creditFile = `${zeroPad(1)}.jpg`;
    await writeMergedHorizontal(path.join(sDir, sFiles[0]!), path.join(sDir, sFiles[0]!), path.join(outS, creditFile));

    // shift existing secondary pages to 0002..0011
    for (let i = 0; i < sFiles.length; i++) {
      const src = path.join(sDir, sFiles[i]!);
      const dstName = `${zeroPad(i + 2)}${path.extname(sFiles[i]!) || ".img"}`;
      await writeFile(path.join(outS, dstName), await readFile(src));
    }

    // Mapping shifts by +1 for all canonical indices (0-based +1, with clamp).
    const shifted = canonicalPrimaryToSecondary_0based.map((x) => x + 1);
    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondary_0based",
          primaryCount: pFiles.length,
          secondaryCount: sFiles.length + 1,
          mapping: shifted,
          note: "Secondary has one extra credit page at index 0; canonical mapping shifted by +1.",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Secondary has an extra inserted page at the start." });
  }

  // 4) resize + pad secondary (scale change robustness)
  {
    const id = "resize_secondary_75pct";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    for (const f of sFiles) {
      const inPath = path.join(sDir, f);
      const buf = await readFile(inPath);
      const img = sharp(buf);
      const meta0 = await img.metadata();
      const w = meta0.width ?? 1200;
      const h = meta0.height ?? 1800;
      const w2 = Math.max(1, Math.round(w * 0.75));
      const h2 = Math.max(1, Math.round(h * 0.75));
      const resized = await img.resize(w2, h2, { fit: "fill" }).toBuffer();
      const padL = Math.floor((w - w2) / 2);
      const padR = w - w2 - padL;
      const padT = Math.floor((h - h2) / 2);
      const padB = h - h2 - padT;
      await sharp(resized)
        .extend({ left: padL, right: padR, top: padT, bottom: padB, background: { r: 0, g: 0, b: 0 } })
        .toFile(path.join(outS, f));
    }

    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Secondary resized down to 75% then padded back (scale robustness test)." });
  }

  // 5) random insert/delete from primary (known-ground-truth synthetic: extra/less pages)
  {
    const id = "insert_delete_from_primary_seed42";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    // Primary stays the real primary.
    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    // Build a synthetic secondary sequence from primary pages (so we know mapping).
    // Operations (deterministic):
    // - Insert a duplicate of primary page 1 at secondary position 0 (credit page)
    // - Delete primary page 6 entirely from secondary (less pages)
    // - Insert a duplicate of primary page 4 after it (extra page mid-chapter)
    //
    // The synthetic secondary is watermarked and encoded as jpg to mimic cross-source diffs.
    const primaryIndices = pFiles.map((_, i) => i); // 0..9
    const deletedPrimary = new Set([5]); // drop primary page 6 (0-based)

    const seq: number[] = [];
    seq.push(0); // credit = duplicate of primary1
    for (const pi of primaryIndices) {
      if (deletedPrimary.has(pi)) continue;
      seq.push(pi);
      if (pi === 3) seq.push(pi); // duplicate primary4
    }

    const mapping: Array<number | null> = primaryIndices.map((pi) => {
      if (deletedPrimary.has(pi)) return null;
      // find the first occurrence of pi in seq
      const idx = seq.indexOf(pi);
      return idx === -1 ? null : idx;
    });

    // Write secondary files as 0001.jpg, 0002.jpg, ...
    for (let i = 0; i < seq.length; i++) {
      const pi = seq[i]!;
      const inPath = path.join(pDir, pFiles[pi]!);
      const outName = `${zeroPad(i + 1)}.jpg`;
      const outPath = path.join(outS, outName);
      const buf = await readFile(inPath);
      // watermark + re-encode
      const img = sharp(buf);
      const meta0 = await img.metadata();
      const w = meta0.width ?? 1200;
      const h = meta0.height ?? 1800;
      const svg = `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font: 64px sans-serif; fill: rgba(255,255,255,0.22); }
  </style>
  <text x="40" y="${Math.max(90, Math.round(h * 0.12))}">SYNTH42</text>
</svg>
`.trim();
      await img
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 88 })
        .toFile(outPath);
    }

    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondaryOrNull_0based",
          primaryCount: pFiles.length,
          secondaryCount: seq.length,
          mapping,
          note: "Secondary derived from primary with insert/delete ops; mapping is ground truth. null means the page was deleted (missing).",
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Known-ground-truth synthetic: insert+delete pages derived from primary." });
  }

  // 6) primary spreads (merge pairs) vs secondary single pages
  {
    const id = "merge_primary_pairs";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

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

    const mapping: Array<MappingEntry> = mergedFiles.map((_, idx) => {
      const a = idx * 2;
      const b = a + 1;
      if (b < pFiles.length) {
        return { kind: "merge", indices: [a, b], order: "normal" };
      }
      return { kind: "single", index: a };
    });

    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondary_match_v1",
          primaryCount: mergedFiles.length,
          secondaryCount: pFiles.length,
          mapping,
          note: "Primary pages are merged pairs (spreads); secondary remains single pages.",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Primary merges pairs into spreads; secondary stays single pages." });
  }

  // 7) secondary spreads (merge pairs) vs primary single pages (split detection)
  {
    const id = "split_secondary_pairs";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

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

    const mapping: Array<MappingEntry> = pFiles.map((_, idx) => {
      const spreadIndex = Math.floor(idx / 2);
      const hasPair = idx + 1 < pFiles.length;
      if (!hasPair && idx === pFiles.length - 1 && pFiles.length % 2 === 1) {
        return { kind: "single", index: spreadIndex };
      }
      return {
        kind: "split",
        index: spreadIndex,
        side: idx % 2 === 0 ? "left" : "right",
      };
    });

    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondary_match_v1",
          primaryCount: pFiles.length,
          secondaryCount: mergedSecondary.length,
          mapping,
          note: "Secondary merges pairs into spreads; primary stays single pages.",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Secondary merges pairs into spreads; primary stays single pages." });
  }

  // 8) duplicate secondary pages (1,1,2,2,...)
  {
    const id = "duplicate_secondary_pages";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const mapping: Array<MappingEntry> = [];
    for (let i = 0; i < pFiles.length; i++) {
      const src = path.join(pDir, pFiles[i]!);
      const outNameA = `${zeroPad(i * 2 + 1)}${path.extname(pFiles[i]!) || ".img"}`;
      const outNameB = `${zeroPad(i * 2 + 2)}${path.extname(pFiles[i]!) || ".img"}`;
      await writeFile(path.join(outS, outNameA), await readFile(src));
      await writeFile(path.join(outS, outNameB), await readFile(src));
      mapping.push({ kind: "single", index: i * 2 });
    }

    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondary_match_v1",
          primaryCount: pFiles.length,
          secondaryCount: pFiles.length * 2,
          mapping,
          note: "Secondary duplicates each primary page (1,1,2,2,...).",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Secondary duplicates each page (1,1,2,2,...)." });
  }

  // 9) swapped secondary pairs (2,1,4,3,...)
  {
    const id = "swap_secondary_pairs";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const mapping: Array<MappingEntry> = new Array(pFiles.length);
    let outIndex = 1;
    for (let i = 0; i < pFiles.length; i += 2) {
      const first = pFiles[i]!;
      const second = pFiles[i + 1];
      if (second) {
        await writeFile(path.join(outS, `${zeroPad(outIndex++)}${path.extname(second) || ".img"}`), await readFile(path.join(pDir, second)));
        await writeFile(path.join(outS, `${zeroPad(outIndex++)}${path.extname(first) || ".img"}`), await readFile(path.join(pDir, first)));
        mapping[i] = { kind: "single", index: i + 1 };
        mapping[i + 1] = { kind: "single", index: i };
      } else {
        await writeFile(path.join(outS, `${zeroPad(outIndex++)}${path.extname(first) || ".img"}`), await readFile(path.join(pDir, first)));
        mapping[i] = { kind: "single", index: i };
      }
    }

    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondary_match_v1",
          primaryCount: pFiles.length,
          secondaryCount: pFiles.length,
          mapping,
          note: "Secondary swaps adjacent pairs (2,1,4,3,...).",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({ id, primaryDir: `synthetic/${id}/primary`, secondaryDir: `synthetic/${id}/secondary`, note: "Secondary swaps adjacent pairs (2,1,4,3,...)." });
  }

  // 10) missing secondary page replaced with unrelated noise
  {
    const id = "missing_secondary_page_noise";
    const outDir = path.join(synthRoot, id);
    const outP = path.join(outDir, "primary");
    const outS = path.join(outDir, "secondary");
    await mkdir(outP, { recursive: true });
    await mkdir(outS, { recursive: true });

    for (const f of pFiles) {
      await writeFile(path.join(outP, f), await readFile(path.join(pDir, f)));
    }

    const missingIndex = Math.min(2, Math.max(0, sFiles.length - 1));
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
      await writeSyntheticNoise(dst, w, h, 4242);
    }

    const mapping: Array<number | null> = canonicalPrimaryToSecondary_0based.map((idx) =>
      idx === missingIndex ? null : idx
    );

    await writeFile(
      path.join(outDir, "mapping.json"),
      JSON.stringify(
        {
          type: "primaryToSecondaryOrNull_0based",
          primaryCount: pFiles.length,
          secondaryCount: sFiles.length,
          mapping,
          note: "Secondary page replaced with unrelated noise; primaries that mapped there should be null.",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, caseId: `${caseId}/${id}` }, null, 2), "utf8");
    meta.synthetic.push({
      id,
      primaryDir: `synthetic/${id}/primary`,
      secondaryDir: `synthetic/${id}/secondary`,
      note: "Secondary page replaced with unrelated noise (missing-page detection).",
    });
  }

  await writeFile(path.join(caseDir, "synthetic.json"), JSON.stringify(meta.synthetic, null, 2), "utf8");

  console.log(`[dual-reader] dataset ready: ${caseDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
