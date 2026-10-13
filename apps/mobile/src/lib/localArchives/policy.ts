export const LOCAL_ARCHIVE_REGISTRY_ID = "local-archive";
export const LOCAL_ARCHIVE_SOURCE_ID = "local";
export const LOCAL_ARCHIVE_DIRECTORY_NAME = "local-archives";
/** Persisted image references (covers) use this scheme; paths are resolved at runtime. */
export const LOCAL_ARCHIVE_URI_SCHEME = "nemu-local";

export const LOCAL_ARCHIVE_LIMITS = {
  maxArchiveBytes: 2 * 1024 ** 3,
  maxEntries: 20_000,
  maxPages: 4_000,
  maxPageBytes: 128 * 1024 ** 2,
  maxTotalUncompressedBytes: 4 * 1024 ** 3,
  maxCompressionRatio: 200,
  maxPathLength: 512,
} as const;

export type LocalArchiveLimits = {
  [K in keyof typeof LOCAL_ARCHIVE_LIMITS]: number;
};

export const LOCAL_ARCHIVE_PAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"] as const;

export class LocalArchiveError extends Error {
  constructor(
    readonly code:
      | "unsafe-path"
      | "too-many-entries"
      | "too-many-pages"
      | "page-too-large"
      | "archive-too-large"
      | "total-too-large"
      | "compression-ratio"
      | "no-pages"
      | "corrupt"
      | "aborted",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LocalArchiveError";
  }
}

/** Guard for cache-clearing code: imported books live outside any cache. */
export function isLocalArchivePath(path: string): boolean {
  return path.includes(`/${LOCAL_ARCHIVE_DIRECTORY_NAME}/`) || path.endsWith(`/${LOCAL_ARCHIVE_DIRECTORY_NAME}`);
}

export function assertNotLocalArchivePath(path: string): void {
  if (isLocalArchivePath(path)) {
    throw new Error("Refusing to clear a local archive path as cache.");
  }
}
