import { sha256Bytes } from "@nemu/core";

export type MobileImageCacheKeySource = {
  uri?: string | null;
  headers?: Record<string, string>;
};

function stableHeaderTuples(
  headers?: Record<string, string>,
): Array<[string, string]> {
  if (!headers) return [];
  return Object.entries(headers)
    .map(([key, value]): [string, string] => [key.toLowerCase(), value])
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );
}

/**
 * Hashing is pure, but the reader asks for the same handful of identities on
 * every render — once per mounted page, plus once per chapter page whenever it
 * prunes image state — and this SHA-256 runs in plain JS on the UI thread. A
 * bounded memo keeps it to one digest per distinct identity. Insertion order is
 * the eviction order, and a hit is re-inserted so a chapter's live pages
 * outlive one-off lookups.
 */
const SHA256_MEMO_LIMIT = 512;
const sha256HexMemo = new Map<string, string>();

function sha256Hex(value: string): string {
  const memoized = sha256HexMemo.get(value);
  if (memoized !== undefined) {
    sha256HexMemo.delete(value);
    sha256HexMemo.set(value, memoized);
    return memoized;
  }
  const digest = Array.from(
    sha256Bytes(new TextEncoder().encode(value)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256HexMemo.size >= SHA256_MEMO_LIMIT) {
    const oldest = sha256HexMemo.keys().next().value;
    if (oldest !== undefined) sha256HexMemo.delete(oldest);
  }
  sha256HexMemo.set(value, digest);
  return digest;
}

/**
 * The profile scope remains an explicit prefix and the content portion uses a
 * full SHA-256 digest. A short non-cryptographic hash is not acceptable here:
 * a collision would make one account's private image file addressable by
 * another account before any network or metadata revalidation occurs.
 */
export function makeMobileImageCacheStorageKey(
  executionScope: string,
  source: MobileImageCacheKeySource,
  cacheKey?: string,
): string {
  const contentIdentity = JSON.stringify([
    // `cacheKey` is a pipeline/consumer discriminator, never a replacement
    // for content identity. Aidoku page ids commonly repeat between chapters;
    // omitting the URI could serve a different chapter's private image.
    source.uri ?? "",
    cacheKey ?? "",
    stableHeaderTuples(source.headers),
  ]);
  return `mobile-image:${executionScope}:${sha256Hex(contentIdentity)}`;
}
