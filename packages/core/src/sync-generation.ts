export type SyncGenerationSnapshot = {
  generation: number;
};

export type SyncGenerationDecision =
  | "initialize"
  | "current"
  | "reset"
  | "stale";

export const SYNC_SNAPSHOT_TOTAL_ROW_LIMIT = 50_000;
export const SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT = 40_000;
export const SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT = 16 * 1024 * 1024;
export const SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT = 12 * 1024 * 1024;

// Snapshot rows are retained as JavaScript objects, not raw UTF-8. Charge twice
// their JSON UTF-8 representation plus a small per-row framing allowance. The
// row-count budget separately covers object-heavy records whose JSON is tiny.
const SYNC_SNAPSHOT_JSON_MEMORY_SAFETY_FACTOR = 2;
const SYNC_SNAPSHOT_ROW_ESTIMATED_OVERHEAD_BYTES = 64;
// Convex pagination results are immutable snapshots. Cache successful row
// measurements by identity so loading N pages does not re-walk the first N-1
// pages on every React subscription update.
const syncSnapshotRowEstimateCache = new WeakMap<object, number>();

export const SYNC_SNAPSHOT_RESOURCE_KEYS = [
  "libraryItems",
  "sourceLinks",
  "collections",
  "collectionItems",
  "chapterProgress",
  "mangaProgress",
  "settings",
] as const;

export type SyncSnapshotResourceKey =
  (typeof SYNC_SNAPSHOT_RESOURCE_KEYS)[number];

export type SyncSnapshotPaginationResource = {
  key: SyncSnapshotResourceKey;
  rowCount: number;
  estimatedBytes: number;
  status: string;
};

export type SyncSnapshotPaginationPlan =
  | { status: "complete"; totalRows: number; totalEstimatedBytes: number }
  | {
      status: "load-more";
      key: SyncSnapshotResourceKey;
      numItems: number;
      totalRows: number;
      totalEstimatedBytes: number;
    }
  | {
      status: "budget-exceeded";
      key: SyncSnapshotResourceKey | "total";
      totalRows: number;
      totalEstimatedBytes: number;
    };

export type SyncSnapshotPageItem<T> =
  | { kind: "generation"; generation: number }
  | { kind: "row"; generation: number; row: T };

export function countSyncSnapshotRows<T>(
  items: readonly SyncSnapshotPageItem<T>[],
): number {
  let count = 0;
  for (const item of items) {
    if (item.kind === "row") count += 1;
  }
  return count;
}

function cappedAdd(total: number, amount: number, limit: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) return limit + 1;
  const next = total + amount;
  return Number.isSafeInteger(next) && next <= limit ? next : limit + 1;
}

/** Exact UTF-8 byte length of a JSON string literal, without allocating the
 * encoded string. Lone surrogates are charged as their six-byte `\\uXXXX`
 * well-formed JSON escape. */
function jsonStringUtf8ByteLength(value: string, limit: number): number {
  let bytes = 2;
  if (bytes > limit) return limit + 1;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    let nextBytes: number;
    if (code === 0x22 || code === 0x5c) {
      nextBytes = 2;
    } else if (code <= 0x1f) {
      nextBytes =
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d
          ? 2
          : 6;
    } else if (code <= 0x7f) {
      nextBytes = 1;
    } else if (code <= 0x7ff) {
      nextBytes = 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (following >= 0xdc00 && following <= 0xdfff) {
        nextBytes = 4;
        index += 1;
      } else {
        nextBytes = 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      nextBytes = 6;
    } else {
      nextBytes = 3;
    }
    bytes = cappedAdd(bytes, nextBytes, limit);
    if (bytes > limit) return bytes;
  }
  return bytes;
}

function isJsonOmittedValue(value: unknown): boolean {
  return (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  );
}

/** Deterministic JSON UTF-8 measurement for the plain values returned by
 * Convex. Unsupported prototypes, bigint values, accessors that throw, and
 * cycles return over-budget so snapshot consumers fail closed. */
function jsonValueUtf8ByteLength(
  value: unknown,
  limit: number,
  ancestors: Set<object>,
): number {
  if (value === null) return 4;
  if (typeof value === "string") return jsonStringUtf8ByteLength(value, limit);
  if (typeof value === "boolean") return value ? 4 : 5;
  if (typeof value === "number") {
    const serialized = Number.isFinite(value)
      ? Object.is(value, -0)
        ? "0"
        : String(value)
      : "null";
    return serialized.length <= limit ? serialized.length : limit + 1;
  }
  if (typeof value !== "object" || isJsonOmittedValue(value)) return limit + 1;

  const object = value as object;
  if (ancestors.has(object)) return limit + 1;
  ancestors.add(object);
  try {
    if (Array.isArray(value)) {
      let bytes = 2;
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) bytes = cappedAdd(bytes, 1, limit);
        if (bytes > limit) return bytes;
        const item = value[index];
        const itemBytes = isJsonOmittedValue(item)
          ? 4
          : jsonValueUtf8ByteLength(item, limit - bytes, ancestors);
        bytes = cappedAdd(bytes, itemBytes, limit);
        if (bytes > limit) return bytes;
      }
      return bytes;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return limit + 1;
    if (
      "toJSON" in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).toJSON === "function"
    ) {
      return limit + 1;
    }

    let bytes = 2;
    let serializedProperties = 0;
    for (const key of Object.keys(value)) {
      const propertyValue = (value as Record<string, unknown>)[key];
      if (isJsonOmittedValue(propertyValue)) continue;
      if (serializedProperties > 0) bytes = cappedAdd(bytes, 1, limit);
      if (bytes > limit) return bytes;
      const keyBytes = jsonStringUtf8ByteLength(key, limit - bytes);
      bytes = cappedAdd(bytes, keyBytes, limit);
      bytes = cappedAdd(bytes, 1, limit);
      if (bytes > limit) return bytes;
      const propertyBytes = jsonValueUtf8ByteLength(
        propertyValue,
        limit - bytes,
        ancestors,
      );
      bytes = cappedAdd(bytes, propertyBytes, limit);
      if (bytes > limit) return bytes;
      serializedProperties += 1;
    }
    return bytes;
  } finally {
    ancestors.delete(object);
  }
}

export function estimateSyncSnapshotRowBytes(
  row: unknown,
  maxEstimatedBytes = SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
): number {
  if (!Number.isSafeInteger(maxEstimatedBytes) || maxEstimatedBytes < 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (maxEstimatedBytes < SYNC_SNAPSHOT_ROW_ESTIMATED_OVERHEAD_BYTES) {
    return maxEstimatedBytes + 1;
  }
  if (typeof row === "object" && row !== null) {
    const cached = syncSnapshotRowEstimateCache.get(row);
    if (cached !== undefined) {
      return cached <= maxEstimatedBytes ? cached : maxEstimatedBytes + 1;
    }
  }
  const jsonLimit = Math.floor(
    (maxEstimatedBytes - SYNC_SNAPSHOT_ROW_ESTIMATED_OVERHEAD_BYTES) /
      SYNC_SNAPSHOT_JSON_MEMORY_SAFETY_FACTOR,
  );
  try {
    const jsonBytes = jsonValueUtf8ByteLength(row, jsonLimit, new Set());
    if (jsonBytes > jsonLimit) return maxEstimatedBytes + 1;
    const estimatedBytes =
      SYNC_SNAPSHOT_ROW_ESTIMATED_OVERHEAD_BYTES +
      jsonBytes * SYNC_SNAPSHOT_JSON_MEMORY_SAFETY_FACTOR;
    if (typeof row === "object" && row !== null) {
      syncSnapshotRowEstimateCache.set(row, estimatedBytes);
    }
    return estimatedBytes;
  } catch {
    return maxEstimatedBytes + 1;
  }
}

export function measureSyncSnapshotRows<T>(
  items: readonly SyncSnapshotPageItem<T>[],
  maxEstimatedBytes = SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
): { rowCount: number; estimatedBytes: number } {
  let rowCount = 0;
  let estimatedBytes = 0;
  let byteLimitExceeded = false;
  for (const item of items) {
    if (item.kind !== "row") continue;
    rowCount += 1;
    if (byteLimitExceeded) continue;
    const remaining = maxEstimatedBytes - estimatedBytes;
    const rowBytes = estimateSyncSnapshotRowBytes(item.row, remaining);
    if (rowBytes > remaining) {
      estimatedBytes = maxEstimatedBytes + 1;
      byteLimitExceeded = true;
    } else {
      estimatedBytes += rowBytes;
    }
  }
  return { rowCount, estimatedBytes };
}

/**
 * Load one resource page at a time. Serial planning keeps seven React
 * subscriptions from collectively reserving more than the shared budget in a
 * single render. Hitting a limit is valid only when every affected resource is
 * already exhausted; `CanLoadMore` at the limit means the snapshot is unsafe.
 */
export function planSyncSnapshotPagination(
  resources: readonly SyncSnapshotPaginationResource[],
  pageSize = 128,
): SyncSnapshotPaginationPlan {
  const totalRows = resources.reduce((total, resource) => {
    return total + Math.max(0, Math.floor(resource.rowCount));
  }, 0);
  const totalEstimatedBytes = resources.reduce((total, resource) => {
    return total + Math.max(0, Math.floor(resource.estimatedBytes));
  }, 0);
  const invalidResource = resources.find(
    (resource) =>
      !Number.isSafeInteger(resource.rowCount) ||
      resource.rowCount < 0 ||
      resource.rowCount > SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT ||
      !Number.isSafeInteger(resource.estimatedBytes) ||
      resource.estimatedBytes < 0 ||
      resource.estimatedBytes > SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT,
  );
  if (invalidResource) {
    return {
      status: "budget-exceeded",
      key: invalidResource.key,
      totalRows,
      totalEstimatedBytes,
    };
  }
  if (
    !Number.isSafeInteger(totalRows) ||
    totalRows > SYNC_SNAPSHOT_TOTAL_ROW_LIMIT ||
    !Number.isSafeInteger(totalEstimatedBytes) ||
    totalEstimatedBytes > SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT
  ) {
    return {
      status: "budget-exceeded",
      key: "total",
      totalRows,
      totalEstimatedBytes,
    };
  }

  const pending = resources.find(
    (resource) => resource.status === "CanLoadMore",
  );
  if (!pending) return { status: "complete", totalRows, totalEstimatedBytes };

  const resourceRemaining = SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT - pending.rowCount;
  const totalRemaining = SYNC_SNAPSHOT_TOTAL_ROW_LIMIT - totalRows;
  const resourceByteRemaining =
    SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT - pending.estimatedBytes;
  const totalByteRemaining =
    SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT - totalEstimatedBytes;
  const requestedPageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 128;
  const numItems = Math.min(
    requestedPageSize,
    resourceRemaining,
    totalRemaining,
  );
  if (numItems <= 0 || resourceByteRemaining <= 0 || totalByteRemaining <= 0) {
    return {
      status: "budget-exceeded",
      key:
        resourceRemaining <= 0 || resourceByteRemaining <= 0
          ? pending.key
          : "total",
      totalRows,
      totalEstimatedBytes,
    };
  }
  return {
    status: "load-more",
    key: pending.key,
    numItems,
    totalRows,
    totalEstimatedBytes,
  };
}

/** Every database page carries a generation sentinel, including empty pages.
 * This lets React's flattened paginated-query result detect a reset race even
 * though it intentionally hides page-level response metadata. */
export function decodeSyncSnapshotPage<T>(
  items: readonly SyncSnapshotPageItem<T>[],
  expectedGeneration: number,
): T[] | null {
  if (
    items.length === 0 ||
    !items.some((item) => item.kind === "generation") ||
    items.some((item) => item.generation !== expectedGeneration)
  ) {
    return null;
  }
  return items.flatMap((item) => (item.kind === "row" ? [item.row] : []));
}

export function completeSyncSnapshot<T>(
  items: readonly SyncSnapshotPageItem<T>[],
  expectedGeneration: number,
  paginationStatus: string,
): T[] | null {
  if (paginationStatus !== "Exhausted") return null;
  return decodeSyncSnapshotPage(items, expectedGeneration);
}

/** Canonicalize duplicates only after every page has been assembled. Doing it
 * page-by-page is incorrect because equal logical keys can straddle cursors. */
export function canonicalizeSyncSnapshotRecords<
  T extends { updatedAt?: number },
>(
  records: readonly T[],
  keyOf: (record: T) => string,
  isRemoved: (record: T) => boolean = () => false,
): T[] {
  const canonical = new Map<string, T>();
  for (const record of records) {
    const key = keyOf(record);
    const current = canonical.get(key);
    if (
      !current ||
      (record.updatedAt ?? 0) > (current.updatedAt ?? 0) ||
      ((record.updatedAt ?? 0) === (current.updatedAt ?? 0) &&
        isRemoved(record) &&
        !isRemoved(current))
    ) {
      canonical.set(key, record);
    }
  }
  return [...canonical.values()];
}

export type SyncSnapshotPage<T> = {
  generation: number;
  page: SyncSnapshotPageItem<T>[];
  continueCursor: string;
  isDone: boolean;
};

export type SyncSnapshotSharedBudget = {
  usedRows: number;
  usedEstimatedBytes: number;
};

export type BoundedSyncSnapshotFetchResult<T> =
  | { status: "complete"; rows: T[] }
  | { status: "generation-changed" }
  | { status: "budget-exceeded" };

/** A bounded one-shot page collector for headless/background clients. */
export async function fetchBoundedSyncSnapshotPages<T>(
  generation: number,
  fetchPage: (paginationOpts: {
    numItems: number;
    cursor: string | null;
  }) => Promise<SyncSnapshotPage<T>>,
  sharedBudget: SyncSnapshotSharedBudget,
  pageSize = 128,
): Promise<BoundedSyncSnapshotFetchResult<T>> {
  const rows: T[] = [];
  let resourceEstimatedBytes = 0;
  let cursor: string | null = null;
  do {
    const resourceRemaining = SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT - rows.length;
    const totalRemaining =
      SYNC_SNAPSHOT_TOTAL_ROW_LIMIT - sharedBudget.usedRows;
    const resourceByteRemaining =
      SYNC_SNAPSHOT_RESOURCE_ESTIMATED_BYTE_LIMIT - resourceEstimatedBytes;
    const totalByteRemaining =
      SYNC_SNAPSHOT_TOTAL_ESTIMATED_BYTE_LIMIT -
      sharedBudget.usedEstimatedBytes;
    const numItems = Math.min(pageSize, resourceRemaining, totalRemaining);
    if (
      !Number.isSafeInteger(sharedBudget.usedRows) ||
      sharedBudget.usedRows < 0 ||
      !Number.isSafeInteger(sharedBudget.usedEstimatedBytes) ||
      sharedBudget.usedEstimatedBytes < 0 ||
      numItems <= 0 ||
      resourceByteRemaining <= 0 ||
      totalByteRemaining <= 0
    ) {
      return { status: "budget-exceeded" };
    }

    const result = await fetchPage({ numItems, cursor });
    if (result.generation !== generation) {
      return { status: "generation-changed" };
    }
    const page = decodeSyncSnapshotPage(result.page, generation);
    if (page === null) return { status: "generation-changed" };
    const pageMeasurement = measureSyncSnapshotRows(
      result.page,
      Math.min(resourceByteRemaining, totalByteRemaining),
    );
    if (
      page.length > numItems ||
      pageMeasurement.rowCount !== page.length ||
      rows.length + page.length > SYNC_SNAPSHOT_RESOURCE_ROW_LIMIT ||
      sharedBudget.usedRows + page.length > SYNC_SNAPSHOT_TOTAL_ROW_LIMIT ||
      pageMeasurement.estimatedBytes > resourceByteRemaining ||
      pageMeasurement.estimatedBytes > totalByteRemaining
    ) {
      return { status: "budget-exceeded" };
    }
    rows.push(...page);
    sharedBudget.usedRows += page.length;
    resourceEstimatedBytes += pageMeasurement.estimatedBytes;
    sharedBudget.usedEstimatedBytes += pageMeasurement.estimatedBytes;
    if (result.isDone) return { status: "complete", rows };
    if (!result.continueCursor || result.continueCursor === cursor) {
      return { status: "generation-changed" };
    }
    cursor = result.continueCursor;
  } while (cursor !== null);
  return { status: "generation-changed" };
}

/** One-shot clients (background sync/import checks) fetch every page before
 * exposing rows. Any generation change aborts the bundle so the caller can
 * restart all seven resources from page one. */
export async function fetchAllSyncSnapshotPages<T>(
  generation: number,
  fetchPage: (paginationOpts: {
    numItems: number;
    cursor: string | null;
  }) => Promise<SyncSnapshotPage<T>>,
  pageSize = 128,
): Promise<T[] | null> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const result = await fetchPage({ numItems: pageSize, cursor });
    if (result.generation !== generation) return null;
    const page = decodeSyncSnapshotPage(result.page, generation);
    if (page === null) return null;
    rows.push(...page);
    if (result.isDone) return rows;
    if (!result.continueCursor || result.continueCursor === cursor) return null;
    cursor = result.continueCursor;
  } while (cursor !== null);
  return null;
}

/**
 * A multi-table snapshot is safe to consume only when every transactional
 * response is present and belongs to the exact same account generation.
 */
export function consistentSyncGeneration(
  ...snapshots: Array<SyncGenerationSnapshot | null | undefined>
): number | null {
  if (
    snapshots.length === 0 ||
    snapshots.some((snapshot) => snapshot == null)
  ) {
    return null;
  }
  const generation = snapshots[0]!.generation;
  if (!Number.isSafeInteger(generation) || generation < 0) return null;
  return snapshots.every((snapshot) => snapshot!.generation === generation)
    ? generation
    : null;
}

/**
 * Persisted generations are monotonic. A delayed response from an older
 * generation must never roll local state back after a reset was accepted.
 */
export function decideSyncGeneration(
  storedGeneration: number | null,
  incomingGeneration: number,
): SyncGenerationDecision {
  if (!Number.isSafeInteger(incomingGeneration) || incomingGeneration < 0) {
    return "stale";
  }
  if (storedGeneration == null) {
    return incomingGeneration === 0 ? "initialize" : "reset";
  }
  if (incomingGeneration < storedGeneration) return "stale";
  if (incomingGeneration === storedGeneration) return "current";
  return "reset";
}
