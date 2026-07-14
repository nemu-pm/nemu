import { Directory, File, Paths } from "expo-file-system";
import type { NativeBinaryCache } from "./contracts";
import { base64ToBytes } from "@/lib/mobileBase64";
import { downloadMobileNativeHttpFile } from "@/sources/mobileNativeHttpFile";
import {
  selectNativeBinaryCacheEvictions,
  type NativeBinaryCachePolicy,
} from "./nativeCachePolicy";
import {
  NativeCacheMutationQueue,
  NativeCacheWriteCoordinator,
  type NativeCacheWriteLease,
} from "./nativeCacheWriteCoordinator";

export type NativeBinaryCacheDownloadOptions = {
  cookieScope?: string;
  headers?: Record<string, string>;
  maxBytes: number;
  maxImageDimension?: number;
  maxImagePixels?: number;
  signal?: AbortSignal;
};

function encodeKey(key: string) {
  return encodeURIComponent(key).replace(/%/g, "_");
}

const CACHE_EXTENSIONS = [
  "aix",
  "apk",
  "zip",
  "js",
  "bin",
  "jpg",
  "png",
  "webp",
  "avif",
  "gif",
  "heic",
  "wav",
] as const;

function extensionForContentType(contentType?: string) {
  if (contentType?.includes("aidoku") || contentType?.includes("aix")) return "aix";
  if (contentType?.includes("android.package") || contentType?.includes("apk")) return "apk";
  if (contentType?.includes("zip")) return "zip";
  if (contentType?.includes("javascript") || contentType?.includes("ecmascript")) return "js";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("avif")) return "avif";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("heic")) return "heic";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (contentType?.includes("wav") || contentType?.includes("wave")) return "wav";
  return "bin";
}

export class FileSystemBinaryCache implements NativeBinaryCache {
  private readonly cacheDir: Directory;
  private readonly mutationQueue = new NativeCacheMutationQueue();
  private readonly writeCoordinator = new NativeCacheWriteCoordinator();
  private indexed = false;
  private indexedBytes = 0;
  private indexedEntries = 0;

  constructor(
    directoryName = "nemu-cache",
    private readonly policy?: NativeBinaryCachePolicy,
  ) {
    if (
      policy &&
      (
        policy.maxBytes <= 0 ||
        policy.maxEntries < 1 ||
        policy.maxAgeMs <= 0 ||
        policy.maxEntryBytes <= 0 ||
        policy.maxEntryBytes > policy.maxBytes
      )
    ) {
      throw new Error("Invalid native binary cache policy.");
    }
    this.cacheDir = new Directory(Paths.cache, directoryName);
  }

  private cacheFiles(): File[] {
    if (!this.cacheDir.exists) return [];
    return this.cacheDir.list().filter((entry): entry is File => entry instanceof File);
  }

  private indexAndEnforcePolicy(protectedUri?: string): void {
    if (!this.policy || !this.cacheDir.exists) {
      this.indexed = true;
      this.indexedBytes = 0;
      this.indexedEntries = 0;
      return;
    }

    const files = this.cacheFiles();
    const entries = files.map((file) => {
      const info = file.info();
      return {
        id: file.uri,
        size: info.size ?? 0,
        modifiedAt: info.modificationTime ?? 0,
      };
    });
    const evictions = new Set(
      selectNativeBinaryCacheEvictions(
        entries,
        this.policy,
        Date.now(),
        protectedUri,
      ),
    );
    for (const file of files) {
      if (evictions.has(file.uri) && file.exists) file.delete();
    }

    const retained = entries.filter((entry) => !evictions.has(entry.id));
    this.indexedBytes = retained.reduce((total, entry) => total + entry.size, 0);
    this.indexedEntries = retained.length;
    this.indexed = true;
  }

  private ensureIndexed(): void {
    if (!this.indexed) this.indexAndEnforcePolicy();
  }

  private removeTrackedFile(file: File): void {
    if (!file.exists) return;
    const size = this.policy && this.indexed ? (file.info().size ?? 0) : 0;
    file.delete();
    if (this.policy && this.indexed) {
      this.indexedBytes = Math.max(0, this.indexedBytes - size);
      this.indexedEntries = Math.max(0, this.indexedEntries - 1);
    }
  }

  async getUri(key: string): Promise<string | null> {
    this.ensureIndexed();
    for (const ext of CACHE_EXTENSIONS) {
      const file = new File(this.cacheDir, `${encodeKey(key)}.${ext}`);
      if (file.exists) return file.uri;
    }
    return null;
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    const uri = await this.getUri(key);
    if (!uri) return null;
    return base64ToBytes(await new File(uri).base64());
  }

  async setBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<string> {
    if (this.policy && bytes.byteLength > this.policy.maxEntryBytes) {
      throw new Error(
        `Cache entry exceeds ${this.policy.maxEntryBytes} byte limit.`,
      );
    }
    const writeLease = this.writeCoordinator.begin(key);
    try {
      return await this.mutationQueue.run(() => {
        this.assertCurrentWrite(writeLease);
        if (!this.cacheDir.exists) {
          this.cacheDir.create({ intermediates: true });
        }
        this.ensureIndexed();
        const nextExtension = extensionForContentType(contentType);
        // Same key, different content type (e.g. a registry artifact switching
        // apk → zip) must not leave the old-extension file behind: getUri probes
        // extensions in a fixed order and would keep serving the stale bytes.
        for (const ext of CACHE_EXTENSIONS) {
          if (ext === nextExtension) continue;
          const stale = new File(this.cacheDir, `${encodeKey(key)}.${ext}`);
          this.removeTrackedFile(stale);
        }
        const file = new File(this.cacheDir, `${encodeKey(key)}.${nextExtension}`);
        this.removeTrackedFile(file);
        file.write(bytes);
        this.assertCurrentWrite(writeLease);
        if (this.policy) {
          this.indexedBytes += bytes.byteLength;
          this.indexedEntries += 1;
          if (
            this.indexedBytes > this.policy.maxBytes ||
            this.indexedEntries > this.policy.maxEntries
          ) {
            this.indexAndEnforcePolicy(file.uri);
          }
        }
        return file.uri;
      });
    } finally {
      this.writeCoordinator.finish(writeLease);
    }
  }

  /**
   * Streams a remote executable directly into a temporary native file, then
   * atomically moves it into the bounded cache. This avoids the native byte
   * buffer -> base64 -> JS Uint8Array copies used by a bridge response.
   */
  async downloadFile(
    key: string,
    url: string,
    contentType: string | undefined,
    options: NativeBinaryCacheDownloadOptions,
  ): Promise<string> {
    if (
      !Number.isSafeInteger(options.maxBytes) ||
      options.maxBytes <= 0 ||
      (this.policy && options.maxBytes > this.policy.maxEntryBytes)
    ) {
      throw new Error("Invalid native cache download byte limit.");
    }
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    }
    if (!this.cacheDir.exists) {
      this.cacheDir.create({ intermediates: true });
    }
    this.ensureIndexed();

    const writeLease = this.writeCoordinator.begin(key);
    const extension = extensionForContentType(contentType);
    const finalFile = new File(this.cacheDir, `${encodeKey(key)}.${extension}`);
    let nativeTemporaryUri: string | null = null;

    try {
      const result = await downloadMobileNativeHttpFile(
        {
          cookieScope: options.cookieScope,
          url,
          headers: options.headers ?? {},
          maxResponseBytes: options.maxBytes,
          maxImageDimension: options.maxImageDimension,
          maxImagePixels: options.maxImagePixels,
        },
        options.signal,
      );
      nativeTemporaryUri = result.fileUri;
      if (options.signal?.aborted) {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      }
      this.assertCurrentWrite(writeLease);
      const downloaded = new File(nativeTemporaryUri);
      const size = downloaded.info().size ?? 0;
      if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > options.maxBytes ||
        size !== result.byteLength
      ) {
        throw new Error(`Cache entry exceeds ${options.maxBytes} byte limit.`);
      }
      this.assertCurrentWrite(writeLease);

      return await this.mutationQueue.run(async () => {
        this.assertCurrentWrite(writeLease);
        for (const ext of CACHE_EXTENSIONS) {
          const stale = new File(this.cacheDir, `${encodeKey(key)}.${ext}`);
          this.removeTrackedFile(stale);
        }
        await downloaded.move(finalFile, { overwrite: true });
        nativeTemporaryUri = null;
        if (!this.writeCoordinator.isCurrent(writeLease)) {
          // No other publish/delete can run inside this short critical section,
          // so this path can only remove the file moved by this stale lease.
          if (finalFile.exists) finalFile.delete();
          throw new Error("The cache download was superseded by a newer write.");
        }
        if (this.policy) {
          this.indexedBytes += size;
          this.indexedEntries += 1;
          if (
            this.indexedBytes > this.policy.maxBytes ||
            this.indexedEntries > this.policy.maxEntries
          ) {
            this.indexAndEnforcePolicy(finalFile.uri);
          }
        }
        return finalFile.uri;
      });
    } finally {
      this.writeCoordinator.finish(writeLease);
      if (nativeTemporaryUri) {
        try {
          const temporaryFile = new File(nativeTemporaryUri);
          if (temporaryFile.exists) temporaryFile.delete();
        } catch {
          // Native owns partial downloads; this only cleans a completed temp
          // file when validation, cancellation, or the atomic move fails.
        }
      }
    }
  }

  async remove(key: string): Promise<void> {
    this.writeCoordinator.invalidate(key);
    await this.mutationQueue.run(() => {
      if (!this.cacheDir.exists) return;
      for (const ext of CACHE_EXTENSIONS) {
        const file = new File(this.cacheDir, `${encodeKey(key)}.${ext}`);
        this.removeTrackedFile(file);
      }
    });
  }

  async clearAll(): Promise<void> {
    this.writeCoordinator.invalidateAll();
    await this.mutationQueue.run(() => {
      if (this.cacheDir.exists) {
        this.cacheDir.delete();
      }
      this.indexed = false;
      this.indexedBytes = 0;
      this.indexedEntries = 0;
    });
  }

  private assertCurrentWrite(lease: NativeCacheWriteLease): void {
    if (!this.writeCoordinator.isCurrent(lease)) {
      throw new Error("The cache download was superseded by a newer write.");
    }
  }
}
