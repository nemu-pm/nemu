import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";
import { hasOAuthTokenPayload, isLikelyOAuthCallbackValue } from "@nemu/core";
import {
  buildMobileSourceOAuthExchangeBody,
  buildMobileSourceOAuthAuthRequest,
  classifyMobileSourceLoginCallback,
  isMobileSourceOAuthStoredValueWithinLimit,
  MOBILE_SOURCE_OAUTH_STORED_VALUE_MAX_BYTES,
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
 *  4. classify the returned redirect — a full token payload is stored directly,
 *     an authorization `code` is exchanged at the source's `tokenUrl` for a
 *     token (PKCE) or stored verbatim (non-PKCE, mirroring web).
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
  const authUrl = endpoint.url;

  const usePkce = Boolean(setting.pkce);
  let authRequest;
  try {
    authRequest = buildMobileSourceOAuthAuthRequest(authUrl, usePkce);
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
    Linking.createURL("oauth/callback"),
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

  if (!usePkce) {
    // Non-PKCE OAuth: store the raw callback value if it looks like one
    // (mirrors web's `submitOAuthLogin` non-PKCE branch).
    if (isLikelyOAuthCallbackValue(callbackUrl)) {
      return { ok: true, token: callbackUrl };
    }
    return { ok: false, code: "invalid-callback" };
  }

  // PKCE OAuth: a returned token payload is stored directly; otherwise exchange
  // the authorization code for a token at the source's token endpoint.
  const classified = classifyMobileSourceLoginCallback(callbackUrl);
  if (classified.kind === "token") {
    return { ok: true, token: classified.value };
  }
  if (classified.kind !== "code") {
    return { ok: false, code: "invalid-callback" };
  }

  const tokenUrl = setting.tokenUrl
    ? normalizeMobileSourceOAuthHttpUrl(setting.tokenUrl)
    : null;
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
  if (response.bytes.byteLength > MOBILE_SOURCE_OAUTH_STORED_VALUE_MAX_BYTES) {
    return { ok: false, code: "oversized-token" };
  }

  return { ok: true, token: responseText };
}
