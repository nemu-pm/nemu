import type { InstalledSource } from "@/data/schema";
import { type MobileSourceExecutorOptions } from "./mobileSourceExecutor";
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
};

const imageRequestCache = new Map<string, Promise<MobileSourceImageRequest | null>>();
const MAX_IMAGE_REQUEST_CACHE_SIZE = 300;

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

  if (imageRequestCache.size >= MAX_IMAGE_REQUEST_CACHE_SIZE) {
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

  return cache.withSession(
    normalized,
    { ...options.executor, executionScope, settings },
    async (session): Promise<MobileSourceImageRequest | null> => {
      if (session.status === "blocked") return null;
      try {
        return await session.source.modifyImageRequest(url);
      } catch {
        return null;
      }
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

  return cacheImageRequest(key, async () => {
    return cache.withSession(
      normalized,
      { ...options.executor, executionScope, settings },
      async (session): Promise<MobileSourceImageRequest | null> => {
        if (session.status === "blocked") return null;
        try {
          return await session.source.modifyImageRequest(url);
        } catch {
          return null;
        }
      },
    );
  });
}
