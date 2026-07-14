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
  resolveMobileSourceLoginUrl,
  type MobileSourceOAuthLoginInput,
  type MobileSourceOAuthLoginResult,
} from "./mobileSourceOAuthLogic";
import { registerMobileSourceProfileTransitionHandler } from "@/sources/mobileSourceProfileScope";

const MOBILE_SOURCE_OAUTH_TOKEN_RESPONSE_MAX_BYTES = 128 * 1024;
const MOBILE_SOURCE_OAUTH_ERROR_MAX_CHARS = 512;

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
 * Derive the redirect URL the browser auth session should watch for. Sources
 * that declare `callbackScheme` redirect back to that custom scheme; otherwise
 * fall back to the app's own linking URL (`nemu://`).
 */
function resolveMobileSourceOAuthRedirectUrl(
  callbackScheme: string | undefined,
): string {
  if (callbackScheme) {
    return `${callbackScheme}://callback`;
  }
  return Linking.createURL("oauth/callback");
}

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

  const rawAuthUrl = resolveMobileSourceLoginUrl(setting, values);
  const authUrl = rawAuthUrl
    ? normalizeMobileSourceOAuthHttpUrl(rawAuthUrl)
    : null;
  if (!authUrl) {
    return { ok: false, error: "No login URL configured for this source." };
  }

  const usePkce = Boolean(setting.pkce);
  let authRequest;
  try {
    authRequest = buildMobileSourceOAuthAuthRequest(authUrl, usePkce);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid source login URL.",
    };
  }
  const {
    url: authRequestUrl,
    codeVerifier,
    state,
  } = authRequest;

  const redirectUrl = resolveMobileSourceOAuthRedirectUrl(setting.callbackScheme);

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(authRequestUrl, redirectUrl, {
      // iOS source login must not inherit another app/profile browser session.
      preferEphemeralSession: true,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to open login page.",
    };
  }

  if (result.type !== "success") {
    return { ok: false, error: "Login was cancelled." };
  }

  const callbackUrl = result.url;
  if (!isMobileSourceOAuthStoredValueWithinLimit(callbackUrl)) {
    return { ok: false, error: "The source returned an oversized login callback." };
  }
  if (!mobileSourceOAuthCallbackHasExpectedState(callbackUrl, state)) {
    return { ok: false, error: "The login callback state did not match this attempt." };
  }

  if (!usePkce) {
    // Non-PKCE OAuth: store the raw callback value if it looks like one
    // (mirrors web's `submitOAuthLogin` non-PKCE branch).
    if (isLikelyOAuthCallbackValue(callbackUrl)) {
      return { ok: true, token: callbackUrl };
    }
    return { ok: false, error: "The login callback was not recognized." };
  }

  // PKCE OAuth: a returned token payload is stored directly; otherwise exchange
  // the authorization code for a token at the source's token endpoint.
  const classified = classifyMobileSourceLoginCallback(callbackUrl);
  if (classified.kind === "token") {
    return { ok: true, token: classified.value };
  }
  if (classified.kind !== "code") {
    return { ok: false, error: "The login callback did not include a token or code." };
  }

  const tokenUrl = setting.tokenUrl
    ? normalizeMobileSourceOAuthHttpUrl(setting.tokenUrl)
    : null;
  if (!tokenUrl) {
    return { ok: false, error: "This source does not provide a token endpoint." };
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
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Token exchange request failed.",
    };
  }

  const responseText = typeof response.body === "string" ? response.body : "";
  if (!response.ok || !hasOAuthTokenPayload(responseText)) {
    return {
      ok: false,
      error:
        responseText.slice(0, MOBILE_SOURCE_OAUTH_ERROR_MAX_CHARS) ||
        "Token exchange failed.",
    };
  }
  if (response.bytes.byteLength > MOBILE_SOURCE_OAUTH_STORED_VALUE_MAX_BYTES) {
    return { ok: false, error: "The source returned an oversized token payload." };
  }

  return { ok: true, token: responseText };
}
