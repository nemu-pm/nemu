/**
 * File-backed JSON cache for the mobile dual-reader plugin.
 *
 * Web persists dual-reader state in localStorage (session config) and IndexedDB
 * (dhash cache). Mobile has neither zustand nor AsyncStorage wired app-wide; the
 * established mobile pattern is the `expo-file-system` cache used by the
 * Japanese-learning TTS cache (`mobileJapaneseLearningTts.ts`). This module
 * mirrors that pattern so both the per-session config and the dhash cache live
 * as small JSON files under `Paths.cache`, with no SQLite migration and no new
 * dependency. The on-disk shape mirrors web's (`{ version: 3, hash }` for dhash,
 * the `DualReadPersistedConfig` object for config) so the schema stays in lock
 * step across platforms.
 *
 * The filesystem is injected so the pure logic is unit-testable without a native
 * build (tests pass a fake `DualReaderFileCacheBackend`).
 */
export type DualReaderFileCacheBackend = {
  /** Read a cached file's UTF-8 text, or return null if it does not exist. */
  readText(dir: string, fileName: string): Promise<string | null>;
  /** Write UTF-8 text to a file under `dir`, creating the directory if needed. */
  writeText(dir: string, fileName: string, text: string): Promise<void>;
  /** Remove a file if it exists. */
  remove(dir: string, fileName: string): Promise<void>;
  /**
   * List file metadata for bounded caches. Config-only test backends may omit
   * this; the native backend always provides it.
   */
  listFiles?(dir: string): Promise<DualReaderFileCacheEntry[]>;
};

export type DualReaderFileCacheEntry = {
  fileName: string;
  sizeBytes: number;
  modifiedAtMs: number;
};

export type BoundedJsonCachePolicy = {
  maxBytes: number;
  maxEntries: number;
  maxAgeMs: number;
  selectEvictions(
    entries: readonly DualReaderFileCacheEntry[],
    nowMs: number,
    protectedFileName: string,
  ): string[];
};

function encodeFileName(key: string): string {
  return `${encodeURIComponent(key).replace(/%/g, "_")}.json`;
}

let defaultBackend: DualReaderFileCacheBackend | null = null;
let defaultBackendPromise: Promise<DualReaderFileCacheBackend> | null = null;
let backendOverride: DualReaderFileCacheBackend | null = null;

type BoundedCacheIndex = {
  entries: Map<string, DualReaderFileCacheEntry>;
  totalBytes: number;
  oldestModifiedAtMs: number;
  oldestDirty: boolean;
};

const boundedCacheIndexes = new Map<string, BoundedCacheIndex>();
const directoryMutationTails = new Map<string, Promise<void>>();

/** Test hook: inject a fake backend. Pass null to restore the real one. */
export function setMobileDualReaderFileCacheBackend(
  backend: DualReaderFileCacheBackend | null,
): void {
  backendOverride = backend;
  // A backend swap represents a different filesystem (primarily in tests), so
  // never carry counters or serialized mutation tails across it.
  boundedCacheIndexes.clear();
  directoryMutationTails.clear();
}

async function getDefaultBackend(): Promise<DualReaderFileCacheBackend> {
  if (defaultBackend) return defaultBackend;
  if (!defaultBackendPromise) {
    // Lazy: only import expo-file-system when the real backend is actually
    // needed (never during unit tests, which inject a fake backend).
    defaultBackendPromise = (async () => {
      const { Directory, File, Paths } = await import("expo-file-system");
      const backend: DualReaderFileCacheBackend = {
        async readText(dir, fileName) {
          const directory = new Directory(Paths.cache, dir);
          if (!directory.exists) return null;
          const file = new File(directory, fileName);
          if (!file.exists) return null;
          return file.text();
        },
        async writeText(dir, fileName, text) {
          const directory = new Directory(Paths.cache, dir);
          if (!directory.exists) {
            directory.create({ intermediates: true });
          }
          const file = new File(directory, fileName);
          await file.write(text);
        },
        async remove(dir, fileName) {
          const directory = new Directory(Paths.cache, dir);
          if (!directory.exists) return;
          const file = new File(directory, fileName);
          if (file.exists) {
            file.delete();
          }
        },
        async listFiles(dir) {
          const directory = new Directory(Paths.cache, dir);
          if (!directory.exists) return [];
          return directory
            .list()
            .filter(
              (entry): entry is InstanceType<typeof File> =>
                entry instanceof File,
            )
            .map((file) => {
              const info = file.info();
              return {
                fileName: file.name,
                sizeBytes: info.size ?? 0,
                modifiedAtMs: info.modificationTime ?? 0,
              };
            });
        },
      };
      defaultBackend = backend;
      return backend;
    })();
  }
  return defaultBackendPromise;
}

async function getBackend(): Promise<DualReaderFileCacheBackend> {
  if (backendOverride) return backendOverride;
  return getDefaultBackend();
}

function safeSize(sizeBytes: number): number {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
}

function runDirectoryMutation<T>(
  dir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = directoryMutationTails.get(dir) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  directoryMutationTails.set(dir, tail);
  void tail.finally(() => {
    if (directoryMutationTails.get(dir) === tail) {
      directoryMutationTails.delete(dir);
    }
  });
  return result;
}

async function ensureBoundedCacheIndex(
  backend: DualReaderFileCacheBackend,
  dir: string,
): Promise<BoundedCacheIndex> {
  const existing = boundedCacheIndexes.get(dir);
  if (existing) return existing;
  if (!backend.listFiles) {
    throw new Error(
      "Bounded dual-reader cache backend does not support file listing.",
    );
  }

  const listed = await backend.listFiles(dir);
  const entries = new Map<string, DualReaderFileCacheEntry>();
  for (const entry of listed) {
    if (!entry.fileName.endsWith(".json")) continue;
    entries.set(entry.fileName, {
      fileName: entry.fileName,
      sizeBytes: safeSize(entry.sizeBytes),
      modifiedAtMs: entry.modifiedAtMs,
    });
  }
  const indexed: BoundedCacheIndex = {
    entries,
    totalBytes: [...entries.values()].reduce(
      (total, entry) => total + entry.sizeBytes,
      0,
    ),
    oldestModifiedAtMs: Number.POSITIVE_INFINITY,
    oldestDirty: true,
  };
  boundedCacheIndexes.set(dir, indexed);
  return indexed;
}

function getOldestModifiedAtMs(index: BoundedCacheIndex): number {
  if (!index.oldestDirty) return index.oldestModifiedAtMs;
  let oldest = Number.POSITIVE_INFINITY;
  for (const entry of index.entries.values()) {
    const modifiedAt = Number.isFinite(entry.modifiedAtMs)
      ? entry.modifiedAtMs
      : Number.NEGATIVE_INFINITY;
    oldest = Math.min(oldest, modifiedAt);
  }
  index.oldestModifiedAtMs = oldest;
  index.oldestDirty = false;
  return oldest;
}

function removeIndexedEntry(index: BoundedCacheIndex, fileName: string): void {
  const entry = index.entries.get(fileName);
  if (!entry) return;
  index.entries.delete(fileName);
  index.totalBytes = Math.max(0, index.totalBytes - entry.sizeBytes);
  if (entry.modifiedAtMs === index.oldestModifiedAtMs) {
    index.oldestDirty = true;
  }
}

function shouldEnforceBoundedPolicy(
  index: BoundedCacheIndex,
  policy: BoundedJsonCachePolicy,
  nowMs: number,
): boolean {
  if (
    index.totalBytes > policy.maxBytes ||
    index.entries.size > policy.maxEntries
  ) {
    return true;
  }
  const oldest = getOldestModifiedAtMs(index);
  return (
    oldest !== Number.POSITIVE_INFINITY && nowMs - oldest > policy.maxAgeMs
  );
}

export async function readJsonCache<T>(
  dir: string,
  key: string,
): Promise<T | null> {
  const backend = await getBackend();
  const text = await backend.readText(dir, encodeFileName(key));
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeJsonCache<T>(
  dir: string,
  key: string,
  value: T,
): Promise<void> {
  const backend = await getBackend();
  await backend.writeText(dir, encodeFileName(key), JSON.stringify(value));
}

/**
 * Write and bound a JSON cache directory without rescanning it on every hot
 * path write. The first write in a process indexes the directory once; later
 * writes update byte/entry counters and only sort the in-memory index after a
 * quota or age threshold is crossed.
 */
export async function writeBoundedJsonCache<T>(
  dir: string,
  key: string,
  value: T,
  policy: BoundedJsonCachePolicy,
  nowMs = Date.now(),
): Promise<void> {
  if (policy.maxBytes <= 0 || policy.maxEntries < 1 || policy.maxAgeMs <= 0) {
    throw new Error("Invalid bounded JSON cache policy.");
  }
  const backend = await getBackend();
  const fileName = encodeFileName(key);
  const text = JSON.stringify(value);
  const sizeBytes = new TextEncoder().encode(text).byteLength;

  await runDirectoryMutation(dir, async () => {
    const index = await ensureBoundedCacheIndex(backend, dir);
    await backend.writeText(dir, fileName, text);

    const previous = index.entries.get(fileName);
    if (previous) {
      index.totalBytes = Math.max(0, index.totalBytes - previous.sizeBytes);
      if (previous.modifiedAtMs === index.oldestModifiedAtMs) {
        index.oldestDirty = true;
      }
    }
    const nextEntry = { fileName, sizeBytes, modifiedAtMs: nowMs };
    index.entries.set(fileName, nextEntry);
    index.totalBytes += sizeBytes;
    if (!index.oldestDirty) {
      index.oldestModifiedAtMs = Math.min(index.oldestModifiedAtMs, nowMs);
    }

    if (!shouldEnforceBoundedPolicy(index, policy, nowMs)) return;
    const evictions = policy.selectEvictions(
      [...index.entries.values()],
      nowMs,
      fileName,
    );
    for (const evictedFileName of evictions) {
      try {
        await backend.remove(dir, evictedFileName);
        removeIndexedEntry(index, evictedFileName);
      } catch {
        // Cache cleanup is best-effort. Keep the failed entry indexed so the
        // next threshold crossing retries it instead of under-counting disk.
      }
    }
  });
}

export async function removeJsonCache(dir: string, key: string): Promise<void> {
  const backend = await getBackend();
  const fileName = encodeFileName(key);
  await runDirectoryMutation(dir, async () => {
    await backend.remove(dir, fileName);
    const index = boundedCacheIndexes.get(dir);
    if (index) removeIndexedEntry(index, fileName);
  });
}

/** Clear one cache namespace after all older writes have settled. */
export async function clearJsonCacheDirectory(dir: string): Promise<void> {
  const backend = await getBackend();
  await runDirectoryMutation(dir, async () => {
    try {
      if (!backend.listFiles) {
        throw new Error(
          "Dual-reader cache backend does not support directory clearing.",
        );
      }
      const entries = await backend.listFiles(dir);
      for (const entry of entries) {
        await backend.remove(dir, entry.fileName);
      }
    } finally {
      // Force the next write to rebuild counters from the post-clear directory,
      // including after a partial filesystem failure.
      boundedCacheIndexes.delete(dir);
    }
  });
}

/** Cache subdirectory names under `Paths.cache`. */
export const DUAL_READER_CONFIG_DIR = "nemu-dual-reader-config";
export const DUAL_READER_DHASH_DIR = "nemu-dual-reader-dhash";
