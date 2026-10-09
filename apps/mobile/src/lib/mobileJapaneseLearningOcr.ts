import {
  getMobileJapaneseLearningQaScenario,
  runMobileJapaneseLearningQaOcr,
} from "./mobileJapaneseLearningQa";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";
import { decodeBase64 } from "./mobileBase64";
import { createMobileJapaneseLearningAbortScope } from "./mobileJapaneseLearningLifecycle";
import {
  assertMobileJapaneseLearningBase64Payload,
  assertMobileJapaneseLearningByteLength,
  assertMobileJapaneseLearningCount,
  assertMobileJapaneseLearningStringLength,
  assertMobileJapaneseLearningUtf8ByteLength,
  awaitMobileJapaneseLearningAbortable,
  readMobileJapaneseLearningBoundedResponseText,
  throwIfMobileJapaneseLearningAborted,
} from "./mobileJapaneseLearningSafety";
import { sanitizeMobileErrorDiagnostic } from "./mobileSourceErrors";
import type { MobileStrings } from "./mobileI18n";
import {
  getMobileJapaneseLearningCapabilities,
  getMobileJapaneseLearningEnginePreference,
  isMobileJapaneseLearningOcrAssistActive,
  mobileJapaneseLearningNowMs,
  recordMobileJapaneseLearningEngineRun,
  resolveMobileJapaneseLearningOcrEngine,
  type MobileJapaneseLearningEnginePreference,
} from "./mobileJapaneseLearningEngine";
import {
  runMobileOnDeviceOcr,
  type MobileOnDeviceOcrEngineInfo,
  type MobileOnDeviceOcrResult,
} from "./mobileJapaneseLearningOnDeviceOcr";
import {
  applyMobileOcrAssist,
  mobileOcrAssistSpacesAgree,
  selectMobileOcrAssistTargets,
} from "./mobileJapaneseLearningOcrAssist";
import { MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED } from "./mobileJapaneseLearningAuth";

export type MobileOcrDetection = {
  /** Source page and coordinate space when recognizing a visible spread. */
  pageId?: string;
  imageSize?: { width: number; height: number };
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf: number;
  cls: number;
  label: "eng" | "ja" | "unknown";
  order: number;
  text: string;
};

export type MobileJapaneseLearningOcrResult = {
  source: "source-text" | "ocr";
  detections: MobileOcrDetection[];
  text: string;
  /**
   * Pixel size of the image the detection boxes are measured in, when the
   * engine reports it (on-device recognition may read a rescaled copy of the
   * page). Absent: boxes are in the page image's natural pixels.
   */
  imageSize?: { width: number; height: number };
  /** Which engine produced `detections` (absent for source text). */
  engine?: MobileOnDeviceOcrEngineInfo | { kind: "cloud"; elapsedMs: number };
  /** On-device runs with the online OCR assist: bubbles re-read by the cloud. */
  assistedBlocks?: number;
};

export type MobileJapaneseLearningOcrOptions = {
  fetchImpl?: typeof fetch;
  ocrApiBase?: string;
  readFileBytes?: (uri: string) => Promise<Uint8Array>;
  signal?: AbortSignal;
  /** Overrides the plugin's recognition-engine setting for this run. */
  engine?: MobileJapaneseLearningEnginePreference;
  /**
   * On-device manga-ocr only: the result so far, each time another bubble
   * is read (reading order), before the promise settles.
   */
  onPartialResult?: (result: MobileJapaneseLearningOcrResult) => void;
};

const DEFAULT_OCR_API_BASE = "https://ocr.nemu.pm";
export const MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS =
  4 * Math.ceil(MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES / 3);
export const MOBILE_JAPANESE_LEARNING_OCR_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS = 1_024;
export const MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTION_TEXT_CHARACTERS = 8_192;
export const MOBILE_JAPANESE_LEARNING_OCR_MAX_TEXT_CHARACTERS = 256 * 1024;
const MOBILE_JAPANESE_LEARNING_OCR_MAX_URI_CHARACTERS = 16 * 1024;
const MOBILE_JAPANESE_LEARNING_OCR_MAX_STREAM_EVENTS = 2_048;
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function assertMobileJapaneseLearningOcrImageByteLength(
  byteLength: number,
): void {
  assertMobileJapaneseLearningByteLength(
    byteLength,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES,
    "OCR image",
  );
}

export function assertMobileJapaneseLearningOcrEncodedImageLength(
  characterLength: number,
): void {
  assertMobileJapaneseLearningCount(
    characterLength,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS,
    "OCR encoded image",
  );
}

function mobileEnvValue(key: string): string | undefined {
  const processLike = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = processLike.process?.env?.[key]?.trim();
  return value || undefined;
}

export function getMobileOcrApiBase(envValue?: string): string {
  return (
    envValue?.trim().replace(/\/+$/, "") ||
    mobileEnvValue("EXPO_PUBLIC_OCR_API_BASE")?.replace(/\/+$/, "") ||
    mobileEnvValue("VITE_OCR_API_BASE")?.replace(/\/+$/, "") ||
    DEFAULT_OCR_API_BASE
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triple = (first << 16) | (second << 8) | third;

    output += BASE64_CHARS[(triple >> 18) & 63];
    output += BASE64_CHARS[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_CHARS[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_CHARS[triple & 63] : "=";
  }
  return output;
}

async function defaultReadFileBytes(uri: string): Promise<Uint8Array> {
  const { File } = await import("expo-file-system");
  const file = new File(uri);
  const size = Number(file.size);
  if (Number.isFinite(size)) {
    assertMobileJapaneseLearningOcrImageByteLength(size);
  }
  const encoded = await file.base64();
  assertMobileJapaneseLearningOcrEncodedImageLength(encoded.length);
  assertMobileJapaneseLearningBase64Payload(
    encoded,
    {
      maxEncodedCharacters:
        MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS,
      maxDecodedBytes: MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES,
    },
    "OCR local image",
  );
  return decodeBase64(encoded);
}

function base64FromDataUri(uri: string): string | null {
  const commaIndex = uri.indexOf(",");
  if (commaIndex < 0) return null;
  const metadata = uri.slice(0, commaIndex).toLowerCase();
  if (!metadata.includes(";base64")) return null;
  assertMobileJapaneseLearningOcrEncodedImageLength(
    uri.length - commaIndex - 1,
  );
  return uri.slice(commaIndex + 1);
}

async function imageUriToBase64(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  options: Required<
    Pick<MobileJapaneseLearningOcrOptions, "fetchImpl" | "readFileBytes">
  > & { signal: AbortSignal },
): Promise<string> {
  throwIfMobileJapaneseLearningAborted(options.signal);
  const uri = page.imageUri;
  if (!uri) throw new Error("Current page has no image.");
  assertMobileJapaneseLearningStringLength(
    uri,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS +
      MOBILE_JAPANESE_LEARNING_OCR_MAX_URI_CHARACTERS,
    "OCR image URI",
  );

  if (uri.startsWith("data:")) {
    const base64 = base64FromDataUri(uri);
    if (!base64)
      throw new Error("Current page image data is not base64 encoded.");
    assertMobileJapaneseLearningBase64Payload(
      base64,
      {
        maxEncodedCharacters:
          MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS,
        maxDecodedBytes: MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES,
      },
      "OCR data URI image",
    );
    return base64;
  }

  if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
    assertMobileJapaneseLearningStringLength(
      uri,
      MOBILE_JAPANESE_LEARNING_OCR_MAX_URI_CHARACTERS,
      "OCR local image URI",
    );
    const bytes = await awaitMobileJapaneseLearningAbortable(
      options.readFileBytes(uri),
      options.signal,
    );
    throwIfMobileJapaneseLearningAborted(options.signal);
    assertMobileJapaneseLearningOcrImageByteLength(bytes.byteLength);
    return bytesToBase64(bytes);
  }

  if (options.fetchImpl === fetch) {
    const response = await mobileNativeFetch(uri, {
      headers: page.headers,
      responseMode: "bytes",
      maxResponseBytes: MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES,
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Page image fetch failed: ${response.status}`);
    }
    return bytesToBase64(response.bytes);
  }

  const response = await awaitMobileJapaneseLearningAbortable(
    options.fetchImpl(uri, {
      headers: page.headers,
      signal: options.signal,
    }),
    options.signal,
  );
  if (!response.ok) {
    throw new Error(
      `Page image fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) {
    assertMobileJapaneseLearningOcrImageByteLength(declaredLength);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  throwIfMobileJapaneseLearningAborted(options.signal);
  assertMobileJapaneseLearningOcrImageByteLength(bytes.byteLength);
  return bytesToBase64(bytes);
}

function isMobileOcrDetection(value: unknown): value is MobileOcrDetection {
  const detection = value as Partial<MobileOcrDetection>;
  return (
    Number.isFinite(detection.x1) &&
    Number.isFinite(detection.y1) &&
    Number.isFinite(detection.x2) &&
    Number.isFinite(detection.y2) &&
    Number.isFinite(detection.conf) &&
    Number.isFinite(detection.cls) &&
    Number.isFinite(detection.order) &&
    typeof detection.text === "string" &&
    (detection.label === "eng" ||
      detection.label === "ja" ||
      detection.label === "unknown")
  );
}

function assertMobileOcrDetections(
  detections: MobileOcrDetection[],
): MobileOcrDetection[] {
  assertMobileJapaneseLearningCount(
    detections.length,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS,
    "OCR detections",
  );
  let textCharacters = 0;
  for (const detection of detections) {
    assertMobileJapaneseLearningStringLength(
      detection.text,
      MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTION_TEXT_CHARACTERS,
      "OCR detection text",
    );
    textCharacters += detection.text.length;
    assertMobileJapaneseLearningCount(
      textCharacters,
      MOBILE_JAPANESE_LEARNING_OCR_MAX_TEXT_CHARACTERS,
      "OCR aggregate text",
    );
  }
  return detections;
}

export function parseMobileOcrResponse(body: string): MobileOcrDetection[] {
  assertMobileJapaneseLearningUtf8ByteLength(
    body,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_RESPONSE_BYTES,
    "OCR response",
  );
  const trimmed = body.trim();
  if (!trimmed) throw new Error("OCR response was empty.");

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as { detections?: unknown };
    const detections = Array.isArray(parsed.detections)
      ? parsed.detections
      : null;
    if (detections?.every(isMobileOcrDetection)) {
      return assertMobileOcrDetections(detections);
    }
    throw new Error("OCR response did not include detections.");
  }

  let finalDetections: MobileOcrDetection[] | null = null;
  const blocks = trimmed.split(/\n\n+/);
  assertMobileJapaneseLearningCount(
    blocks.length,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_STREAM_EVENTS,
    "OCR stream events",
  );
  for (const block of blocks) {
    const payload = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (!payload) continue;

    const event = JSON.parse(payload) as {
      type?: string;
      message?: string;
      detections?: unknown;
    };
    if (event.type === "error") {
      throw new Error(event.message || "OCR failed.");
    }
    if (event.type === "result") {
      const detections = Array.isArray(event.detections)
        ? event.detections
        : null;
      if (!detections?.every(isMobileOcrDetection)) {
        throw new Error("OCR result did not include detections.");
      }
      finalDetections = assertMobileOcrDetections(detections);
    }
  }

  if (!finalDetections)
    throw new Error("OCR stream ended without a result event.");
  return finalDetections;
}

export function textFromMobileOcrDetections(
  detections: MobileOcrDetection[],
): string {
  assertMobileOcrDetections(detections);
  const text = detections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((detection) => detection.text.trim())
    .filter(Boolean)
    .join("\n");
  assertMobileJapaneseLearningStringLength(
    text,
    MOBILE_JAPANESE_LEARNING_OCR_MAX_TEXT_CHARACTERS,
    "OCR transcript",
  );
  return text;
}

export type MobileJapaneseLearningOcrErrorKind = "unavailable" | "failed" | "signIn";

export type MobileJapaneseLearningOcrErrorCopy = {
  kind: MobileJapaneseLearningOcrErrorKind;
  title: string;
  description: string;
  diagnostic: string | null;
};

/**
 * Service-side or transport failures (5xx statuses like Cloudflare's 521,
 * timeouts, offline fetches) mean the OCR service itself is unreachable —
 * everything else is a generic recognition failure.
 */
const MOBILE_JAPANESE_LEARNING_OCR_UNAVAILABLE_PATTERN =
  /\b5\d{2}\b|timed?[\s-]*out|timeout|network|offline|unreachable/i;

/**
 * The error-copy contract from `mobileSourceErrors.ts`, applied to the
 * Japanese-learning OCR surfaces: localized copy is the headline and the raw
 * English exception text is a bounded diagnostic shown only inside the
 * collapsed "technical details" disclosure.
 */
export function describeJapaneseLearningOcrError(
  error: unknown,
  strings: Pick<MobileStrings, "reader">,
): MobileJapaneseLearningOcrErrorCopy {
  let message = "";
  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error != null) {
    try {
      message = String(error);
    } catch {
      message = "";
    }
  }
  // Cloud recognition signed out: a sign-in prompt, not a failure. The
  // reader stores the localized sign-in line as the detail.
  if (
    message === MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED ||
    message === strings.reader.pluginJapaneseLearningSignInRequired
  ) {
    return {
      kind: "signIn",
      title: strings.reader.pluginJapaneseLearningSignInRequiredTitle,
      description: strings.reader.pluginJapaneseLearningSignInRequiredDescription,
      diagnostic: null,
    };
  }
  const kind: MobileJapaneseLearningOcrErrorKind =
    message && MOBILE_JAPANESE_LEARNING_OCR_UNAVAILABLE_PATTERN.test(message)
      ? "unavailable"
      : "failed";
  return {
    kind,
    title:
      kind === "unavailable"
        ? strings.reader.pluginJapaneseLearningOcrUnavailableTitle
        : strings.reader.pluginJapaneseLearningOcrFailedTitle,
    description:
      kind === "unavailable"
        ? strings.reader.pluginJapaneseLearningOcrUnavailableDescription
        : strings.reader.pluginJapaneseLearningOcrFailedDescription,
    // Nullish inputs stringify to "undefined"/"null", which is noise, not a
    // diagnostic — hide the disclosure entirely for them.
    diagnostic: message ? sanitizeMobileErrorDiagnostic(error) : null,
  };
}

/**
 * QA fixtures only: the page's real text boxes (on-device recognition, when
 * available), so fixture sentences sit on actual bubbles. Empty on failure.
 */
async function detectMobileJapaneseLearningQaAnchors(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  signal: AbortSignal,
): Promise<{ detections: MobileOcrDetection[]; imageSize?: { width: number; height: number } }> {
  if (!page.imageUri || !getMobileJapaneseLearningCapabilities()?.ocr.available) return { detections: [] };
  try {
    const result = await runMobileOnDeviceOcr(page, { signal });
    return {
      detections: [...result.detections].sort((a, b) => a.order - b.order),
      imageSize: result.imageSize,
    };
  } catch {
    return { detections: [] };
  }
}

export async function runMobileJapaneseLearningOcr(
  page: Pick<MobileReaderPage, "imageUri" | "headers" | "text">,
  options: MobileJapaneseLearningOcrOptions = {},
): Promise<MobileJapaneseLearningOcrResult> {
  const qaScenario = getMobileJapaneseLearningQaScenario("ocr");
  if (qaScenario) {
    const scope = createMobileJapaneseLearningAbortScope(options.signal);
    try {
      const anchors =
        qaScenario === "success"
          ? await detectMobileJapaneseLearningQaAnchors(page, scope.signal)
          : { detections: [] };
      const fixture = await runMobileJapaneseLearningQaOcr(qaScenario, scope.signal, anchors.detections);
      return anchors.imageSize && anchors.detections.length > 0
        ? { ...fixture, imageSize: anchors.imageSize }
        : fixture;
    } finally {
      scope.dispose();
    }
  }
  const sourceText = page.text?.trim();
  if (sourceText) {
    assertMobileJapaneseLearningStringLength(
      sourceText,
      MOBILE_JAPANESE_LEARNING_OCR_MAX_TEXT_CHARACTERS,
      "OCR source text",
    );
    return {
      source: "source-text",
      detections: [],
      text: sourceText,
    };
  }

  const engine = resolveMobileJapaneseLearningOcrEngine(
    options.engine ?? getMobileJapaneseLearningEnginePreference(),
    getMobileJapaneseLearningCapabilities(),
  );
  if (engine === "on-device") {
    const scope = createMobileJapaneseLearningAbortScope(options.signal);
    try {
      const onPartialResult = options.onPartialResult;
      const result = await runMobileOnDeviceOcr(page, {
        signal: scope.signal,
        ...(onPartialResult
          ? {
              onDetections: (detections: MobileOcrDetection[]) => {
                if (scope.signal.aborted) return;
                onPartialResult({
                  source: "ocr",
                  detections,
                  text: textFromMobileOcrDetections(detections),
                });
              },
            }
          : {}),
      });
      const assisted = isMobileJapaneseLearningOcrAssistActive(
        options.engine ?? getMobileJapaneseLearningEnginePreference(),
      )
        ? await assistMobileOnDeviceOcr(page, result, options, scope.signal)
        : null;
      const detections = assisted?.detections ?? result.detections;
      return {
        source: "ocr",
        detections,
        text: textFromMobileOcrDetections(detections),
        ...(result.imageSize ? { imageSize: result.imageSize } : {}),
        engine: result.engine,
        ...(assisted ? { assistedBlocks: assisted.replaced } : {}),
      };
    } finally {
      scope.dispose();
    }
  }

  const abortScope = createMobileJapaneseLearningAbortScope(options.signal);
  const cloudStarted = mobileJapaneseLearningNowMs();
  try {
    const detections = await fetchMobileCloudOcrDetections(page, options, abortScope.signal);
    const elapsedMs = mobileJapaneseLearningNowMs() - cloudStarted;
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "cloud",
      ok: true,
      durationMs: elapsedMs,
      detail: `blocks=${detections.length}`,
    });
    return {
      source: "ocr",
      detections,
      text: textFromMobileOcrDetections(detections),
      engine: { kind: "cloud", elapsedMs: Math.round(elapsedMs) },
    };
  } finally {
    abortScope.dispose();
  }
}

/** Uploads the page to the cloud OCR service (`/ocr`) and returns its detections. */
async function fetchMobileCloudOcrDetections(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  options: MobileJapaneseLearningOcrOptions,
  signal: AbortSignal,
): Promise<MobileOcrDetection[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const imageBase64 = await imageUriToBase64(page, {
    fetchImpl,
    readFileBytes: options.readFileBytes ?? defaultReadFileBytes,
    signal,
  });
  throwIfMobileJapaneseLearningAborted(signal);
  const requestId = `mobile-ocr-${Date.now()}`;
  const response = await awaitMobileJapaneseLearningAbortable(
    fetchImpl(`${getMobileOcrApiBase(options.ocrApiBase)}/ocr`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64, requestId }),
      signal,
    }),
    signal,
  );
  if (!response.ok) {
    throw new Error(`OCR /ocr failed: ${response.status} ${response.statusText}`);
  }
  return parseMobileOcrResponse(
    await readMobileJapaneseLearningBoundedResponseText(response, {
      maxBytes: MOBILE_JAPANESE_LEARNING_OCR_MAX_RESPONSE_BYTES,
      label: "OCR response",
      signal,
    }),
  );
}

const ASSIST_CACHE_LIMIT = 16;
/** The on-device text is already on screen; a slow service must not hold the run. */
const ASSIST_TIMEOUT_MS = 15_000;
const assistCache = new Map<string, { detections: MobileOcrDetection[]; replaced: number }>();

export function clearMobileOcrAssistCache(): void {
  assistCache.clear();
}

/**
 * Online OCR assist: low-confidence manga-ocr bubbles take the cloud's
 * reading. Returns null when nothing was sent; a failed request keeps the
 * on-device result (recorded in the engine log, never thrown) unless the
 * run was aborted.
 */
async function assistMobileOnDeviceOcr(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  result: MobileOnDeviceOcrResult,
  options: MobileJapaneseLearningOcrOptions,
  signal: AbortSignal,
): Promise<{ detections: MobileOcrDetection[]; replaced: number } | null> {
  if (result.engine.pipeline !== "manga-ocr") return null;
  const targets = selectMobileOcrAssistTargets(result.detections, result.recognitionConfidences);
  if (targets.length === 0) return null;
  const cacheKey = `${result.engine.engineRevision}|${page.imageUri ?? ""}|${targets.join(",")}`;
  const hit = assistCache.get(cacheKey);
  if (hit) return hit;
  const started = mobileJapaneseLearningNowMs();
  const request = new AbortController();
  const onAbort = () => request.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => request.abort(), ASSIST_TIMEOUT_MS);
  try {
    const cloud = await fetchMobileCloudOcrDetections(page, options, request.signal);
    const assisted = mobileOcrAssistSpacesAgree(result.detections, cloud, result.imageSize)
      ? applyMobileOcrAssist(result.detections, targets, cloud)
      : { detections: result.detections, replaced: 0 };
    assistCache.set(cacheKey, assisted);
    while (assistCache.size > ASSIST_CACHE_LIMIT) {
      const oldest = assistCache.keys().next().value;
      if (typeof oldest !== "string") break;
      assistCache.delete(oldest);
    }
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "cloud",
      ok: true,
      durationMs: mobileJapaneseLearningNowMs() - started,
      detail: `assist targets=${targets.length} replaced=${assisted.replaced} cloudBlocks=${cloud.length}`,
    });
    return assisted;
  } catch (error) {
    throwIfMobileJapaneseLearningAborted(signal);
    recordMobileJapaneseLearningEngineRun({
      stage: "ocr",
      engine: "cloud",
      ok: false,
      durationMs: mobileJapaneseLearningNowMs() - started,
      detail: `assist skipped: ${request.signal.aborted ? "timed out" : error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
