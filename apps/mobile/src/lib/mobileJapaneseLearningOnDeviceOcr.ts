/**
 * On-device OCR path (the NemuJapaneseLearning module).
 *
 * Two pipelines:
 * - "manga-ocr" (default when the binary bundles the models): a text
 *   detector finds bubbles, the native text_order port orders them and
 *   manga-ocr on Core ML reads each crop, streaming block by block. Builds
 *   with recognition models alone use Apple Vision's line layout
 *   (`detectMobileOcrLayoutRegions`) as an interim detector.
 * - "vision": Apple Vision reads the page, the TS layout groups and orders
 *   the lines, and a second Vision pass re-reads each bubble. It is the
 *   fallback when the models are missing (Debug builds) or Core ML fails.
 *
 * The page image never crosses the bridge as base64 and is never uploaded:
 * remote pages resolve to the reader's own disk cache entry (the file the
 * page view already decoded, same pixel space as the overlay), local pages
 * are passed by `file://` URI, and data URIs are spilled to a temporary file.
 * Long strips cached as segments are recognized tile by tile and stitched
 * back into page coordinates before layout.
 */
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type {
  NemuJapaneseLearningCapabilities,
  NemuJapaneseLearningNativeModule,
  NemuOcrPageBlock,
  NemuOcrRegionInput,
  NemuRecognizeImageResult,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import { decodeBase64 } from "./mobileBase64";
import {
  createMobileJapaneseLearningEngineRequestId,
  getMobileJapaneseLearningCapabilities,
  getMobileJapaneseLearningNativeModule,
  mobileJapaneseLearningNowMs,
  recordMobileJapaneseLearningEngineRun,
} from "./mobileJapaneseLearningEngine";
import {
  classifyMobileOcrScript,
  detectMobileOcrLayoutRegions,
  isMobileOcrWatermarkText,
  layoutMobileOnDeviceOcrPage,
  refineMobileOcrDetectionText,
  type MobileOnDeviceOcrLine,
} from "./mobileJapaneseLearningOcrLayout";
import {
  awaitMobileJapaneseLearningAbortable,
  throwIfMobileJapaneseLearningAborted,
} from "./mobileJapaneseLearningSafety";
import type { MobileOcrDetection } from "./mobileJapaneseLearningOcr";

export type MobileOnDeviceOcrImageTile = {
  fileUri: string;
  /** Offset of this tile inside the page, in page pixels. */
  offsetX: number;
  offsetY: number;
};

export type MobileOnDeviceOcrImage = {
  /** Stable identity for the result cache. */
  identity: string;
  tiles: MobileOnDeviceOcrImageTile[];
  release?: () => void;
};

export type MobileOnDeviceOcrEngineInfo = {
  kind: "on-device";
  engine: string;
  engineRevision: string;
  osVersion: string;
  elapsedMs: number;
  recognizeMs: number;
  lineCount: number;
  cached: boolean;
  /** Which on-device pipeline produced the detections. */
  pipeline?: MobileOnDeviceOcrPipeline;
  /** manga-ocr: the detector that proposed the bubbles. */
  detector?: string;
  /** Why this run used Vision although manga-ocr was preferred. */
  fallbackReason?: string;
};

export type MobileOnDeviceOcrPipeline = "manga-ocr" | "vision";

export type MobileOnDeviceOcrResult = {
  detections: MobileOcrDetection[];
  /**
   * manga-ocr only: each detection's recognition confidence (same index as
   * `detections`), null where the binary does not report it.
   */
  recognitionConfidences?: (number | null)[];
  /** Pixel size of the recognized image: the space `detections` are in. */
  imageSize?: { width: number; height: number };
  engine: MobileOnDeviceOcrEngineInfo;
};

export type MobileOnDeviceOcrOptions = {
  signal: AbortSignal;
  module?: NemuJapaneseLearningNativeModule | null;
  /**
   * manga-ocr only: called with the detections read so far (reading order)
   * each time a bubble is recognized, so the transcript fills progressively.
   */
  onDetections?: (detections: MobileOcrDetection[]) => void;
  /** Forces a pipeline (tests, QA); default picks by capability. */
  pipeline?: MobileOnDeviceOcrPipeline;
  resolveImage?: (
    page: Pick<MobileReaderPage, "imageUri" | "headers">,
    signal: AbortSignal,
  ) => Promise<MobileOnDeviceOcrImage>;
};

const RESULT_CACHE_LIMIT = 24;
const resultCache = new Map<string, MobileOnDeviceOcrResult>();

export function clearMobileOnDeviceOcrCache(): void {
  resultCache.clear();
}

/** Engine + engine revision + OS version + image identity. */
export function makeMobileOnDeviceOcrCacheKey(
  info: { engine: string; engineRevision: string; osVersion: string },
  imageIdentity: string,
): string {
  return `${info.engine}|${info.engineRevision}|${info.osVersion}|${imageIdentity}`;
}

function headersIdentity(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  // Header values can carry credentials: keep only their shape in the key.
  return Object.keys(headers)
    .sort()
    .map((key) => `${key.toLowerCase()}:${headers[key]!.length}`)
    .join(",");
}

async function defaultResolveImage(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  signal: AbortSignal,
): Promise<MobileOnDeviceOcrImage> {
  const uri = page.imageUri;
  if (!uri) throw new Error("Current page has no image.");
  if (uri.startsWith("file://")) {
    return { identity: uri, tiles: [{ fileUri: uri, offsetX: 0, offsetY: 0 }] };
  }
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma < 0 || !uri.slice(0, comma).toLowerCase().includes(";base64")) {
      throw new Error("Current page image data is not base64 encoded.");
    }
    const { File, Paths } = await import("expo-file-system");
    const file = new File(
      Paths.cache,
      `nemu-ocr-${createMobileJapaneseLearningEngineRequestId("page")}.img`,
    );
    await file.write(decodeBase64(uri.slice(comma + 1)));
    return {
      identity: `data:${uri.length}:${uri.slice(comma + 1, comma + 257)}`,
      tiles: [{ fileUri: file.uri, offsetX: 0, offsetY: 0 }],
      release: () => {
        try {
          if (file.exists) file.delete();
        } catch {
          // Cache directory files are purged by the OS eventually.
        }
      },
    };
  }
  if (/^https?:\/\//i.test(uri)) {
    const { resolveCachedMobileImageAsset } = await import("./mobileImageCache");
    const asset = await resolveCachedMobileImageAsset(
      { uri, headers: page.headers, cacheKind: "page" },
      undefined,
      undefined,
      { signal },
    );
    throwIfMobileJapaneseLearningAborted(signal);
    if (!asset) throw new Error("The page image is not available offline yet.");
    const identity = `${uri}#${headersIdentity(page.headers)}`;
    if (asset.kind === "file") {
      return { identity, tiles: [{ fileUri: asset.uri, offsetX: 0, offsetY: 0 }] };
    }
    let offsetY = 0;
    const tiles = asset.segments.map((segment) => {
      const tile = { fileUri: segment.uri, offsetX: 0, offsetY };
      offsetY += segment.height;
      return tile;
    });
    return { identity: `${identity}#${asset.generation}`, tiles };
  }
  throw new Error("Unsupported page image location.");
}

export function mobileOnDeviceOcrLinesFromNative(
  result: Pick<NemuRecognizeImageResult, "lines">,
  offsetX = 0,
  offsetY = 0,
): MobileOnDeviceOcrLine[] {
  const shift = (x1: number, y1: number, x2: number, y2: number) => ({
    x1: x1 + offsetX,
    y1: y1 + offsetY,
    x2: x2 + offsetX,
    y2: y2 + offsetY,
  });
  return result.lines.map((line) => ({
    text: line.text,
    confidence: Number.isFinite(line.confidence) ? line.confidence : 0,
    box: shift(line.box.x1, line.box.y1, line.box.x2, line.box.y2),
    direction: line.direction ?? null,
    characterBoxes: line.characterBoxes?.map((box) =>
      box ? shift(box[0], box[1], box[2], box[3]) : null,
    ),
  }));
}

/**
 * Second pass: Vision reads small manga dialogue far better on a padded,
 * upscaled crop of each bubble than on the whole ~900 px page (on 地縛少年
 * 花子くん ch.1: 「雄かに俺は男だよ」→「確かに俺は男だよ」, 「願いを味える」→
 * 「願いを叶える」). Only Japanese blocks are re-read; boxes and reading
 * order stay those of the first pass. A failed second pass keeps the first.
 */
export async function refineMobileOnDeviceOcrDetections(
  module: NemuJapaneseLearningNativeModule,
  tile: MobileOnDeviceOcrImageTile,
  detections: MobileOcrDetection[],
  options: { width: number; height: number; signal: AbortSignal },
): Promise<{ detections: MobileOcrDetection[]; recognizeMs: number }> {
  const targets = detections
    .map((detection, index) => ({ detection, index }))
    // A block Vision already read with full confidence gains nothing from a
    // second read; skipping it keeps the pass short on busy pages.
    .filter(({ detection }) => detection.label === "ja" && detection.conf < 0.95)
    .slice(0, 64);
  if (!module.recognizeRegions || targets.length === 0) {
    return { detections, recognizeMs: 0 };
  }
  const requestId = createMobileJapaneseLearningEngineRequestId("ocr-regions");
  const onAbort = () => {
    void module.cancelRecognition(requestId).catch(() => undefined);
  };
  options.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const result = await awaitMobileJapaneseLearningAbortable(
      module.recognizeRegions(
        tile.fileUri,
        targets.map(({ detection }) => [
          detection.x1 - tile.offsetX,
          detection.y1 - tile.offsetY,
          detection.x2 - tile.offsetX,
          detection.y2 - tile.offsetY,
        ]),
        { requestId, languages: ["ja-JP", "en-US"], usesLanguageCorrection: true, includeCharacterBoxes: true },
      ),
      options.signal,
    );
    const next = detections.slice();
    targets.forEach(({ detection, index }, position) => {
      const region = result.regions[position];
      if (!region) return;
      const lines = mobileOnDeviceOcrLinesFromNative(
        { lines: region.lines },
        tile.offsetX,
        tile.offsetY,
      );
      next[index] = refineMobileOcrDetectionText(detection, options, lines);
    });
    return { detections: next, recognizeMs: result.recognizeMs };
  } catch (error) {
    throwIfMobileJapaneseLearningAborted(options.signal);
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "on-device",
      ok: false,
      durationMs: 0,
      detail: `region pass skipped: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { detections, recognizeMs: 0 };
  } finally {
    options.signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Set when Core ML itself failed (models unreadable, prediction errors):
 * later pages go straight to Vision for the rest of the session.
 */
let mangaOcrDisabledReason: string | null = null;
const MANGA_OCR_FATAL_CODES = new Set([
  "E_OCR_MODELS_MISSING",
  "E_OCR_MODEL_LOAD",
  "E_OCR_MODEL_OUTPUT",
  "E_OCR_DETECTOR_UNAVAILABLE",
]);

export function resetMobileOnDeviceOcrPipelineForTesting(): void {
  mangaOcrDisabledReason = null;
}

/** manga-ocr when the binary can run it, else Vision with the reason. */
export function resolveMobileOnDeviceOcrPipeline(
  module: Pick<NemuJapaneseLearningNativeModule, "recognizePage"> | null,
  capabilities: NemuJapaneseLearningCapabilities | null,
  requested?: MobileOnDeviceOcrPipeline,
): { pipeline: MobileOnDeviceOcrPipeline; reason?: string } {
  if (requested === "vision") return { pipeline: "vision", reason: "requested" };
  const pipeline = capabilities?.ocr.pipeline;
  if (!pipeline || !module?.recognizePage) {
    return { pipeline: "vision", reason: "binary has no manga-ocr pipeline" };
  }
  if (!pipeline.mangaOcr) return { pipeline: "vision", reason: "manga-ocr models not bundled" };
  if (pipeline.detector === "vision-layout" && !capabilities?.ocr.available) {
    return { pipeline: "vision", reason: "Vision detector unavailable" };
  }
  if (mangaOcrDisabledReason) return { pipeline: "vision", reason: mangaOcrDisabledReason };
  return { pipeline: "manga-ocr" };
}

const LABEL_CLASS: Record<MobileOcrDetection["label"], number> = { eng: 0, ja: 1, unknown: 2 };

/** A native manga-ocr block → the cloud detection contract (page pixels). */
export function mobileOcrDetectionFromPageBlock(
  block: NemuOcrPageBlock,
  tile: Pick<MobileOnDeviceOcrImageTile, "offsetX" | "offsetY">,
  order: number,
): MobileOcrDetection {
  const label =
    block.source === "detector" ? block.label : classifyMobileOcrScript(block.text.normalize("NFKC"));
  return {
    x1: Math.floor(block.x1 + tile.offsetX),
    y1: Math.floor(block.y1 + tile.offsetY),
    x2: Math.ceil(block.x2 + tile.offsetX),
    y2: Math.ceil(block.y2 + tile.offsetY),
    conf: Math.round(Math.max(0, Math.min(1, block.conf)) * 1000) / 1000,
    cls: LABEL_CLASS[label],
    label,
    order,
    text: block.text,
  };
}

function keepMangaOcrDetection(detection: MobileOcrDetection): boolean {
  return Boolean(detection.text.trim()) && !isMobileOcrWatermarkText(detection.text);
}

/** Drops empty and watermark blocks and renumbers the reading order. */
function finalizeMangaOcrDetections(detections: MobileOcrDetection[]): MobileOcrDetection[] {
  return detections
    .filter(keepMangaOcrDetection)
    .map((detection, order) => ({ ...detection, order }));
}

/** A native block's recognition confidence, when the binary reports one. */
function mangaOcrRecognitionConfidence(block: NemuOcrPageBlock): number | null {
  return typeof block.recConf === "number" && Number.isFinite(block.recConf)
    ? Math.max(0, Math.min(1, block.recConf))
    : null;
}

type MangaOcrPageRun = {
  detections: MobileOcrDetection[];
  recognitionConfidences: (number | null)[];
  width: number;
  height: number;
  recognizeMs: number;
  lineCount: number;
  engine: string;
  engineRevision: string;
  osVersion: string;
  detector: string;
  detail: string;
};

async function runMangaOcrPipeline(
  module: NemuJapaneseLearningNativeModule,
  capabilities: NemuJapaneseLearningCapabilities,
  image: MobileOnDeviceOcrImage,
  signal: AbortSignal,
  onDetections?: (detections: MobileOcrDetection[]) => void,
): Promise<MangaOcrPageRun> {
  const recognizePage = module.recognizePage!.bind(module);
  const pipeline = capabilities.ocr.pipeline!;
  const detections: MobileOcrDetection[] = [];
  const confidences: (number | null)[] = [];
  let width = 0;
  let height = 0;
  let recognizeMs = 0;
  let lineCount = 0;
  let engineRevision = pipeline.engineRevision;
  let osVersion = capabilities.osVersion;
  const timings: string[] = [];
  for (const tile of image.tiles) {
    throwIfMobileJapaneseLearningAborted(signal);
    let regions: NemuOcrRegionInput[] | undefined;
    if (pipeline.detector === "vision-layout") {
      const requestId = createMobileJapaneseLearningEngineRequestId("ocr-detect");
      const onAbort = () => {
        void module.cancelRecognition(requestId).catch(() => undefined);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        const vision = await awaitMobileJapaneseLearningAbortable(
          module.recognizeImage(tile.fileUri, {
            requestId,
            languages: ["ja-JP", "en-US"],
            usesLanguageCorrection: true,
            includeCharacterBoxes: true,
          }),
          signal,
        );
        const lines = mobileOnDeviceOcrLinesFromNative(vision);
        lineCount += lines.length;
        recognizeMs += vision.recognizeMs;
        width = Math.max(width, tile.offsetX + vision.width);
        height = Math.max(height, tile.offsetY + vision.height);
        regions = detectMobileOcrLayoutRegions({
          width: vision.width,
          height: vision.height,
          lines,
        }).map((block) => ({
          box: [block.box.x1, block.box.y1, block.box.x2, block.box.y2],
          label: block.label,
          conf: block.confidence,
          text: block.text,
        }));
        timings.push(`vision=${Math.round(vision.recognizeMs)}ms`);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      if (regions.length === 0) continue;
    }
    const requestId = createMobileJapaneseLearningEngineRequestId("ocr-page");
    const base = detections.length;
    const partial: MobileOcrDetection[] = [];
    const subscription = onDetections
      ? module.addListener("onOcrBlock", (event) => {
          if (event.requestId !== requestId) return;
          partial[event.index] = mobileOcrDetectionFromPageBlock(event.block, tile, base + event.index);
          onDetections(finalizeMangaOcrDetections([...detections, ...partial.filter(Boolean)]));
        })
      : null;
    const onAbort = () => {
      void module.cancelRecognition(requestId).catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await awaitMobileJapaneseLearningAbortable(
        recognizePage(tile.fileUri, {
          requestId,
          ...(regions ? { regions } : {}),
          emitBlocks: Boolean(onDetections),
        }),
        signal,
      );
      width = Math.max(width, tile.offsetX + result.width);
      height = Math.max(height, tile.offsetY + result.height);
      recognizeMs += result.recognizeMs;
      engineRevision = result.engineRevision;
      osVersion = result.osVersion;
      for (const block of result.blocks) {
        detections.push(mobileOcrDetectionFromPageBlock(block, tile, base + block.order));
        confidences.push(mangaOcrRecognitionConfidence(block));
      }
      timings.push(
        `order=${Math.round(result.orderMs)}ms ocr=${Math.round(result.recognizeMs)}ms load=${Math.round(result.modelLoadMs)}ms units=${result.computeUnits}`,
      );
    } finally {
      signal.removeEventListener("abort", onAbort);
      subscription?.remove();
    }
  }
  return {
    detections: finalizeMangaOcrDetections(detections),
    recognitionConfidences: confidences.filter((_, index) => keepMangaOcrDetection(detections[index]!)),
    width,
    height,
    recognizeMs,
    lineCount,
    engine: pipeline.engine,
    engineRevision,
    osVersion,
    detector: pipeline.detector,
    detail: timings.join(" "),
  };
}

export async function runMobileOnDeviceOcr(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  options: MobileOnDeviceOcrOptions,
): Promise<MobileOnDeviceOcrResult> {
  const module =
    options.module !== undefined
      ? options.module
      : getMobileJapaneseLearningNativeModule();
  const capabilities =
    options.module !== undefined
      ? options.module?.getCapabilities() ?? null
      : getMobileJapaneseLearningCapabilities();
  if (!module || !capabilities?.ocr.available) {
    throw new Error("On-device text recognition is not available.");
  }
  const started = mobileJapaneseLearningNowMs();
  const image = await (options.resolveImage ?? defaultResolveImage)(
    page,
    options.signal,
  );
  const choice = resolveMobileOnDeviceOcrPipeline(module, capabilities, options.pipeline);
  let fallbackReason = choice.pipeline === "vision" ? choice.reason : undefined;
  const remember = (result: MobileOnDeviceOcrResult, cacheKey: string) => {
    resultCache.set(cacheKey, result);
    while (resultCache.size > RESULT_CACHE_LIMIT) {
      const oldest = resultCache.keys().next().value;
      if (typeof oldest !== "string") break;
      resultCache.delete(oldest);
    }
  };
  const cached = (cacheKey: string): MobileOnDeviceOcrResult | null => {
    const hit = resultCache.get(cacheKey);
    if (!hit) return null;
    resultCache.delete(cacheKey);
    resultCache.set(cacheKey, hit);
    return { ...hit, engine: { ...hit.engine, cached: true } };
  };
  try {
    const mangaOcr = capabilities.ocr.pipeline;
    if (choice.pipeline === "manga-ocr" && mangaOcr) {
      const cacheKey = makeMobileOnDeviceOcrCacheKey(
        {
          engine: mangaOcr.engine,
          engineRevision: mangaOcr.engineRevision,
          osVersion: capabilities.osVersion,
        },
        image.identity,
      );
      const hit = cached(cacheKey);
      if (hit) {
        options.onDetections?.(hit.detections);
        return hit;
      }
      try {
        const run = await runMangaOcrPipeline(
          module,
          capabilities,
          image,
          options.signal,
          options.onDetections,
        );
        const elapsedMs = mobileJapaneseLearningNowMs() - started;
        const result: MobileOnDeviceOcrResult = {
          detections: run.detections,
          recognitionConfidences: run.recognitionConfidences,
          ...(run.width > 0 && run.height > 0
            ? { imageSize: { width: run.width, height: run.height } }
            : {}),
          engine: {
            kind: "on-device",
            engine: run.engine,
            engineRevision: run.engineRevision,
            osVersion: run.osVersion,
            elapsedMs: Math.round(elapsedMs),
            recognizeMs: Math.round(run.recognizeMs),
            lineCount: run.lineCount,
            cached: false,
            pipeline: "manga-ocr",
            detector: run.detector,
          },
        };
        remember(result, cacheKey);
        recordMobileJapaneseLearningEngineRun({
          stage: "ocr",
          engine: "on-device",
          ok: true,
          durationMs: elapsedMs,
          detail: `${run.engine} detector=${run.detector} tiles=${image.tiles.length} blocks=${run.detections.length} ${run.detail}`,
        });
        return result;
      } catch (error) {
        throwIfMobileJapaneseLearningAborted(options.signal);
        const code = (error as { code?: unknown } | null)?.code;
        const message = error instanceof Error ? error.message : String(error);
        fallbackReason = `manga-ocr failed: ${typeof code === "string" ? `${code} ` : ""}${message}`;
        if (typeof code === "string" && MANGA_OCR_FATAL_CODES.has(code)) {
          mangaOcrDisabledReason = fallbackReason;
        }
        recordMobileJapaneseLearningEngineRun({
          stage: "ocr",
          engine: "on-device",
          ok: false,
          durationMs: mobileJapaneseLearningNowMs() - started,
          detail: `${fallbackReason}; falling back to Vision`,
        });
      }
    }

    const cacheKey = makeMobileOnDeviceOcrCacheKey(
      {
        engine: capabilities.ocr.engine,
        engineRevision: capabilities.ocr.engineRevision,
        osVersion: capabilities.osVersion,
      },
      image.identity,
    );
    const hit = cached(cacheKey);
    if (hit) return hit;

    const lines: MobileOnDeviceOcrLine[] = [];
    let width = 0;
    let height = 0;
    let recognizeMs = 0;
    let last: NemuRecognizeImageResult | null = null;
    for (const tile of image.tiles) {
      throwIfMobileJapaneseLearningAborted(options.signal);
      const requestId = createMobileJapaneseLearningEngineRequestId("ocr");
      const onAbort = () => {
        void module.cancelRecognition(requestId).catch(() => undefined);
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const result = await awaitMobileJapaneseLearningAbortable(
          module.recognizeImage(tile.fileUri, {
            requestId,
            languages: ["ja-JP", "en-US"],
            usesLanguageCorrection: true,
            includeCharacterBoxes: true,
          }),
          options.signal,
        );
        last = result;
        recognizeMs += result.recognizeMs;
        width = Math.max(width, tile.offsetX + result.width);
        height = Math.max(height, tile.offsetY + result.height);
        lines.push(...mobileOnDeviceOcrLinesFromNative(result, tile.offsetX, tile.offsetY));
      } finally {
        options.signal.removeEventListener("abort", onAbort);
      }
    }
    throwIfMobileJapaneseLearningAborted(options.signal);
    let detections = layoutMobileOnDeviceOcrPage({ width, height, lines });
    let refineMs = 0;
    const onlyTile = image.tiles.length === 1 ? image.tiles[0] : undefined;
    if (onlyTile && module.recognizeRegions) {
      const refined = await refineMobileOnDeviceOcrDetections(module, onlyTile, detections, {
        width,
        height,
        signal: options.signal,
      });
      detections = refined.detections;
      refineMs = refined.recognizeMs;
    }
    const elapsedMs = mobileJapaneseLearningNowMs() - started;
    const result: MobileOnDeviceOcrResult = {
      detections,
      ...(width > 0 && height > 0 ? { imageSize: { width, height } } : {}),
      engine: {
        kind: "on-device",
        engine: last?.engine ?? capabilities.ocr.engine,
        engineRevision: last?.engineRevision ?? capabilities.ocr.engineRevision,
        osVersion: last?.osVersion ?? capabilities.osVersion,
        elapsedMs: Math.round(elapsedMs),
        recognizeMs: Math.round(recognizeMs + refineMs),
        lineCount: lines.length,
        cached: false,
        pipeline: "vision",
        ...(fallbackReason ? { fallbackReason } : {}),
      },
    };
    remember(result, cacheKey);
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "on-device",
      ok: true,
      durationMs: elapsedMs,
      detail: `${result.engine.engine} tiles=${image.tiles.length} lines=${lines.length} blocks=${detections.length} vision=${result.engine.recognizeMs}ms (regions ${Math.round(refineMs)}ms)${fallbackReason ? ` fallback: ${fallbackReason}` : ""}`,
    });
    return result;
  } catch (error) {
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "on-device",
      ok: false,
      durationMs: mobileJapaneseLearningNowMs() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    image.release?.();
  }
}
