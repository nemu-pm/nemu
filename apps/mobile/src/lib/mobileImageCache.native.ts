import { FileSystemBinaryCache } from "@/data/nativeCache";
import type { NativeBinaryCachePolicy } from "@/data/nativeCachePolicy";
import { Platform } from "react-native";
import { MOBILE_REMOTE_IMAGE_MAX_BYTES } from "./mobileRemoteImageSafety";
import {
  MOBILE_IMAGE_MAX_DECODED_PIXELS,
  MOBILE_IMAGE_MAX_DIMENSION,
} from "./mobileImageMetadataSafety";
import {
  MobileImageCacheCoordinator,
  type MobileImageCacheResolveOptions,
} from "./mobileImageCacheCoordinator";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";
import { makeMobileImageCacheStorageKey } from "./mobileImageCacheKey";

export type MobileImageCacheSource = {
  uri?: string | null;
  headers?: Record<string, string>;
};

export const MOBILE_IMAGE_CACHE_REQUIRES_LOCAL_FILE = true;

export const MOBILE_IMAGE_DISK_CACHE_POLICY: NativeBinaryCachePolicy = {
  maxBytes: 192 * 1024 * 1024,
  maxEntries: 500,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxEntryBytes: MOBILE_REMOTE_IMAGE_MAX_BYTES,
};

const mobileImageCache = new FileSystemBinaryCache(
  "nemu-image-cache",
  MOBILE_IMAGE_DISK_CACHE_POLICY,
);
const MAX_RESOLVED_IMAGE_URIS = 600;
const MAX_IMAGE_LOAD_CONCURRENCY = 4;
const MOBILE_IMAGE_DEFAULT_USER_AGENT = Platform.select({
  android:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const mobileImageCacheCoordinator = new MobileImageCacheCoordinator(
  mobileImageCache,
  MAX_RESOLVED_IMAGE_URIS,
  MAX_IMAGE_LOAD_CONCURRENCY,
);

function isCacheableMobileImageUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

function mobileImageCacheStorageKey(
  source: MobileImageCacheSource,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
) {
  return makeMobileImageCacheStorageKey(executionScope, source, cacheKey);
}

function imageContentTypeForUri(uri: string) {
  const cleanUri = uri.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (cleanUri.endsWith(".png")) return "image/png";
  if (cleanUri.endsWith(".webp")) return "image/webp";
  if (cleanUri.endsWith(".avif")) return "image/avif";
  if (cleanUri.endsWith(".gif")) return "image/gif";
  if (cleanUri.endsWith(".heic")) return "image/heic";
  if (cleanUri.endsWith(".jpg") || cleanUri.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return undefined;
}

function imageDownloadHeaders(headers?: Record<string, string>) {
  if (
    !MOBILE_IMAGE_DEFAULT_USER_AGENT ||
    Object.keys(headers ?? {}).some(
      (header) => header.toLowerCase() === "user-agent",
    )
  ) {
    return headers;
  }
  return {
    ...headers,
    "User-Agent": MOBILE_IMAGE_DEFAULT_USER_AGENT,
  };
}

export function getMobileImageCacheSourceKey(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
): string {
  if (!source?.uri) return "";
  if (!isCacheableMobileImageUri(source.uri)) return source.uri;
  return mobileImageCacheStorageKey(source, cacheKey, executionScope);
}

export function getCachedMobileImageUriSync(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
): string | null {
  if (!source?.uri || !isCacheableMobileImageUri(source.uri)) return null;
  return mobileImageCacheCoordinator.getResolvedUri(
    mobileImageCacheStorageKey(source, cacheKey, executionScope),
  );
}

export async function resolveCachedMobileImageUri(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
  options: MobileImageCacheResolveOptions = {},
): Promise<string | null> {
  if (!source?.uri || !isCacheableMobileImageUri(source.uri)) return null;
  const key = mobileImageCacheStorageKey(source, cacheKey, executionScope);
  return mobileImageCacheCoordinator.resolve(
    key,
    async (signal) => {
      // The native SSRF-protected file seam streams directly to disk. Keeping
      // cover bytes out of both the bridge response and JS avoids several
      // simultaneous 20 MiB copies while still validating every redirect/peer.
      return mobileImageCache.downloadFile(
        key,
        source.uri!,
        imageContentTypeForUri(source.uri!),
        {
          headers: imageDownloadHeaders(source.headers),
          maxBytes: MOBILE_REMOTE_IMAGE_MAX_BYTES,
          maxImageDimension: MOBILE_IMAGE_MAX_DIMENSION,
          maxImagePixels: MOBILE_IMAGE_MAX_DECODED_PIXELS,
          signal,
        },
      );
    },
    options,
  );
}

export function invalidateCachedMobileImage(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
): Promise<void> {
  if (!source?.uri || !isCacheableMobileImageUri(source.uri)) {
    return Promise.resolve();
  }
  return mobileImageCacheCoordinator.invalidate(
    mobileImageCacheStorageKey(source, cacheKey, executionScope),
  );
}

export async function prefetchCachedMobileImages(
  sources: Array<MobileImageCacheSource | null | undefined>,
): Promise<void> {
  const executionScope = getActiveMobileSourceProfileScope();
  await Promise.all(
    sources.map((source) =>
      resolveCachedMobileImageUri(source, undefined, executionScope, {
        priority: "prefetch",
      }).catch(() => null),
    ),
  );
}

export async function clearMobileImageCache(): Promise<void> {
  await mobileImageCacheCoordinator.clearAll(() => mobileImageCache.clearAll());
}

export function clearMobileImageMemoryCacheForProfileTransition(): void {
  mobileImageCacheCoordinator.clearMemory();
}

registerMobileSourceProfileTransitionHandler(
  "mobile-image-uri-cache",
  clearMobileImageMemoryCacheForProfileTransition,
);
