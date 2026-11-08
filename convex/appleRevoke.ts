/**
 * Sign in with Apple token handling for account deletion (App Review
 * 5.1.1(v)). Apple requires the revoke call's client_id to match the audience
 * the token was issued to, and the client_secret JWT's `sub` to equal that
 * client_id:
 *  - web/OAuth-redirect sign-in: Services ID  = APPLE_CLIENT_ID,
 *    secret APPLE_CLIENT_SECRET
 *  - native (bundle id) sign-in:  bundle id   = APPLE_APP_BUNDLE_ID,
 *    secret APPLE_NATIVE_CLIENT_SECRET
 * https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
 */

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

export type AppleClient = { clientId?: string; clientSecret?: string };
export type AppleClientKind = "web" | "native";

export type AppleEnv = {
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_ID?: string;
  APPLE_NATIVE_CLIENT_SECRET?: string;
};

export type AppleRevokeOutcome =
  | "revoked"
  /** Apple says the token is already invalid or revoked (invalid_grant). */
  | "already-revoked"
  | "no-token"
  | "not-configured"
  /** invalid_client: wrong client_id for this token or an expired secret. */
  | "invalid-client"
  /** Any other 4xx. */
  | "rejected"
  /** Network failure or 5xx after retries; the user can retry later. */
  | "unavailable";

export type AppleAccountTokens = {
  refreshToken?: string | null;
  accessToken?: string | null;
  idToken?: string | null;
};

/** `aud` claim of an (unverified) id token; it is the client the token is for. */
export function audienceOfIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const aud = (JSON.parse(json) as { aud?: unknown }).aud;
    return typeof aud === "string" ? aud : null;
  } catch {
    return null;
  }
}

export function appleClientFor(kind: AppleClientKind, env: AppleEnv): AppleClient {
  return kind === "native"
    ? { clientId: env.APPLE_APP_BUNDLE_ID, clientSecret: env.APPLE_NATIVE_CLIENT_SECRET }
    : { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET };
}

/** Picks the client matching the token audience; falls back to `fallback`. */
export function appleClientForAudience(
  audience: string | null,
  env: AppleEnv,
  fallback: AppleClientKind = "web",
): AppleClient {
  if (audience && audience === env.APPLE_APP_BUNDLE_ID) return appleClientFor("native", env);
  if (audience && audience === env.APPLE_CLIENT_ID) return appleClientFor("web", env);
  return appleClientFor(fallback, env);
}

type Options = { fetcher?: typeof fetch; retries?: number };

async function postForm(
  url: string,
  form: Record<string, string>,
  { fetcher = fetch, retries = 2 }: Options,
): Promise<
  | { kind: "ok"; status: number; json: Record<string, unknown> }
  | { kind: "client-error"; status: number; error: string | null }
  | { kind: "unavailable" }
> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form),
      });
      const text = await response.text().catch(() => "");
      let json: Record<string, unknown> = {};
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        json = {};
      }
      if (response.ok) return { kind: "ok", status: response.status, json };
      if (response.status >= 400 && response.status < 500) {
        return {
          kind: "client-error",
          status: response.status,
          error: typeof json.error === "string" ? json.error : null,
        };
      }
    } catch {
      // network failure: retry
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  return { kind: "unavailable" };
}

function classifyClientError(error: string | null): AppleRevokeOutcome {
  if (error === "invalid_client") return "invalid-client";
  if (error === "invalid_grant") return "already-revoked";
  return "rejected";
}

export async function revokeAppleTokens(
  tokens: AppleAccountTokens,
  client: AppleClient,
  options: Options = {},
): Promise<{ outcome: AppleRevokeOutcome; status?: number }> {
  if (!client.clientId || !client.clientSecret) return { outcome: "not-configured" };
  const token = tokens.refreshToken || tokens.accessToken;
  if (!token) return { outcome: "no-token" };
  const result = await postForm(
    APPLE_REVOKE_URL,
    {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      token,
      token_type_hint: tokens.refreshToken ? "refresh_token" : "access_token",
    },
    options,
  );
  if (result.kind === "ok") return { outcome: "revoked", status: result.status };
  if (result.kind === "unavailable") return { outcome: "unavailable" };
  return { outcome: classifyClientError(result.error), status: result.status };
}

/**
 * Exchanges the authorizationCode of a fresh Sign in with Apple (run by the
 * client at deletion time) for tokens, so they can be revoked.
 */
export async function exchangeAppleAuthorizationCode(
  code: string,
  client: AppleClient,
  options: Options = {},
): Promise<
  | { ok: true; tokens: AppleAccountTokens }
  | { ok: false; outcome: AppleRevokeOutcome; status?: number }
> {
  if (!client.clientId || !client.clientSecret) return { ok: false, outcome: "not-configured" };
  const result = await postForm(
    APPLE_TOKEN_URL,
    {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      grant_type: "authorization_code",
    },
    options,
  );
  if (result.kind === "unavailable") return { ok: false, outcome: "unavailable" };
  if (result.kind === "client-error") {
    return { ok: false, outcome: classifyClientError(result.error), status: result.status };
  }
  const refreshToken = typeof result.json.refresh_token === "string" ? result.json.refresh_token : null;
  const accessToken = typeof result.json.access_token === "string" ? result.json.access_token : null;
  if (!refreshToken && !accessToken) return { ok: false, outcome: "rejected", status: result.status };
  return { ok: true, tokens: { refreshToken, accessToken } };
}

/** Exchange (when a code is given) then revoke, for one Apple account. */
export async function revokeAppleAccount(
  account: AppleAccountTokens,
  authorizationCode: string | undefined,
  env: AppleEnv,
  options: Options = {},
): Promise<{ outcome: AppleRevokeOutcome; status?: number }> {
  if (authorizationCode) {
    // The code comes from the iOS app's native sign-in (bundle id client).
    const client = appleClientFor("native", env);
    const exchanged = await exchangeAppleAuthorizationCode(authorizationCode, client, options);
    if (!exchanged.ok) {
      // invalid_grant on a code means the code is bad/expired, not that the
      // user's tokens are revoked.
      const outcome = exchanged.outcome === "already-revoked" ? "rejected" : exchanged.outcome;
      return { outcome, status: exchanged.status };
    }
    return revokeAppleTokens(exchanged.tokens, client, options);
  }
  const client = appleClientForAudience(audienceOfIdToken(account.idToken), env);
  return revokeAppleTokens(account, client, options);
}
