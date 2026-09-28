/**
 * On-device OCR path (Apple Vision via the NemuJapaneseLearning module).
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
  NemuJapaneseLearningNativeModule,
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
  layoutMobileOnDeviceOcrPage,
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
};

export type MobileOnDeviceOcrResult = {
  detections: MobileOcrDetection[];
  engine: MobileOnDeviceOcrEngineInfo;
};

export type MobileOnDeviceOcrOptions = {
  signal: AbortSignal;
  module?: NemuJapaneseLearningNativeModule | null;
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
  result: NemuRecognizeImageResult,
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
  try {
    const cacheKey = makeMobileOnDeviceOcrCacheKey(
      {
        engine: capabilities.ocr.engine,
        engineRevision: capabilities.ocr.engineRevision,
        osVersion: capabilities.osVersion,
      },
      image.identity,
    );
    const cached = resultCache.get(cacheKey);
    if (cached) {
      resultCache.delete(cacheKey);
      resultCache.set(cacheKey, cached);
      return { ...cached, engine: { ...cached.engine, cached: true } };
    }

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
    const detections = layoutMobileOnDeviceOcrPage({ width, height, lines });
    const elapsedMs = mobileJapaneseLearningNowMs() - started;
    const result: MobileOnDeviceOcrResult = {
      detections,
      engine: {
        kind: "on-device",
        engine: last?.engine ?? capabilities.ocr.engine,
        engineRevision: last?.engineRevision ?? capabilities.ocr.engineRevision,
        osVersion: last?.osVersion ?? capabilities.osVersion,
        elapsedMs: Math.round(elapsedMs),
        recognizeMs: Math.round(recognizeMs),
        lineCount: lines.length,
        cached: false,
      },
    };
    resultCache.set(cacheKey, result);
    while (resultCache.size > RESULT_CACHE_LIMIT) {
      const oldest = resultCache.keys().next().value;
      if (typeof oldest !== "string") break;
      resultCache.delete(oldest);
    }
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "on-device",
      ok: true,
      durationMs: elapsedMs,
      detail: `${result.engine.engine} tiles=${image.tiles.length} lines=${lines.length} blocks=${detections.length} vision=${result.engine.recognizeMs}ms`,
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
