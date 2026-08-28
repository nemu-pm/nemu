import type { SourcePackageSetting } from "@/data/schema";
import {
  LOGIN_CODE_VERIFIER_SUFFIX,
  buildOAuthTokenExchangeBody,
  generateCodeVerifier,
  hasOAuthTokenPayload,
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

/** Source manifests are untrusted. OAuth authorization and token endpoints
 * carry credentials, codes, and tokens, so production accepts authenticated
 * HTTPS only -- never custom/app/file schemes, cleartext HTTP, or userinfo. */
export function normalizeMobileSourceOAuthHttpUrl(rawUrl: string): string | null {
  if (
    rawUrl.length === 0 ||
    rawUrl.length > MOBILE_SOURCE_OAUTH_MAX_ENDPOINT_CHARS
  ) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const MOBILE_SOURCE_OAUTH_CALLBACK_SCHEME_PATTERN =
  /^[a-z][a-z0-9+.-]*$/;
const MOBILE_SOURCE_OAUTH_RESERVED_SCHEMES = new Set([
  "data",
  "file",
  "http",
  "https",
  "intent",
  "javascript",
]);
const MOBILE_SOURCE_OAUTH_REGISTERED_CALLBACK_SCHEMES = new Set([
  "nemu",
  "neko",
]);

export function isMobileSourceOAuthCallbackSchemeSupported(
  rawCallbackScheme: string | undefined,
): boolean {
  if (rawCallbackScheme === undefined) return true;
  return MOBILE_SOURCE_OAUTH_REGISTERED_CALLBACK_SCHEMES.has(
    rawCallbackScheme.trim(),
  );
}

/**
 * Resolve the callback URL watched by the native auth session. Aidoku sources
 * can register an exact redirect URI in the authorization URL (for example,
 * MangaDex uses `neko://mangadex-auth`), so preserve it when its scheme matches
 * the declared callback scheme. Otherwise use the conventional callback host.
 */
export function resolveMobileSourceOAuthRedirectUrl(
  authUrl: string,
  rawCallbackScheme: string | undefined,
  fallbackRedirectUrl: string,
): string {
  const callbackScheme = rawCallbackScheme?.trim();
  if (
    !callbackScheme ||
    !MOBILE_SOURCE_OAUTH_CALLBACK_SCHEME_PATTERN.test(callbackScheme) ||
    MOBILE_SOURCE_OAUTH_RESERVED_SCHEMES.has(callbackScheme)
  ) {
    return fallbackRedirectUrl;
  }

  try {
    const redirectUri = new URL(authUrl).searchParams.get("redirect_uri");
    if (
      redirectUri &&
      redirectUri.length <= MOBILE_SOURCE_OAUTH_MAX_ENDPOINT_CHARS &&
      new URL(redirectUri).protocol === `${callbackScheme}:`
    ) {
      return redirectUri;
    }
  } catch {
    // The authorization endpoint is validated separately. A malformed nested
    // redirect should only fall back to the source scheme's conventional host.
  }

  return `${callbackScheme}://callback`;
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

export type MobileSourceOAuthPlatform = "android" | "ios" | "other";

/**
 * Android private-use callback schemes are claimable by another app. Never
 * start a code/token flow there unless PKCE makes an intercepted code useless
 * without the verifier retained inside Nemu.
 */
export function canStartMobileSourceOAuthFlow(params: {
  usePkce: boolean;
  platform: MobileSourceOAuthPlatform;
}): boolean {
  return params.platform !== "android" || params.usePkce;
}

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
  try {
    const parsed = new URL(trimmed);
    const fragment = parsed.hash.startsWith("#")
      ? parsed.hash.slice(1)
      : parsed.hash;
    const fragmentParams = new URLSearchParams(
      fragment.startsWith("?") ? fragment.slice(1) : fragment,
    );
    if (parsed.searchParams.has("error") || fragmentParams.has("error")) {
      return { kind: "invalid" };
    }
    const codes = [
      ...parsed.searchParams.entries(),
      ...fragmentParams.entries(),
    ]
      .filter(([key]) => key.toLowerCase() === "code")
      .map(([, code]) => code);
    // OAuth parameters are single-valued. Reject every ambiguous callback,
    // including `code=&code=real`; filtering empty values first would let an
    // attacker choose which parser's interpretation reaches the exchange.
    if (codes.length > 0) {
      if (codes.length !== 1 || codes[0].length === 0) {
        return { kind: "invalid" };
      }
      return { kind: "code", code: codes[0] };
    }
  } catch {
    const rawCodes = [
      ...trimmed.matchAll(/(?:^|[?#&])code=([^&#]*)/gi),
    ].map((match) => match[1]);
    if (rawCodes.length > 0) {
      if (rawCodes.length !== 1 || rawCodes[0].length === 0) {
        return { kind: "invalid" };
      }
      try {
        const code = decodeURIComponent(rawCodes[0]);
        return code.length > 0
          ? { kind: "code", code }
          : { kind: "invalid" };
      } catch {
        return { kind: "invalid" };
      }
    }
  }
  // URL callbacks are checked for code first so OIDC hybrid responses
  // (`code id_token`) cannot skip the PKCE-bound exchange.
  if (hasOAuthTokenPayload(trimmed)) {
    return { kind: "token", value: trimmed };
  }
  return { kind: "invalid" };
}

export function isMobileSourceOAuthCallbackAllowed(params: {
  kind: MobileSourceLoginCallback["kind"];
  usePkce: boolean;
  platform: MobileSourceOAuthPlatform;
}): boolean {
  if (params.kind === "invalid") return false;
  // PKCE binds only an authorization code. A token returned from the browser
  // is an implicit response even if the request happened to include a
  // code_challenge, and must never bypass the code exchange.
  if (params.usePkce) return params.kind === "code";
  // Expo's Android auth session is a Custom Tab + OS deep-link listener. A
  // second app can claim the same private-use scheme and receive a bearer
  // token. iOS ASWebAuthenticationSession isolates the active callback, so a
  // narrowly retained legacy implicit flow remains available there only.
  return params.platform === "ios";
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
export async function buildMobileSourceOAuthAuthRequest(
  rawUrl: string,
  usePkce: boolean,
): Promise<{
  url: string;
  codeVerifier: string;
  state: string;
}> {
  const normalizedUrl = normalizeMobileSourceOAuthHttpUrl(rawUrl);
  if (!normalizedUrl) throw new Error("Source OAuth URL must use HTTPS.");
  const state = generateCodeVerifier();
  const request = usePkce
    ? await withPkce(normalizedUrl)
    : { url: normalizedUrl, codeVerifier: "" };
  const url = new URL(request.url);
  url.searchParams.set("state", state);
  return { url: url.toString(), codeVerifier: request.codeVerifier, state };
}

/** Backward-compatible pure helper used by focused PKCE tests/callers. */
export async function buildMobileSourcePkceAuthUrl(rawUrl: string): Promise<{
  url: string;
  codeVerifier: string;
  state: string;
}> {
  return buildMobileSourceOAuthAuthRequest(rawUrl, true);
}

export type MobileSourceOAuthLoginInput = {
  setting: MobileSourceLoginSetting;
  values: Record<string, unknown>;
};

export type MobileSourceOAuthLoginResult =
  | { ok: true; token: string }
  | { ok: false; code: MobileSourceOAuthErrorCode };
