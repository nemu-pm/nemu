/**
 * Source OAuth / PKCE helpers shared between web and mobile.
 *
 * Source login (Aidoku `LoginSetting` with `method: "oauth"` + `pkce`) follows
 * RFC 7636: the client generates a random `code_verifier`, derives a
 * `code_challenge` (S256 = base64url(SHA-256(verifier))), sends the challenge
 * with the auth request, then sends the verifier with the token exchange.
 *
 * Everything in this module is pure logic with no platform I/O so it runs
 * identically under bun (web/mobile tests) and in both app runtimes. The
 * SHA-256 used for the S256 challenge is a self-contained pure-JS impl
 * (`sha256Bytes`) — RN has no `crypto.subtle`, and pulling in a native crypto
 * dep just for this would be disproportionate. It is validated against NIST
 * test vectors and the RFC 7636 example in `source-oauth.test.ts`.
 */

/** Suffix appended to a login setting's key to store its PKCE code verifier. */
export const LOGIN_CODE_VERIFIER_SUFFIX = ".codeVerifier";

/** Compression formats the token-exchange response might be encoded with. */
export type SourceOauthCompressionFormat = "gzip" | "deflate";

/**
 * Detect whether a token-exchange response value (access token JSON, URL-encoded
 * token, or an `error_description` payload) looks like a real token response.
 */
export function hasOAuthTokenPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return ["access_token", "refresh_token", "id_token", "token_type"].some((key) => {
        const tokenValue = parsed[key];
        return typeof tokenValue === "string" && tokenValue.length > 0;
      });
    } catch {
      return false;
    }
  }

  return /(?:^|[?#&])(access_token|refresh_token|id_token|token_type)=/i.test(trimmed);
}

export function looksLikeTokenExchangeText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (hasOAuthTokenPayload(trimmed)) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (/"error_description"\s*:|"error"\s*:/i.test(trimmed)) return true;
  return false;
}

/**
 * True if a pasted callback value could be an OAuth callback (a token payload,
 * a `code=` query, or a URL with search/hash). Used to guard the non-PKCE
 * "paste the whole callback" path.
 */
export function isLikelyOAuthCallbackValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (hasOAuthTokenPayload(trimmed)) return true;
  if (/(?:^|[?#&])code=/i.test(trimmed)) return true;

  try {
    const url = new URL(trimmed);
    return Boolean(url.search || url.hash);
  } catch {
    return false;
  }
}

/** Extract the `code` query param from a callback URL or raw `code=` fragment. */
export function extractAuthorizationCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code");
  } catch {
    const codeMatch = trimmed.match(/(?:^|[?#&])code=([^&#]+)/i);
    if (codeMatch?.[1]) {
      return decodeURIComponent(codeMatch[1]);
    }

    if (!/[=?&#]/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }
}

/**
 * Resolve the auth URL for a login/link setting: the static `url` if present,
 * otherwise the string value stored at `urlKey`. Returns null when neither
 * yields a usable URL.
 */
export function resolveLoginActionUrl(
  setting: { url?: string; urlKey?: string },
  values: Record<string, unknown>,
): string | null {
  if (setting.url) return setting.url;
  if (setting.urlKey) {
    const value = values[setting.urlKey];
    return typeof value === "string" && value ? value : null;
  }
  return null;
}

/** Detect likely compression of a token-exchange response from its magic bytes. */
export function detectCompressionFormats(
  bytes: Uint8Array,
): SourceOauthCompressionFormat[] {
  if (bytes.length >= 2) {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      return ["gzip"];
    }

    const compressionMethod = bytes[0] & 0x0f;
    const header = (bytes[0] << 8) | bytes[1];
    if (compressionMethod === 8 && header % 31 === 0) {
      return ["deflate"];
    }
  }

  return ["gzip", "deflate"];
}

const PKCE_CODE_VERIFIER_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

/**
 * RFC 7636 §4.1: a 43-128 char random string from the unreserved set. We emit
 * 64 chars from `crypto.getRandomValues`. JSC does not expose Web Crypto, so
 * the native app installs a compatible shim backed by Expo Crypto's platform
 * CSPRNG (`apps/mobile/src/polyfills/secureRandom.native.ts`) before this
 * module can run. Environments without a secure source fail closed.
 */
export function generateCodeVerifier(): string {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.getRandomValues !== "function") {
    throw new Error(
      "crypto.getRandomValues is not available in this JavaScript engine.",
    );
  }
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(bytes, (byte) => PKCE_CODE_VERIFIER_ALPHABET[byte % PKCE_CODE_VERIFIER_ALPHABET.length]).join("");
}

/** Base64url (no padding) encode of a byte array — pure JS, no `btoa`. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let binary = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : -1;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : -1;
    binary += alphabet[b0 >> 2];
    binary += alphabet[((b0 & 0x03) << 4) | (b1 >= 0 ? b1 >> 4 : 0)];
    binary += b1 >= 0 ? alphabet[((b1 & 0x0f) << 2) | (b2 >= 0 ? b2 >> 6 : 0)] : "=";
    binary += b2 >= 0 ? alphabet[b2 & 0x3f] : "=";
  }
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// --- pure-JS SHA-256 (FIPS 180-4) ------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 of a byte array, returning a 32-byte digest. Pure JS, no Web Crypto. */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  // Pre-processing: padding to a multiple of 64 bytes with the 1-bit, zeros, and
  // the original bit length as a big-endian 64-bit integer.
  const bitLength = data.length * 8;
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  // High 32 bits of the length (sufficient for any realistic input size).
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, h[i], false);
  }
  return digest;
}

function utf8Encode(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }
  // Fallback for runtimes without TextEncoder.
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

/** RFC 7636 S256 code challenge: base64url(SHA-256(codeVerifier)). */
export function generateCodeChallenge(codeVerifier: string): string {
  return bytesToBase64Url(sha256Bytes(utf8Encode(codeVerifier)));
}

/**
 * Append PKCE challenge params to an auth URL and return the modified URL plus
 * the generated code verifier (which the caller must persist keyed by
 * `${settingKey}${LOGIN_CODE_VERIFIER_SUFFIX}` and reuse at token exchange).
 */
export function withPkce(rawUrl: string): { url: string; codeVerifier: string } {
  const url = new URL(rawUrl);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_type", "code");
  return {
    url: url.toString(),
    codeVerifier,
  };
}

/** Build the `application/x-www-form-urlencoded` token-exchange body. */
export function buildOAuthTokenExchangeBody(params: {
  code: string;
  codeVerifier: string;
  redirectUri?: string | null;
  clientId?: string | null;
}): string {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.codeVerifier,
  });
  if (params.redirectUri) body.set("redirect_uri", params.redirectUri);
  if (params.clientId) body.set("client_id", params.clientId);
  return body.toString();
}
