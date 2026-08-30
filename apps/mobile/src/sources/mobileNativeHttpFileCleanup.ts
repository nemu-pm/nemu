const MAX_NATIVE_SEGMENT_CLEANUP_SCAN = 128;

/**
 * A malformed native response must not strand already-published temporary
 * members merely because its count exceeds the accepted 32-tile contract.
 * Bound the defensive scan independently so hostile bridge data cannot turn
 * cleanup itself into unbounded work.
 */
export function collectNativeSegmentTemporaryUrisForCleanup(
  rawSegments: unknown,
  isOwned: (uri: string) => boolean,
): string[] {
  if (!Array.isArray(rawSegments)) return [];
  const uris: string[] = [];
  const seen = new Set<string>();
  const scanCount = Math.min(
    rawSegments.length,
    MAX_NATIVE_SEGMENT_CLEANUP_SCAN,
  );
  for (let index = 0; index < scanCount; index += 1) {
    const segment = rawSegments[index];
    if (!segment || typeof segment !== "object") continue;
    let rawUri: unknown;
    try {
      rawUri = (segment as { fileUri?: unknown }).fileUri;
    } catch {
      // Defensive bridge cleanup must keep scanning even if malformed mocked
      // data exposes a throwing accessor or revoked Proxy.
      continue;
    }
    if (typeof rawUri !== "string") continue;
    const uri = rawUri.trim();
    if (!uri || seen.has(uri) || !isOwned(uri)) continue;
    seen.add(uri);
    uris.push(uri);
  }
  return uris;
}
