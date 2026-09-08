/**
 * The User-Agent the Aidoku runtime puts on every source request unless the
 * source package overrides it (`@nemu.pm/aidoku-runtime`'s `DEFAULT_USER_AGENT`).
 *
 * A Cloudflare clearance cookie is bound to the User-Agent that solved the
 * challenge, so the native solver's WebView has to present exactly the string
 * the follow-up source requests will send. Both native platforms carry the same
 * literal — `nemuAidokuDefaultUserAgent` in
 * `modules/nemu-aidoku/ios/NemuAidokuCloudflareSolver.swift` and
 * `NEMU_AIDOKU_DEFAULT_USER_AGENT` in
 * `modules/nemu-aidoku/runtime/kotlin/NemuCloudflareSolver.kt` — and use it
 * whenever `solveCloudflare` is called without an explicit `userAgent`.
 */
export const MOBILE_AIDOKU_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/**
 * Reads a `userAgent` off a source error without asserting a shape.
 * `CloudflareBlockedError` does not carry one today (it has `url` and `status`
 * only); a newer runtime is expected to add it, and this returns `undefined`
 * until then so the native default applies.
 */
export function readMobileCloudflareUserAgent(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("userAgent" in error)) return undefined;
  const candidate = (error as { userAgent: unknown }).userAgent;
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : undefined;
}
