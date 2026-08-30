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
import {
  nextNativeSegmentedImageGeneration,
  NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES,
  parseNativeSegmentedImageCacheManifest,
  type NativeSegmentedImageCacheManifest,
} from "./nativeSegmentedImageCache";

export type NativeBinaryCacheDownloadOptions = {
  cookieScope?: string;
  headers?: Record<string, string>;
  maxBytes: number;
  requireHttps?: boolean;
  maxImageDimension?: number;
  maxImagePixels?: number;
  allowLongStripSegments?: boolean;
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

const SEGMENT_MANIFEST_MAX_BYTES = NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES;
const SEGMENT_MANIFEST_PATTERN =
  /^(.*)\.segments-v1-([a-z0-9]{10}-[a-z0-9]{6}-[a-z0-9]{10})\.json$/;
const SEGMENT_MEMBER_PATTERN =
  /^(.*)\.segment-v1-([a-z0-9]{10}-[a-z0-9]{6}-[a-z0-9]{10})-(\d{2})\.(png|jpg)$/;
const SEGMENT_STAGE_PATTERN =
  /^(.*)\.segments-stage-([a-z0-9]{10}-[a-z0-9]{6}-[a-z0-9]{10})\.part$/;
const MAX_CACHE_PHYSICAL_FILES = 4_096;

type IndexedCacheEntry = {
  id: string;
  size: number;
  modifiedAt: number;
  files: File[];
};

type ValidSegmentManifest = {
  file: File;
  manifest: NativeSegmentedImageCacheManifest;
};

function extensionForContentType(contentType?: string) {
  if (contentType?.includes("aidoku") || contentType?.includes("aix"))
    return "aix";
  if (contentType?.includes("android.package") || contentType?.includes("apk"))
    return "apk";
  if (contentType?.includes("zip")) return "zip";
  if (
    contentType?.includes("javascript") ||
    contentType?.includes("ecmascript")
  )
    return "js";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("avif")) return "avif";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("heic")) return "heic";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg"))
    return "jpg";
  if (contentType?.includes("wav") || contentType?.includes("wave"))
    return "wav";
  return "bin";
}

export class FileSystemBinaryCache implements NativeBinaryCache {
  private readonly cacheDir: Directory;
  private readonly mutationQueue = new NativeCacheMutationQueue();
  private readonly writeCoordinator = new NativeCacheWriteCoordinator();
  private readonly activeSegmentPublishFiles = new Set<string>();
  private readonly retiredSegmentManifests = new Map<
    string,
    { encodedKey: string }
  >();
  private readonly segmentedManifestConsumers = new Map<string, number>();
  /** Validated latest generation per key, refreshed only by index/mutation. */
  private latestSegmentManifests = new Map<string, ValidSegmentManifest>();
  private indexed = false;
  private indexedBytes = 0;
  private indexedEntries = 0;
  private indexedPhysicalFiles = 0;

  constructor(
    directoryName = "nemu-cache",
    private readonly policy?: NativeBinaryCachePolicy,
  ) {
    if (
      policy &&
      (policy.maxBytes <= 0 ||
        policy.maxEntries < 1 ||
        policy.maxAgeMs <= 0 ||
        policy.maxEntryBytes <= 0 ||
        policy.maxEntryBytes > policy.maxBytes)
    ) {
      throw new Error("Invalid native binary cache policy.");
    }
    this.cacheDir = new Directory(Paths.cache, directoryName);
  }

  private cacheFiles(): File[] {
    if (!this.cacheDir.exists) return [];
    return this.cacheDir
      .list()
      .filter((entry): entry is File => entry instanceof File);
  }

  private segmentManifestFile(encodedKey: string, generation: string): File {
    return new File(
      this.cacheDir,
      `${encodedKey}.segments-v1-${generation}.json`,
    );
  }

  private removeSegmentArtifacts(encodedKey: string): boolean {
    if (!this.cacheDir.exists) return false;
    let removed = false;
    for (const file of this.cacheFiles()) {
      const manifestMatch = SEGMENT_MANIFEST_PATTERN.exec(file.name);
      const match = SEGMENT_MEMBER_PATTERN.exec(file.name);
      const stageMatch = SEGMENT_STAGE_PATTERN.exec(file.name);
      if (
        manifestMatch?.[1] !== encodedKey &&
        match?.[1] !== encodedKey &&
        stageMatch?.[1] !== encodedKey
      ) {
        continue;
      }
      if (this.activeSegmentPublishFiles.has(file.name)) continue;
      if (file.exists) {
        file.delete();
        this.activeSegmentPublishFiles.delete(file.name);
        this.retiredSegmentManifests.delete(file.name);
        this.segmentedManifestConsumers.delete(file.name);
        removed = true;
      }
    }
    if (removed) this.indexed = false;
    return removed;
  }

  /**
   * A segment group is discoverable only through its manifest. Members left
   * by process death before the manifest-last commit are therefore safe to
   * delete. Active same-process publishers are exempt until their lease exits.
   */
  private sweepSegmentArtifacts(
    includeActiveManifests = false,
  ): Map<string, ValidSegmentManifest> {
    const latestByKey = new Map<string, ValidSegmentManifest>();
    if (!this.cacheDir.exists) return latestByKey;
    const files = this.cacheFiles();
    const byName = new Map(files.map((file) => [file.name, file]));
    const membersByGroup = new Map<string, File[]>();
    for (const file of files) {
      const memberMatch = SEGMENT_MEMBER_PATTERN.exec(file.name);
      if (!memberMatch) continue;
      const groupKey = `${memberMatch[1]!}\u0000${memberMatch[2]!}`;
      const members = membersByGroup.get(groupKey) ?? [];
      members.push(file);
      membersByGroup.set(groupKey, members);
    }
    const validByKey = new Map<string, ValidSegmentManifest[]>();
    const referencedMembers = new Set<string>();
    let changed = false;

    for (const manifestFile of files) {
      const manifestMatch = SEGMENT_MANIFEST_PATTERN.exec(manifestFile.name);
      if (!manifestMatch) continue;
      if (
        !includeActiveManifests &&
        this.activeSegmentPublishFiles.has(manifestFile.name)
      ) {
        continue;
      }
      const encodedKey = manifestMatch[1]!;
      const generation = manifestMatch[2]!;
      let manifest: NativeSegmentedImageCacheManifest | null = null;
      try {
        const size = manifestFile.info().size ?? 0;
        if (size > 0 && size <= SEGMENT_MANIFEST_MAX_BYTES) {
          manifest = parseNativeSegmentedImageCacheManifest(
            JSON.parse(manifestFile.textSync()) as unknown,
            encodedKey,
            this.policy?.maxEntryBytes ?? Number.MAX_SAFE_INTEGER,
          );
        }
      } catch {
        manifest = null;
      }
      if (
        !manifest ||
        manifest.generation !== generation ||
        manifest.segments.some((segment) => {
          const member = byName.get(segment.fileName);
          const actualSize = member?.exists ? (member.info().size ?? 0) : 0;
          return actualSize !== segment.byteLength;
        })
      ) {
        if (!this.activeSegmentPublishFiles.has(manifestFile.name)) {
          if (manifestFile.exists) manifestFile.delete();
          const groupKey = `${encodedKey}\u0000${generation}`;
          for (const file of membersByGroup.get(groupKey) ?? []) {
            if (!this.activeSegmentPublishFiles.has(file.name) && file.exists) {
              file.delete();
            }
          }
          changed = true;
        }
        continue;
      }
      const entry = { file: manifestFile, manifest };
      const current = validByKey.get(encodedKey) ?? [];
      current.push(entry);
      validByKey.set(encodedKey, current);
    }

    validByKey.forEach((entries, encodedKey) => {
      const ordered = [...entries].sort((left, right) =>
        left.manifest.generation.localeCompare(right.manifest.generation),
      );
      const latest = ordered[ordered.length - 1]!;
      latestByKey.set(encodedKey, latest);
      for (const entry of ordered) {
        const keep =
          entry === latest ||
          this.retiredSegmentManifests.has(entry.file.name) ||
          (this.segmentedManifestConsumers.get(entry.file.name) ?? 0) > 0;
        if (keep) {
          entry.manifest.segments.forEach((segment) =>
            referencedMembers.add(segment.fileName),
          );
          continue;
        }
        if (entry.file.exists) entry.file.delete();
        entry.manifest.segments.forEach((segment) => {
          const member = byName.get(segment.fileName);
          if (member?.exists) member.delete();
        });
        this.retiredSegmentManifests.delete(entry.file.name);
        changed = true;
      }
    });

    for (const file of files) {
      const memberMatch = SEGMENT_MEMBER_PATTERN.exec(file.name);
      const stageMatch = SEGMENT_STAGE_PATTERN.exec(file.name);
      const encodedKey = memberMatch?.[1] ?? stageMatch?.[1];
      if (!encodedKey || this.activeSegmentPublishFiles.has(file.name))
        continue;
      if (memberMatch && referencedMembers.has(file.name)) continue;
      if (file.exists) {
        file.delete();
        changed = true;
      }
    }
    if (changed) this.indexed = false;
    return latestByKey;
  }

  private indexedCacheEntries(): IndexedCacheEntry[] {
    const manifests = this.sweepSegmentArtifacts(true);
    const files = this.cacheFiles();
    const excluded = new Set<string>();
    const entries: IndexedCacheEntry[] = [];
    const segmentFilesByKey = new Map<string, File[]>();
    for (const file of files) {
      const manifestMatch = SEGMENT_MANIFEST_PATTERN.exec(file.name);
      const memberMatch = SEGMENT_MEMBER_PATTERN.exec(file.name);
      const encodedKey = manifestMatch?.[1] ?? memberMatch?.[1];
      if (!encodedKey) continue;
      const groupFiles = segmentFilesByKey.get(encodedKey) ?? [];
      groupFiles.push(file);
      segmentFilesByKey.set(encodedKey, groupFiles);
    }
    manifests.forEach((latest, encodedKey) => {
      const groupFiles = segmentFilesByKey.get(encodedKey) ?? [];
      groupFiles.forEach((file) => excluded.add(file.uri));
      const infos = groupFiles.map((file) => file.info());
      entries.push({
        id: latest.file.uri,
        size: infos.reduce((total, info) => total + (info.size ?? 0), 0),
        modifiedAt: infos.reduce(
          (latest, info) => Math.max(latest, info.modificationTime ?? 0),
          0,
        ),
        files: groupFiles,
      });
    });
    for (const file of files) {
      if (
        excluded.has(file.uri) ||
        SEGMENT_MEMBER_PATTERN.test(file.name) ||
        SEGMENT_STAGE_PATTERN.test(file.name) ||
        SEGMENT_MANIFEST_PATTERN.test(file.name)
      ) {
        continue;
      }
      const info = file.info();
      entries.push({
        id: file.uri,
        size: info.size ?? 0,
        modifiedAt: info.modificationTime ?? 0,
        files: [file],
      });
    }
    return entries;
  }

  private indexAndEnforcePolicy(protectedUri?: string): void {
    if (!this.cacheDir.exists) {
      this.latestSegmentManifests.clear();
      this.indexed = true;
      this.indexedBytes = 0;
      this.indexedEntries = 0;
      this.indexedPhysicalFiles = 0;
      return;
    }
    const indexedEntries = this.indexedCacheEntries();
    if (!this.policy) {
      this.latestSegmentManifests = this.sweepSegmentArtifacts();
      this.indexed = true;
      this.indexedBytes = 0;
      this.indexedEntries = 0;
      this.indexedPhysicalFiles = indexedEntries.reduce(
        (total, entry) => total + entry.files.length,
        0,
      );
      return;
    }
    const entries = indexedEntries.map(({ id, size, modifiedAt }) => ({
      id,
      size,
      modifiedAt,
    }));
    const consumerProtectedIds = new Set(
      indexedEntries
        .filter((entry) =>
          entry.files.some(
            (file) =>
              SEGMENT_MANIFEST_PATTERN.test(file.name) &&
              (this.segmentedManifestConsumers.get(file.name) ?? 0) > 0,
          ),
        )
        .map((entry) => entry.id),
    );
    const evictions = new Set(
      selectNativeBinaryCacheEvictions(
        entries,
        this.policy,
        Date.now(),
        protectedUri,
      ),
    );
    consumerProtectedIds.forEach((id) => evictions.delete(id));
    let retainedBytesForPolicy = indexedEntries
      .filter((entry) => !evictions.has(entry.id))
      .reduce((total, entry) => total + entry.size, 0);
    let retainedEntriesForPolicy = indexedEntries.filter(
      (entry) => !evictions.has(entry.id),
    ).length;
    const remainingPolicyCandidates = indexedEntries
      .filter(
        (entry) =>
          !evictions.has(entry.id) && !consumerProtectedIds.has(entry.id),
      )
      .sort((left, right) => {
        if (left.id === protectedUri && right.id !== protectedUri) return 1;
        if (right.id === protectedUri && left.id !== protectedUri) return -1;
        return left.modifiedAt - right.modifiedAt;
      });
    for (const entry of remainingPolicyCandidates) {
      if (
        retainedBytesForPolicy <= this.policy.maxBytes &&
        retainedEntriesForPolicy <= this.policy.maxEntries
      ) {
        break;
      }
      evictions.add(entry.id);
      retainedBytesForPolicy -= entry.size;
      retainedEntriesForPolicy -= 1;
    }
    let retainedPhysicalFiles = indexedEntries
      .filter((entry) => !evictions.has(entry.id))
      .reduce((total, entry) => total + entry.files.length, 0);
    const physicalPressureOrder = [
      ...indexedEntries.filter(
        (entry) =>
          !evictions.has(entry.id) &&
          !consumerProtectedIds.has(entry.id) &&
          entry.id !== protectedUri,
      ),
      ...indexedEntries.filter(
        (entry) =>
          !evictions.has(entry.id) &&
          !consumerProtectedIds.has(entry.id) &&
          entry.id === protectedUri,
      ),
    ].sort((left, right) => {
      if (left.id === protectedUri && right.id !== protectedUri) return 1;
      if (right.id === protectedUri && left.id !== protectedUri) return -1;
      return left.modifiedAt - right.modifiedAt;
    });
    for (const entry of physicalPressureOrder) {
      if (retainedPhysicalFiles <= MAX_CACHE_PHYSICAL_FILES) break;
      evictions.add(entry.id);
      retainedPhysicalFiles -= entry.files.length;
    }
    for (const entry of indexedEntries) {
      if (!evictions.has(entry.id)) continue;
      entry.files.forEach((file) => {
        if (file.exists) file.delete();
        this.retiredSegmentManifests.delete(file.name);
        this.segmentedManifestConsumers.delete(file.name);
      });
    }

    const retained = entries.filter((entry) => !evictions.has(entry.id));
    this.indexedBytes = retained.reduce(
      (total, entry) => total + entry.size,
      0,
    );
    this.indexedEntries = retained.length;
    this.indexedPhysicalFiles = indexedEntries
      .filter((entry) => !evictions.has(entry.id))
      .reduce((total, entry) => total + entry.files.length, 0);
    this.latestSegmentManifests = this.sweepSegmentArtifacts();
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

  retainSegmentedImageManifest(locatorUri: string): () => void {
    const prefix = `${this.cacheDir.uri.replace(/\/+$/, "")}/`;
    if (!locatorUri.startsWith(prefix)) return () => undefined;
    const fileName = locatorUri.slice(prefix.length);
    if (fileName.includes("/") || !SEGMENT_MANIFEST_PATTERN.test(fileName)) {
      return () => undefined;
    }
    this.segmentedManifestConsumers.set(
      fileName,
      (this.segmentedManifestConsumers.get(fileName) ?? 0) + 1,
    );
    let retained = true;
    return () => {
      if (!retained) return;
      retained = false;
      const next = (this.segmentedManifestConsumers.get(fileName) ?? 1) - 1;
      if (next <= 0) this.segmentedManifestConsumers.delete(fileName);
      else this.segmentedManifestConsumers.set(fileName, next);
    };
  }

  async getUri(key: string): Promise<string | null> {
    this.ensureIndexed();
    const encodedKey = encodeKey(key);
    let segmented = this.latestSegmentManifests.get(encodedKey);
    if (
      segmented &&
      (!segmented.file.exists ||
        segmented.manifest.segments.some((segment) => {
          const member = new File(this.cacheDir, segment.fileName);
          return (
            !member.exists || (member.info().size ?? 0) !== segment.byteLength
          );
        }))
    ) {
      // Repair is exceptional. Ordinary file/cover hits stay O(extension
      // count), while a missing member triggers one full validated re-index.
      this.indexed = false;
      this.ensureIndexed();
      segmented = this.latestSegmentManifests.get(encodedKey);
    }
    if (segmented) return segmented.file.uri;
    for (const ext of CACHE_EXTENSIONS) {
      const file = new File(this.cacheDir, `${encodedKey}.${ext}`);
      if (file.exists) return file.uri;
    }
    return null;
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    const uri = await this.getUri(key);
    if (!uri) return null;
    // A segment manifest is a typed image locator, never image/binary payload.
    if (SEGMENT_MANIFEST_PATTERN.test(new File(uri).name)) return null;
    return base64ToBytes(await new File(uri).base64());
  }

  async setBytes(
    key: string,
    bytes: Uint8Array,
    contentType?: string,
  ): Promise<string> {
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
        const encodedKey = encodeKey(key);
        this.removeSegmentArtifacts(encodedKey);
        this.ensureIndexed();
        const nextExtension = extensionForContentType(contentType);
        // Same key, different content type (e.g. a registry artifact switching
        // apk → zip) must not leave the old-extension file behind: getUri probes
        // extensions in a fixed order and would keep serving the stale bytes.
        for (const ext of CACHE_EXTENSIONS) {
          if (ext === nextExtension) continue;
          const stale = new File(this.cacheDir, `${encodedKey}.${ext}`);
          this.removeTrackedFile(stale);
        }
        const file = new File(this.cacheDir, `${encodedKey}.${nextExtension}`);
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
    const encodedKey = encodeKey(key);
    let nativeTemporaryUri: string | null = null;
    let nativeSegmentTemporaryUris: string[] = [];

    try {
      const result = await downloadMobileNativeHttpFile(
        {
          cookieScope: options.cookieScope,
          url,
          headers: options.headers ?? {},
          maxResponseBytes: options.maxBytes,
          requireHttps: options.requireHttps === true,
          maxImageDimension: options.maxImageDimension,
          maxImagePixels: options.maxImagePixels,
          ...(options.allowLongStripSegments === true
            ? { allowLongStripSegments: true }
            : {}),
        },
        options.signal,
      );
      if (result.kind === "segmented-image") {
        nativeSegmentTemporaryUris = result.imageSegments.map(
          (segment) => segment.fileUri,
        );
      } else {
        nativeTemporaryUri = result.fileUri;
      }
      if (options.signal?.aborted) {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      }
      this.assertCurrentWrite(writeLease);
      if (result.kind === "segmented-image") {
        if (
          !options.allowLongStripSegments ||
          result.byteLength > options.maxBytes ||
          (this.policy && result.byteLength > this.policy.maxEntryBytes)
        ) {
          throw new Error(
            "Segmented image cache entry exceeds its byte limit.",
          );
        }
        let aggregateBytes = 0;
        for (const segment of result.imageSegments) {
          const downloaded = new File(segment.fileUri);
          const size = downloaded.info().size ?? 0;
          if (
            !Number.isSafeInteger(size) ||
            size !== segment.byteLength ||
            segment.byteLength > options.maxBytes - aggregateBytes
          ) {
            throw new Error("Segmented image cache member is incomplete.");
          }
          aggregateBytes += segment.byteLength;
        }
        if (aggregateBytes !== result.byteLength) {
          throw new Error("Segmented image cache aggregate is inconsistent.");
        }

        return await this.mutationQueue.run(async () => {
          this.assertCurrentWrite(writeLease);
          const oldManifest =
            this.latestSegmentManifests.get(encodedKey) ?? null;
          let previousGeneration = oldManifest?.manifest.generation ?? null;
          let generation = "";
          let plannedMemberNames: string[] = [];
          // Preflight every immutable destination before moving any member.
          // This prevents same-ms/restart collisions from overwriting a valid
          // generation and makes cleanup incapable of deleting old content.
          for (let attempt = 0; attempt < 100; attempt += 1) {
            generation = nextNativeSegmentedImageGeneration({
              now: Date.now(),
              previousGeneration,
              epoch: writeLease.epoch,
              token: writeLease.token,
            });
            plannedMemberNames = result.imageSegments.map((segment, index) => {
              const memberExtension =
                segment.mimeType === "image/png" ? "png" : "jpg";
              return `${encodedKey}.segment-v1-${generation}-${index
                .toString()
                .padStart(2, "0")}.${memberExtension}`;
            });
            const stageCandidate = new File(
              this.cacheDir,
              `${encodedKey}.segments-stage-${generation}.part`,
            );
            const manifestCandidate = this.segmentManifestFile(
              encodedKey,
              generation,
            );
            if (
              !stageCandidate.exists &&
              !manifestCandidate.exists &&
              plannedMemberNames.every(
                (name) => !new File(this.cacheDir, name).exists,
              )
            ) {
              break;
            }
            previousGeneration = generation;
            generation = "";
          }
          if (!generation) {
            throw new Error(
              "Could not allocate a segmented image cache generation.",
            );
          }
          const newMemberNames: string[] = [];
          let successful = false;
          let stageManifestMoved = false;
          const stageManifestName =
            `${encodedKey}.segments-stage-${generation}.part`;
          const stageManifest = new File(
            this.cacheDir,
            stageManifestName,
          );
          this.activeSegmentPublishFiles.add(stageManifestName);
          try {
            const manifestSegments = [];
            for (
              let index = 0;
              index < result.imageSegments.length;
              index += 1
            ) {
              this.assertCurrentWrite(writeLease);
              if (options.signal?.aborted) {
                throw options.signal.reason instanceof Error
                  ? options.signal.reason
                  : new DOMException(
                      "The operation was aborted.",
                      "AbortError",
                    );
              }
              const segment = result.imageSegments[index]!;
              const fileName = plannedMemberNames[index]!;
              newMemberNames.push(fileName);
              this.activeSegmentPublishFiles.add(fileName);
              const destination = new File(this.cacheDir, fileName);
              await new File(segment.fileUri).move(destination);
              const publishedSize = destination.info().size ?? 0;
              if (publishedSize !== segment.byteLength) {
                throw new Error(
                  "Segmented image cache member changed during publish.",
                );
              }
              manifestSegments.push({
                fileName,
                byteLength: segment.byteLength,
                width: segment.width,
                height: segment.height,
                mimeType: segment.mimeType,
              });
            }
            const manifest: NativeSegmentedImageCacheManifest = {
              kind: "nemu-segmented-image",
              manifestVersion: 1,
              generation,
              byteLength: result.byteLength,
              width: result.imageWidth,
              height: result.imageHeight,
              segments: manifestSegments,
            };
            const serialized = JSON.stringify(manifest);
            if (
              serialized.length <= 0 ||
              serialized.length > SEGMENT_MANIFEST_MAX_BYTES
            ) {
              throw new Error(
                "Segmented image cache manifest exceeds its byte limit.",
              );
            }
            stageManifest.write(serialized);
            const manifestBytes = stageManifest.info().size ?? 0;
            if (
              manifestBytes <= 0 ||
              manifestBytes > SEGMENT_MANIFEST_MAX_BYTES ||
              (this.policy &&
                manifestBytes + result.byteLength > this.policy.maxEntryBytes)
            ) {
              throw new Error(
                "Segmented image cache entry exceeds its byte limit.",
              );
            }
            this.assertCurrentWrite(writeLease);
            if (options.signal?.aborted) {
              throw options.signal.reason instanceof Error
                ? options.signal.reason
                : new DOMException("The operation was aborted.", "AbortError");
            }
            const finalManifest = this.segmentManifestFile(
              encodedKey,
              generation,
            );
            if (finalManifest.exists) {
              throw new Error(
                "Segmented image cache generation already exists.",
              );
            }
            for (const [name, retired] of this.retiredSegmentManifests) {
              if (retired.encodedKey === encodedKey) {
                this.retiredSegmentManifests.delete(name);
              }
            }
            if (oldManifest) {
              this.retiredSegmentManifests.set(oldManifest.file.name, {
                encodedKey,
              });
            }
            this.activeSegmentPublishFiles.add(finalManifest.name);
            // Never overwrite a commit record: Expo's Android overwrite move
            // deletes the destination before rename. A unique manifest name
            // makes this final move atomic and crash-safe.
            await stageManifest.move(finalManifest);
            // Expo FileSystem updates the source File object's URI after a
            // successful move. From this point onward, only the immutable
            // staging name may identify the old path; deleting stageManifest
            // itself would delete the committed destination instead.
            stageManifestMoved = true;
            this.assertCurrentWrite(writeLease);
            // Readers keep immutable generation-scoped member URIs. Preserve
            // the previous generation for the rest of this app process so an
            // offscreen virtualized tile can remount hours later. On a fresh
            // launch the in-memory retirement set is empty and the startup
            // sweep removes every no-longer-referenced generation.
            for (const ext of CACHE_EXTENSIONS) {
              this.removeTrackedFile(
                new File(this.cacheDir, `${encodedKey}.${ext}`),
              );
            }
            this.activeSegmentPublishFiles.delete(stageManifestName);
            this.indexed = false;
            this.indexAndEnforcePolicy(finalManifest.uri);
            if (!finalManifest.exists) {
              throw new Error(
                "Segmented image cache entry could not be retained.",
              );
            }
            if (
              this.policy &&
              (this.indexedBytes > this.policy.maxBytes ||
                this.indexedEntries > this.policy.maxEntries ||
                this.indexedPhysicalFiles > MAX_CACHE_PHYSICAL_FILES)
            ) {
              throw new Error(
                "Segmented image cache cannot publish without evicting an active reader.",
              );
            }
            this.activeSegmentPublishFiles.delete(finalManifest.name);
            this.latestSegmentManifests = this.sweepSegmentArtifacts();
            if (
              this.latestSegmentManifests.get(encodedKey)?.file.uri !==
              finalManifest.uri
            ) {
              throw new Error(
                "Segmented image cache generation was not committed.",
              );
            }
            newMemberNames.forEach((name) =>
              this.activeSegmentPublishFiles.delete(name),
            );
            successful = true;
            nativeSegmentTemporaryUris = [];
            return finalManifest.uri;
          } finally {
            this.activeSegmentPublishFiles.delete(stageManifestName);
            newMemberNames.forEach((name) =>
              this.activeSegmentPublishFiles.delete(name),
            );
            this.activeSegmentPublishFiles.delete(
              this.segmentManifestFile(encodedKey, generation).name,
            );
            if (!stageManifestMoved) {
              const abandonedStageManifest = new File(
                this.cacheDir,
                stageManifestName,
              );
              if (abandonedStageManifest.exists) abandonedStageManifest.delete();
            }
            if (!successful) {
              newMemberNames.forEach((name) => {
                const member = new File(this.cacheDir, name);
                if (member.exists) member.delete();
              });
              const finalManifest = this.segmentManifestFile(
                encodedKey,
                generation,
              );
              if (finalManifest.exists) finalManifest.delete();
              this.latestSegmentManifests.delete(encodedKey);
              this.indexed = false;
            }
          }
        });
      }

      if (!nativeTemporaryUri) {
        throw new Error("Native HTTP file response is missing its owned file.");
      }
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
      const responseContentType = Object.entries(result.headers).find(
        ([name]) => name.toLowerCase() === "content-type",
      )?.[1];
      const extension = extensionForContentType(
        responseContentType ?? contentType,
      );
      const finalFile = new File(this.cacheDir, `${encodedKey}.${extension}`);

      return await this.mutationQueue.run(async () => {
        this.assertCurrentWrite(writeLease);
        for (const ext of CACHE_EXTENSIONS) {
          const stale = new File(this.cacheDir, `${encodedKey}.${ext}`);
          this.removeTrackedFile(stale);
        }
        await downloaded.move(finalFile, { overwrite: true });
        nativeTemporaryUri = null;
        if (!this.writeCoordinator.isCurrent(writeLease)) {
          // No other publish/delete can run inside this short critical section,
          // so this path can only remove the file moved by this stale lease.
          if (finalFile.exists) finalFile.delete();
          throw new Error(
            "The cache download was superseded by a newer write.",
          );
        }
        const replacedSegmentGroup = this.removeSegmentArtifacts(encodedKey);
        if (replacedSegmentGroup) {
          this.indexAndEnforcePolicy(finalFile.uri);
          if (!finalFile.exists) {
            throw new Error("Cache entry could not be retained.");
          }
        }
        if (this.policy && !replacedSegmentGroup) {
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
      for (const uri of nativeSegmentTemporaryUris) {
        try {
          const temporaryFile = new File(uri);
          if (temporaryFile.exists) temporaryFile.delete();
        } catch {
          // Best-effort cleanup for a response rejected after native publish.
        }
      }
    }
  }

  async remove(key: string): Promise<void> {
    this.writeCoordinator.invalidate(key);
    await this.mutationQueue.run(() => {
      if (!this.cacheDir.exists) return;
      const encodedKey = encodeKey(key);
      this.removeSegmentArtifacts(encodedKey);
      for (const ext of CACHE_EXTENSIONS) {
        const file = new File(this.cacheDir, `${encodedKey}.${ext}`);
        this.removeTrackedFile(file);
      }
      this.indexed = false;
      this.latestSegmentManifests.delete(encodedKey);
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
      this.indexedPhysicalFiles = 0;
      this.activeSegmentPublishFiles.clear();
      this.retiredSegmentManifests.clear();
      this.segmentedManifestConsumers.clear();
      this.latestSegmentManifests.clear();
    });
  }

  private assertCurrentWrite(lease: NativeCacheWriteLease): void {
    if (!this.writeCoordinator.isCurrent(lease)) {
      throw new Error("The cache download was superseded by a newer write.");
    }
  }
}
