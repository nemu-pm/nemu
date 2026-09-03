import { FileSystemBinaryCache } from "@/data/nativeCache";
import { File } from "expo-file-system";
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
import { parseNativeSegmentedImageCacheManifest } from "@/data/nativeSegmentedImageCache";

export type MobileImageCacheSource = {
  uri?: string | null;
  headers?: Record<string, string>;
};

export type MobileCachedImageFileAsset = Readonly<{
  kind: "file";
  uri: string;
}>;

export type MobileCachedImageSegment = Readonly<{
  uri: string;
  byteLength: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
}>;

export type MobileCachedSegmentedImageAsset = Readonly<{
  kind: "segmented-image";
  manifestVersion: 1;
  generation: string;
  manifestUri: string;
  byteLength: number;
  width: number;
  height: number;
  segments: ReadonlyArray<MobileCachedImageSegment>;
}>;

export type MobileCachedImageAsset =
  | MobileCachedImageFileAsset
  | MobileCachedSegmentedImageAsset;

export function retainCachedMobileImageAsset(
  asset: MobileCachedImageAsset | null | undefined,
): () => void {
  return asset?.kind === "segmented-image"
    ? mobileImageCache.retainSegmentedImageManifest(asset.manifestUri)
    : () => undefined;
}

const SEGMENT_MANIFEST_FILE_PATTERN =
  /^(.*)\.segments-v1-([a-z0-9]{10}-[a-z0-9]{6}-[a-z0-9]{10})\.json$/;

function readCachedMobileImageAsset(
  locatorUri: string,
): MobileCachedImageAsset | null {
  const locator = new File(locatorUri);
  const match = SEGMENT_MANIFEST_FILE_PATTERN.exec(locator.name);
  if (!match) return { kind: "file", uri: locatorUri };
  try {
    const locatorSize = locator.info().size ?? 0;
    if (!locator.exists || locatorSize <= 0 || locatorSize > 64 * 1024)
      return null;
    const manifest = parseNativeSegmentedImageCacheManifest(
      JSON.parse(locator.textSync()) as unknown,
      match[1]!,
      MOBILE_REMOTE_IMAGE_MAX_BYTES,
    );
    if (!manifest || manifest.generation !== match[2]) return null;
    const directoryUri = locator.uri.slice(0, locator.uri.lastIndexOf("/") + 1);
    const segments = manifest.segments.map((segment) => {
      const member = new File(`${directoryUri}${segment.fileName}`);
      if (!member.exists || (member.info().size ?? 0) !== segment.byteLength) {
        throw new Error(
          "Segmented image cache member is missing or incomplete.",
        );
      }
      return {
        uri: member.uri,
        byteLength: segment.byteLength,
        width: segment.width,
        height: segment.height,
        mimeType: segment.mimeType,
      };
    });
    return {
      kind: "segmented-image",
      manifestVersion: 1,
      generation: manifest.generation,
      manifestUri: locator.uri,
      byteLength: manifest.byteLength,
      width: manifest.width,
      height: manifest.height,
      segments,
    };
  } catch {
    return null;
  }
}

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
const MAX_IMAGE_LOAD_CONCURRENCY = 8;
// Matches what the platform's real browser currently sends: Chrome mobile
// ships the reduced UA ("Android 10; K"), and Safari 26 freezes the OS token
// at 18_7 while Version/ carries the real Safari major.
const MOBILE_IMAGE_DEFAULT_USER_AGENT = Platform.select({
  android:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
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

export function getCachedMobileImageAssetSync(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
): MobileCachedImageAsset | null {
  if (!source?.uri || !isCacheableMobileImageUri(source.uri)) return null;
  return getCachedMobileImageAssetByStorageKeySync(
    mobileImageCacheStorageKey(source, cacheKey, executionScope),
  );
}

/** Avoid re-reading a segmented manifest when its exact storage identity is unchanged. */
export function getCachedMobileImageAssetByStorageKeySync(
  storageKey: string,
): MobileCachedImageAsset | null {
  if (!storageKey) return null;
  const locator = mobileImageCacheCoordinator.getResolvedUri(storageKey);
  return locator ? readCachedMobileImageAsset(locator) : null;
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

export async function resolveCachedMobileImageAsset(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
  options: MobileImageCacheResolveOptions = {},
): Promise<MobileCachedImageAsset | null> {
  if (!source?.uri || !isCacheableMobileImageUri(source.uri)) return null;
  const key = mobileImageCacheStorageKey(source, cacheKey, executionScope);
  const locator = await mobileImageCacheCoordinator.resolve(
    key,
    (signal) =>
      mobileImageCache.downloadFile(
        key,
        source.uri!,
        imageContentTypeForUri(source.uri!),
        {
          headers: imageDownloadHeaders(source.headers),
          maxBytes: MOBILE_REMOTE_IMAGE_MAX_BYTES,
          maxImageDimension: MOBILE_IMAGE_MAX_DIMENSION,
          maxImagePixels: MOBILE_IMAGE_MAX_DECODED_PIXELS,
          allowLongStripSegments:
            Platform.OS === "android" || Platform.OS === "ios",
          signal,
        },
      ),
    options,
  );
  if (!locator) return null;
  const asset = readCachedMobileImageAsset(locator);
  if (asset) return asset;
  // A manifest locator without a complete validated generation is corrupt.
  // Remove it before a bounded retry can repopulate the key.
  await mobileImageCacheCoordinator.invalidate(key);
  throw new Error("The segmented image cache entry is incomplete.");
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
