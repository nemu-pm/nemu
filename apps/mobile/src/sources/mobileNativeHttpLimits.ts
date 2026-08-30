/**
 * Native responses cross the Expo bridge as strings/base64 and therefore need
 * a process-wide allocation ceiling even when a caller forgets a narrower
 * content-specific limit. Source packages and remote images override this.
 */
export const MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
