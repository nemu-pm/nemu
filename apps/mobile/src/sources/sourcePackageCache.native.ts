import { File } from "expo-file-system";
import { FileSystemBinaryCache } from "@/data/nativeCache";
import {
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import { extractAixMetadata } from "./aixMetadata";
import {
  makeAixArtifactCacheKey,
  type MobileRegistrySource,
} from "./aidokuRegistry";
import { sha256Bytes } from "@nemu/core";
import {
  assertAidokuSourcePackageIdentity,
  getSourcePackageKind,
  makeTachiyomiExtensionCacheKey,
  sourcePackageContentType,
  type SourcePackageCacheOptions,
  type SourcePackageCacheResult,
} from "./sourcePackageCacheTypes";
import {
  MOBILE_SOURCE_PACKAGE_CACHE_POLICY,
  assertSecureSourcePackageDownloadUrl,
  assertSourcePackageCompressedByteLength,
  isCachedSourcePackageFileInfoValid,
  sourcePackageCompressedByteLimit,
} from "./sourcePackageSafety";
import { throwIfMobileNativeHttpAborted } from "./mobileNativeHttpAbort";

const packageCache = new FileSystemBinaryCache(
  "nemu-cache",
  MOBILE_SOURCE_PACKAGE_CACHE_POLICY,
);

function packageKindForCacheKey(packageCacheKey: string) {
  return packageCacheKey.startsWith("tachiyomi:")
    ? ("tachiyomi-extension" as const)
    : ("aidoku-aix" as const);
}

function assertReadablePackageFileSize(
  file: File,
  packageKind: "aidoku-aix" | "tachiyomi-extension",
): void {
  const info = file.info();
  if (!isCachedSourcePackageFileInfoValid(packageKind, info)) {
    throw new Error("The cached source package file is missing or invalid.");
  }
}

async function readPackageFileBytes(
  file: File,
  packageKind: "aidoku-aix" | "tachiyomi-extension",
): Promise<Uint8Array> {
  // Check filesystem metadata before asking Expo to bridge the entire file.
  // This avoids both an oversized base64 string and its decoded allocation.
  assertReadablePackageFileSize(file, packageKind);
  const bytes = await file.bytes();
  // Defend against replacement between stat and read.
  assertSourcePackageCompressedByteLength(packageKind, bytes.byteLength);
  return bytes;
}

async function writeCompletePackage(
  packageCacheKey: string,
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    throwIfMobileNativeHttpAborted(signal);
    const packageUri = await packageCache.setBytes(
      packageCacheKey,
      bytes,
      contentType,
    );
    // Close the race where the owner expires immediately after the synchronous
    // file write. Remove the just-written executable instead of publishing it
    // from a cancelled hydration run.
    throwIfMobileNativeHttpAborted(signal);
    return packageUri;
  } catch (error) {
    // FileSystem writes can fail after creating the destination. Never leave a
    // partial executable package discoverable by a subsequent cache lookup.
    try {
      await packageCache.remove(packageCacheKey);
    } catch {
      // Preserve the original write error; cleanup is best effort.
    }
    throw error;
  }
}

export async function cacheSourcePackage(
  source: MobileRegistrySource,
  options: SourcePackageCacheOptions = {},
): Promise<SourcePackageCacheResult> {
  if (!source.downloadUrl)
    return { packageUri: null, packageCacheKey: null, metadata: null };
  throwIfMobileNativeHttpAborted(options.signal);
  const secureDownloadUrl = assertSecureSourcePackageDownloadUrl(
    source.downloadUrl,
  );

  const packageKind = getSourcePackageKind(source);
  const sourceKey = `${source.registryId}:${source.id}`;
  const cacheStartedAt = markMobilePerformance("source.package.cache.start", {
    key: sourceKey,
    kind: packageKind,
  });
  const downloadStartedAt = markMobilePerformance(
    "source.package.download.start",
    {
      key: sourceKey,
      kind: packageKind,
    },
  );
  const packageCacheKey =
    packageKind === "aidoku-aix"
      ? makeAixArtifactCacheKey({
          artifactIdentity: secureDownloadUrl,
          registryId: source.registryId,
          sourceId: source.id,
          version: source.version,
        })
      : makeTachiyomiExtensionCacheKey(source.registryId, source.id);
  const contentType = sourcePackageContentType(source, packageKind);
  const packageUri = await packageCache.downloadFile(
    packageCacheKey,
    secureDownloadUrl,
    contentType,
    {
      maxBytes: sourcePackageCompressedByteLimit(packageKind),
      requireHttps: true,
      signal: options.signal,
    },
  );
  measureMobilePerformance(
    "source.package.download.complete",
    downloadStartedAt,
    {
      key: sourceKey,
      kind: packageKind,
      status: 200,
    },
  );
  throwIfMobileNativeHttpAborted(options.signal);
  const packageFile = new File(packageUri);
  assertReadablePackageFileSize(packageFile, packageKind);
  const byteLength = packageFile.info().size ?? 0;
  const metadataStartedAt = markMobilePerformance(
    "source.package.metadata.start",
    {
      key: sourceKey,
      kind: packageKind,
      byteLength,
    },
  );
  let metadata: SourcePackageCacheResult["metadata"] = null;
  try {
    // Tachiyomi packages stay entirely on disk. AIX metadata parsing still
    // needs one bounded JS buffer, but the native response/base64/write copies
    // have already been eliminated.
    if (packageKind === "aidoku-aix") {
      const bytes = await readPackageFileBytes(packageFile, packageKind);
      throwIfMobileNativeHttpAborted(options.signal);
      metadata = extractAixMetadata(bytes);
      assertAidokuSourcePackageIdentity(source, metadata);
    }
    throwIfMobileNativeHttpAborted(options.signal);
  } catch (error) {
    await packageCache.remove(packageCacheKey).catch(() => undefined);
    throw error;
  }
  measureMobilePerformance(
    "source.package.metadata.complete",
    metadataStartedAt,
    {
      key: sourceKey,
      kind: packageKind,
    },
  );
  measureMobilePerformance("source.package.cache.complete", cacheStartedAt, {
    key: sourceKey,
    kind: packageKind,
    byteLength,
  });
  return { packageUri, packageCacheKey, metadata };
}

export async function cacheImportedAixSourcePackage({
  uri,
  registryId,
}: {
  uri: string;
  registryId: string;
}): Promise<SourcePackageCacheResult> {
  const readStartedAt = markMobilePerformance(
    "source.package.import-read.start",
    {
      registryId,
    },
  );
  const bytes = await readPackageFileBytes(new File(uri), "aidoku-aix");
  measureMobilePerformance(
    "source.package.import-read.complete",
    readStartedAt,
    {
      registryId,
      byteLength: bytes.byteLength,
    },
  );

  const metadataStartedAt = markMobilePerformance(
    "source.package.import-metadata.start",
    {
      registryId,
      byteLength: bytes.byteLength,
    },
  );
  const metadata = extractAixMetadata(bytes);
  measureMobilePerformance(
    "source.package.import-metadata.complete",
    metadataStartedAt,
    {
      registryId,
      sourceId: metadata.sourceId,
    },
  );

  const contentDigest = Array.from(sha256Bytes(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const packageCacheKey = makeAixArtifactCacheKey({
    artifactIdentity: `sha256:${contentDigest}`,
    registryId,
    sourceId: metadata.sourceId,
    version: metadata.version,
  });
  const writeStartedAt = markMobilePerformance(
    "source.package.import-cache-write.start",
    {
      key: packageCacheKey,
      byteLength: bytes.byteLength,
    },
  );
  const packageUri = await writeCompletePackage(
    packageCacheKey,
    bytes,
    sourcePackageContentType(
      {
        id: metadata.sourceId,
        registryId,
        downloadUrl: uri,
      },
      "aidoku-aix",
    ),
  );
  measureMobilePerformance(
    "source.package.import-cache-write.complete",
    writeStartedAt,
    {
      key: packageCacheKey,
      byteLength: bytes.byteLength,
    },
  );

  return { packageUri, packageCacheKey, metadata };
}

export async function readCachedSourcePackageBytes(
  packageCacheKey: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!packageCacheKey) return null;
  const uri = await packageCache.getUri(packageCacheKey);
  if (!uri) return null;
  return readPackageFileBytes(
    new File(uri),
    packageKindForCacheKey(packageCacheKey),
  );
}

export async function hasCachedSourcePackage(
  packageCacheKey: string | null | undefined,
): Promise<boolean> {
  return (await resolveCachedSourcePackageUri(packageCacheKey)) !== null;
}

export async function resolveCachedSourcePackageUri(
  packageCacheKey: string | null | undefined,
): Promise<string | null> {
  if (!packageCacheKey) return null;
  const uri = await packageCache.getUri(packageCacheKey);
  if (!uri) return null;
  try {
    const file = new File(uri);
    if (
      isCachedSourcePackageFileInfoValid(
        packageKindForCacheKey(packageCacheKey),
        file.info(),
      )
    ) {
      return uri;
    }
  } catch {
    // Treat an unreadable stat exactly like a stale cache entry.
  }
  try {
    await packageCache.remove(packageCacheKey);
  } catch {
    // Hydration will overwrite the stale key; cleanup is best effort.
  }
  return null;
}

export async function clearCachedSourcePackage(
  packageCacheKey: string | null | undefined,
): Promise<void> {
  if (!packageCacheKey) return;
  await packageCache.remove(packageCacheKey);
}

export async function clearCachedSourcePackages(): Promise<void> {
  await packageCache.clearAll();
}
