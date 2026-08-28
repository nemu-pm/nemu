import { describe, expect, test } from "bun:test";
import {
  buildOAuthTokenExchangeBody,
  bytesToBase64Url,
  detectCompressionFormats,
  extractAuthorizationCode,
  extractOAuthState,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  hasOAuthTokenPayload,
  isLikelyOAuthCallbackValue,
  looksLikeTokenExchangeText,
  resolveLoginActionUrl,
  sha256,
  sha256Bytes,
  verifyOAuthCallbackState,
  withOAuthState,
  withPkce,
  LOGIN_CODE_VERIFIER_SUFFIX,
  LOGIN_OAUTH_REQUEST_SUFFIX,
  LOGIN_OAUTH_STATE_SUFFIX,
} from "./source-oauth";

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Run `fn` with `crypto.subtle` hidden so the pure-JS fallback path executes —
 * this is what bare JSC (React Native without a SubtleCrypto polyfill) sees.
 */
async function withoutSubtleCrypto<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.crypto;
  const stub = {
    getRandomValues: (array: Uint8Array) => original.getRandomValues(array),
  } as unknown as Crypto;
  Object.defineProperty(globalThis, "crypto", {
    value: stub,
    configurable: true,
    writable: true,
  });
  try {
    expect(globalThis.crypto.subtle).toBeUndefined();
    return await fn();
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      value: original,
      configurable: true,
      writable: true,
    });
  }
}

const SHA256_PATHS: ReadonlyArray<{
  name: string;
  digest: (data: Uint8Array) => Promise<Uint8Array>;
}> = [
  { name: "sha256 (crypto.subtle path)", digest: (data) => sha256(data) },
  {
    name: "sha256 (pure-JS fallback path)",
    digest: (data) => withoutSubtleCrypto(() => sha256(data)),
  },
  {
    name: "sha256Bytes (pure JS, direct)",
    digest: async (data) => sha256Bytes(data),
  },
];

for (const { name, digest } of SHA256_PATHS) {
  describe(name, () => {
    test("empty string → known NIST vector", async () => {
      expect(hexFromBytes(await digest(new Uint8Array(0)))).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });
    test('"abc" → known NIST vector', async () => {
      expect(hexFromBytes(await digest(new TextEncoder().encode("abc")))).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });
    test("a message longer than one block (56 bytes → 2 padded blocks) → known NIST vector", async () => {
      const input = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
      expect(hexFromBytes(await digest(new TextEncoder().encode(input)))).toBe(
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      );
    });
    test("a multi-block message (1,000,000 'a's) → known NIST vector", async () => {
      const input = "a".repeat(1_000_000);
      expect(hexFromBytes(await digest(new TextEncoder().encode(input)))).toBe(
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
      );
    });
  });
}

describe("generateCodeChallenge — S256 vector", () => {
  // Vector cross-verified against `node -e "crypto.createHash('sha256').update(v).digest('base64url')"`
  // (and against the NIST-validated digests above). Using a reference-checked
  // value rather than a hand-copied RFC string avoids transcription errors.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjyo";
  const expected = "qtIcHbqbz9JyWqb4RS8dJiwvk3pU88Xj3A73FeSPyQo";

  test("verifier → base64url(SHA-256(verifier)) matches a reference impl", async () => {
    expect(await generateCodeChallenge(verifier)).toBe(expected);
  });
  test("the pure-JS fallback produces the identical challenge", async () => {
    expect(
      await withoutSubtleCrypto(() => generateCodeChallenge(verifier)),
    ).toBe(expected);
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
  test("rejection sampling redraws biased bytes instead of modulo-mapping them", () => {
    const original = globalThis.crypto;
    let call = 0;
    const stub = {
      // First draw: every byte is >= 198 and must be rejected, forcing a
      // redraw. Second draw: zeros, each mapping to alphabet[0].
      getRandomValues: (array: Uint8Array) => {
        call += 1;
        array.fill(call === 1 ? 255 : 0);
        return array;
      },
    } as unknown as Crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: stub,
      configurable: true,
      writable: true,
    });
    try {
      expect(generateCodeVerifier()).toBe("a".repeat(64));
      expect(call).toBe(2);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: original,
        configurable: true,
        writable: true,
      });
    }
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

describe("generateOAuthState", () => {
  test("is 32 chars from the unreserved set", () => {
    const state = generateOAuthState();
    expect(state).toHaveLength(32);
    expect(state).toMatch(/^[A-Za-z0-9-._~]+$/);
  });
  test("two calls produce different states", () => {
    expect(generateOAuthState()).not.toBe(generateOAuthState());
  });
});

describe("withPkce", () => {
  test("appends S256 challenge params and returns a verifier", async () => {
    const { url, codeVerifier } = await withPkce(
      "https://example.com/auth?client_id=cid",
    );
    expect(codeVerifier).toHaveLength(64);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe(
      await generateCodeChallenge(codeVerifier),
    );
    expect(parsed.searchParams.get("client_id")).toBe("cid");
  });
  test("sends an unguessable state that the caller can verify (RFC 6749 §10.12)", async () => {
    const first = await withPkce("https://example.com/auth");
    const second = await withPkce("https://example.com/auth");
    expect(first.state).toHaveLength(32);
    expect(first.state).not.toBe(second.state);
    expect(new URL(first.url).searchParams.get("state")).toBe(first.state);
  });
  test("a callback echoing the issued state validates", async () => {
    const { state } = await withPkce("https://example.com/auth");
    expect(
      verifyOAuthCallbackState(
        `https://app/callback?code=c&state=${state}`,
        state,
      ),
    ).toBe("ok");
  });
});

describe("withOAuthState", () => {
  test("binds a non-PKCE authorization request to an unguessable state", () => {
    const request = withOAuthState(
      "https://example.com/auth?response_type=token&state=manifest-value",
    );
    expect(request.state).toHaveLength(32);
    expect(new URL(request.url).searchParams.get("state")).toBe(request.state);
    expect(request.state).not.toBe("manifest-value");
  });
});

describe("extractOAuthState", () => {
  test("from a callback URL query", () => {
    expect(extractOAuthState("https://app/callback?code=c&state=abc")).toBe(
      "abc",
    );
  });
  test("from a callback URL hash fragment", () => {
    expect(
      extractOAuthState("https://app/callback#access_token=t&state=abc"),
    ).toBe("abc");
  });
  test("rejects duplicate state parameters across query and fragment", () => {
    expect(
      extractOAuthState(
        "https://app/callback?state=abc#access_token=t&state=abc",
      ),
    ).toBeNull();
  });
  test("from a bare state= fragment", () => {
    expect(extractOAuthState("code=c&state=abc")).toBe("abc");
  });
  test("percent-decodes the raw fragment form", () => {
    expect(extractOAuthState("code=c&state=a%2Bb")).toBe("a+b");
  });
  test("null when absent", () => {
    expect(extractOAuthState("https://app/callback?code=c")).toBeNull();
    expect(extractOAuthState("code=c")).toBeNull();
    expect(extractOAuthState("   ")).toBeNull();
  });
});

describe("verifyOAuthCallbackState", () => {
  test("ok when the callback echoes the expected state", () => {
    expect(
      verifyOAuthCallbackState("https://app/cb?code=c&state=s1", "s1"),
    ).toBe("ok");
  });
  test("mismatch when a different state comes back", () => {
    expect(
      verifyOAuthCallbackState("https://app/cb?code=c&state=evil", "s1"),
    ).toBe("mismatch");
  });
  test("missing when the callback carries no state at all", () => {
    expect(verifyOAuthCallbackState("https://app/cb?code=c", "s1")).toBe(
      "missing",
    );
    expect(verifyOAuthCallbackState("bare-code", "s1")).toBe("missing");
  });
  test("ok when no state was issued (flow started by an older build)", () => {
    expect(verifyOAuthCallbackState("https://app/cb?code=c", "")).toBe("ok");
    expect(verifyOAuthCallbackState("https://app/cb?code=c", null)).toBe("ok");
    expect(verifyOAuthCallbackState("https://app/cb?code=c", undefined)).toBe(
      "ok",
    );
  });
  test("state comparison is exact (no prefix or case folding)", () => {
    expect(
      verifyOAuthCallbackState("https://app/cb?code=c&state=s1x", "s1"),
    ).toBe("mismatch");
    expect(
      verifyOAuthCallbackState("https://app/cb?code=c&state=S1", "s1"),
    ).toBe("mismatch");
  });
  test("duplicate state values fail closed even when both match", () => {
    expect(
      verifyOAuthCallbackState("https://app/cb?code=c&state=s1#state=s1", "s1"),
    ).toBe("mismatch");
    expect(verifyOAuthCallbackState("code=c&state=s1&state=s1", "s1")).toBe(
      "mismatch",
    );
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
  test("token metadata without a credential", () => {
    expect(hasOAuthTokenPayload('{"token_type":"bearer"}')).toBe(false);
    expect(hasOAuthTokenPayload("token_type=bearer")).toBe(false);
  });
  test("urlencoded access_token", () => {
    expect(hasOAuthTokenPayload("access_token=abc&token_type=bearer")).toBe(
      true,
    );
  });
  test("empty or ambiguous token values", () => {
    expect(hasOAuthTokenPayload('{"access_token":"   "}')).toBe(false);
    expect(hasOAuthTokenPayload("access_token=&token_type=bearer")).toBe(false);
    expect(hasOAuthTokenPayload("access_token=a&access_token=b")).toBe(false);
  });
  test("empty", () => {
    expect(hasOAuthTokenPayload("   ")).toBe(false);
  });
});

describe("looksLikeTokenExchangeText", () => {
  test("error_description payload", () => {
    expect(
      looksLikeTokenExchangeText(
        '{"error":"invalid","error_description":"bad verifier"}',
      ),
    ).toBe(true);
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
    expect(isLikelyOAuthCallbackValue("https://app/callback?code=xyz")).toBe(
      true,
    );
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
  test("state-only and unrelated callback URLs are not credentials", () => {
    expect(
      isLikelyOAuthCallbackValue(
        "https://app/callback?state=expected&error=access_denied",
      ),
    ).toBe(false);
  });
});

describe("extractAuthorizationCode", () => {
  test("from a callback URL", () => {
    expect(
      extractAuthorizationCode("https://app/callback?code=abc123&state=s"),
    ).toBe("abc123");
  });
  test("from a bare code= fragment", () => {
    expect(extractAuthorizationCode("code=abc123")).toBe("abc123");
  });
  test("from a callback URL hash fragment", () => {
    expect(
      extractAuthorizationCode(
        "https://app/callback#code=abc123&state=expected",
      ),
    ).toBe("abc123");
  });
  test("rejects duplicate and empty authorization codes", () => {
    expect(
      extractAuthorizationCode("https://app/callback?code=first#code=second"),
    ).toBeNull();
    expect(extractAuthorizationCode("code=&code=second")).toBeNull();
    expect(extractAuthorizationCode("code=")).toBeNull();
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
    expect(
      resolveLoginActionUrl(
        { url: "https://a", urlKey: "k" },
        { k: "https://b" },
      ),
    ).toBe("https://a");
  });
  test("urlKey resolves from values", () => {
    expect(resolveLoginActionUrl({ urlKey: "k" }, { k: "https://b" })).toBe(
      "https://b",
    );
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
    expect(
      detectCompressionFormats(new Uint8Array([0x1f, 0x8b, 0x08])),
    ).toEqual(["gzip"]);
  });
  test("deflate header", () => {
    // 0x78 0x9c is a common zlib (deflate) header; (0x78 & 0x0f)===8, 0x789c % 31 === 0.
    expect(detectCompressionFormats(new Uint8Array([0x78, 0x9c]))).toEqual([
      "deflate",
    ]);
  });
  test("unknown → tries both", () => {
    expect(detectCompressionFormats(new Uint8Array([0x00, 0x00]))).toEqual([
      "gzip",
      "deflate",
    ]);
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
    expect(body).toContain(
      "redirect_uri=" + encodeURIComponent("https://app/cb"),
    );
    expect(body).toContain("client_id=cid");
  });
});

describe("login setting suffixes", () => {
  test("are the documented suffixes", () => {
    expect(LOGIN_CODE_VERIFIER_SUFFIX).toBe(".codeVerifier");
    expect(LOGIN_OAUTH_REQUEST_SUFFIX).toBe(".oauthRequest");
    expect(LOGIN_OAUTH_STATE_SUFFIX).toBe(".oauthState");
  });
});
