import path from "node:path";
import sharp from "sharp";
import { toLuma } from "@/lib/dual-reader/image";
import { computeAlignmentTransform } from "@/lib/dual-reader/visual-alignment";
import { buildAlignmentOptions } from "@/lib/dual-reader/alignment-options";
import { initAlignmentWasm, isAlignmentWasmReady } from "@/lib/dual-reader/fft-wasm";

type Pair = {
  id: string;
  primaryFile: string;
  secondaryFile: string;
};

const PAIRS: Pair[] = [
  { id: "p0015-s0016", primaryFile: "primary-0015.jpg", secondaryFile: "secondary-0016.webp" },
  { id: "p0016-s0017", primaryFile: "primary-0016.jpg", secondaryFile: "secondary-0017.webp" },
  { id: "p0017-s0018", primaryFile: "primary-0017.jpg", secondaryFile: "secondary-0018.webp" },
];

async function loadLuma(file: string) {
  const input = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const width = input.info.width ?? 0;
  const height = input.info.height ?? 0;
  const channels = input.info.channels ?? 3;
  const data = new Uint8ClampedArray(input.data.buffer, input.data.byteOffset, input.data.byteLength);
  const luma = toLuma({ data, width, height, channels });
  return { data: luma, width, height };
}

async function main() {
  const root = path.resolve("public/dual-read-debug");
  const fineMax = Number(process.env.FINE_MAX ?? "512");
  const fftMax = Number(process.env.FFT_MAX ?? "256");
  const fftBackend = (process.env.FFT_BACKEND ?? "js") as "js" | "wasm" | "auto";
  if (fftBackend !== "js") {
    const ready = await initAlignmentWasm();
    console.log(`[bench] wasmReady=${ready}`);
  }
  console.log(`[bench] fftBackend=${fftBackend} ready=${isAlignmentWasmReady()}`);
  for (const pair of PAIRS) {
    const primaryPath = path.join(root, pair.primaryFile);
    const secondaryPath = path.join(root, pair.secondaryFile);
    const primary = await loadLuma(primaryPath);
    const secondary = await loadLuma(secondaryPath);
    const startedAt = performance.now();
    const result = computeAlignmentTransform({
      primary,
      secondary,
      options: buildAlignmentOptions({
        fineMax,
        fftMax,
        fftBackend,
        profile: true,
      }),
    });
    const elapsedMs = performance.now() - startedAt;
    console.log(
      `[bench] ${pair.id} fineMax=${fineMax} fftMax=${Math.min(fftMax, fineMax)} total=${elapsedMs.toFixed(1)}ms timings=${result.timings?.totalMs?.toFixed(1)}ms score=${result.score.toFixed(2)}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
