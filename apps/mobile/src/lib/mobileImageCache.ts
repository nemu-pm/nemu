import { getActiveMobileSourceProfileScope } from "@/sources/mobileSourceProfileScope";
import { makeMobileImageCacheStorageKey } from "./mobileImageCacheKey";
import type { MobileImageCacheResolveOptions } from "./mobileImageCacheCoordinator";

export type MobileImageCacheSource = {
  uri?: string | null;
  headers?: Record<string, string>;
  cacheKind?: "cover" | "page";
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
  void asset;
  return () => undefined;
}

// Expo web relies on the browser's network boundary and has no native file
// cache. Native overrides this to require a policy-checked local file before a
// remote URL may reach React Native's image decoder.
export const MOBILE_IMAGE_CACHE_REQUIRES_LOCAL_FILE = false;

export function getMobileImageCacheSourceKey(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
): string {
  if (!source?.uri) return "";
  return makeMobileImageCacheStorageKey(executionScope, source, cacheKey);
}

export function getCachedMobileImageUriSync(
  _source: MobileImageCacheSource | null | undefined,
  _cacheKey?: string,
  _executionScope?: string,
): string | null {
  void _source;
  void _cacheKey;
  void _executionScope;
  return null;
}

export function getCachedMobileImageAssetSync(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
): MobileCachedImageAsset | null {
  const uri = getCachedMobileImageUriSync(source, cacheKey, executionScope);
  return uri ? { kind: "file", uri } : null;
}

export function getCachedMobileImageAssetByStorageKeySync(
  _storageKey: string,
): MobileCachedImageAsset | null {
  void _storageKey;
  return null;
}

export async function resolveCachedMobileImageUri(
  _source: MobileImageCacheSource | null | undefined,
  _cacheKey?: string,
  _executionScope?: string,
  _options: MobileImageCacheResolveOptions = {},
): Promise<string | null> {
  void _source;
  void _cacheKey;
  void _executionScope;
  void _options;
  return null;
}

export async function resolveCachedMobileImageAsset(
  source: MobileImageCacheSource | null | undefined,
  cacheKey?: string,
  executionScope = getActiveMobileSourceProfileScope(),
  options: MobileImageCacheResolveOptions = {},
): Promise<MobileCachedImageAsset | null> {
  const uri = await resolveCachedMobileImageUri(
    source,
    cacheKey,
    executionScope,
    options,
  );
  return uri ? { kind: "file", uri } : null;
}

export async function invalidateCachedMobileImage(
  _source: MobileImageCacheSource | null | undefined,
  _cacheKey?: string,
  _executionScope?: string,
): Promise<void> {
  void _source;
  void _cacheKey;
  void _executionScope;
}

export async function prefetchCachedMobileImages(
  sources: Array<MobileImageCacheSource | null | undefined>,
): Promise<void> {
  await Promise.all(
    sources.map((source) =>
      resolveCachedMobileImageUri(source, undefined, undefined, {
        priority: "prefetch",
      }),
    ),
  );
}

export async function clearMobileImageCache(): Promise<void> {
  return undefined;
}

export const clearMobileCoverImageCache = clearMobileImageCache;
export const clearMobileReaderPageImageCache = clearMobileImageCache;

export async function getMobileImageCacheStats(): Promise<{
  covers: { bytes: number; entries: number };
  pages: { bytes: number; entries: number };
}> {
  return {
    covers: { bytes: 0, entries: 0 },
    pages: { bytes: 0, entries: 0 },
  };
}

export function clearMobileImageMemoryCacheForProfileTransition(): void {}
