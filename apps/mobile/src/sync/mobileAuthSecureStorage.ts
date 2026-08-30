import { sha256Bytes } from "@nemu/core";

export interface MobileAuthSecureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

export interface MutableMobileAuthSecureStorage extends MobileAuthSecureStorage {
  deleteItem(key: string): unknown;
}

export interface MobileAuthChunkCleanupStorage extends MobileAuthSecureStorage {
  recoverStaleChunks(): Promise<void>;
}

export type MobileAuthFetch = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => Promise<Response>;

export type MobileAuthHttpsNativeFetch = (
  input: string,
  init: RequestInit & {
    maxResponseBytes: number;
    requireHttps: true;
    responseMode: "text";
  },
) => Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
}>;

const BETTER_AUTH_CHUNK_MARKER = "\u0001ba-chunks:";
const MOBILE_AUTH_SECURE_ITEM_MAX_BYTES = 1_800;
const MOBILE_AUTH_MAX_CHUNKS = 64;
const MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS = 256;
const MOBILE_AUTH_NATIVE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const utf8Encoder = new TextEncoder();

type ChunkCleanupJournal = {
  v: 1;
  c: number;
  h: string;
};

function authStorageHash(value: string): string {
  return Array.from(sha256Bytes(utf8Encoder.encode(value)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function parseBetterAuthChunkCount(value: string | null): number | null {
  if (!value?.startsWith(BETTER_AUTH_CHUNK_MARKER)) return null;
  const count = Number(value.slice(BETTER_AUTH_CHUNK_MARKER.length));
  return Number.isSafeInteger(count) &&
    count >= 1 &&
    count <= MOBILE_AUTH_MAX_CHUNKS
    ? count
    : null;
}

function parseHighWater(value: string | null): number | "invalid" | null {
  if (value === null) return null;
  if (!/^[1-9][0-9]*$/.test(value)) return "invalid";
  const count = Number(value);
  return Number.isSafeInteger(count) && count <= MOBILE_AUTH_MAX_CHUNKS
    ? count
    : "invalid";
}

function parseCleanupJournal(value: string | null): ChunkCleanupJournal | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(",") !== "c,h,v"
  ) {
    return null;
  }
  const candidate = parsed as Partial<ChunkCleanupJournal>;
  return candidate.v === 1 &&
    Number.isSafeInteger(candidate.c) &&
    (candidate.c ?? 0) >= 1 &&
    (candidate.c ?? 0) <= MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS &&
    typeof candidate.h === "string" &&
    /^[a-f0-9]{64}$/.test(candidate.h)
    ? (candidate as ChunkCleanupJournal)
    : null;
}

function assertPortableAuthStorageValue(value: string): void {
  if (
    utf8Encoder.encode(value).byteLength > MOBILE_AUTH_SECURE_ITEM_MAX_BYTES
  ) {
    throw new TypeError(
      "Mobile auth SecureStore item exceeds the portable size limit.",
    );
  }
}

function isPortableAuthStorageValue(value: string): boolean {
  return (
    utf8Encoder.encode(value).byteLength <= MOBILE_AUTH_SECURE_ITEM_MAX_BYTES
  );
}

/**
 * Better Auth 1.6 chunks large Expo values but does not remove old `<key>.N`
 * items when a cookie/session cache later shrinks. This wrapper owns only the
 * two Better Auth base keys and keeps a non-secret high-water mark plus a
 * crash journal, allowing stale chunks to be securely deleted without ever
 * copying cookie contents into logs or metadata.
 */
export function createMobileAuthChunkCleanupStorage(
  storage: MutableMobileAuthSecureStorage,
  { storagePrefix }: { storagePrefix: string },
): MobileAuthChunkCleanupStorage {
  const normalizedStoragePrefix = storagePrefix.replace(/:/g, "_");
  if (
    !normalizedStoragePrefix ||
    !/^[A-Za-z0-9._-]+$/.test(normalizedStoragePrefix)
  ) {
    throw new TypeError("Invalid mobile auth storage prefix.");
  }
  const baseKeys = [
    `${normalizedStoragePrefix}_cookie`,
    `${normalizedStoragePrefix}_session_data`,
  ] as const;
  const baseKeySet = new Set<string>(baseKeys);
  const queues = new Map<string, Promise<unknown>>();

  const metadataKey = (baseKey: string) => `${baseKey}.__nemu_chunk_high_water`;
  const journalKey = (baseKey: string) => `${baseKey}.__nemu_chunk_cleanup`;
  const chunkKey = (baseKey: string, index: number) => `${baseKey}.${index}`;

  const enqueue = <T>(
    baseKey: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previous = queues.get(baseKey) ?? Promise.resolve();
    const task = previous.then(operation);
    queues.set(
      baseKey,
      task.catch(() => undefined),
    );
    return task;
  };

  const setRaw = async (key: string, value: string): Promise<void> => {
    assertPortableAuthStorageValue(value);
    await storage.setItem(key, value);
    if (storage.getItem(key) !== value) {
      throw new Error("Mobile auth SecureStore did not persist an item.");
    }
  };

  const deleteChunks = async (
    baseKey: string,
    start: number,
    end: number,
  ): Promise<void> => {
    for (let index = start; index < end; index += 1) {
      await storage.deleteItem(chunkKey(baseKey, index));
    }
  };

  const recoverBase = async (baseKey: string): Promise<void> => {
    let current = storage.getItem(baseKey);
    const rawJournal = storage.getItem(journalKey(baseKey));
    const journal = parseCleanupJournal(rawJournal);
    if (rawJournal !== null) {
      if (journal && authStorageHash(current ?? "") === journal.h) {
        // The replacement intent was durable but its base write did not reach
        // the commit point. Fail closed and delete the old chunks: restoring a
        // stale cookie after sign-out would be worse than requiring sign-in.
        await deleteChunks(baseKey, 0, journal.c);
        await storage.deleteItem(metadataKey(baseKey));
        await storage.deleteItem(journalKey(baseKey));
        await storage.deleteItem(baseKey);
      } else {
        const cleanupCount =
          journal?.c ?? MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS;
        await deleteChunks(baseKey, 0, cleanupCount);
        await storage.deleteItem(metadataKey(baseKey));
        await storage.deleteItem(journalKey(baseKey));
        if (!journal) await storage.deleteItem(baseKey);
      }
      current = storage.getItem(baseKey);
    }

    const activeCount = parseBetterAuthChunkCount(current);
    const rawHighWater = storage.getItem(metadataKey(baseKey));
    const highWater = parseHighWater(rawHighWater);
    if (
      (current?.startsWith(BETTER_AUTH_CHUNK_MARKER) && activeCount === null) ||
      (current !== null && !isPortableAuthStorageValue(current))
    ) {
      // Never let Better Auth consume an attacker/corruption-controlled count
      // and synchronously issue that many reads. Fail closed, scrub the entire
      // bounded namespace this wrapper could have created, and remove the base
      // marker so subsequent reads stay constant-time.
      await deleteChunks(baseKey, 0, MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS);
      await storage.deleteItem(metadataKey(baseKey));
      await storage.deleteItem(baseKey);
      return;
    }
    if (activeCount !== null) {
      const cleanupEnd =
        highWater === "invalid"
          ? MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS
          : Math.max(activeCount, highWater ?? activeCount);
      await deleteChunks(baseKey, activeCount, cleanupEnd);
      await setRaw(metadataKey(baseKey), String(activeCount));
      return;
    }

    const cleanupEnd =
      highWater === "invalid"
        ? MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS
        : (highWater ?? 0);
    await deleteChunks(baseKey, 0, cleanupEnd);
    if (rawHighWater !== null) {
      await storage.deleteItem(metadataKey(baseKey));
    }
  };

  const parseChunkKey = (
    key: string,
  ): { baseKey: string; index: number } | "invalid" | null => {
    for (const baseKey of baseKeys) {
      if (!key.startsWith(`${baseKey}.`)) continue;
      const suffix = key.slice(baseKey.length + 1);
      if (!/^(0|[1-9][0-9]*)$/.test(suffix)) return null;
      const index = Number(suffix);
      return Number.isSafeInteger(index) && index < MOBILE_AUTH_MAX_CHUNKS
        ? { baseKey, index }
        : "invalid";
    }
    return null;
  };

  return {
    getItem(key) {
      const value = storage.getItem(key);
      if (
        baseKeySet.has(key) &&
        value !== null &&
        (storage.getItem(journalKey(key)) !== null ||
          (value.startsWith(BETTER_AUTH_CHUNK_MARKER) &&
            parseBetterAuthChunkCount(value) === null) ||
          !isPortableAuthStorageValue(value))
      ) {
        // `storageAdapter.getItem` trusts this count and loops synchronously.
        // Queue bounded cleanup, but return signed-out immediately.
        void enqueue(key, () => recoverBase(key)).catch(() => undefined);
        return null;
      }
      return value;
    },
    setItem(key, value) {
      const chunk = parseChunkKey(key);
      if (chunk === "invalid") {
        return Promise.reject(
          new TypeError("Mobile auth chunk index exceeds the safety limit."),
        );
      }
      if (chunk) {
        return enqueue(chunk.baseKey, async () => {
          if (
            parseBetterAuthChunkCount(storage.getItem(chunk.baseKey)) !== null
          ) {
            throw new Error(
              "Refusing to overwrite an active mobile auth chunk.",
            );
          }
          const highWater = parseHighWater(
            storage.getItem(metadataKey(chunk.baseKey)),
          );
          const nextHighWater = Math.max(
            chunk.index + 1,
            highWater === "invalid"
              ? MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS
              : (highWater ?? 0),
          );
          await setRaw(metadataKey(chunk.baseKey), String(nextHighWater));
          await setRaw(key, value);
        });
      }
      if (!baseKeySet.has(key)) return setRaw(key, value);

      const baseKey = key;
      return enqueue(baseKey, async () => {
        const nextCount = parseBetterAuthChunkCount(value);
        if (value.startsWith(BETTER_AUTH_CHUNK_MARKER) && nextCount === null) {
          throw new TypeError("Invalid mobile auth chunk marker.");
        }
        if (nextCount !== null) {
          const highWater = parseHighWater(
            storage.getItem(metadataKey(baseKey)),
          );
          if (
            highWater !== "invalid" &&
            highWater !== null &&
            highWater < nextCount
          ) {
            throw new Error("Mobile auth chunks are incomplete.");
          }
          for (let index = 0; index < nextCount; index += 1) {
            const storedChunk = storage.getItem(chunkKey(baseKey, index));
            if (storedChunk === null) {
              throw new Error("Mobile auth chunks are incomplete.");
            }
            assertPortableAuthStorageValue(storedChunk);
          }
          await setRaw(baseKey, value);
          const cleanupEnd =
            highWater === "invalid"
              ? MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS
              : (highWater ?? nextCount);
          await deleteChunks(baseKey, nextCount, cleanupEnd);
          await setRaw(metadataKey(baseKey), String(nextCount));
          return;
        }

        await recoverBase(baseKey);
        assertPortableAuthStorageValue(value);
        const current = storage.getItem(baseKey);
        const activeCount = parseBetterAuthChunkCount(current);
        const highWater = parseHighWater(storage.getItem(metadataKey(baseKey)));
        const cleanupCount = Math.max(
          activeCount ?? 0,
          highWater === "invalid"
            ? MOBILE_AUTH_LEGACY_CLEANUP_MAX_CHUNKS
            : (highWater ?? 0),
        );
        if (cleanupCount > 0) {
          const journal: ChunkCleanupJournal = {
            v: 1,
            c: cleanupCount,
            h: authStorageHash(current ?? ""),
          };
          await setRaw(journalKey(baseKey), JSON.stringify(journal));
        }
        await setRaw(baseKey, value);
        if (cleanupCount > 0) {
          await deleteChunks(baseKey, 0, cleanupCount);
          await storage.deleteItem(metadataKey(baseKey));
          await storage.deleteItem(journalKey(baseKey));
        }
      });
    },
    async recoverStaleChunks() {
      await Promise.all(
        baseKeys.map((baseKey) => enqueue(baseKey, () => recoverBase(baseKey))),
      );
    },
  };
}

// React Native can leave fetch promises pending while the JS timer queue is
// paused in the background. If connectivity disappears during that window,
// the rejection may only surface when a headless task wakes the queue again.
// Normalize transport failures into an ordinary non-success response so every
// Better Auth caller receives its normal `{ data: null, error }` result. Keep
// this wrapper at the network boundary: parser and lifecycle-hook bugs must
// still throw rather than being silently classified as offline behavior.
export function createFailClosedMobileAuthFetch(
  fetchImpl: MobileAuthFetch = globalThis.fetch,
): MobileAuthFetch {
  return async (input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch {
      return new Response(
        JSON.stringify({
          code: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
          message: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
        }),
        {
          status: init?.signal?.aborted ? 499 : 503,
          statusText: init?.signal?.aborted
            ? "Request Cancelled"
            : "Service Unavailable",
          headers: { "content-type": "application/json" },
        },
      );
    }
  };
}

/**
 * Routes native authentication through Nemu's redirect-aware HTTPS transport.
 * Android's app-wide cleartext exception exists only for legacy source sites;
 * auth cookies, headers, and request bodies must never enter that path.
 */
export function createHttpsOnlyMobileAuthFetch(
  nativeFetch: MobileAuthHttpsNativeFetch,
  maxResponseBytes = MOBILE_AUTH_NATIVE_RESPONSE_MAX_BYTES,
): MobileAuthFetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.clone().text();
    const response = await nativeFetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      signal: request.signal,
      maxResponseBytes,
      requireHttps: true,
      responseMode: "text",
    });
    const responseBody = [204, 205, 304].includes(response.status)
      ? null
      : response.body;
    return new Response(responseBody, {
      status: response.status,
      headers: response.headers,
    });
  };
}

const logSecureStorageUnavailable = () => {
  // Do not include the key, value, or native error: authentication storage can
  // contain secrets and native error text is not needed to classify this state.
  console.info("[mobile-auth] secure_storage_unavailable");
};

export const MOBILE_AUTH_STORAGE_UNAVAILABLE =
  "MOBILE_AUTH_STORAGE_UNAVAILABLE";

export function isMobileAuthStorageUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === MOBILE_AUTH_STORAGE_UNAVAILABLE
  );
}

function mobileAuthStorageUnavailableError(): Error {
  // Never attach the key, value, native error, or a cause. This exception can
  // cross Better Auth and eventually become user-visible diagnostics.
  return new Error(MOBILE_AUTH_STORAGE_UNAVAILABLE);
}

/**
 * Better Auth reads SecureStore synchronously while the client module is being
 * initialized. Native keychain access can fail transiently (for example while
 * protected data is unavailable), and that must not crash the whole app.
 * Returning null fails closed as signed out; later reads may recover normally.
 * Writes are different: reporting success without persisting the cookie makes
 * sign-in/sign-out appear to work and then silently revert. Propagate one
 * stable sanitized error so the auth surface can offer a retry.
 */
export function createFailClosedMobileAuthStorage(
  storage: MobileAuthSecureStorage,
  onUnavailable: () => void = logSecureStorageUnavailable,
): MobileAuthSecureStorage {
  let hasWarned = false;

  const reportUnavailable = () => {
    if (hasWarned) return;
    hasWarned = true;
    onUnavailable();
  };

  return {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        reportUnavailable();
        return null;
      }
    },
    setItem(key, value) {
      try {
        const result = storage.setItem(key, value);
        if (
          result !== null &&
          typeof result === "object" &&
          "then" in result &&
          typeof result.then === "function"
        ) {
          return Promise.resolve(result).catch(() => {
            reportUnavailable();
            throw mobileAuthStorageUnavailableError();
          });
        }
        return result;
      } catch {
        reportUnavailable();
        throw mobileAuthStorageUnavailableError();
      }
    },
  };
}
