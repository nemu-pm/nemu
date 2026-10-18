#!/usr/bin/env bun
/**
 * Materialises the on-device manga OCR models the NemuJapaneseLearning pod
 * bundles (gitignored, ~130 MB):
 *
 *   ios/Models/NemuMangaOcr/MangaOcrEncoder.mlmodelc   ViT encoder, int8 weights
 *   ios/Models/NemuMangaOcr/MangaOcrDecoder.mlmodelc   2-layer BERT decoder, int8 weights
 *   ios/Models/NemuMangaOcr/manga-ocr-vocab.txt        tokenizer vocabulary
 *   ios/Models/NemuMangaOcr/manifest.json              revision, hashes, provenance
 *
 * Source: the Core ML packages published at
 * https://huggingface.co/nemu-pm/nemu-ocr-coreml (kha-white/manga-ocr-base and
 * ogkalu/comic-text-and-bubble-detector, both Apache-2.0, converted by nemu;
 * the conversion scripts live in that repo). Every source file is pinned by
 * sha256 below, and the Hub repo by commit.
 *
 * Where the source packages come from, first match wins:
 *   --from <dir> / NEMU_OCR_MODELS_DIR  a folder with the three .mlpackage
 *                                       folders and vocab.txt
 *   NEMU_OCR_MODELS_URL                 a .tar.gz of that folder (optionally
 *                                       NEMU_OCR_MODELS_SHA256 for the archive);
 *                                       unpacked into the local cache
 *   ~/Library/Caches/nemu/ocr-models/<SOURCE_ID>   the local cache
 *   the Hugging Face repo at HF_REVISION (default; HF_ENDPOINT overrides the
 *                                       host, e.g. a mirror), into the cache
 *
 * The packages are compiled with `xcrun coremlcompiler` (Xcode) into the
 * .mlmodelc folders the app loads. Re-running is a no-op when the manifest
 * already matches. `--pack <out.tar.gz>` writes the distributable archive of
 * the verified sources (for hosting behind NEMU_OCR_MODELS_URL).
 *
 * Usage (from apps/mobile): bun run ocr:models [--from <dir>] [--force] [--pack <file>]
 * then `pod install` in apps/mobile/ios.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const SOURCE_ID = "manga-ocr-int8-ogkalu-v4s-fp16-v1";
const DETECTOR_PACKAGE = "ogkalu-ctbd-v4s-fp16.mlpackage";
const ENCODER_PACKAGE = "mangaocr-encoder-int8.mlpackage";
const DECODER_PACKAGE = "mangaocr-decoder-int8.mlpackage";
const VOCAB = "vocab.txt";
const HF_REPO = "nemu-pm/nemu-ocr-coreml";
/** The Hub commit the pins below were published at. */
const HF_REVISION = "691285cc539f4662f785540efcc9a62d51a1095c";

/** sha256 and size of every source file, relative to the source folder. */
const PINNED: Record<string, { sha256: string; bytes: number }> = {
  [`${ENCODER_PACKAGE}/Manifest.json`]: {
    sha256: "7746f6eb8b766e8cdd270a70a3e4e7f953600f7662f650c9195aa67121f8ae6c",
    bytes: 617,
  },
  [`${ENCODER_PACKAGE}/Data/com.apple.CoreML/model.mlmodel`]: {
    sha256: "4760438fc8718b236395d2e1b71bc9c93e8d58c620e1666911415571c0593a4c",
    bytes: 150_209,
  },
  [`${ENCODER_PACKAGE}/Data/com.apple.CoreML/weights/weight.bin`]: {
    sha256: "407a6a3ff79c42eab4b29f10cf90450c1790d8b0dff5a41904b21dce1c30889f",
    bytes: 86_110_336,
  },
  [`${DECODER_PACKAGE}/Manifest.json`]: {
    sha256: "56b97b180b9d0b1b0d34db0c97bdf2c322160540070bf7f18bee3e87a0f45e46",
    bytes: 617,
  },
  [`${DECODER_PACKAGE}/Data/com.apple.CoreML/model.mlmodel`]: {
    sha256: "41d730617c622d30fa76b0718abf2eb69c6c0d22be7b8f2e073f886e7d2c3217",
    bytes: 83_482,
  },
  [`${DECODER_PACKAGE}/Data/com.apple.CoreML/weights/weight.bin`]: {
    sha256: "fe9c5a2a3737cf6939fbfb0ed1929df52f486dc2609dfc4541c4d4c9df826eb0",
    bytes: 24_728_960,
  },
  [`${DETECTOR_PACKAGE}/Data/com.apple.CoreML/model.mlmodel`]: {
    sha256: "8dff4f6396bdcb78fbcb7a4eca8a5727eeff0c5b724fb8eb2948afc19791d2bb",
    bytes: 348572,
  },
  [`${DETECTOR_PACKAGE}/Data/com.apple.CoreML/weights/weight.bin`]: {
    sha256: "d44f9bc16335f139df319b7ca109dc25404174833cd6441590e720c87136b537",
    bytes: 20650688,
  },
  [`${DETECTOR_PACKAGE}/Manifest.json`]: {
    sha256: "ea71993f1816afe2eaa6e1afde984f3da6a84709172b67df561a388d1a990b65",
    bytes: 617,
  },
  [VOCAB]: {
    sha256: "344fbb6b8bf18c57839e924e2c9365434697e0227fac00b88bb4899b78aa594d",
    bytes: 24_072,
  },
};

const moduleDir = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = join(moduleDir, "ios", "Models", "NemuMangaOcr");
const cacheDir = join(homedir(), "Library", "Caches", "nemu", "ocr-models", SOURCE_ID);

function fail(message: string): never {
  console.error(`fetch-ocr-models: ${message}`);
  process.exit(1);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolvePromise(hash.digest("hex")))
      .on("error", reject);
  });
}

/** The pinned revision: a digest over the pinned file hashes. */
function pinnedRevision(): string {
  const digest = createHash("sha256");
  for (const key of Object.keys(PINNED).sort()) digest.update(`${key}:${PINNED[key]!.sha256}\n`);
  return `${SOURCE_ID}-${digest.digest("hex").slice(0, 12)}`;
}

async function verifySource(dir: string): Promise<string | null> {
  for (const [path, expected] of Object.entries(PINNED)) {
    const full = join(dir, path);
    if (!existsSync(full)) return `missing ${path}`;
    if (statSync(full).size !== expected.bytes) return `size mismatch for ${path}`;
    if ((await sha256File(full)) !== expected.sha256) return `sha256 mismatch for ${path}`;
  }
  return null;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: ["ignore", "pipe", "inherit"] });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed (${result.status})`);
}

async function download(url: string): Promise<string> {
  console.log(`fetch-ocr-models: downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) fail(`download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const expected = process.env.NEMU_OCR_MODELS_SHA256?.trim().toLowerCase();
  if (expected) {
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) fail(`archive sha256 ${actual} != NEMU_OCR_MODELS_SHA256 ${expected}`);
  }
  const work = mkdtempSync(join(tmpdir(), "nemu-ocr-models-"));
  const archive = join(work, "models.tar.gz");
  writeFileSync(archive, bytes);
  const unpacked = join(work, "src");
  mkdirSync(unpacked);
  run("tar", ["-xzf", archive, "-C", unpacked]);
  // Accept archives with or without a single top-level folder.
  const entries = readdirSync(unpacked);
  const root =
    entries.length === 1 && !existsSync(join(unpacked, ENCODER_PACKAGE))
      ? join(unpacked, entries[0]!)
      : unpacked;
  const problem = await verifySource(root);
  if (problem) fail(`downloaded archive: ${problem}`);
  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(dirname(cacheDir), { recursive: true });
  cpSync(root, cacheDir, { recursive: true });
  rmSync(work, { recursive: true, force: true });
  return cacheDir;
}

/** Downloads every pinned file from the Hub commit into the cache, verified. */
async function downloadFromHub(): Promise<string> {
  const endpoint = (process.env.HF_ENDPOINT?.trim() || "https://huggingface.co").replace(/\/+$/, "");
  console.log(`fetch-ocr-models: downloading ${HF_REPO}@${HF_REVISION.slice(0, 8)} from ${endpoint}`);
  const work = mkdtempSync(join(tmpdir(), "nemu-ocr-models-"));
  for (const [path, expected] of Object.entries(PINNED)) {
    const url = `${endpoint}/${HF_REPO}/resolve/${HF_REVISION}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url);
    if (!response.ok) fail(`download failed for ${path}: HTTP ${response.status} (${url})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== expected.bytes || actual !== expected.sha256) {
      fail(`downloaded ${path} does not match its pin (sha256 ${actual}, ${bytes.byteLength} bytes)`);
    }
    const target = join(work, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(dirname(cacheDir), { recursive: true });
  cpSync(work, cacheDir, { recursive: true });
  rmSync(work, { recursive: true, force: true });
  return cacheDir;
}

async function resolveSource(): Promise<string> {
  const explicit = argument("--from") ?? process.env.NEMU_OCR_MODELS_DIR;
  if (explicit) {
    const dir = resolve(explicit);
    const problem = await verifySource(dir);
    if (problem) fail(`${dir}: ${problem}`);
    return dir;
  }
  const url = process.env.NEMU_OCR_MODELS_URL?.trim();
  if (url) return download(url);
  if (existsSync(cacheDir)) {
    const problem = await verifySource(cacheDir);
    if (!problem) return cacheDir;
    console.warn(`fetch-ocr-models: ignoring cache ${cacheDir}: ${problem}`);
  }
  return downloadFromHub();
}

function compile(sourceDir: string, packageName: string, target: string, work: string): void {
  const out = join(work, packageName.replace(/\.mlpackage$/, ""));
  mkdirSync(out, { recursive: true });
  run("xcrun", ["coremlcompiler", "compile", join(sourceDir, packageName), out]);
  const compiled = readdirSync(out).find((name) => name.endsWith(".mlmodelc"));
  if (!compiled) fail(`coremlcompiler produced no .mlmodelc for ${packageName}`);
  renameSync(join(out, compiled), target);
}

function folderBytes(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + folderBytes(join(path, name)), 0);
}

async function main(): Promise<void> {
  const revision = pinnedRevision();
  const pack = argument("--pack");
  const manifestPath = join(outDir, "manifest.json");
  if (!pack && !process.argv.includes("--force") && existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { revision?: string };
      const complete = ["MangaOcrEncoder.mlmodelc", "MangaOcrDecoder.mlmodelc", "MangaTextDetector.mlmodelc", "manga-ocr-vocab.txt"].every(
        (name) => existsSync(join(outDir, name)),
      );
      if (manifest.revision === revision && complete) {
        cpSync(join(moduleDir, "OCR-NOTICES.txt"), join(outDir, "OCR-NOTICES.txt"));
        console.log(`fetch-ocr-models: ${revision} already in place (${outDir})`);
        return;
      }
    } catch {
      // Rebuild below.
    }
  }

  const source = await resolveSource();
  if (pack) {
    run("tar", ["-czf", resolve(pack), "-C", source, ENCODER_PACKAGE, DECODER_PACKAGE, DETECTOR_PACKAGE, VOCAB]);
    console.log(`fetch-ocr-models: wrote ${resolve(pack)} (sha256 ${await sha256File(resolve(pack))})`);
    return;
  }
  if (source !== cacheDir) {
    // Keep a verified copy so later runs work without the original folder.
    rmSync(cacheDir, { recursive: true, force: true });
    mkdirSync(dirname(cacheDir), { recursive: true });
    cpSync(source, cacheDir, { recursive: true });
  }

  const work = mkdtempSync(join(tmpdir(), "nemu-ocr-compile-"));
  const staging = join(work, "NemuMangaOcr");
  mkdirSync(staging);
  compile(source, ENCODER_PACKAGE, join(staging, "MangaOcrEncoder.mlmodelc"), work);
  compile(source, DECODER_PACKAGE, join(staging, "MangaOcrDecoder.mlmodelc"), work);
  compile(source, DETECTOR_PACKAGE, join(staging, "MangaTextDetector.mlmodelc"), work);
  cpSync(join(moduleDir, "OCR-NOTICES.txt"), join(staging, "OCR-NOTICES.txt"));
  cpSync(join(source, VOCAB), join(staging, "manga-ocr-vocab.txt"));
  const xcode = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" }).stdout?.trim().replace(/\n/g, " ");
  const files: Record<string, number> = {};
  for (const name of readdirSync(staging)) files[name] = folderBytes(join(staging, name));
  if (Object.values(files).reduce((sum, value) => sum + value, 0) >= 300_000_000) {
    fail("compiled models exceed the 300 MB bundle budget");
  }
  writeFileSync(
    join(staging, "manifest.json"),
    `${JSON.stringify(
      {
        revision,
        model: "kha-white/manga-ocr-base",
        detector: "ogkalu/comic-text-and-bubble-detector detector-v4-s_int8.onnx @ 16e8a622, dequantised to fp16 Core ML",
        license: "Apache-2.0 (manga-ocr-base; trained on Manga109-s)",
        conversion: "coremltools 9 mlprogram iOS17, int8 per-channel linear weights (quantize_int8.py)",
        compiledWith: xcode ?? "unknown",
        sources: Object.fromEntries(Object.entries(PINNED).map(([path, pin]) => [path, pin.sha256])),
        bytes: files,
        totalBytes: Object.values(files).reduce((sum, value) => sum + value, 0),
      },
      null,
      2,
    )}\n`,
  );
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(dirname(outDir), { recursive: true });
  renameSync(staging, outDir);
  rmSync(work, { recursive: true, force: true });
  const total = Object.values(files).reduce((sum, value) => sum + value, 0);
  console.log(
    `fetch-ocr-models: ${revision} → ${relative(process.cwd(), outDir)} (${(total / 1e6).toFixed(1)} MB). Run 'pod install' in apps/mobile/ios.`,
  );
}

await main();
