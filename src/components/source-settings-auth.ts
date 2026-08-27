import type { MangaSource } from "@/lib/sources/types";
import { hasAuthenticationHandlers } from "@/lib/sources/types";
import {
  buildOAuthTokenExchangeBody,
  extractAuthorizationCode,
  hasOAuthTokenPayload,
  isLikelyOAuthCallbackValue,
  verifyOAuthCallbackState,
} from "@nemu/core";

export async function submitSourceBasicLogin(
  source: MangaSource | null,
  key: string,
  username: string,
  password: string,
  fallbackMessage: string
): Promise<void> {
  if (!source || !hasAuthenticationHandlers(source)) {
    throw new Error(fallbackMessage);
  }

  const handlesLogin = await source.handlesBasicLogin();
  if (!handlesLogin) {
    throw new Error(fallbackMessage);
  }

  const success = await source.handleBasicLogin(key, username, password);
  if (!success) {
    throw new Error(fallbackMessage);
  }
}

export async function submitSourceWebLogin(
  source: MangaSource | null,
  key: string,
  cookies: Record<string, string>,
  fallbackMessage: string
): Promise<void> {
  if (Object.keys(cookies).length === 0) {
    return;
  }

  if (!source || !hasAuthenticationHandlers(source)) {
    throw new Error(fallbackMessage);
  }

  const handlesLogin = await source.handlesWebLogin();
  if (!handlesLogin) {
    throw new Error(fallbackMessage);
  }

  const success = await source.handleWebLogin(key, cookies);
  if (!success) {
    throw new Error(fallbackMessage);
  }
}

/** Translated messages the OAuth callback resolver can fail with. */
export interface SourceOAuthMessages {
  invalidLoginUrl: string;
  openLoginFirst: string;
  invalidCallback: string;
  callbackStateMismatch: string;
  callbackStateMissing: string;
  tokenExchangeFailed: string;
}

export interface SourceOAuthLoginRequest {
  /** What the user pasted: a callback URL, a bare code, or a token payload. */
  submittedValue: string;
  setting: { key: string; pkce?: boolean; tokenUrl?: string };
  /** Authorization URL of this login action; supplies redirect_uri/client_id. */
  authUrl: string | null;
  /** Verifier stored when the authorization page was opened ("" if none). */
  storedCodeVerifier: string;
  /** `state` stored when the authorization page was opened ("" if none). */
  storedState: string;
  messages: SourceOAuthMessages;
  /** Performs the POST and returns the raw (decoded) token response body. */
  exchangeToken: (input: { tokenUrl: string; body: string }) => Promise<string>;
}

export interface SourceOAuthLoginResult {
  /** Value to persist as the login setting's primary value. */
  storedValue: string;
}

/**
 * Validate an OAuth callback and, for PKCE logins, exchange its authorization
 * code for a token.
 *
 * Extracted from the settings dialog so the security-relevant decisions — CSRF
 * `state` validation (RFC 6749 §10.12) and the lifetime of the single-use PKCE
 * secrets — are testable without driving the UI.
 *
 * Resolving successfully always ends the authorization request: the caller must
 * then delete the stored verifier and state. Throwing leaves them in place so
 * the user can paste a corrected callback.
 */
export async function resolveSourceOAuthLogin(
  request: SourceOAuthLoginRequest,
): Promise<SourceOAuthLoginResult> {
  const { submittedValue, setting, messages } = request;
  const tokenUrl = setting.tokenUrl;

  if (!setting.pkce || !tokenUrl) {
    if (!isLikelyOAuthCallbackValue(submittedValue)) {
      throw new Error(messages.invalidCallback);
    }
    return { storedValue: submittedValue };
  }

  // A state that came back different belongs to another authorization request:
  // never trust the response, whichever shape it has.
  const stateResult = verifyOAuthCallbackState(submittedValue, request.storedState);
  if (stateResult === "mismatch") {
    throw new Error(messages.callbackStateMismatch);
  }

  if (hasOAuthTokenPayload(submittedValue)) {
    // A directly-delivered token carries no authorization code to exchange, so
    // there is nothing left for the pending verifier/state to protect.
    return { storedValue: submittedValue };
  }

  if (!request.authUrl) {
    throw new Error(messages.invalidLoginUrl);
  }
  if (!request.storedCodeVerifier) {
    throw new Error(messages.openLoginFirst);
  }
  // A code that arrives without the state we issued cannot be attributed to
  // this login attempt; refuse to exchange it.
  if (stateResult === "missing") {
    throw new Error(messages.callbackStateMissing);
  }

  const code = extractAuthorizationCode(submittedValue);
  if (!code) {
    throw new Error(messages.invalidCallback);
  }

  const authUrlObject = new URL(request.authUrl);
  const responseText = await request.exchangeToken({
    tokenUrl,
    body: buildOAuthTokenExchangeBody({
      code,
      codeVerifier: request.storedCodeVerifier,
      redirectUri: authUrlObject.searchParams.get("redirect_uri"),
      clientId: authUrlObject.searchParams.get("client_id"),
    }),
  });

  if (!hasOAuthTokenPayload(responseText)) {
    throw new Error(messages.tokenExchangeFailed);
  }

  return { storedValue: responseText };
}
