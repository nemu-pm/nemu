import { ConvexError } from "convex/values";

/**
 * Convex currently caps one document at 1 MiB and one array at 8,192 values.
 * Keep this legacy single-document settings shape comfortably below both
 * limits until installed sources can be normalized into independently paged
 * rows. The byte budget deliberately leaves half the document for Convex's
 * encoding overhead, system fields, and future settings fields.
 */
export const MAX_INSTALLED_SOURCE_RECORDS = 2_048;
export const MAX_INSTALLED_SOURCE_SERIALIZED_BYTES = 512 * 1024;
export const INSTALLED_SOURCE_SET_LIMIT_EXCEEDED =
  "SYNC_INSTALLED_SOURCE_SET_LIMIT_EXCEEDED";

export type InstalledSourceTombstoneIdentity = {
  id: string;
  registryId: string;
  version: number;
  updatedAt?: number;
  removed?: boolean;
};

export type InstalledSourceSetMetrics = {
  count: number;
  serializedBytes: number;
};

const utf8Encoder = new TextEncoder();

/** Mirrors Convex's encoded value-size model for the JSON-like values accepted
 * by the installed-source validator. Keeping this local avoids depending on
 * getConvexSize(), which is not exported by the Convex SDK version pinned by
 * this branch. */
function convexSerializedSize(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null || typeof value === "boolean") return 1;
  if (typeof value === "number" || typeof value === "bigint") return 9;
  if (typeof value === "string") {
    return 2 + utf8Encoder.encode(value).byteLength;
  }
  if (value instanceof ArrayBuffer) return 2 + value.byteLength;
  if (Array.isArray(value)) {
    return 2 + value.reduce(
      (total, item) => total + convexSerializedSize(item),
      0,
    );
  }
  if (typeof value === "object") {
    return 2 + Object.entries(value).reduce((total, [key, item]) => {
      if (item === undefined) return total;
      return (
        total +
        utf8Encoder.encode(key).byteLength +
        1 +
        convexSerializedSize(item)
      );
    }, 0);
  }
  throw new Error("Installed source contains an unsupported Convex value.");
}

export function measureInstalledSourceSet(
  sources: readonly unknown[],
): InstalledSourceSetMetrics {
  return {
    count: sources.length,
    serializedBytes: convexSerializedSize(sources),
  };
}

export function compactInstalledSourceTombstone<
  T extends InstalledSourceTombstoneIdentity,
>(source: T): T | InstalledSourceTombstoneIdentity {
  if (source.removed !== true) return source;
  return {
    id: source.id,
    registryId: source.registryId,
    version: source.version,
    ...(source.updatedAt === undefined ? {} : { updatedAt: source.updatedAt }),
    removed: true,
  };
}

function isWithinInstalledSourceSetLimits(
  metrics: InstalledSourceSetMetrics,
): boolean {
  return (
    metrics.count <= MAX_INSTALLED_SOURCE_RECORDS &&
    metrics.serializedBytes <= MAX_INSTALLED_SOURCE_SERIALIZED_BYTES
  );
}

/**
 * Reject growth beyond the hard limits before Convex rejects the whole
 * document write. A legacy account that is already over either limit may still
 * replay an idempotent write or make a non-growing change, which keeps stale
 * retries harmless and lets compact tombstones drain oversized documents.
 */
export function assertInstalledSourceSetAdmission(
  currentSources: readonly unknown[],
  proposedSources: readonly unknown[],
): void {
  const proposed = measureInstalledSourceSet(proposedSources);
  if (isWithinInstalledSourceSetLimits(proposed)) return;

  const current = measureInstalledSourceSet(currentSources);
  if (
    proposed.count <= current.count &&
    proposed.serializedBytes <= current.serializedBytes
  ) {
    return;
  }

  throw new ConvexError({
    code: INSTALLED_SOURCE_SET_LIMIT_EXCEEDED,
    count: proposed.count,
    maximumCount: MAX_INSTALLED_SOURCE_RECORDS,
    maximumSerializedBytes: MAX_INSTALLED_SOURCE_SERIALIZED_BYTES,
    serializedBytes: proposed.serializedBytes,
  });
}
