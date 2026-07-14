// Base (non-native) binary cache.
//
// Metro resolves `nativeCache.native.ts` on native (iOS/Android), which holds
// the real `expo-file-system` `FileSystemBinaryCache` (same `nemu-cache` dir
// and filename encoding — unchanged). This base file is what bun's test
// runner and Expo web resolve instead — an in-memory stub with no
// `expo-file-system`/`react-native` import, so it loads under bun. It is never
// the on-disk cache on native; on Expo web the app uses
// `mobileData.web.tsx` (`WebUserDataStore`), not this stub. Native cache
// dir/encoding is byte-for-byte unchanged. See `CONTRIBUTING.md` for the
// convention.

import type { NativeBinaryCache } from "./contracts";
import type { NativeBinaryCachePolicy } from "./nativeCachePolicy";
import {
  MOBILE_IMAGE_MAX_DECODED_PIXELS,
  MOBILE_IMAGE_MAX_DIMENSION,
  assertMobileImageMetadataSafety,
} from "@/lib/mobileImageMetadataSafety";

export type NativeBinaryCacheDownloadOptions = {
  cookieScope?: string;
  headers?: Record<string, string>;
  maxBytes: number;
  maxImageDimension?: number;
  maxImagePixels?: number;
  signal?: AbortSignal;
};

export class FileSystemBinaryCache implements NativeBinaryCache {
  private readonly entries = new Map<string, { bytes: Uint8Array; contentType?: string }>();

  constructor(
    _directoryName = "nemu-cache",
    _policy?: NativeBinaryCachePolicy,
  ) {
    void _directoryName;
    void _policy;
  }

  async getUri(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    return entry ? `memory://${key}` : null;
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    return this.entries.get(key)?.bytes ?? null;
  }

  async setBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<string> {
    this.entries.set(key, { bytes, contentType });
    return `memory://${key}`;
  }

  async downloadFile(
    key: string,
    url: string,
    contentType: string | undefined,
    options: NativeBinaryCacheDownloadOptions,
  ): Promise<string> {
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
      throw new Error("Invalid native cache download byte limit.");
    }
    const hasImageDimension = options.maxImageDimension != null;
    const hasImagePixels = options.maxImagePixels != null;
    if (
      hasImageDimension !== hasImagePixels ||
      (hasImageDimension && (
        !Number.isSafeInteger(options.maxImageDimension) ||
        options.maxImageDimension! <= 0 ||
        options.maxImageDimension! > MOBILE_IMAGE_MAX_DIMENSION ||
        !Number.isSafeInteger(options.maxImagePixels) ||
        options.maxImagePixels! <= 0 ||
        options.maxImagePixels! > MOBILE_IMAGE_MAX_DECODED_PIXELS
      ))
    ) {
      throw new Error("Invalid native cache image dimension limit.");
    }
    const response = await fetch(url, {
      headers: options.headers,
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
      throw new Error(`Cache entry exceeds ${options.maxBytes} byte limit.`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > options.maxBytes) {
      throw new Error(`Cache entry exceeds ${options.maxBytes} byte limit.`);
    }
    if (hasImageDimension) {
      assertMobileImageMetadataSafety(bytes, "Cached image", {
        maxDimension: options.maxImageDimension,
        maxPixels: options.maxImagePixels,
      });
    }
    return this.setBytes(key, bytes, contentType);
  }

  async remove(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clearAll(): Promise<void> {
    this.entries.clear();
  }
}
