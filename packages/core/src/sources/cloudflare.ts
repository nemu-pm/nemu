/**
 * Shared Cloudflare / network error-detection primitives.
 *
 * The regexes and message patterns here were duplicated verbatim across the
 * web app (`src/lib/sources/error-handler.ts`) and the mobile app
 * (`apps/mobile/src/lib/mobileSourceErrors.ts`). This module exports only the
 * shared *primitives*; each app keeps its own gating wrapper so its existing
 * classification semantics are preserved byte-for-byte:
 *
 * - Web wraps these inside an `instanceof Error` gate (a non-Error string is
 *   never classified as Cloudflare).
 * - Mobile wraps these inside a lenient `errorMessage()` stringification (a
 *   plain string CAN be classified as Cloudflare).
 *
 * Hoisting mobile's lenient predicate to web (or vice-versa) would change
 * observable behavior, so the gate stays per-app. See the plan's
 * behavior-preservation contract.
 */

/**
 * True if a (raw, un-lowercased) message text matches a Cloudflare-block
 * pattern. Does NOT include the `CloudflareBlockedError` name check — each app
 * applies that in its own `instanceof Error`-aware wrapper.
 */
export function isCloudflareErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("cloudflare blocked") ||
    msg.includes("cloudflare challenge") ||
    msg.includes("cloudflare protection") ||
    (msg.includes("fetch image") && msg.includes("403"))
  );
}

/**
 * Read a `.url` property from an error-like object if present and stringy.
 * Used by both apps' CF-url extraction (the `CloudflareBlockedError` carries
 * its challenge url here).
 */
export function readErrorUrl(error: unknown): string | undefined {
  if (
    error !== null &&
    typeof error === "object" &&
    "url" in error &&
    typeof (error as { url: unknown }).url === "string"
  ) {
    return (error as { url: string }).url;
  }
  return undefined;
}

/**
 * Extract a Cloudflare challenge URL from a (raw) message string.
 * Tries the "... for https://..." form first, then the "blocked: https://..." form.
 */
export function extractCfUrlFromMessage(message: string): string | undefined {
  const challengeMatch = message.match(/for (https?:\/\/[^\s(]+)/);
  if (challengeMatch) return challengeMatch[1];

  const blockedMatch = message.match(/blocked[:\s]+(https?:\/\/[^\s]+)/i);
  return blockedMatch?.[1];
}

/**
 * True if an error looks like a generic network failure (not Cloudflare).
 * Mobile's `isMobileNetworkSourceError` is a re-export of this; the
 * RN/Hermes/WebAssembly "runtime unavailable" classification stays in a
 * separate, mobile-only predicate.
 */
export function isNetworkSourceError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("fetch") ||
    message.includes("network request failed") ||
    message.includes("networkerror") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}