import type { MobileSourcePriorityInput } from "./mobileSourceRuntimeScheduler";
import type {
  ChapterSummary,
  InstalledSource,
} from "@/data/schema";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
import {
  getProcessedMobileReaderPageUri,
  isProcessedMobileReaderPageStored,
  storeProcessedMobileReaderPage,
  type MobileProcessedReaderPageIdentity,
} from "@/lib/mobileImageCache";
import {
  assertMobileBase64ImageMetadataSafety,
  assertMobileImageMetadataSafety,
} from "@/lib/mobileImageMetadataSafety";
import {
  type AidokuChapter,
  type MobileAidokuExecutorSource,
  type MobileSourcePage,
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorRuntime,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  notifyMobileSourcePackageHydrated,
  type MobileSourcePackageHydrationHandler,
} from "./mobileSourcePackageLoader";
import {
  mapAidokuChapterList,
  mapAidokuChapterToSummary,
} from "./mobileSourceDetails";
import { mobileNativeFetch } from "./mobileNativeHttp";
import {
  defaultMobileSourceSettings,
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "./mobileSourceRuntime";
import { isMobileReaderPageImageCacheLimitExceeded } from "./mobileSourcePageSafety";

type MobileReaderPageBase = {
  id: string;
  index: number;
  headers?: Record<string, string>;
  text?: string;
  context?: Record<string, string>;
  imageProcessing?: "pending" | "ready" | "fallback";
  /** Pixel size reported by the server before download (Komga), for spread pairing. */
  sourceSize?: { width: number; height: number };
};

export type MobileReaderPage = MobileReaderPageBase &
  (
    | {
        imageUri: string;
        imageUriOwnership: MobileImageUriOwnership;
      }
    | {
        imageUri?: undefined;
        imageUriOwnership?: undefined;
      }
  );

export type MobileReaderPageWindowResult = {
  generation: number;
  pages: MobileReaderPage[];
  processedIndexes: number[];
};

export type MobileReaderPageProcessor = {
  processWindow(
    centerIndex: number,
    options?: {
      signal?: AbortSignal;
      onUpdate?: (result: MobileReaderPageWindowResult) => void;
    },
  ): Promise<MobileReaderPageWindowResult | null>;
  /**
   * Scroll reading: the pages wanted now, most urgent first (the pages on
   * screen, then where a fling lands, then ahead in the scroll direction,
   * then behind). Replaces the previous list: work for pages still listed
   * keeps running, work for dropped pages is aborted, and resolved pages are
   * not resolved again. `onUpdate` gets every page the moment it is ready.
   */
  processPages?(
    indexes: readonly number[],
    options?: { onUpdate?: (result: MobileReaderPageWindowResult) => void },
  ): void;
  /**
   * One page, resolved exactly as the window would (decorated request,
   * processed bytes), without moving the window or caching the result.
   * `null` when the processor is disposed or the signal aborts.
   */
  resolvePage?(
    index: number,
    options?: { signal?: AbortSignal; priority?: MobileSourcePriorityInput },
  ): Promise<MobileReaderPage | null>;
  cancel(): void;
  dispose(): void;
  cacheSize(): number;
  cacheByteSize?(): number;
};

/** The first-paint half of a refresh: pages without the chapter index. */
export type MobileReaderPagesFirstPaint = {
  runtime: MobileSourceExecutorRuntime;
  pages: MobileReaderPage[];
  pageProcessor?: MobileReaderPageProcessor;
  chapter: ChapterSummary;
  fetchedAt: number;
};

export type MobileReaderPagesRefresh =
  | {
      status: "ready";
      runtime: MobileSourceExecutorRuntime;
      pages: MobileReaderPage[];
      pageProcessor?: MobileReaderPageProcessor;
      chapters: ChapterSummary[];
      /**
       * Whether the chapter index came back. `"unavailable"` means the index
       * request failed and `chapters` is empty for that reason alone — callers
       * must not persist that emptiness into the page-list cache, or a single
       * failed index would serve an empty chapter list for the cache's life.
       */
      chapterIndexStatus: "ready" | "unavailable";
      chapter: ChapterSummary;
      fetchedAt: number;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

export type MobileReaderPagesOptions = {
  getSourceSettings?: (
    sourceKey: string,
    source: InstalledSource,
  ) => Promise<Record<string, unknown>>;
  executor?: Pick<
    MobileSourceExecutorOptions,
    "bridge" | "readBytes"
  >;
  sessionCache?: MobileSourceSessionCache;
  onSourcePackageHydrated?: MobileSourcePackageHydrationHandler;
  fetchImpl?: typeof fetch;
  processPageImages?: boolean;
  now?: () => number;
  pageProcessingWindowRadius?: number;
  pageProcessingCacheSize?: number;
  pageProcessingCacheMaxBytes?: number;
  /**
   * Where processed (descrambled) page bytes are kept. Defaults to the
   * reader's page disk cache on native: a page is processed once, then
   * shown from an app-local file. `null` keeps them as in-memory data URIs.
   */
  processedPageStore?: MobileReaderProcessedPageStore | null;
  /**
   * Called the moment the page list is renderable, before the chapter index
   * resolves. The returned promise still carries the full result (chapters
   * included); this only exists so a reader can paint its first page without
   * waiting on a request it needs solely for adjacent-chapter navigation.
   */
  onPagesReady?: (firstPaint: MobileReaderPagesFirstPaint) => void;
  /**
   * Scheduling priority on the shared source runtime (see
   * `mobileSourceRuntimeScheduler`). Defaults to `user`: someone is looking
   * at this chapter. Warm-ups for a chapter nobody opened yet pass `normal`.
   */
  priority?: MobileSourcePriorityInput;
};

export type MobileReaderProcessedPageStore = {
  get(identity: MobileProcessedReaderPageIdentity): Promise<string | null>;
  put(
    identity: MobileProcessedReaderPageIdentity,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<string | null>;
  /** Synchronous: is a URI `put`/`get` returned still backed by its file? */
  has(uri: string): boolean;
};

const defaultMobileReaderProcessedPageStore: MobileReaderProcessedPageStore = {
  get: (identity) => getProcessedMobileReaderPageUri(identity),
  put: (identity, bytes, mimeType) =>
    storeProcessedMobileReaderPage(identity, bytes, mimeType),
  has: (uri) => isProcessedMobileReaderPageStored(uri),
};

export const MOBILE_READER_PAGE_PROCESSING_WINDOW_RADIUS = 2;
/**
 * Most processed pages held as image data in the JS heap (data URIs). Pages
 * that resolved to a request only (a decorated URL and headers) are a few
 * hundred bytes each and are kept for the whole chapter, outside this cap.
 */
export const MOBILE_READER_PAGE_PROCESSING_CACHE_SIZE = 24;
/**
 * Scroll reading (`processPages`): at most this many wanted pages at once,
 * and this many resolving concurrently. Sources with an image processor
 * fetch, descramble and encode every page, so they get a shorter list —
 * the pages on screen must never wait behind a long run-ahead.
 */
export const MOBILE_READER_PAGE_PROCESSING_MAX_IMAGE_TARGETS = 24;
export const MOBILE_READER_PAGE_PROCESSING_MAX_REQUEST_TARGETS = 48;
export const MOBILE_READER_PAGE_PROCESSING_IMAGE_CONCURRENCY = 3;
export const MOBILE_READER_PAGE_PROCESSING_REQUEST_CONCURRENCY = 2;
// The native sandbox accepts at most 8 MiB for page-image processing. Reject
// larger responses before the bridge performs native buffer/base64/JS copies;
// the reader falls back to the original image URL instead of doing doomed work.
export const MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES = 8 * 1024 * 1024;
// Resolved/processed pages are held as UTF-16 data URIs. Bound both untrusted
// processor output before base64 expansion and the actual estimated JS string
// footprint retained by the shared near-page LRU.
export const MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MOBILE_READER_PROCESSED_IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Chapter index to keep when a refresh comes back.
 *
 * `chapterIndexStatus: "unavailable"` means the index request failed and
 * `chapters` is empty for that reason alone. Both the page-list cache and the
 * reader's in-memory state have to fall back to the last index they know about
 * — otherwise a single failed index request drops adjacent-chapter navigation
 * (for the cache's whole life, or for the rest of the session). Empty
 * fallbacks are skipped: the reader blanks its index on first paint, before
 * the real one lands.
 *
 * Returns `undefined` when nothing is known, which is the caller's cue to skip
 * the cache write entirely.
 */
export function resolveMobileReaderChapterIndex(options: {
  chapterIndexStatus: "ready" | "unavailable";
  chapters: ChapterSummary[];
  previousChapters?: ChapterSummary[];
  persistedChapters?: ChapterSummary[];
}): ChapterSummary[] | undefined {
  if (options.chapterIndexStatus === "ready") return options.chapters;
  if (options.previousChapters?.length) return options.previousChapters;
  if (options.persistedChapters?.length) return options.persistedChapters;
  return undefined;
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  if (code === 0x2b) return 62;
  if (code === 0x2f) return 63;
  return -1;
}

function validateBase64ImagePayload(
  value: string,
  start: number,
): { byteLength: number; prefix: Uint8Array } | null {
  const length = value.length - start;
  if (length <= 0 || length % 4 === 1) return null;
  let padding = 0;
  if (value.endsWith("==")) padding = 2;
  else if (value.endsWith("=")) padding = 1;
  if (padding > 0 && length % 4 !== 0) return null;
  const payloadEnd = value.length - padding;
  for (let index = start; index < value.length; index += 1) {
    if (index >= payloadEnd) {
      if (value.charCodeAt(index) !== 0x3d) return null;
      continue;
    }
    if (base64Value(value.charCodeAt(index)) < 0) return null;
  }
  const byteLength = Math.floor((length * 3) / 4) - padding;
  if (
    byteLength <= 0 ||
    byteLength > MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES
  ) {
    return null;
  }

  const prefix = new Uint8Array(Math.min(byteLength, 16));
  let prefixLength = 0;
  let bits = 0;
  let bitCount = 0;
  for (
    let index = start;
    index < payloadEnd && prefixLength < prefix.length;
    index += 1
  ) {
    bits = (bits << 6) | base64Value(value.charCodeAt(index));
    bitCount += 6;
    if (bitCount < 8) continue;
    bitCount -= 8;
    prefix[prefixLength] = (bits >> bitCount) & 0xff;
    prefixLength += 1;
    bits &= bitCount === 0 ? 0 : (1 << bitCount) - 1;
  }
  return { byteLength, prefix: prefix.subarray(0, prefixLength) };
}

function trustedBase64ImageUri(base64: string): string | null {
  let payloadStart = 0;
  let declaredMimeType: string | null = null;
  if (base64.startsWith("data:")) {
    const comma = base64.indexOf(",");
    if (comma <= 0 || comma > 64) return null;
    const header = base64.slice(0, comma).toLowerCase();
    const match =
      /^data:(image\/(?:avif|gif|jpeg|png|webp));base64$/.exec(header);
    if (!match?.[1]) return null;
    declaredMimeType = match[1];
    payloadStart = comma + 1;
  }

  const validated = validateBase64ImagePayload(base64, payloadStart);
  if (!validated) return null;
  const detectedMimeType = detectProcessedImageMimeType(validated.prefix);
  if (
    !detectedMimeType ||
    (declaredMimeType !== null && declaredMimeType !== detectedMimeType)
  ) {
    return null;
  }
  try {
    assertMobileBase64ImageMetadataSafety(
      base64,
      payloadStart,
      "Reader page image",
    );
  } catch {
    return null;
  }
  return payloadStart > 0
    ? base64
    : `data:${detectedMimeType};base64,${base64}`;
}

function bytesToBase64(bytes: Uint8Array): string {
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

export function detectProcessedImageMimeType(
  bytes: Uint8Array,
): "image/avif" | "image/gif" | "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x61 &&
    bytes[9] === 0x76 &&
    bytes[10] === 0x69 &&
    (bytes[11] === 0x66 || bytes[11] === 0x73)
  ) {
    return "image/avif";
  }
  return null;
}

type ProcessedImageMimeType = NonNullable<
  ReturnType<typeof detectProcessedImageMimeType>
>;

/** Throws unless `bytes` is a supported image with safe metadata. */
function assertProcessedImageBytes(bytes: Uint8Array): ProcessedImageMimeType {
  const mimeType = detectProcessedImageMimeType(bytes);
  if (!mimeType) {
    throw new Error("Aidoku image processor returned an unsupported image format.");
  }
  assertMobileImageMetadataSafety(bytes, "Processed reader page image");
  return mimeType;
}

function processedImageDataUri(
  bytes: Uint8Array,
  mimeType: ProcessedImageMimeType,
): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function assertProcessedImageByteLength(byteLength: number): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES
  ) {
    throw new Error(
      `Processed page image exceeds the ${MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES} byte safety limit.`,
    );
  }
}

function assertPageProcessingInputByteLength(byteLength: number): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES
  ) {
    throw new Error(
      `Page processing input exceeds the ${MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES} byte safety limit.`,
    );
  }
}

function estimatedDataUriBytes(uri: string | undefined): number {
  return uri?.startsWith("data:") ? uri.length * 2 : 0;
}

function responseHeadersMap(headers: Headers): Record<string, string> {
  const map: Record<string, string> = {};
  headers.forEach((value, key) => {
    map[key.toLowerCase()] = value;
  });
  return map;
}

export function mapAidokuPageToReaderPage(
  page: MobileSourcePage,
  index: number,
  request?: { url: string; headers: Record<string, string> },
): MobileReaderPage {
  const pageIndex = Number.isFinite(page.index) ? page.index : index;
  if (page.localUri) {
    // A page of an imported archive: a file the app itself extracted.
    return {
      id: page.id ?? `${pageIndex}:${page.localUri}`,
      index: pageIndex,
      imageUri: page.localUri,
      imageUriOwnership: "app",
    };
  }
  const imageUri =
    request?.url ??
    page.url ??
    (page.base64 ? trustedBase64ImageUri(page.base64) ?? undefined : undefined);
  const imageUriOwnership: MobileImageUriOwnership | undefined = imageUri
    ? request?.url || page.url
      ? "source"
      : "app"
    : undefined;
  const pageId =
    page.id ??
    (imageUri?.startsWith("data:")
      ? `b:${pageIndex}:${index}`
      : `${pageIndex}:${imageUri ?? page.text ?? index}`);
  const result = {
    id: pageId,
    index: pageIndex,
    headers: request?.headers ?? page.headers,
    text: page.text,
    context: page.context,
    ...(page.width && page.height && page.width > 0 && page.height > 0
      ? { sourceSize: { width: page.width, height: page.height } }
      : {}),
  };
  if (!imageUri || !imageUriOwnership) return result;
  return { ...result, imageUri, imageUriOwnership };
}

function chapterFromSummary(chapter: ChapterSummary): AidokuChapter {
  const sourceChapter: AidokuChapter = {
    key: chapter.id,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
  };
  if (chapter.dateUploaded != null)
    sourceChapter.dateUploaded = chapter.dateUploaded;
  if (chapter.locked) sourceChapter.locked = true;
  if (chapter.lang) sourceChapter.lang = chapter.lang;
  if (chapter.scanlator) sourceChapter.scanlator = chapter.scanlator;
  return sourceChapter;
}

async function processMobileReaderPageImage({
  page,
  request,
  processBytes,
  fetchImpl,
  signal,
}: {
  page: MobileSourcePage;
  request: { url: string; headers: Record<string, string> };
  /**
   * Runs the source's processor on the fetched bytes. Its own session turn:
   * the fetch above it holds no source session, so other pages' request
   * rewrites (and other processors) are not queued behind the network.
   */
  processBytes: (input: {
    bytes: Uint8Array;
    context: Record<string, string> | null;
    status: number;
    headers: Record<string, string>;
  }) => Promise<Uint8Array | null | undefined>;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ bytes: Uint8Array; mimeType: ProcessedImageMimeType } | null> {
  // Like Aidoku and the web adapter, every remote page goes through the
  // source's processor; `context` is optional and passed through as null.
  // Sources such as Shonen Jump+ descramble pages that carry no context.
  if (signal?.aborted) return null;
  const context = page.context ?? null;

  try {
    if (fetchImpl === fetch) {
      const response = await mobileNativeFetch(request.url, {
        headers: request.headers,
        responseMode: "bytes",
        maxResponseBytes: MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES,
        signal,
      });
      if (!response.ok || signal?.aborted) return null;
      const processed = await processBytes({
        bytes: response.bytes,
        context,
        status: response.status,
        headers: response.headers,
      });
      if (!processed || signal?.aborted) return null;
      assertProcessedImageByteLength(processed.byteLength);
      return { bytes: processed, mimeType: assertProcessedImageBytes(processed) };
    }

    const response = await fetchImpl(request.url, {
      headers: request.headers,
      signal,
    });
    if (!response.ok || signal?.aborted) return null;
    const declaredLengthHeader = response.headers.get("content-length");
    const declaredLength = Number(declaredLengthHeader);
    if (declaredLengthHeader != null && Number.isFinite(declaredLength)) {
      assertPageProcessingInputByteLength(declaredLength);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (signal?.aborted) return null;
    assertPageProcessingInputByteLength(bytes.byteLength);
    const processed = await processBytes({
      bytes,
      context,
      status: response.status,
      headers: responseHeadersMap(response.headers),
    });
    if (!processed || signal?.aborted) return null;
    assertProcessedImageByteLength(processed.byteLength);
    return { bytes: processed, mimeType: assertProcessedImageBytes(processed) };
  } catch {
    return null;
  }
}

function indexesAroundCenter(
  centerIndex: number,
  pageCount: number,
  radius: number,
): number[] {
  if (pageCount <= 0) return [];
  const center = Math.max(0, Math.min(pageCount - 1, Math.round(centerIndex)));
  const indexes = [center];
  for (let distance = 1; distance <= radius; distance += 1) {
    const before = center - distance;
    const after = center + distance;
    if (before >= 0) indexes.push(before);
    if (after < pageCount) indexes.push(after);
  }
  return indexes;
}

function decoratePageImageRequest(
  source: MobileAidokuExecutorSource,
  request: { url: string; headers: Record<string, string> },
): Promise<{ url: string; headers: Record<string, string> }> {
  if (!source.decorateImageRequest) return Promise.resolve(request);
  return source.decorateImageRequest(request).catch(() => request);
}

type ProcessedPageEntry = {
  page: MobileReaderPage;
  /** Estimated JS heap held by the entry (a data URI); 0 for request-only. */
  byteSize: number;
  /** Shown from the processed-page store's file (which the cache may evict). */
  stored: boolean;
};

function createMobileReaderPageProcessor({
  normalizedSource,
  rawPages,
  basePages,
  settings,
  hasImageProcessor,
  options,
}: {
  normalizedSource: ReturnType<typeof normalizeInstalledSource>;
  rawPages: MobileSourcePage[];
  basePages: MobileReaderPage[];
  settings: Record<string, unknown>;
  hasImageProcessor: boolean;
  options: MobileReaderPagesOptions;
}): MobileReaderPageProcessor {
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;
  const fetchImpl = options.fetchImpl ?? fetch;
  const processesBytes = options.processPageImages === true && hasImageProcessor;
  const processedStore =
    options.processedPageStore === undefined
      ? defaultMobileReaderProcessedPageStore
      : options.processedPageStore;
  const sourceIdentity = makeMobileRuntimeSourceKey(normalizedSource);
  const processedIdentity = (
    page: MobileSourcePage,
  ): MobileProcessedReaderPageIdentity => ({
    url: page.url!,
    variant: JSON.stringify([sourceIdentity, page.context ?? null]),
  });
  const storedPage = (
    basePage: MobileReaderPage,
    uri: string,
  ): MobileReaderPage => ({
    ...basePage,
    imageUri: uri,
    imageUriOwnership: "app",
    headers: undefined,
    imageProcessing: "ready",
  });
  const requestedRadius =
    options.pageProcessingWindowRadius ??
    MOBILE_READER_PAGE_PROCESSING_WINDOW_RADIUS;
  const radius = Math.max(
    0,
    Number.isFinite(requestedRadius)
      ? Math.round(requestedRadius)
      : MOBILE_READER_PAGE_PROCESSING_WINDOW_RADIUS,
  );
  const requestedCacheSize =
    options.pageProcessingCacheSize ?? MOBILE_READER_PAGE_PROCESSING_CACHE_SIZE;
  const maxCacheSize = Math.max(
    radius * 2 + 1,
    Number.isFinite(requestedCacheSize)
      ? Math.round(requestedCacheSize)
      : MOBILE_READER_PAGE_PROCESSING_CACHE_SIZE,
  );
  const requestedCacheMaxBytes =
    options.pageProcessingCacheMaxBytes ??
    MOBILE_READER_PROCESSED_IMAGE_CACHE_MAX_BYTES;
  const maxCacheBytes =
    Number.isSafeInteger(requestedCacheMaxBytes) && requestedCacheMaxBytes > 0
      ? Math.min(
          requestedCacheMaxBytes,
          MOBILE_READER_PROCESSED_IMAGE_CACHE_MAX_BYTES,
        )
      : MOBILE_READER_PROCESSED_IMAGE_CACHE_MAX_BYTES;
  // Resolved pages, insertion order = recency. Request-only results (a
  // decorated URL and headers, nothing else) are kept for the whole chapter;
  // only entries holding image data in the JS heap count against the LRU.
  const processedPages = new Map<number, ProcessedPageEntry>();
  let processedCacheBytes = 0;
  let heldImageEntries = 0;
  let generation = 0;
  let disposed = false;

  // Scroll reading's prioritized queue (`processPages`).
  const targetLimit = processesBytes
    ? MOBILE_READER_PAGE_PROCESSING_MAX_IMAGE_TARGETS
    : MOBILE_READER_PAGE_PROCESSING_MAX_REQUEST_TARGETS;
  const targetConcurrency = processesBytes
    ? MOBILE_READER_PAGE_PROCESSING_IMAGE_CONCURRENCY
    : MOBILE_READER_PAGE_PROCESSING_REQUEST_CONCURRENCY;
  let targetOrder: number[] = [];
  let targetSet = new Set<number>();
  // Indexes finished (or failed) while continuously targeted: not queued
  // again until they leave the target list, so an evicted or failing page
  // cannot loop.
  const targetHandled = new Set<number>();
  const targetJobs = new Map<number, AbortController>();
  let targetListener:
    | ((result: MobileReaderPageWindowResult) => void)
    | undefined;

  const isCancelled = (run: number, signal?: AbortSignal) =>
    disposed || run !== generation || signal?.aborted === true;

  const evict = (index: number) => {
    const evicted = processedPages.get(index);
    if (!evicted) return;
    processedCacheBytes -= evicted.byteSize;
    if (evicted.byteSize > 0) heldImageEntries -= 1;
    processedPages.delete(index);
  };

  const touch = (index: number, page: MobileReaderPage) => {
    evict(index);
    const byteSize = estimatedDataUriBytes(page.imageUri);
    // Only the processed-page store hands out file URIs here.
    const stored =
      page.imageProcessing === "ready" &&
      page.imageUri?.startsWith("file:") === true;
    processedPages.set(index, { page, byteSize, stored });
    processedCacheBytes += byteSize;
    if (byteSize > 0) heldImageEntries += 1;
    while (
      heldImageEntries > maxCacheSize ||
      isMobileReaderPageImageCacheLimitExceeded(
        processedCacheBytes,
        maxCacheBytes,
      )
    ) {
      // Oldest image entry first, sparing pages the reader still wants;
      // only when every held image is wanted does the oldest go anyway.
      let victim: number | undefined;
      let fallbackVictim: number | undefined;
      for (const [candidate, entry] of processedPages) {
        if (entry.byteSize <= 0) continue;
        fallbackVictim ??= candidate;
        if (!targetSet.has(candidate)) {
          victim = candidate;
          break;
        }
      }
      const chosen = victim ?? fallbackVictim;
      if (chosen === undefined) break;
      evict(chosen);
    }
  };

  /** A stored page whose file the disk cache evicted is resolved again. */
  const dropIfFileGone = (index: number) => {
    const entry = processedPages.get(index);
    if (!entry?.stored || !processedStore) return;
    if (entry.page.imageUri && processedStore.has(entry.page.imageUri)) return;
    evict(index);
  };

  const materializePages = () =>
    basePages.map((page, index) => processedPages.get(index)?.page ?? page);

  const makeResult = (run: number, processedIndexes: number[]) => ({
    generation: run,
    pages: materializePages(),
    processedIndexes: [...processedIndexes],
  });

  const sessionOptions = (
    priority: MobileSourcePriorityInput,
    signal: AbortSignal | undefined,
  ) => ({
    ...options.executor,
    settings,
    priority,
    ...(signal ? { signal } : {}),
  });

  /**
   * Resolves one pending page: request rewriting on the shared source
   * session, then (sources with an image processor) the byte fetch outside
   * the session and the processor in a second, short session turn.
   * `isStale` is re-checked after every await; a stale run hands back the
   * unprocessed base page. `queueSignal` drops a turn still waiting in the
   * per-source queue (the session call then rejects).
   */
  const resolvePendingPage = async (
    page: MobileSourcePage,
    basePage: MobileReaderPage,
    index: number,
    isStale: () => boolean,
    signal: AbortSignal | undefined,
    priority: MobileSourcePriorityInput,
    queueSignal?: AbortSignal,
  ): Promise<MobileReaderPage> => {
    // Processed before (this session or an earlier one): shown from its
    // file, with no source, network or processor work at all.
    const identity = processesBytes && processedStore ? processedIdentity(page) : null;
    if (identity && processedStore) {
      const storedUri = await processedStore.get(identity).catch(() => null);
      if (isStale()) return basePage;
      if (storedUri) return storedPage(basePage, storedUri);
    }
    const step = await cache.withSession(
      normalizedSource,
      sessionOptions(priority, queueSignal),
      async (
        session,
      ): Promise<
        | { kind: "done"; page: MobileReaderPage }
        | {
            kind: "process";
            request: { url: string; headers: Record<string, string> };
          }
      > => {
        // `withSession` is a per-source queue. A newer viewport can cancel
        // this run while it is waiting for its turn, so re-check inside
        // the queue before starting any source/network/image work.
        if (isStale()) return { kind: "done", page: basePage };
        if (session.status === "blocked") {
          return {
            kind: "done",
            page: { ...basePage, imageProcessing: "fallback" },
          };
        }
        const resolvedBase64 = session.source.resolvePageImage
          ? await session.source.resolvePageImage(page).catch(() => null)
          : null;
        if (isStale()) return { kind: "done", page: basePage };
        const resolvedImageUri = resolvedBase64
          ? trustedBase64ImageUri(resolvedBase64)
          : null;
        if (resolvedImageUri) {
          return {
            kind: "done",
            page: {
              ...basePage,
              imageUri: resolvedImageUri,
              imageUriOwnership: "app",
              headers: undefined,
              imageProcessing: "ready",
            },
          };
        }
        // Page headers skip `modifyImageRequest`, so they go through the
        // same native decoration (scoped cookies + their UA) on their own.
        const request = page.headers
          ? await decoratePageImageRequest(session.source, {
              url: page.url!,
              headers: page.headers,
            })
          : await session.source
              .modifyImageRequest(page.url!)
              .catch(() => undefined);
        if (isStale()) return { kind: "done", page: basePage };
        if (!request) {
          return {
            kind: "done",
            page: { ...basePage, imageProcessing: "fallback" },
          };
        }
        if (!processesBytes) {
          return {
            kind: "done",
            page: {
              ...mapAidokuPageToReaderPage(page, index, request),
              id: basePage.id,
              imageProcessing: "fallback",
            },
          };
        }
        return { kind: "process", request };
      },
    );
    if (step.kind === "done") return step.page;
    const { request } = step;
    const processed = await processMobileReaderPageImage({
      page,
      request,
      processBytes: (input) =>
        cache.withSession(
          normalizedSource,
          sessionOptions(priority, queueSignal),
          async (session) => {
            if (isStale() || session.status === "blocked") return null;
            return session.source.processPageImage(
              input.bytes,
              input.context,
              request.url,
              request.headers,
              input.status,
              input.headers,
            );
          },
        ),
      fetchImpl,
      signal,
    });
    if (isStale()) return basePage;
    if (!processed) {
      return {
        ...mapAidokuPageToReaderPage(page, index, request),
        id: basePage.id,
        imageProcessing: "fallback",
      };
    }
    if (identity && processedStore) {
      const storedUri = await processedStore
        .put(identity, processed.bytes, processed.mimeType)
        .catch(() => null);
      if (isStale()) return basePage;
      if (storedUri) return storedPage(basePage, storedUri);
    }
    // No store (or it failed): the page is held as a data URI instead.
    return {
      ...basePage,
      imageUri: processedImageDataUri(processed.bytes, processed.mimeType),
      imageUriOwnership: "app",
      headers: undefined,
      imageProcessing: "ready",
    };
  };

  const isProcessable = (index: number) => {
    const page = rawPages[index];
    const basePage = basePages[index];
    return Boolean(
      page && basePage && basePage.imageProcessing === "pending" && page.url,
    );
  };

  const pumpTargets = () => {
    if (disposed) return;
    for (const index of targetOrder) {
      if (targetJobs.size >= targetConcurrency) return;
      if (
        targetJobs.has(index) ||
        targetHandled.has(index) ||
        processedPages.has(index) ||
        !isProcessable(index)
      ) {
        continue;
      }
      const controller = new AbortController();
      targetJobs.set(index, controller);
      const isStale = () => disposed || controller.signal.aborted;
      const settle = (resolved: MobileReaderPage | null) => {
        if (targetJobs.get(index) === controller) targetJobs.delete(index);
        if (!isStale()) {
          targetHandled.add(index);
          if (resolved) {
            touch(index, resolved);
            // Each page is published the moment it is ready; the caller
            // coalesces bursts into one render.
            try {
              targetListener?.(makeResult(generation, [index]));
            } catch {
              // A view subscriber must not stop the queue.
            }
          }
        }
        pumpTargets();
      };
      void resolvePendingPage(
        rawPages[index]!,
        basePages[index]!,
        index,
        isStale,
        controller.signal,
        options.priority ?? "user",
        controller.signal,
      ).then(settle, () => settle(null));
    }
  };

  const clearTargets = () => {
    for (const controller of targetJobs.values()) controller.abort();
    targetJobs.clear();
    targetOrder = [];
    targetSet = new Set();
    targetHandled.clear();
  };

  return {
    async processWindow(centerIndex, processOptions = {}) {
      if (disposed) return null;
      const run = generation + 1;
      generation = run;
      const targetIndexes = indexesAroundCenter(
        centerIndex,
        rawPages.length,
        radius,
      );
      const processedIndexes: number[] = [];

      for (const index of targetIndexes) {
        if (isCancelled(run, processOptions.signal)) return null;
        dropIfFileGone(index);
        const cached = processedPages.get(index);
        if (cached) {
          touch(index, cached.page);
          processedIndexes.push(index);
          continue;
        }
        if (!isProcessable(index)) continue;
        const page = rawPages[index]!;
        const basePage = basePages[index]!;

        const resolvedPage = await resolvePendingPage(
          page,
          basePage,
          index,
          () => isCancelled(run, processOptions.signal),
          processOptions.signal,
          options.priority ?? "user",
        );
        if (isCancelled(run, processOptions.signal)) return null;
        touch(index, resolvedPage);
        processedIndexes.push(index);
        // Publish the visible page as soon as it is ready, then keep warming
        // the surrounding pages. The first paint must not wait for the rest of
        // the window's serial source processor work.
        if (processedIndexes.length === 1) {
          try {
            processOptions.onUpdate?.(makeResult(run, processedIndexes));
          } catch {
            // A view subscriber must not stop cache warming.
          }
        }
      }

      if (isCancelled(run, processOptions.signal)) return null;
      return makeResult(run, processedIndexes);
    },
    processPages(indexes, processOptions = {}) {
      if (disposed) return;
      targetListener = processOptions.onUpdate;
      const order: number[] = [];
      const wanted = new Set<number>();
      for (const raw of indexes) {
        if (order.length >= targetLimit) break;
        if (!Number.isFinite(raw)) continue;
        const index = Math.round(raw);
        if (index < 0 || index >= rawPages.length || wanted.has(index)) {
          continue;
        }
        wanted.add(index);
        order.push(index);
      }
      for (const index of order) {
        if (!targetSet.has(index)) dropIfFileGone(index);
      }
      targetOrder = order;
      targetSet = wanted;
      // Work for pages still wanted keeps running; the rest is dropped.
      for (const [index, controller] of targetJobs) {
        if (wanted.has(index)) continue;
        controller.abort();
        targetJobs.delete(index);
      }
      for (const index of targetHandled) {
        if (!wanted.has(index)) targetHandled.delete(index);
      }
      pumpTargets();
    },
    async resolvePage(index, resolveOptions = {}) {
      const signal = resolveOptions.signal;
      const isStale = () => disposed || signal?.aborted === true;
      if (isStale()) return null;
      dropIfFileGone(index);
      const cached = processedPages.get(index);
      if (cached) return cached.page;
      const page = rawPages[index];
      const basePage = basePages[index];
      if (!page || !basePage) return null;
      if (basePage.imageProcessing !== "pending" || !page.url) return basePage;
      // Off-window: neither bumps the window generation nor enters the
      // window's LRU, so a caller reading a far page cannot cancel or evict
      // the pages around the reader's viewport.
      const resolved = await resolvePendingPage(
        page,
        basePage,
        index,
        isStale,
        signal,
        resolveOptions.priority ?? "normal",
      );
      return isStale() ? null : resolved;
    },
    cancel() {
      generation += 1;
      clearTargets();
    },
    dispose() {
      disposed = true;
      generation += 1;
      clearTargets();
      targetListener = undefined;
      processedPages.clear();
      processedCacheBytes = 0;
      heldImageEntries = 0;
    },
    cacheSize() {
      return processedPages.size;
    },
    cacheByteSize() {
      return processedCacheBytes;
    },
  };
}

export async function refreshMobileReaderPages(
  source: InstalledSource,
  mangaId: string,
  chapter: ChapterSummary,
  options: MobileReaderPagesOptions = {},
): Promise<MobileReaderPagesRefresh> {
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(
    sourceKey,
    source,
  );
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings, priority: options.priority ?? "user" },
    async (session): Promise<MobileReaderPagesRefresh> => {
      await notifyMobileSourcePackageHydrated(
        source,
        session.sourcePackageHydration,
        options.onSourcePackageHydrated,
      );

      if (session.status === "blocked") {
        return {
          status: "blocked",
          reason: session.reason,
          detail: session.detail,
        };
      }

      const requestedChapter = chapterFromSummary(chapter);
      // The route already carries a safe chapter summary, so the page list is
      // requested straight away and never waits on the chapter index. Order
      // matters: iOS dispatches sandbox operations onto one serial queue, so
      // whichever call is issued first owns it. Only the page list gates the
      // first paint — the index exists for adjacent-chapter navigation — so it
      // goes first and the index queues behind it.
      const pagesRequest = session.source.getPageList(
        { key: mangaId },
        requestedChapter,
      );
      const chaptersRequest = session.source
        .getChapterList({ key: mangaId })
        // A chapter index that fails must not take an already-rendered page
        // list down with it, and must never surface as an unhandled rejection
        // while the page list is still being turned into a first paint.
        .catch(() => null);
      let rawPages: Awaited<typeof pagesRequest>;
      let pageListChapter = requestedChapter;
      try {
        rawPages = await pagesRequest;
      } catch (error) {
        // A route-carried summary has no source url, and some sources (e.g.
        // ja.soraraw) read the page list's key off the chapter's own url.
        // Retry once with the chapter exactly as the source listed it.
        const listed = (await chaptersRequest)?.find(
          (item) => item.key === chapter.id,
        );
        if (!listed?.url || requestedChapter.url) throw error;
        pageListChapter = listed;
        rawPages = await session.source.getPageList({ key: mangaId }, listed);
      }
      const shouldProcessPageImages = options.processPageImages === true;
      // Every remote page is a processor candidate (context is optional, as
      // in Aidoku and the web reader); app-local archive pages never are.
      const hasRemotePages =
        shouldProcessPageImages &&
        rawPages.some((page) => page.url && !page.localUri);
      const hasImageProcessor = hasRemotePages
        ? await session.source.hasImageProcessor()
        : false;
      // Keep the initial refresh to the page-list request only. Request
      // rewriting and optional byte processing happen lazily in the current
      // page's bounded window, so a long chapter cannot serialize work for
      // every page before the first page becomes renderable.
      const pages = rawPages.map((page, index) => {
        const mapped = mapAidokuPageToReaderPage(page, index);
        return page.url
          ? { ...mapped, imageProcessing: "pending" as const }
          : mapped;
      });

      const pageProcessor = rawPages.some((page) => page.url)
        ? createMobileReaderPageProcessor({
            normalizedSource: normalized,
            rawPages,
            basePages: pages,
            settings,
            hasImageProcessor,
            options,
          })
        : undefined;

      // One timestamp for both halves: the reader keys its restore/scroll
      // identity on `fetchedAt`, so the chapter index landing must not look
      // like a different fetch.
      const fetchedAt = options.now?.() ?? Date.now();
      options.onPagesReady?.({
        runtime: session.runtime,
        pages,
        pageProcessor,
        chapter: mapAidokuChapterToSummary(pageListChapter),
        fetchedAt,
      });

      // Still inside the pinned session: awaiting here (rather than letting the
      // promise escape) is what keeps the runtime alive for this request.
      const chapters = await chaptersRequest;
      const chapterSummaries = chapters ? mapAidokuChapterList(chapters) : [];
      const sourceChapter =
        chapters?.find((item) => item.key === chapter.id) ?? requestedChapter;

      return {
        status: "ready",
        runtime: session.runtime,
        pages,
        pageProcessor,
        chapters: chapterSummaries,
        chapterIndexStatus: chapters ? "ready" : "unavailable",
        chapter: mapAidokuChapterToSummary(sourceChapter),
        fetchedAt,
      };
    },
  );
}
