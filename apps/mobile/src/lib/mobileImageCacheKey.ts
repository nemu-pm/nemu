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

function sha256Hex(value: string): string {
  return Array.from(sha256Bytes(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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
