import type { SourcePackageSetting } from "@/data/schema";
import {
  LOGIN_CODE_VERIFIER_SUFFIX,
  buildOAuthTokenExchangeBody,
  extractAuthorizationCode,
  generateCodeVerifier,
  hasOAuthTokenPayload,
  isLikelyOAuthCallbackValue,
  resolveLoginActionUrl,
  withPkce,
} from "@nemu/core";

export const MOBILE_SOURCE_OAUTH_MAX_ENDPOINT_CHARS = 8_192;
export const MOBILE_SOURCE_OAUTH_STORED_VALUE_MAX_BYTES = 64 * 1024;

/**
 * A source `login` setting narrowed with the OAuth fields the Aidoku runtime
 * emits at runtime but that the loose {@link SourcePackageSetting} type doesn't
 * declare. See `src/lib/settings/types.ts` (`LoginSetting`) for the web side —
 * the runtime JSON shape is identical on both platforms.
 */
export type MobileSourceLoginSetting = SourcePackageSetting & {
  type: "login";
  method?: "basic" | "web" | "oauth";
  logoutTitle?: string;
  url?: string;
  urlKey?: string;
  tokenUrl?: string;
  callbackScheme?: string;
  pkce?: boolean;
  useEmail?: boolean;
};

/** True if a source setting is a login row (rendered as Log in / Log out). */
export function isMobileSourceLoginSetting(
  setting: SourcePackageSetting,
): setting is MobileSourceLoginSetting {
  return setting.type === "login";
}

/** Storage key for a login setting's PKCE code verifier (mirrors web). */
export function mobileSourceLoginVerifierKey(settingKey: string): string {
  return `${settingKey}${LOGIN_CODE_VERIFIER_SUFFIX}`;
}

/** Whether a login setting already has a stored credential (logged in). */
export function isMobileSourceLoggedIn(
  setting: MobileSourceLoginSetting,
  values: Record<string, unknown>,
): boolean {
  const value = values[setting.key];
  return typeof value === "string" && value.length > 0;
}

export function mobileSourceLoginMethod(
  setting: MobileSourceLoginSetting,
): NonNullable<MobileSourceLoginSetting["method"]> {
  return setting.method ?? "basic";
}

export function canRunMobileSourceLoginMethod(
  setting: MobileSourceLoginSetting,
): boolean {
  return ["basic", "web", "oauth"].includes(mobileSourceLoginMethod(setting));
}

/** Resolve the auth URL for a login setting (static `url` or `urlKey` value). */
export function resolveMobileSourceLoginUrl(
  setting: MobileSourceLoginSetting,
  values: Record<string, unknown>,
): string | null {
  return resolveLoginActionUrl(setting, values);
}

export type MobileSourceOAuthErrorCode =
  | "missing-login-url"
  | "invalid-login-url"
  | "browser-open-failed"
  | "unsupported-platform"
  | "cancelled"
  | "oversized-callback"
  | "state-mismatch"
  | "invalid-callback"
  | "missing-token-endpoint"
  | "token-request-failed"
  | "token-exchange-failed"
  | "oversized-token";

/** Source manifests are untrusted. Browser and token endpoints must remain
 * ordinary network URLs, never custom/app/file schemes or credentialed URLs. */
export function normalizeMobileSourceOAuthHttpUrl(rawUrl: string): string | null {
  if (
    rawUrl.length === 0 ||
    rawUrl.length > MOBILE_SOURCE_OAUTH_MAX_ENDPOINT_CHARS
  ) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveMobileSourceOAuthLoginEndpoint(
  setting: MobileSourceLoginSetting,
  values: Record<string, unknown>,
):
  | { ok: true; url: string }
  | {
      ok: false;
      code: Extract<
        MobileSourceOAuthErrorCode,
        "missing-login-url" | "invalid-login-url"
      >;
    } {
  const rawUrl = resolveMobileSourceLoginUrl(setting, values);
  if (!rawUrl) return { ok: false, code: "missing-login-url" };
  const url = normalizeMobileSourceOAuthHttpUrl(rawUrl);
  return url
    ? { ok: true, url }
    : { ok: false, code: "invalid-login-url" };
}

export function isMobileSourceOAuthStoredValueWithinLimit(
  value: string,
): boolean {
  return (
    value.length > 0 &&
    new TextEncoder().encode(value).byteLength <=
      MOBILE_SOURCE_OAUTH_STORED_VALUE_MAX_BYTES
  );
}

export function mobileSourceOAuthCallbackHasExpectedState(
  callbackUrl: string,
  expectedState: string,
): boolean {
  if (!expectedState) return false;
  try {
    const parsed = new URL(callbackUrl);
    const fragment = parsed.hash.startsWith("#")
      ? parsed.hash.slice(1)
      : parsed.hash;
    const fragmentParams = new URLSearchParams(
      fragment.startsWith("?") ? fragment.slice(1) : fragment,
    );
    const states = [
      ...parsed.searchParams.getAll("state"),
      ...fragmentParams.getAll("state"),
    ];
    return states.length === 1 && states[0] === expectedState;
  } catch {
    return false;
  }
}

export type MobileSourceLoginCallback =
  | { kind: "token"; value: string }
  | { kind: "code"; code: string }
  | { kind: "invalid" };

/**
 * Classify the value returned by the OAuth browser session: a full token
 * payload (store directly), an authorization `code` (exchange for a token), or
 * nothing usable.
 */
export function classifyMobileSourceLoginCallback(
  value: string,
): MobileSourceLoginCallback {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "invalid" };
  if (hasOAuthTokenPayload(trimmed)) {
    return { kind: "token", value: trimmed };
  }
  if (isLikelyOAuthCallbackValue(trimmed)) {
    const code = extractAuthorizationCode(trimmed);
    if (code) return { kind: "code", code };
  }
  return { kind: "invalid" };
}

/**
 * Build the `application/x-www-form-urlencoded` token-exchange body for a
 * PKCE code → token exchange. Redirect/client id are pulled from the auth URL
 * the source provided (mirroring web's `submitOAuthLogin`).
 */
export function buildMobileSourceOAuthExchangeBody(params: {
  code: string;
  codeVerifier: string;
  authUrl: string;
}): string {
  const authUrlObject = new URL(params.authUrl);
  return buildOAuthTokenExchangeBody({
    code: params.code,
    codeVerifier: params.codeVerifier,
    redirectUri: authUrlObject.searchParams.get("redirect_uri"),
    clientId: authUrlObject.searchParams.get("client_id"),
  });
}

/** Build a state-bound auth request. PKCE adds its independent verifier and
 * S256 challenge; every request gets state so a colliding custom-scheme app
 * cannot complete another login attempt. */
export function buildMobileSourceOAuthAuthRequest(
  rawUrl: string,
  usePkce: boolean,
): {
  url: string;
  codeVerifier: string;
  state: string;
} {
  const normalizedUrl = normalizeMobileSourceOAuthHttpUrl(rawUrl);
  if (!normalizedUrl) throw new Error("Source OAuth URL must use http or https.");
  const state = generateCodeVerifier();
  const request = usePkce
    ? withPkce(normalizedUrl)
    : { url: normalizedUrl, codeVerifier: "" };
  const url = new URL(request.url);
  url.searchParams.set("state", state);
  return { url: url.toString(), codeVerifier: request.codeVerifier, state };
}

/** Backward-compatible pure helper used by focused PKCE tests/callers. */
export function buildMobileSourcePkceAuthUrl(rawUrl: string): {
  url: string;
  codeVerifier: string;
  state: string;
} {
  return buildMobileSourceOAuthAuthRequest(rawUrl, true);
}

export type MobileSourceOAuthLoginInput = {
  setting: MobileSourceLoginSetting;
  values: Record<string, unknown>;
};

export type MobileSourceOAuthLoginResult =
  | { ok: true; token: string }
  | { ok: false; code: MobileSourceOAuthErrorCode };
