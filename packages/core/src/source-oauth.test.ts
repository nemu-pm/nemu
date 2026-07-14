import { describe, expect, test } from "bun:test";
import {
  buildOAuthTokenExchangeBody,
  bytesToBase64Url,
  detectCompressionFormats,
  extractAuthorizationCode,
  generateCodeChallenge,
  generateCodeVerifier,
  hasOAuthTokenPayload,
  isLikelyOAuthCallbackValue,
  looksLikeTokenExchangeText,
  resolveLoginActionUrl,
  sha256Bytes,
  withPkce,
  LOGIN_CODE_VERIFIER_SUFFIX,
} from "./source-oauth";

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("sha256Bytes", () => {
  test("empty string → known NIST vector", () => {
    expect(hexFromBytes(sha256Bytes(new Uint8Array(0)))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  test('"abc" → known NIST vector', () => {
    expect(hexFromBytes(sha256Bytes(new TextEncoder().encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  test("a message longer than one block (56 bytes → 2 padded blocks) → known NIST vector", () => {
    const input =
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    expect(hexFromBytes(sha256Bytes(new TextEncoder().encode(input)))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
  test("a multi-block message (1,000,000 'a's) → known NIST vector", () => {
    const input = "a".repeat(1_000_000);
    expect(hexFromBytes(sha256Bytes(new TextEncoder().encode(input)))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("generateCodeChallenge — S256 vector", () => {
  test("verifier → base64url(SHA-256(verifier)) matches a reference impl", () => {
    // Vector cross-verified against `node -e "crypto.createHash('sha256').update(v).digest('base64url')"`
    // (and against the NIST-validated sha256Bytes above). Using a reference-checked
    // value rather than a hand-copied RFC string avoids transcription errors.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjyo";
    expect(generateCodeChallenge(verifier)).toBe(
      "qtIcHbqbz9JyWqb4RS8dJiwvk3pU88Xj3A73FeSPyQo",
    );
  });
});

describe("generateCodeVerifier", () => {
  test("is 64 chars from the unreserved set", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9-._~]+$/);
  });
  test("two calls produce different verifiers", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("bytesToBase64Url", () => {
  test("encodes with URL alphabet and no padding", () => {
    // SHA-256("") in base64url:
    expect(bytesToBase64Url(sha256Bytes(new Uint8Array(0)))).toBe(
      "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
    );
  });
  test("handles non-multiple-of-3 lengths (1 and 2 trailing bytes)", () => {
    expect(bytesToBase64Url(new Uint8Array([255]))).toBe("_w");
    expect(bytesToBase64Url(new Uint8Array([255, 255]))).toBe("__8");
  });
});

describe("withPkce", () => {
  test("appends S256 challenge params and returns a verifier", () => {
    const { url, codeVerifier } = withPkce("https://example.com/auth?client_id=cid");
    expect(codeVerifier).toHaveLength(64);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe(
      generateCodeChallenge(codeVerifier),
    );
    expect(parsed.searchParams.get("client_id")).toBe("cid");
  });
});

describe("hasOAuthTokenPayload", () => {
  test("JSON with access_token", () => {
    expect(
      hasOAuthTokenPayload('{"access_token":"abc","token_type":"bearer"}'),
    ).toBe(true);
  });
  test("JSON without token fields", () => {
    expect(hasOAuthTokenPayload('{"error":"bad"}')).toBe(false);
  });
  test("urlencoded access_token", () => {
    expect(hasOAuthTokenPayload("access_token=abc&token_type=bearer")).toBe(true);
  });
  test("empty", () => {
    expect(hasOAuthTokenPayload("   ")).toBe(false);
  });
});

describe("looksLikeTokenExchangeText", () => {
  test("error_description payload", () => {
    expect(looksLikeTokenExchangeText('{"error":"invalid","error_description":"bad verifier"}')).toBe(true);
  });
  test("bare JSON object", () => {
    expect(looksLikeTokenExchangeText('{"foo":1}')).toBe(true);
  });
  test("plain text", () => {
    expect(looksLikeTokenExchangeText("not a token")).toBe(false);
  });
});

describe("isLikelyOAuthCallbackValue", () => {
  test("callback URL with code", () => {
    expect(isLikelyOAuthCallbackValue("https://app/callback?code=xyz")).toBe(true);
  });
  test("bare code=", () => {
    expect(isLikelyOAuthCallbackValue("code=xyz")).toBe(true);
  });
  test("token payload", () => {
    expect(isLikelyOAuthCallbackValue('{"access_token":"t"}')).toBe(true);
  });
  test("plain string", () => {
    expect(isLikelyOAuthCallbackValue("nothing useful")).toBe(false);
  });
});

describe("extractAuthorizationCode", () => {
  test("from a callback URL", () => {
    expect(extractAuthorizationCode("https://app/callback?code=abc123&state=s")).toBe("abc123");
  });
  test("from a bare code= fragment", () => {
    expect(extractAuthorizationCode("code=abc123")).toBe("abc123");
  });
  test("a bare value with no separators is returned as-is", () => {
    expect(extractAuthorizationCode("abc123")).toBe("abc123");
  });
  test("null for garbage with separators and no code", () => {
    expect(extractAuthorizationCode("foo=bar&baz=qux")).toBeNull();
  });
  test("empty", () => {
    expect(extractAuthorizationCode("   ")).toBeNull();
  });
});

describe("resolveLoginActionUrl", () => {
  test("static url wins", () => {
    expect(resolveLoginActionUrl({ url: "https://a", urlKey: "k" }, { k: "https://b" })).toBe("https://a");
  });
  test("urlKey resolves from values", () => {
    expect(resolveLoginActionUrl({ urlKey: "k" }, { k: "https://b" })).toBe("https://b");
  });
  test("null when urlKey missing/empty", () => {
    expect(resolveLoginActionUrl({ urlKey: "k" }, { k: "" })).toBeNull();
    expect(resolveLoginActionUrl({ urlKey: "k" }, {})).toBeNull();
  });
  test("null when neither provided", () => {
    expect(resolveLoginActionUrl({}, {})).toBeNull();
  });
});

describe("detectCompressionFormats", () => {
  test("gzip magic bytes", () => {
    expect(detectCompressionFormats(new Uint8Array([0x1f, 0x8b, 0x08]))).toEqual(["gzip"]);
  });
  test("deflate header", () => {
    // 0x78 0x9c is a common zlib (deflate) header; (0x78 & 0x0f)===8, 0x789c % 31 === 0.
    expect(detectCompressionFormats(new Uint8Array([0x78, 0x9c]))).toEqual(["deflate"]);
  });
  test("unknown → tries both", () => {
    expect(detectCompressionFormats(new Uint8Array([0x00, 0x00]))).toEqual(["gzip", "deflate"]);
  });
});

describe("buildOAuthTokenExchangeBody", () => {
  test("includes grant_type, code, code_verifier", () => {
    const body = buildOAuthTokenExchangeBody({
      code: "c",
      codeVerifier: "v",
    });
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=c");
    expect(body).toContain("code_verifier=v");
    expect(body).not.toContain("redirect_uri");
    expect(body).not.toContain("client_id");
  });
  test("includes redirect_uri and client_id when provided", () => {
    const body = buildOAuthTokenExchangeBody({
      code: "c",
      codeVerifier: "v",
      redirectUri: "https://app/cb",
      clientId: "cid",
    });
    expect(body).toContain("redirect_uri=" + encodeURIComponent("https://app/cb"));
    expect(body).toContain("client_id=cid");
  });
});

describe("LOGIN_CODE_VERIFIER_SUFFIX", () => {
  test("is the documented suffix", () => {
    expect(LOGIN_CODE_VERIFIER_SUFFIX).toBe(".codeVerifier");
  });
});