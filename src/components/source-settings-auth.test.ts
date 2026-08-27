import { describe, expect, test } from "bun:test";
import {
  resolveSourceOAuthLogin,
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

function pkceRequest(overrides: {
  submittedValue: string;
  storedState?: string;
  storedCodeVerifier?: string;
  authUrl?: string | null;
  exchangeToken?: (input: { tokenUrl: string; body: string }) => Promise<string>;
}) {
  const calls: { tokenUrl: string; body: string }[] = [];
  const request = {
    submittedValue: overrides.submittedValue,
    setting: { key: "login", pkce: true, tokenUrl: "https://api.example.com/token" },
    authUrl:
      overrides.authUrl === undefined
        ? "https://example.com/auth?client_id=cid&redirect_uri=https%3A%2F%2Fapp%2Fcb"
        : overrides.authUrl,
    storedCodeVerifier: overrides.storedCodeVerifier ?? "stored-verifier",
    storedState: overrides.storedState ?? "stored-state",
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
  test("exchanges the code when the callback echoes the issued state", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: "https://app/cb?code=auth-code&state=stored-state",
    });

    const result = await resolveSourceOAuthLogin(request);

    expect(result.storedValue).toBe(TOKEN_RESPONSE);
    expect(calls).toHaveLength(1);
    expect(calls[0].tokenUrl).toBe("https://api.example.com/token");
    expect(calls[0].body).toContain("code=auth-code");
    expect(calls[0].body).toContain("code_verifier=stored-verifier");
    expect(calls[0].body).toContain("client_id=cid");
    expect(calls[0].body).toContain(`redirect_uri=${encodeURIComponent("https://app/cb")}`);
  });

  test("rejects a callback carrying a different state without exchanging it", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: "https://app/cb?code=attacker-code&state=other-state",
    });

    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow("state-mismatch");
    expect(calls).toHaveLength(0);
  });

  test("rejects a bare code with no state when a state was issued", async () => {
    const { request, calls } = pkceRequest({ submittedValue: "auth-code" });

    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow("state-missing");
    expect(calls).toHaveLength(0);
  });

  test("rejects a mismatching state even when a token payload is pasted", async () => {
    const { request } = pkceRequest({
      submittedValue: "https://app/cb#access_token=at&token_type=bearer&state=other-state",
    });

    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow("state-mismatch");
  });

  test("accepts a callback from a flow started before state existed", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: "https://app/cb?code=auth-code",
      storedState: "",
    });

    const result = await resolveSourceOAuthLogin(request);

    expect(result.storedValue).toBe(TOKEN_RESPONSE);
    expect(calls).toHaveLength(1);
  });

  test("requires a stored verifier before exchanging", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: "https://app/cb?code=auth-code&state=stored-state",
      storedCodeVerifier: "",
    });

    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow("open-login-first");
    expect(calls).toHaveLength(0);
  });

  test("fails when the token endpoint returns a non-token body", async () => {
    const { request } = pkceRequest({
      submittedValue: "https://app/cb?code=auth-code&state=stored-state",
      exchangeToken: async () => '{"error":"invalid_grant"}',
    });

    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow("token-exchange-failed");
  });
});

describe("resolveSourceOAuthLogin — single-use secret lifetime", () => {
  // Resolving successfully means the authorization request is over, and the
  // caller (the settings dialog) deletes the stored verifier + state. Throwing
  // keeps them so the user can paste a corrected callback.
  test("a directly delivered token needs no exchange and ends the flow", async () => {
    const { request, calls } = pkceRequest({
      submittedValue: '{"access_token":"at"}',
    });

    const result = await resolveSourceOAuthLogin(request);

    expect(result.storedValue).toBe('{"access_token":"at"}');
    expect(calls).toHaveLength(0);
  });

  test("a failed exchange rejects so the pending secrets are kept for a retry", async () => {
    const { request } = pkceRequest({
      submittedValue: "https://app/cb?code=auth-code&state=stored-state",
      exchangeToken: async () => {
        throw new Error("network down");
      },
    });

    await expect(resolveSourceOAuthLogin(request)).rejects.toThrow("network down");
  });
});

describe("resolveSourceOAuthLogin — non-PKCE logins", () => {
  const nonPkce = (submittedValue: string) => ({
    submittedValue,
    setting: { key: "login" },
    authUrl: "https://example.com/auth",
    storedCodeVerifier: "",
    storedState: "",
    messages,
    exchangeToken: async () => {
      throw new Error("must not exchange");
    },
  });

  test("stores a pasted callback value as-is", async () => {
    const result = await resolveSourceOAuthLogin(nonPkce("https://app/cb?code=abc"));
    expect(result).toEqual({ storedValue: "https://app/cb?code=abc" });
  });

  test("rejects a value that does not look like a callback", async () => {
    await expect(resolveSourceOAuthLogin(nonPkce("hello"))).rejects.toThrow(
      "invalid-callback",
    );
  });
});
