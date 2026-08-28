import type { MangaSource } from "@/lib/sources/types";
import { hasAuthenticationHandlers } from "@/lib/sources/types";
import {
  buildOAuthTokenExchangeBody,
  extractAuthorizationCode,
  hasOAuthTokenPayload,
  isLikelyOAuthCallbackValue,
  resolveLoginActionUrl,
  verifyOAuthCallbackState,
} from "@nemu/core";

export const SOURCE_OAUTH_CALLBACK_MAX_BYTES = 16 * 1024;
export const SOURCE_OAUTH_AUTH_URL_MAX_BYTES = 8 * 1024;
export const SOURCE_OAUTH_CODE_MAX_BYTES = 4 * 1024;
export const SOURCE_SETTINGS_ERROR_DIAGNOSTIC_MAX_LENGTH = 500;
const SOURCE_OAUTH_POLICY_RESPONSE_MAX_BYTES = 4 * 1024;
const SOURCE_SETTINGS_ERROR_PROCESSING_MAX_LENGTH = 4 * 1024;
const OAUTH_UNRESERVED_PATTERN = /^[A-Za-z0-9\-._~]+$/;

export interface SourceOAuthPendingRequest {
  version: 1;
  /** Exact canonical authorization URL used to derive this attempt. */
  authUrl: string;
  /** RFC 6749 state bound to this attempt. */
  state: string;
  /** RFC 7636 verifier, or null for a non-PKCE OAuth flow. */
  codeVerifier: string | null;
}

export interface SourceLoginPopup {
  opener: unknown;
  readonly closed: boolean;
  location: { replace(url: string): void };
  close(): void;
}

type OpenLoginWindow = (
  url?: string | URL,
  target?: string,
) => SourceLoginPopup | null;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function sanitizeDiagnosticUrl(match: string): string {
  const trailing = match.match(/[),.;!?]+$/)?.[0] ?? "";
  const rawUrl = trailing ? match.slice(0, -trailing.length) : match;
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.toString()}${trailing}`;
  } catch {
    return `${rawUrl.replace(/[?#].*$/, "")}${trailing}`;
  }
}

/**
 * Keep localized copy primary while retaining a bounded diagnostic for
 * troubleshooting. Source runtimes are untrusted, so strip credentials,
 * query values, authorization material, and terminal control characters
 * before rendering their exception text.
 */
export function formatSourceSettingsError(
  error: unknown,
  localizedFallback: string,
): string {
  let message = "";
  try {
    message = error instanceof Error ? error.message : String(error ?? "");
  } catch {
    return localizedFallback;
  }

  let diagnostic = message
    .slice(0, SOURCE_SETTINGS_ERROR_PROCESSING_MAX_LENGTH)
    .trim();
  if (!diagnostic || diagnostic === "[object Object]") {
    return localizedFallback;
  }

  diagnostic = Array.from(
    diagnostic
      .replace(/\bhttps?:\/\/[^\s<>"']+/gi, sanitizeDiagnosticUrl)
      .replace(
        /\b(cookie|set-cookie|authorization|proxy-authorization)\b\s*:\s*[^\r\n]+/gi,
        "$1: [redacted]",
      )
      .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [redacted]")
      .replace(
        /\b(password|passwd|access[_-]?token|refresh[_-]?token|id[_-]?token|csrf[_-]?token|token|api[_-]?key|client[_-]?secret|secret|code[_-]?verifier|session)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1$2[redacted]",
      ),
    (character) => {
      const code = character.codePointAt(0) ?? 0;
      const unsafe =
        (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
        code === 0x7f;
      return unsafe ? " " : character;
    },
  )
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!diagnostic) return localizedFallback;
  if (diagnostic.length > SOURCE_SETTINGS_ERROR_DIAGNOSTIC_MAX_LENGTH) {
    diagnostic = `${diagnostic
      .slice(0, SOURCE_SETTINGS_ERROR_DIAGNOSTIC_MAX_LENGTH - 1)
      .trimEnd()}…`;
  }
  return diagnostic === localizedFallback
    ? localizedFallback
    : `${localizedFallback}\n${diagnostic}`;
}

function isValidOAuthState(value: string): boolean {
  return value.length === 32 && OAUTH_UNRESERVED_PATTERN.test(value);
}

function isValidPkceVerifier(value: string): boolean {
  return (
    value.length >= 43 &&
    value.length <= 128 &&
    OAUTH_UNRESERVED_PATTERN.test(value)
  );
}

function isValidAuthorizationCode(value: string): boolean {
  return (
    value.length > 0 &&
    utf8ByteLength(value) <= SOURCE_OAUTH_CODE_MAX_BYTES &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  );
}

/**
 * Open a same-origin blank tab synchronously while the click still has browser
 * activation, then sever `opener` before any asynchronous PKCE work. Passing
 * `noopener` directly to `window.open` intentionally is not used: standards-
 * compliant browsers return null in that mode even when the tab opened.
 */
export function openSourceLoginPopup(
  openWindow: OpenLoginWindow,
): SourceLoginPopup | null {
  const popup = openWindow("about:blank", "_blank");
  if (!popup) return null;
  try {
    popup.opener = null;
    return popup;
  } catch {
    popup.close();
    return null;
  }
}

export function navigateSourceLoginPopup(
  popup: SourceLoginPopup,
  safeUrl: string,
): boolean {
  if (popup.closed) return false;
  try {
    popup.location.replace(safeUrl);
    return true;
  } catch {
    popup.close();
    return false;
  }
}

export function serializeSourceOAuthPendingRequest(
  request: SourceOAuthPendingRequest,
): string {
  const normalizedAuthUrl = normalizeSourceLoginHttpsUrl(request.authUrl);
  const validVerifier =
    request.codeVerifier === null || isValidPkceVerifier(request.codeVerifier);
  if (
    !normalizedAuthUrl ||
    !isValidOAuthState(request.state) ||
    !validVerifier
  ) {
    throw new Error("Invalid OAuth authorization request.");
  }
  return JSON.stringify({
    version: 1,
    authUrl: normalizedAuthUrl,
    state: request.state,
    codeVerifier: request.codeVerifier,
  } satisfies SourceOAuthPendingRequest);
}

export function parseSourceOAuthPendingRequest(
  value: unknown,
): SourceOAuthPendingRequest | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SourceOAuthPendingRequest>;
    const normalizedAuthUrl = normalizeSourceLoginHttpsUrl(parsed.authUrl);
    const validVerifier =
      parsed.codeVerifier === null ||
      (typeof parsed.codeVerifier === "string" &&
        isValidPkceVerifier(parsed.codeVerifier));
    if (
      parsed.version !== 1 ||
      !normalizedAuthUrl ||
      typeof parsed.state !== "string" ||
      !isValidOAuthState(parsed.state) ||
      !validVerifier
    ) {
      return null;
    }
    return {
      version: 1,
      authUrl: normalizedAuthUrl,
      state: parsed.state,
      codeVerifier: parsed.codeVerifier ?? null,
    };
  } catch {
    return null;
  }
}

async function readResponseTextWithinLimit(
  response: Response,
  limit: number,
): Promise<string | null> {
  const declaredLength = response.headers.get("content-length")?.trim();
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > limit
  ) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Fail closed before any authorization code or verifier is sent to a Worker
 * that predates the hardened redirect/cache/body policy. */
export async function hasRequiredSourceOAuthProxyPolicy(
  fetcher: typeof fetch,
  healthUrl: string,
  requiredPolicyVersion = 2,
): Promise<boolean> {
  try {
    const response = await fetcher(healthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return false;
    const text = await readResponseTextWithinLimit(
      response,
      SOURCE_OAUTH_POLICY_RESPONSE_MAX_BYTES,
    );
    if (!text) return false;
    const payload = JSON.parse(text) as { policyVersion?: unknown };
    return (
      Number.isSafeInteger(payload.policyVersion) &&
      Number(payload.policyVersion) >= requiredPolicyVersion
    );
  } catch {
    return false;
  }
}

export async function submitSourceBasicLogin(
  source: MangaSource | null,
  key: string,
  username: string,
  password: string,
  fallbackMessage: string,
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
  fallbackMessage: string,
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
  /** Atomic authorization attempt persisted when the login page was opened. */
  pendingRequest: SourceOAuthPendingRequest | null;
  messages: SourceOAuthMessages;
  /** Performs the POST and returns the raw (decoded) token response body. */
  exchangeToken: (input: { tokenUrl: string; body: string }) => Promise<string>;
}

export interface SourceOAuthLoginResult {
  /** Value to persist as the login setting's primary value. */
  storedValue: string;
}

/** Source manifests are untrusted. Authentication endpoints may carry codes,
 * verifiers, cookies, or tokens, so only credential-free HTTPS URLs are safe
 * to open or request. */
export function normalizeSourceLoginHttpsUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (
    !rawUrl?.trim() ||
    utf8ByteLength(rawUrl.trim()) > SOURCE_OAUTH_AUTH_URL_MAX_BYTES
  ) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Resolve and validate an untrusted manifest link before it reaches
 * `window.open`. `javascript:`, `data:`, inherited-origin `about:blank`, local
 * paths, credentials, and cleartext URLs all fail closed. */
export function resolveSafeSourceExternalUrl(
  setting: { url?: string; urlKey?: string },
  values: Record<string, unknown>,
): string | null {
  return normalizeSourceLoginHttpsUrl(resolveLoginActionUrl(setting, values));
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
  const { setting, messages } = request;
  const submittedValue = request.submittedValue.trim();
  const tokenUrl = setting.tokenUrl;

  if (
    !submittedValue ||
    utf8ByteLength(submittedValue) > SOURCE_OAUTH_CALLBACK_MAX_BYTES
  ) {
    throw new Error(messages.invalidCallback);
  }

  // `state` protects every OAuth response from login CSRF, including legacy
  // implicit/non-PKCE flows. Requiring an authorization request opened by this
  // build is safer than accepting an unbound pasted token. Users with an
  // already-open legacy tab can restart once to obtain a bound callback.
  const pendingRequest = request.pendingRequest;
  if (!pendingRequest || !isValidOAuthState(pendingRequest.state)) {
    throw new Error(messages.openLoginFirst);
  }
  const stateResult = verifyOAuthCallbackState(
    submittedValue,
    pendingRequest.state,
  );
  if (stateResult === "mismatch") {
    throw new Error(messages.callbackStateMismatch);
  }
  if (stateResult === "missing") {
    throw new Error(messages.callbackStateMissing);
  }

  if (!setting.pkce) {
    if (!isLikelyOAuthCallbackValue(submittedValue)) {
      throw new Error(messages.invalidCallback);
    }
    return { storedValue: submittedValue };
  }

  const normalizedTokenUrl = normalizeSourceLoginHttpsUrl(tokenUrl);
  if (!normalizedTokenUrl) {
    throw new Error(messages.tokenExchangeFailed);
  }

  const normalizedAuthUrl = normalizeSourceLoginHttpsUrl(
    pendingRequest.authUrl,
  );
  if (!normalizedAuthUrl) {
    throw new Error(messages.invalidLoginUrl);
  }
  const codeVerifier = pendingRequest.codeVerifier;
  if (!codeVerifier || !isValidPkceVerifier(codeVerifier)) {
    throw new Error(messages.openLoginFirst);
  }

  // A PKCE request is bound only to an authorization code. Token-only implicit
  // and hybrid payloads must never bypass the verifier exchange; hybrid
  // callbacks continue through their code field below.
  const code = extractAuthorizationCode(submittedValue);
  if (!code || !isValidAuthorizationCode(code)) {
    throw new Error(messages.invalidCallback);
  }
  const authUrlObject = new URL(normalizedAuthUrl);
  const responseText = await request.exchangeToken({
    tokenUrl: normalizedTokenUrl,
    body: buildOAuthTokenExchangeBody({
      code,
      codeVerifier,
      redirectUri: authUrlObject.searchParams.get("redirect_uri"),
      clientId: authUrlObject.searchParams.get("client_id"),
    }),
  });

  if (!hasOAuthTokenPayload(responseText)) {
    throw new Error(messages.tokenExchangeFailed);
  }

  return { storedValue: responseText };
}
