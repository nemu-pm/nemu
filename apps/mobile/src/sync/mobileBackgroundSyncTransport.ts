import {
  createHttpsOnlyMobileAuthFetch,
  type MobileAuthHttpsNativeFetch,
} from "./mobileAuthSecureStorage";
import { MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES } from "@/sources/mobileNativeHttpLimits";

export const MOBILE_BACKGROUND_SYNC_NATIVE_RESPONSE_MAX_BYTES =
  MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES;

/**
 * Convex's headless client carries a bearer token, so it must use the same
 * redirect-aware HTTPS-only native boundary as Better Auth. The task-owned
 * signal intentionally supersedes per-request signals: expiration/sign-out
 * must abort every request created by this short-lived client together.
 */
export function createMobileBackgroundSyncFetch(
  nativeFetch: MobileAuthHttpsNativeFetch,
  taskSignal: AbortSignal,
): typeof globalThis.fetch {
  const httpsOnlyFetch = createHttpsOnlyMobileAuthFetch(
    nativeFetch,
    MOBILE_BACKGROUND_SYNC_NATIVE_RESPONSE_MAX_BYTES,
  );
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    httpsOnlyFetch(input, {
      ...init,
      signal: taskSignal,
    })) as typeof globalThis.fetch;
}
