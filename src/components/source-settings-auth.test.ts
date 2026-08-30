import { describe, expect, test } from "bun:test";
import {
  formatSourceSettingsError,
  hasRequiredSourceOAuthProxyPolicy,
  navigateSourceLoginPopup,
  normalizeSourceLoginHttpsUrl,
  openSourceLoginPopup,
  parseSourceOAuthPendingRequest,
  resolveSafeSourceExternalUrl,
  resolveSourceOAuthLogin,
  serializeSourceOAuthPendingRequest,
  SOURCE_OAUTH_CALLBACK_MAX_BYTES,
  type SourceOAuthMessages,
} from "./source-settings-auth";

const messages: SourceOAuthMessages = {
  invalidLoginUrl: "invalid-login-url",
  openLoginFirst: "open-login-first",
  invalidCallback: "invalid-callback",
  callbackStateMismatch: "state-mismatch",
  callbackStateMissing: "state-missing",
  tokenExchangeFailed: "token-exchange-failed",
};

const TOKEN_RESPONSE = '{"access_token":"at","token_type":"bearer"}';
const STATE = "abcdefghijklmnopqrstuvwxyzABCDEF";
const VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const AUTH_URL =
  "https://example.com/auth?client_id=cid&redirect_uri=https%3A%2F%2Fapp%2Fcb";

describe("source settings error presentation", () => {
  test("keeps localized copy primary and redacts hostile diagnostics", () => {
    const formatted = formatSourceSettingsError(
      new Error(
        "Request https://user:pass@example.com/token?code=secret#fragment failed\u0007; Authorization: Bearer abc.def; access_token=visible",
      ),
      "Login failed",
    );

    expect(formatted.startsWith("Login failed\n")).toBe(true);
    expect(formatted).toContain("https://example.com/token");
    expect(formatted).toContain("Authorization: [redacted]");
    expect(formatted).not.toContain("user:pass");
    expect(formatted).not.toContain("secret");
    expect(formatted).not.toContain("abc.def");
    expect(formatted).not.toContain("visible");
    expect(formatted).not.toContain("\u0007");
  });

  test("falls back safely and bounds diagnostics", () => {
    expect(formatSourceSettingsError({}, "Fallback")).toBe("Fallback");
    expect(formatSourceSettingsError(new Error("Fallback"), "Fallback")).toBe(
      "Fallback",
    );
    expect(
      formatSourceSettingsError(new Error("x".repeat(10_000)), "Fallback")
        .length,
    ).toBeLessThanOrEqual("Fallback\n".length + 500);
  });
});

function pkceRequest(overrides: {
  submittedValue: string;
  storedState?: string;
  storedCodeVerifier?: string | null;
  authUrl?: string;
  noPendingRequest?: boolean;
  exchangeToken?: (input: {
    tokenUrl: string;
    body: string;
  }) => Promise<string>;
}) {
  const calls: { tokenUrl: string; body: string }[] = [];
  const request = {
    submittedValue: overrides.submittedValue,
    setting: {
      key: "login",
      pkce: true,
      tokenUrl: "https://api.example.com/token",
    },
    pendingRequest: overrides.noPendingRequest
      ? null
      : {
          version: 1 as const,
          authUrl: overrides.authUrl ?? AUTH_URL,
          codeVerifier:
            overrides.storedCodeVerifier === undefined
              ? VERIFIER
              : overrides.storedCodeVerifier,
          state: overrides.storedState ?? STATE,
        },
    messages,
    exchangeToken:
      overrides.exchangeToken ??
      (async (input: { tokenUrl: string; body: string }) => {
        calls.push(input);
        return TOKEN_RESPONSE;
      }),
  };
  return { request, calls };
}

describe("resolveSourceOAuthLogin — PKCE state validation", () => {
  test("exchanges a bound code using immutable authorization metadata", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: `https://app/cb?code=auth-code&state=${STATE}`,
    });

    const result = await resolveSourceOAuthLogin(request);

    expect(result.storedValue).toBe(TOKEN_RESPONSE);
    expect(calls).toHaveLength(1);
    expect(calls[0].tokenUrl).toBe("https://api.example.com/token");
    expect(calls[0].body).toContain("code=auth-code");
    expect(calls[0].body).toContain(`code_verifier=${VERIFIER}`);
    expect(calls[0].body).toContain("client_id=cid");
    expect(calls[0].body).toContain(
      `redirect_uri=${encodeURIComponent("https://app/cb")}`,
    );
  });

  test("rejects different, missing, duplicate, and unopened state", async () => {
    for (const [submittedValue, overrides, expected] of [
      ["https://app/cb?code=bad&state=other", {}, "state-mismatch"],
      ["auth-code", {}, "state-missing"],
      [
        `https://app/cb?code=bad&state=${STATE}#state=${STATE}`,
        {},
        "state-mismatch",
      ],
      [
        `https://app/cb?code=bad&state=${STATE}`,
        { noPendingRequest: true },
        "open-login-first",
      ],
    ] as const) {
      const { request, calls } = pkceRequest({
        submittedValue,
        ...overrides,
      });
      await expect(resolveSourceOAuthLogin(request)).rejects.toThrow(expected);
      expect(calls).toHaveLength(0);
    }
  });

  test("exchanges a hybrid callback instead of trusting its token", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: `https://app/cb?code=auth-code&id_token=untrusted&state=${STATE}`,
    });

    expect((await resolveSourceOAuthLogin(request)).storedValue).toBe(
      TOKEN_RESPONSE,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].body).not.toContain("untrusted");
  });

  test("requires a valid RFC 7636 verifier", async () => {
    for (const storedCodeVerifier of [null, "", "short", "x".repeat(129)]) {
      const { request, calls } = pkceRequest({
        submittedValue: `https://app/cb?code=auth-code&state=${STATE}`,
        storedCodeVerifier,
      });
      await expect(resolveSourceOAuthLogin(request)).rejects.toThrow(
        "open-login-first",
      );
      expect(calls).toHaveLength(0);
    }
  });

  test("rejects malformed endpoints and non-token exchange bodies", async () => {
    const insecureAuth = pkceRequest({
      submittedValue: `https://app/cb?code=auth-code&state=${STATE}`,
      authUrl: "http://example.com/auth?client_id=cid",
    });
    await expect(resolveSourceOAuthLogin(insecureAuth.request)).rejects.toThrow(
      "invalid-login-url",
    );
    expect(insecureAuth.calls).toHaveLength(0);

    const insecureToken = pkceRequest({
      submittedValue: `https://app/cb?code=auth-code&state=${STATE}`,
    });
    insecureToken.request.setting.tokenUrl = "http://api.example.com/token";
    await expect(
      resolveSourceOAuthLogin(insecureToken.request),
    ).rejects.toThrow("token-exchange-failed");
    expect(insecureToken.calls).toHaveLength(0);

    for (const responseText of [
      '{"error":"invalid_grant"}',
      '{"token_type":"bearer"}',
      "access_token=&token_type=bearer",
    ]) {
      const { request } = pkceRequest({
        submittedValue: `https://app/cb?code=auth-code&state=${STATE}`,
        exchangeToken: async () => responseText,
      });
      await expect(resolveSourceOAuthLogin(request)).rejects.toThrow(
        "token-exchange-failed",
      );
    }
  });

  test("does not clear retryable pending secrets inside the resolver", async () => {
    const { request } = pkceRequest({
      submittedValue: `https://app/cb?code=auth-code&state=${STATE}`,
      exchangeToken: async () => {
        throw new Error("network down");
      },
    });
    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow(
      "network down",
    );
    expect(request.pendingRequest?.state).toBe(STATE);
  });

  test("rejects direct tokens, oversized callbacks, codes, and invalid state", async () => {
    for (const input of [
      pkceRequest({ submittedValue: '{"access_token":"at"}' }),
      pkceRequest({
        submittedValue: "x".repeat(SOURCE_OAUTH_CALLBACK_MAX_BYTES + 1),
      }),
      pkceRequest({
        submittedValue: `https://app/cb?code=${"x".repeat(4097)}&state=${STATE}`,
      }),
      pkceRequest({
        submittedValue: "https://app/cb?code=x&state=short",
        storedState: "short",
      }),
    ]) {
      await expect(resolveSourceOAuthLogin(input.request)).rejects.toThrow();
      expect(input.calls).toHaveLength(0);
    }
  });
});

describe("source login endpoint validation", () => {
  test("accepts only bounded credential-free HTTPS URLs", () => {
    expect(normalizeSourceLoginHttpsUrl(" HTTPS://Example.COM/login ")).toBe(
      "https://example.com/login",
    );
    for (const value of [
      "http://example.com/login",
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///tmp/login",
      "https://user:password@example.com/login",
      "/relative/login",
      `https://example.com/${"a".repeat(9 * 1024)}`,
      "",
    ]) {
      expect(
        normalizeSourceLoginHttpsUrl(value),
        value.slice(0, 80),
      ).toBeNull();
    }
  });

  test("validates both static and urlKey manifest links before opening", () => {
    expect(
      resolveSafeSourceExternalUrl({ url: "https://example.com/docs" }, {}),
    ).toBe("https://example.com/docs");
    expect(
      resolveSafeSourceExternalUrl(
        { urlKey: "docs" },
        { docs: "https://example.com/dynamic" },
      ),
    ).toBe("https://example.com/dynamic");
    for (const unsafe of [
      "javascript:alert(document.domain)",
      "data:text/html,<script>alert(1)</script>",
      "about:blank",
      "blob:https://nemu.pm/id",
      "file:///tmp/secret",
      "http://example.com/cleartext",
      "https://user:secret@example.com/private",
    ]) {
      expect(
        resolveSafeSourceExternalUrl({ urlKey: "docs" }, { docs: unsafe }),
        unsafe,
      ).toBeNull();
    }
  });
});

describe("atomic OAuth authorization attempts", () => {
  const pending = {
    version: 1 as const,
    authUrl: "https://example.com/auth?client_id=cid",
    state: STATE,
    codeVerifier: VERIFIER,
  };

  test("round-trips one bound state/verifier/auth URL envelope", () => {
    expect(
      parseSourceOAuthPendingRequest(
        serializeSourceOAuthPendingRequest(pending),
      ),
    ).toEqual(pending);
  });

  test("rejects partial, malformed, and out-of-bounds envelopes", () => {
    for (const value of [
      "",
      "{}",
      JSON.stringify({ ...pending, version: 2 }),
      JSON.stringify({ ...pending, state: "short" }),
      JSON.stringify({ ...pending, codeVerifier: "short" }),
      JSON.stringify({ ...pending, authUrl: "javascript:alert(1)" }),
    ]) {
      expect(parseSourceOAuthPendingRequest(value), value).toBeNull();
    }
  });
});

describe("source login popup lifecycle", () => {
  test("opens synchronously, severs opener, and navigates the retained tab", () => {
    const calls: Array<[string | URL | undefined, string | undefined]> = [];
    const navigations: string[] = [];
    const popup = {
      opener: { untrusted: true } as unknown,
      closed: false,
      location: { replace: (url: string) => navigations.push(url) },
      close() {},
    };

    const opened = openSourceLoginPopup((url, target) => {
      calls.push([url, target]);
      return popup;
    });

    expect(calls).toEqual([["about:blank", "_blank"]]);
    expect(opened).toBe(popup);
    expect(popup.opener).toBeNull();
    expect(
      navigateSourceLoginPopup(popup, "https://example.com/authorize"),
    ).toBe(true);
    expect(navigations).toEqual(["https://example.com/authorize"]);
  });

  test("reports blocked and already-closed tabs without navigating", () => {
    expect(openSourceLoginPopup(() => null)).toBeNull();
    const popup = {
      opener: null,
      closed: true,
      location: {
        replace() {
          throw new Error("must not navigate");
        },
      },
      close() {},
    };
    expect(
      navigateSourceLoginPopup(popup, "https://example.com/authorize"),
    ).toBe(false);
  });
});

describe("OAuth relay policy gate", () => {
  test("accepts only the required policy using a non-caching request", async () => {
    let init: RequestInit | undefined;
    const allowed = await hasRequiredSourceOAuthProxyPolicy(
      (async (_url, requestInit) => {
        init = requestInit;
        return Response.json({ status: "ok", policyVersion: 2 });
      }) as typeof fetch,
      "https://service.nemu.pm/health",
    );

    expect(allowed).toBe(true);
    expect(init?.cache).toBe("no-store");
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    expect(init?.referrerPolicy).toBe("no-referrer");
  });

  test("fails closed on old, malformed, unavailable, or oversized data", async () => {
    for (const response of [
      Response.json({ policyVersion: 1 }),
      new Response("not json"),
      new Response("{}", { status: 503 }),
      new Response("x", { headers: { "content-length": "5000" } }),
    ]) {
      expect(
        await hasRequiredSourceOAuthProxyPolicy(
          (async () => response) as unknown as typeof fetch,
          "https://service.nemu.pm/health",
        ),
      ).toBe(false);
    }
    expect(
      await hasRequiredSourceOAuthProxyPolicy(
        (async () => {
          throw new Error("offline");
        }) as unknown as typeof fetch,
        "https://service.nemu.pm/health",
      ),
    ).toBe(false);
  });
});

describe("resolveSourceOAuthLogin — non-PKCE logins", () => {
  const nonPkce = (submittedValue: string, state: string | null = STATE) => ({
    submittedValue,
    setting: { key: "login" },
    pendingRequest: state
      ? {
          version: 1 as const,
          authUrl: "https://example.com/auth",
          codeVerifier: null,
          state,
        }
      : null,
    messages,
    exchangeToken: async () => {
      throw new Error("must not exchange");
    },
  });

  test("stores a complete state-bound callback as-is", async () => {
    const callback = `https://app/cb?code=abc&state=${STATE}`;
    expect(await resolveSourceOAuthLogin(nonPkce(callback))).toEqual({
      storedValue: callback,
    });
  });

  test("rejects invalid, missing, mismatched, duplicate, and unopened state", async () => {
    for (const [callback, state, expected] of [
      [`https://app/cb?state=${STATE}`, STATE, "invalid-callback"],
      ["https://app/cb?code=abc", STATE, "state-missing"],
      ["https://app/cb?code=abc&state=attacker", STATE, "state-mismatch"],
      [
        `https://app/cb?code=abc&state=${STATE}#state=${STATE}`,
        STATE,
        "state-mismatch",
      ],
      [`https://app/cb?code=abc&state=${STATE}`, null, "open-login-first"],
    ] as const) {
      await expect(
        resolveSourceOAuthLogin(nonPkce(callback, state)),
      ).rejects.toThrow(expected);
    }
  });
});
