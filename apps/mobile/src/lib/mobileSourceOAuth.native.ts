import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";
import { hasOAuthTokenPayload } from "@nemu/core";
import {
  buildMobileSourceOAuthExchangeBody,
  buildMobileSourceOAuthAuthRequest,
  canStartMobileSourceOAuthFlow,
  classifyMobileSourceLoginCallback,
  isMobileSourceOAuthStoredValueWithinLimit,
  isMobileSourceOAuthCallbackAllowed,
  isMobileSourceOAuthCallbackSchemeSupported,
  mobileSourceOAuthCallbackHasExpectedState,
  normalizeMobileSourceOAuthHttpUrl,
  resolveMobileSourceOAuthRedirectUrl,
  resolveMobileSourceOAuthLoginEndpoint,
  type MobileSourceOAuthLoginInput,
  type MobileSourceOAuthLoginResult,
} from "./mobileSourceOAuthLogic";
import { registerMobileSourceProfileTransitionHandler } from "@/sources/mobileSourceProfileScope";

const MOBILE_SOURCE_OAUTH_TOKEN_RESPONSE_MAX_BYTES = 128 * 1024;

// Re-export the full pure-logic surface so importers of `mobileSourceOAuth`
// get identical names on native and on web/test (where the base resolves).
// `export *` mirrors the base seam and stays drift-proof as the logic module
// grows new helpers.
export * from "./mobileSourceOAuthLogic";

registerMobileSourceProfileTransitionHandler(
  "source-oauth-browser-session",
  () => {
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      // Android custom tabs and already-closed sessions can reject dismissal.
    }
  },
);

/**
 * Run an OAuth PKCE source login end-to-end:
 *  1. resolve the source's auth URL (static or from `urlKey`);
 *  2. if PKCE, append the S256 challenge and remember the verifier;
 *  3. open a system browser auth session (`expo-web-browser`) with a redirect
 *     URL the app can capture;
 *  4. classify the returned redirect — PKCE accepts only an authorization
 *     `code` and exchanges it at the source's HTTPS `tokenUrl`; legacy direct
 *     token callbacks are retained only where the platform auth session keeps
 *     the private-use redirect inside this app.
 *
 * NOTE: whether the browser session can actually capture the redirect depends
 * on the source's `redirect_uri`/`callbackScheme` semantics, which vary per
 * source and must be verified on-device against a real OAuth-using source.
 */
export async function runMobileSourceOAuthLogin(
  input: MobileSourceOAuthLoginInput,
): Promise<MobileSourceOAuthLoginResult> {
  const { setting, values } = input;

  const endpoint = resolveMobileSourceOAuthLoginEndpoint(setting, values);
  if (!endpoint.ok) return endpoint;
  if (!isMobileSourceOAuthCallbackSchemeSupported(setting.callbackScheme)) {
    return { ok: false, code: "unsupported-platform" };
  }
  const authUrl = endpoint.url;

  const usePkce = Boolean(setting.pkce);
  const platform =
    Platform.OS === "android"
      ? "android"
      : Platform.OS === "ios"
        ? "ios"
        : "other";
  if (!canStartMobileSourceOAuthFlow({ usePkce, platform })) {
    return { ok: false, code: "unsupported-platform" };
  }
  const tokenUrl =
    usePkce && setting.tokenUrl
      ? normalizeMobileSourceOAuthHttpUrl(setting.tokenUrl)
      : null;
  // Fail before opening a browser when this PKCE attempt cannot complete. This
  // also ensures a cleartext or credentialed token endpoint is never deferred
  // until after the user has already authenticated.
  if (usePkce && !tokenUrl) {
    return { ok: false, code: "missing-token-endpoint" };
  }
  let authRequest;
  try {
    authRequest = await buildMobileSourceOAuthAuthRequest(authUrl, usePkce);
  } catch {
    return {
      ok: false,
      code: "invalid-login-url",
    };
  }
  const {
    url: authRequestUrl,
    codeVerifier,
    state,
  } = authRequest;

  const redirectUrl = resolveMobileSourceOAuthRedirectUrl(
    authRequestUrl,
    setting.callbackScheme,
    // The app intentionally registers both its own `nemu` scheme and the
    // Aidoku-compatible `neko` scheme. Pick the app-owned fallback explicitly
    // so Expo does not guess (and warn) when more than one scheme is present.
    Linking.createURL("oauth/callback", { scheme: "nemu" }),
  );

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(authRequestUrl, redirectUrl, {
      // iOS source login must not inherit another app/profile browser session.
      preferEphemeralSession: true,
    });
  } catch {
    return {
      ok: false,
      code: "browser-open-failed",
    };
  }

  if (result.type !== "success") {
    return { ok: false, code: "cancelled" };
  }

  const callbackUrl = result.url;
  if (!isMobileSourceOAuthStoredValueWithinLimit(callbackUrl)) {
    return { ok: false, code: "oversized-callback" };
  }
  if (!mobileSourceOAuthCallbackHasExpectedState(callbackUrl, state)) {
    return { ok: false, code: "state-mismatch" };
  }

  const classified = classifyMobileSourceLoginCallback(callbackUrl);
  if (
    !isMobileSourceOAuthCallbackAllowed({
      kind: classified.kind,
      usePkce,
      platform,
    })
  ) {
    return { ok: false, code: "invalid-callback" };
  }

  if (!usePkce) {
    // Non-PKCE OAuth stores the complete callback only when it contains real
    // credential material. A state-only or provider-error callback is not a
    // successful login.
    return { ok: true, token: callbackUrl };
  }

  // PKCE OAuth always exchanges its verifier-bound authorization code at the
  // source's authenticated token endpoint. Implicit/hybrid token fields never
  // bypass that exchange.
  if (classified.kind !== "code") {
    return { ok: false, code: "invalid-callback" };
  }

  if (!tokenUrl) {
    return { ok: false, code: "missing-token-endpoint" };
  }

  let response;
  try {
    const body = buildMobileSourceOAuthExchangeBody({
      code: classified.code,
      codeVerifier,
      authUrl,
    });
    response = await mobileNativeFetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        // Ask for an uncompressed response so the body is a plain string we
        // can parse directly — mirrors the web agent path's
        // `x-proxy-accept-encoding: identity`. RN has no DecompressionStream,
        // so we cannot decode gzip/deflate here the way web does.
        "Accept-Encoding": "identity",
      },
      body,
      responseMode: "text",
      maxResponseBytes: MOBILE_SOURCE_OAUTH_TOKEN_RESPONSE_MAX_BYTES,
      // The authorization code and PKCE verifier are single-use credentials.
      // Keep them off any HTTPS -> HTTP redirect while preserving general
      // source-network compatibility for callers that do not opt in.
      requireHttps: true,
    });
  } catch {
    return {
      ok: false,
      code: "token-request-failed",
    };
  }

  const responseText = typeof response.body === "string" ? response.body : "";
  if (!response.ok || !hasOAuthTokenPayload(responseText)) {
    return {
      ok: false,
      code: "token-exchange-failed",
    };
  }
  // `responseMode: "text"` intentionally omits the base64 byte payload, so
  // `response.bytes` is empty on native. Bound the actual UTF-8 string that
  // will be persisted instead of relying on that transport optimization.
  if (!isMobileSourceOAuthStoredValueWithinLimit(responseText)) {
    return { ok: false, code: "oversized-token" };
  }

  return { ok: true, token: responseText };
}
