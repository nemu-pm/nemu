import type {
  ChapterSummary,
  InstalledSource,
} from "@/data/schema";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
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
  mapAidokuChapterToSummary,
  sortChapterSummaries,
} from "./mobileSourceDetails";
import { mobileNativeFetch } from "./mobileNativeHttp";
import {
  defaultMobileSourceSettings,
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "./mobileSourceRuntime";
import {
  MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES,
  isMobileReaderPageImageCacheLimitExceeded,
} from "./mobileSourcePageSafety";

type MobileReaderPageBase = {
  id: string;
  index: number;
  headers?: Record<string, string>;
  text?: string;
  context?: Record<string, string>;
  imageProcessing?: "pending" | "ready" | "fallback";
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
   * Called the moment the page list is renderable, before the chapter index
   * resolves. The returned promise still carries the full result (chapters
   * included); this only exists so a reader can paint its first page without
   * waiting on a request it needs solely for adjacent-chapter navigation.
   */
  onPagesReady?: (firstPaint: MobileReaderPagesFirstPaint) => void;
};

export const MOBILE_READER_PAGE_PROCESSING_WINDOW_RADIUS = 2;
export const MOBILE_READER_PAGE_PROCESSING_CACHE_SIZE = 7;
// The native sandbox accepts at most 8 MiB for page-image processing. Reject
// larger responses before the bridge performs native buffer/base64/JS copies;
// the reader falls back to the original image URL instead of doing doomed work.
export const MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES = 8 * 1024 * 1024;
// Resolved/processed pages are held as UTF-16 data URIs. Bound both untrusted
// processor output before base64 expansion and the actual estimated JS string
// footprint retained by the shared near-page LRU.
export const MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MOBILE_READER_PROCESSED_IMAGE_CACHE_MAX_BYTES =
  MOBILE_READER_PAGE_IMAGE_CACHE_MAX_BYTES;

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

function processedImageUri(bytes: Uint8Array): string {
  const mimeType = detectProcessedImageMimeType(bytes);
  if (!mimeType) {
    throw new Error("Aidoku image processor returned an unsupported image format.");
  }
  assertMobileImageMetadataSafety(bytes, "Processed reader page image");
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
  return sourceChapter;
}

async function processMobileReaderPageImage({
  page,
  request,
  source,
  fetchImpl,
  signal,
}: {
  page: MobileSourcePage;
  request: { url: string; headers: Record<string, string> };
  source: MobileAidokuExecutorSource;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<string | null> {
  if (!page.context || signal?.aborted) return null;

  try {
    if (fetchImpl === fetch) {
      const response = await mobileNativeFetch(request.url, {
        headers: request.headers,
        responseMode: "bytes",
        maxResponseBytes: MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES,
        signal,
      });
      if (!response.ok || signal?.aborted) return null;
      const processed = await source.processPageImage(
        response.bytes,
        page.context,
        request.url,
        request.headers,
        response.status,
        response.headers,
      );
      if (!processed || signal?.aborted) return null;
      assertProcessedImageByteLength(processed.byteLength);
      return processedImageUri(processed);
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
    const processed = await source.processPageImage(
      bytes,
      page.context,
      request.url,
      request.headers,
      response.status,
      responseHeadersMap(response.headers),
    );
    if (!processed || signal?.aborted) return null;
    assertProcessedImageByteLength(processed.byteLength);
    return processedImageUri(processed);
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
  const processedPages = new Map<
    number,
    { page: MobileReaderPage; byteSize: number }
  >();
  let processedCacheBytes = 0;
  let generation = 0;
  let disposed = false;

  const isCancelled = (run: number, signal?: AbortSignal) =>
    disposed || run !== generation || signal?.aborted === true;

  const touch = (index: number, page: MobileReaderPage) => {
    const existing = processedPages.get(index);
    if (existing) processedCacheBytes -= existing.byteSize;
    processedPages.delete(index);
    const byteSize = estimatedDataUriBytes(page.imageUri);
    processedPages.set(index, { page, byteSize });
    processedCacheBytes += byteSize;
    while (
      processedPages.size > maxCacheSize ||
      isMobileReaderPageImageCacheLimitExceeded(
        processedCacheBytes,
        maxCacheBytes,
      )
    ) {
      const oldest = processedPages.keys().next().value;
      if (oldest === undefined) break;
      const evicted = processedPages.get(oldest);
      if (evicted) processedCacheBytes -= evicted.byteSize;
      processedPages.delete(oldest);
    }
  };

  const materializePages = () =>
    basePages.map((page, index) => processedPages.get(index)?.page ?? page);

  const makeResult = (run: number, processedIndexes: number[]) => ({
    generation: run,
    pages: materializePages(),
    processedIndexes: [...processedIndexes],
  });

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
        const cached = processedPages.get(index);
        if (cached) {
          touch(index, cached.page);
          processedIndexes.push(index);
          continue;
        }
        const page = rawPages[index];
        const basePage = basePages[index];
        if (
          !page ||
          !basePage ||
          basePage.imageProcessing !== "pending" ||
          !page.url
        ) {
          continue;
        }

        const resolvedPage = await cache.withSession(
          normalizedSource,
          { ...options.executor, settings },
          async (session): Promise<MobileReaderPage> => {
            // `withSession` is a per-source queue. A newer viewport can cancel
            // this run while it is waiting for its turn, so re-check inside
            // the queue before starting any source/network/image work.
            if (isCancelled(run, processOptions.signal)) return basePage;
            if (session.status === "blocked") {
              return { ...basePage, imageProcessing: "fallback" };
            }
            const resolvedBase64 = session.source.resolvePageImage
              ? await session.source.resolvePageImage(page).catch(() => null)
              : null;
            if (isCancelled(run, processOptions.signal)) return basePage;
            const resolvedImageUri = resolvedBase64
              ? trustedBase64ImageUri(resolvedBase64)
              : null;
            if (resolvedImageUri) {
              return {
                ...basePage,
                imageUri: resolvedImageUri,
                imageUriOwnership: "app",
                headers: undefined,
                imageProcessing: "ready",
              };
            }
            const request = page.headers
              ? { url: page.url!, headers: page.headers }
              : await session.source
                  .modifyImageRequest(page.url!)
                  .catch(() => undefined);
            if (isCancelled(run, processOptions.signal)) return basePage;
            if (!request) return { ...basePage, imageProcessing: "fallback" };
            if (
              !options.processPageImages ||
              !hasImageProcessor ||
              !page.context
            ) {
              return {
                ...mapAidokuPageToReaderPage(page, index, request),
                id: basePage.id,
                imageProcessing: "fallback",
              };
            }
            const processedImageUri = await processMobileReaderPageImage({
              page,
              request,
              source: session.source,
              fetchImpl,
              signal: processOptions.signal,
            });
            if (isCancelled(run, processOptions.signal)) return basePage;
            if (!processedImageUri) {
              return {
                ...mapAidokuPageToReaderPage(page, index, request),
                id: basePage.id,
                imageProcessing: "fallback",
              };
            }
            return {
              ...basePage,
              imageUri: processedImageUri,
              imageUriOwnership: "app",
              headers: undefined,
              imageProcessing: "ready",
            };
          },
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
    cancel() {
      generation += 1;
    },
    dispose() {
      disposed = true;
      generation += 1;
      processedPages.clear();
      processedCacheBytes = 0;
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
    { ...options.executor, settings },
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
      const rawPages = await pagesRequest;
      const shouldProcessPageImages = options.processPageImages === true;
      const hasProcessorContext =
        shouldProcessPageImages &&
        rawPages.some((page) => page.url && page.context);
      const hasImageProcessor = hasProcessorContext
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
        chapter: mapAidokuChapterToSummary(requestedChapter),
        fetchedAt,
      });

      // Still inside the pinned session: awaiting here (rather than letting the
      // promise escape) is what keeps the runtime alive for this request.
      const chapters = await chaptersRequest;
      const chapterSummaries = chapters
        ? sortChapterSummaries(chapters.map(mapAidokuChapterToSummary))
        : [];
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
