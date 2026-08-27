import { describe, expect, test } from "bun:test";
import type { SourcePackageSetting } from "@/data/schema";
import {
  buildMobileSourceOAuthExchangeBody,
  buildMobileSourceOAuthAuthRequest,
  buildMobileSourcePkceAuthUrl,
  classifyMobileSourceLoginCallback,
  canRunMobileSourceLoginMethod,
  isMobileSourceOAuthStoredValueWithinLimit,
  isMobileSourceLoggedIn,
  isMobileSourceLoginSetting,
  mobileSourceLoginMethod,
  mobileSourceLoginVerifierKey,
  mobileSourceOAuthCallbackHasExpectedState,
  isMobileSourceOAuthCallbackSchemeSupported,
  MOBILE_SOURCE_OAUTH_MAX_ENDPOINT_CHARS,
  normalizeMobileSourceOAuthHttpUrl,
  resolveMobileSourceOAuthRedirectUrl,
  resolveMobileSourceOAuthLoginEndpoint,
  resolveMobileSourceLoginUrl,
  type MobileSourceLoginSetting,
} from "./mobileSourceOAuthLogic";

function loginSetting(
  overrides: Partial<MobileSourceLoginSetting> = {},
): MobileSourceLoginSetting {
  return {
    key: "auth",
    type: "login",
    title: "Log in",
    ...overrides,
  } as MobileSourceLoginSetting;
}

describe("isMobileSourceLoginSetting", () => {
  test("true for type login", () => {
    expect(isMobileSourceLoginSetting(loginSetting())).toBe(true);
  });
  test("false for other types", () => {
    const other = { key: "k", type: "switch", title: "t" } as unknown as SourcePackageSetting;
    expect(isMobileSourceLoginSetting(other)).toBe(false);
  });
});

describe("mobileSourceLoginVerifierKey", () => {
  test("appends the canonical suffix", () => {
    expect(mobileSourceLoginVerifierKey("auth")).toBe("auth.codeVerifier");
  });
});

describe("isMobileSourceLoggedIn", () => {
  test("true when a non-empty string is stored", () => {
    expect(isMobileSourceLoggedIn(loginSetting(), { auth: "token" })).toBe(true);
  });
  test("false when empty string", () => {
    expect(isMobileSourceLoggedIn(loginSetting(), { auth: "" })).toBe(false);
  });
  test("false when missing", () => {
    expect(isMobileSourceLoggedIn(loginSetting(), {})).toBe(false);
  });
  test("false when non-string", () => {
    expect(isMobileSourceLoggedIn(loginSetting(), { auth: 123 })).toBe(false);
  });
});

describe("mobileSourceLoginMethod", () => {
  test("defaults unspecified source logins to basic", () => {
    expect(mobileSourceLoginMethod(loginSetting())).toBe("basic");
  });

  test("supports every declared mobile source login method", () => {
    expect(canRunMobileSourceLoginMethod(loginSetting({ method: "oauth" }))).toBe(true);
    expect(canRunMobileSourceLoginMethod(loginSetting({ method: "basic" }))).toBe(true);
    expect(canRunMobileSourceLoginMethod(loginSetting({ method: "web" }))).toBe(true);
  });
});

describe("resolveMobileSourceLoginUrl", () => {
  test("static url wins over urlKey", () => {
    expect(
      resolveMobileSourceLoginUrl(
        loginSetting({ url: "https://a", urlKey: "k" }),
        { k: "https://b" },
      ),
    ).toBe("https://a");
  });
  test("urlKey resolves from values", () => {
    expect(
      resolveMobileSourceLoginUrl(loginSetting({ urlKey: "k" }), { k: "https://b" }),
    ).toBe("https://b");
  });
  test("null when neither provided", () => {
    expect(resolveMobileSourceLoginUrl(loginSetting(), {})).toBeNull();
  });
});

describe("resolveMobileSourceOAuthLoginEndpoint", () => {
  test("distinguishes missing, unsafe, and usable source endpoints", () => {
    expect(resolveMobileSourceOAuthLoginEndpoint(loginSetting(), {})).toEqual({
      ok: false,
      code: "missing-login-url",
    });
    expect(
      resolveMobileSourceOAuthLoginEndpoint(
        loginSetting({ url: "nemu://credentials" }),
        {},
      ),
    ).toEqual({
      ok: false,
      code: "invalid-login-url",
    });
    expect(
      resolveMobileSourceOAuthLoginEndpoint(loginSetting({ urlKey: "endpoint" }), {
        endpoint: "HTTPS://Example.COM/login",
      }),
    ).toEqual({
      ok: true,
      url: "https://example.com/login",
    });
  });
});

describe("classifyMobileSourceLoginCallback", () => {
  test("token payload → token", () => {
    const r = classifyMobileSourceLoginCallback('{"access_token":"t","token_type":"bearer"}');
    expect(r).toEqual({ kind: "token", value: '{"access_token":"t","token_type":"bearer"}' });
  });
  test("callback url with code → code", () => {
    const r = classifyMobileSourceLoginCallback("https://app/cb?code=abc123");
    expect(r).toEqual({ kind: "code", code: "abc123" });
  });
  test("bare code= → code", () => {
    expect(classifyMobileSourceLoginCallback("code=abc123")).toEqual({
      kind: "code",
      code: "abc123",
    });
  });
  test("empty → invalid", () => {
    expect(classifyMobileSourceLoginCallback("   ")).toEqual({ kind: "invalid" });
  });
  test("garbage → invalid", () => {
    expect(classifyMobileSourceLoginCallback("nothing useful here")).toEqual({
      kind: "invalid",
    });
  });
  test("state-only callback → invalid", () => {
    expect(
      classifyMobileSourceLoginCallback(
        "nemu://oauth/callback?state=expected",
      ),
    ).toEqual({ kind: "invalid" });
  });
  test("OAuth error callback → invalid even when it also contains a code", () => {
    expect(
      classifyMobileSourceLoginCallback(
        "nemu://oauth/callback?error=access_denied&code=ignored&state=expected",
      ),
    ).toEqual({ kind: "invalid" });
  });
});

describe("buildMobileSourcePkceAuthUrl", () => {
  test("appends S256 challenge plus fresh state", async () => {
    const { url, codeVerifier, state } = await buildMobileSourcePkceAuthUrl(
      "https://example.com/auth?client_id=cid",
    );
    expect(codeVerifier).toHaveLength(64);
    expect(state).toHaveLength(64);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
    expect(parsed.searchParams.get("client_id")).toBe("cid");
    expect(parsed.searchParams.get("state")).toBe(state);
  });

  test("adds state and overrides source-provided state without PKCE", async () => {
    const request = await buildMobileSourceOAuthAuthRequest(
      "https://example.com/auth?state=source-controlled",
      false,
    );
    expect(request.codeVerifier).toBe("");
    expect(new URL(request.url).searchParams.getAll("state"))
      .toEqual([request.state]);
  });
});

describe("mobile source OAuth URL and callback safety", () => {
  test("accepts only callback schemes registered by the native binary", () => {
    expect(isMobileSourceOAuthCallbackSchemeSupported(undefined)).toBe(true);
    expect(isMobileSourceOAuthCallbackSchemeSupported("nemu")).toBe(true);
    expect(isMobileSourceOAuthCallbackSchemeSupported("neko")).toBe(true);
    expect(isMobileSourceOAuthCallbackSchemeSupported("other-app")).toBe(false);
    expect(isMobileSourceOAuthCallbackSchemeSupported("javascript")).toBe(false);
  });

  test("preserves the source's exact registered custom-scheme redirect", () => {
    const authUrl =
      "https://auth.example/authorize?redirect_uri=neko%3A%2F%2Fmangadex-auth";
    expect(
      resolveMobileSourceOAuthRedirectUrl(authUrl, "neko", "nemu://oauth/callback"),
    ).toBe("neko://mangadex-auth");
  });

  test("falls back safely when a callback scheme is absent or malformed", () => {
    expect(
      resolveMobileSourceOAuthRedirectUrl(
        "https://auth.example/authorize",
        undefined,
        "nemu://oauth/callback",
      ),
    ).toBe("nemu://oauth/callback");
    expect(
      resolveMobileSourceOAuthRedirectUrl(
        "https://auth.example/authorize",
        "javascript",
        "nemu://oauth/callback",
      ),
    ).toBe("nemu://oauth/callback");
    expect(
      resolveMobileSourceOAuthRedirectUrl(
        "https://auth.example/authorize?redirect_uri=other%3A%2F%2Fcallback",
        "neko",
        "nemu://oauth/callback",
      ),
    ).toBe("neko://callback");
  });

  test("accepts only credential-free http(s) endpoints", () => {
    expect(normalizeMobileSourceOAuthHttpUrl("HTTPS://Example.COM/auth"))
      .toBe("https://example.com/auth");
    for (const invalid of [
      "intent://auth",
      "nemu://auth",
      "file:///auth",
      "/relative",
      "https://user:secret@example.com/auth",
    ]) {
      expect(normalizeMobileSourceOAuthHttpUrl(invalid)).toBeNull();
    }
    expect(
      normalizeMobileSourceOAuthHttpUrl(
        `https://example.com/${"x".repeat(MOBILE_SOURCE_OAUTH_MAX_ENDPOINT_CHARS)}`,
      ),
    ).toBeNull();
  });

  test("bounds every callback value before it can be parsed or persisted", () => {
    expect(
      isMobileSourceOAuthStoredValueWithinLimit("nemu://callback?state=x"),
    ).toBe(true);
    expect(isMobileSourceOAuthStoredValueWithinLimit("😀".repeat(20_000)))
      .toBe(false);
  });

  test("requires exactly one matching state from query or fragment", () => {
    expect(
      mobileSourceOAuthCallbackHasExpectedState(
        "nemu://oauth/callback?code=abc&state=expected",
        "expected",
      ),
    ).toBe(true);
    expect(
      mobileSourceOAuthCallbackHasExpectedState(
        "nemu://oauth/callback#access_token=t&state=expected",
        "expected",
      ),
    ).toBe(true);
    expect(
      mobileSourceOAuthCallbackHasExpectedState(
        "nemu://oauth/callback?code=abc",
        "expected",
      ),
    ).toBe(false);
    expect(
      mobileSourceOAuthCallbackHasExpectedState(
        "nemu://oauth/callback?state=attacker",
        "expected",
      ),
    ).toBe(false);
    expect(
      mobileSourceOAuthCallbackHasExpectedState(
        "nemu://oauth/callback?state=expected#state=expected",
        "expected",
      ),
    ).toBe(false);
  });
});

describe("buildMobileSourceOAuthExchangeBody", () => {
  test("includes grant_type, code, code_verifier, redirect_uri, client_id from auth url", () => {
    const authUrl =
      "https://example.com/auth?client_id=cid&redirect_uri=https%3A%2F%2Fapp%2Fcb";
    const body = buildMobileSourceOAuthExchangeBody({
      code: "abc",
      codeVerifier: "verifier-123",
      authUrl,
    });
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=abc");
    expect(body).toContain("code_verifier=verifier-123");
    expect(body).toContain("client_id=cid");
    expect(body).toContain("redirect_uri=" + encodeURIComponent("https://app/cb"));
  });
  test("omits redirect_uri/client_id when the auth url lacks them", () => {
    const body = buildMobileSourceOAuthExchangeBody({
      code: "abc",
      codeVerifier: "v",
      authUrl: "https://example.com/auth",
    });
    expect(body).not.toContain("redirect_uri");
    expect(body).not.toContain("client_id");
  });
});
