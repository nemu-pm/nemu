import type { InstalledSource } from "@/data/schema";
import {
  type MobileAidokuExecutorSource,
  type MobileSourceExecutorOptions,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  defaultMobileSourceSettings, makeMobileRuntimeSourceKey, normalizeInstalledSource,
} from "./mobileSourceRuntime";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "./mobileSourceProfileScope";
import {
  resolveMobileProcessedCoverUri,
  type ResolveMobileProcessedCoverUri,
} from "./mobileSourceCoverImages";
import { selectMobileCoverImageRequest } from "./mobileSourceCoverProcessing";

export type MobileSourceImageRequest = {
  url: string;
  headers: Record<string, string>;
};

export type MobileSourceImageRequestOptions = {
  getSourceSettings?: (sourceKey: string, source: InstalledSource) => Promise<Record<string, unknown>>;
  executor?: Pick<
    MobileSourceExecutorOptions,
    "bridge" | "readBytes" | "executionScope"
  >;
  sessionCache?: MobileSourceSessionCache;
  /** Injection seam for the platform cover-processing resolver. */
  resolveProcessedCoverUri?: ResolveMobileProcessedCoverUri;
  /**
   * Receives the cache key this resolve is memoized under, so a caller holding
   * the result can later drop exactly that entry (see
   * `forgetMobileSourceImageRequest`).
   */
  onCacheKey?: (cacheKey: string) => void;
};

const imageRequestCache = new Map<string, Promise<MobileSourceImageRequest | null>>();

/**
 * How many resolved image requests stay memoized.
 *
 * `MOBILE_PROCESSED_COVER_MAX_FILES` must stay strictly greater than this: a
 * memoized entry for a source-processed cover is a `file://` URI, and while
 * the entry is a cache hit nothing re-resolves it, so pruning the file it
 * points at would leave a permanently broken cover.
 */
export const MOBILE_SOURCE_IMAGE_REQUEST_CACHE_MAX_SIZE = 300;

function stableSettingsStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSettingsStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${stableSettingsStringify(item)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function makeMobileSourceImageRequestCacheKey(
  source: InstalledSource,
  url: string,
  settings: Record<string, unknown>,
  executionScope = getActiveMobileSourceProfileScope(),
): string {
  const normalized = normalizeInstalledSource(source);
  return [
    executionScope,
    makeMobileRuntimeSourceKey(normalized),
    source.packageCacheKey ?? "",
    source.packageUri ?? "",
    source.version,
    source.updatedAt ?? "",
    url,
    stableSettingsStringify(settings),
  ].join("|");
}

export function clearMobileSourceImageRequestCache() {
  imageRequestCache.clear();
}

/**
 * Drops one memoized request so the next resolve goes back to the source.
 *
 * The render path uses this when a processed cover's local file turns out to
 * be gone: the memoized `file://` URI is the reason nothing re-resolves, so it
 * has to be evicted before the repair can do anything.
 */
export function forgetMobileSourceImageRequest(cacheKey: string): boolean {
  return imageRequestCache.delete(cacheKey);
}

registerMobileSourceProfileTransitionHandler(
  "source-image-request-cache",
  clearMobileSourceImageRequestCache,
);

function cacheImageRequest(
  key: string,
  loader: () => Promise<MobileSourceImageRequest | null>,
) {
  const cached = imageRequestCache.get(key);
  if (cached) return cached;

  if (imageRequestCache.size >= MOBILE_SOURCE_IMAGE_REQUEST_CACHE_MAX_SIZE) {
    const firstKey = imageRequestCache.keys().next().value;
    if (firstKey) imageRequestCache.delete(firstKey);
  }

  const promise = loader()
    .catch(() => null)
    .then((request) => {
      // Keep successful rewrites, but never let a transient blocked session,
      // timeout, or runtime error poison this URL until process restart.
      if (request === null && imageRequestCache.get(key) === promise) {
        imageRequestCache.delete(key);
      }
      return request;
    });
  imageRequestCache.set(key, promise);
  return promise;
}

/**
 * One cover/page image request, resolved through the source.
 *
 * `modifyImageRequest` gives the URL and headers the source wants used. A
 * source that also exports a cover processor expects its covers to be
 * rewritten by it, so the processed cover is materialized as a local file and
 * that file becomes the request; everything else keeps the url+headers pair.
 */
async function resolveSessionImageRequest(
  source: MobileAidokuExecutorSource,
  url: string,
  cacheKey: string,
  options: MobileSourceImageRequestOptions,
): Promise<MobileSourceImageRequest | null> {
  let request: MobileSourceImageRequest;
  try {
    request = await source.modifyImageRequest(url);
  } catch {
    return null;
  }
  if (!source.hasCoverImageProcessor) return request;
  const resolveProcessedCover =
    options.resolveProcessedCoverUri ?? resolveMobileProcessedCoverUri;
  const processedUri = await resolveProcessedCover({
    source,
    request,
    cacheKey,
  }).catch(() => null);
  return selectMobileCoverImageRequest(request, processedUri);
}

export async function resolveMobileSourceImageRequest(
  source: InstalledSource,
  url: string,
  options: MobileSourceImageRequestOptions = {},
): Promise<MobileSourceImageRequest | null> {
  const executionScope =
    options.executor?.executionScope ?? getActiveMobileSourceProfileScope();
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(
    sourceKey,
    source,
  );
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;
  const cacheKey = makeMobileSourceImageRequestCacheKey(
    source,
    url,
    settings,
    executionScope,
  );

  return cache.withSession(
    normalized,
    { ...options.executor, executionScope, settings },
    async (session): Promise<MobileSourceImageRequest | null> => {
      if (session.status === "blocked") return null;
      return resolveSessionImageRequest(session.source, url, cacheKey, options);
    },
  );
}

export async function resolveCachedMobileSourceImageRequest(
  source: InstalledSource,
  url: string,
  options: MobileSourceImageRequestOptions = {},
): Promise<MobileSourceImageRequest | null> {
  const executionScope =
    options.executor?.executionScope ?? getActiveMobileSourceProfileScope();
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(
    sourceKey,
    source,
  );
  const key = makeMobileSourceImageRequestCacheKey(
    source,
    url,
    settings,
    executionScope,
  );
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;
  options.onCacheKey?.(key);

  return cacheImageRequest(key, async () => {
    return cache.withSession(
      normalized,
      { ...options.executor, executionScope, settings },
      async (session): Promise<MobileSourceImageRequest | null> => {
        if (session.status === "blocked") return null;
        return resolveSessionImageRequest(session.source, url, key, options);
      },
    );
  });
}
