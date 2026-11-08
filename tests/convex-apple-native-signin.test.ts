import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { crossDomain } from "@convex-dev/better-auth/plugins";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { nativeAppleBundleId } from "../convex/appleRevoke";
import { createMobileOriginBridge } from "../convex/authMobileOriginBridge";

const SERVICES_ID = "pm.nemu.web";
const BUNDLE_ID = "pm.nemu";
const SITE = "https://nemu.example.test";
const BASE = "https://nemu.convex.site";
const KID = "test-key";

let privateKey: CryptoKey;
let appleKeys: unknown;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  appleKeys = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" }],
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://appleid.apple.com/auth/keys") return Response.json(appleKeys);
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function identityToken(claims: {
  sub: string;
  aud?: string;
  email?: string;
  nonce?: string;
}): Promise<string> {
  const { sub, aud = BUNDLE_ID, ...rest } = claims;
  return new SignJWT({ email_verified: "true", ...rest })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer("https://appleid.apple.com")
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

/** convex/auth.ts's stack, on a memory database; `convex()` only adds JWT routes. */
function createTestAuth(appBundleIdentifier: string | undefined) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const auth = betterAuth({
    secret: "a-test-secret-of-at-least-32-characters",
    baseURL: BASE,
    trustedOrigins: [SITE, "nemu://", "nemu://*"],
    database: memoryAdapter(db),
    socialProviders: {
      apple: { clientId: SERVICES_ID, clientSecret: "secret", appBundleIdentifier },
    },
    advanced: { cookiePrefix: "nemu", useSecureCookies: true },
    plugins: [
      createMobileOriginBridge({ siteUrl: SITE }),
      expo({ disableOriginOverride: true }),
      crossDomain({ siteUrl: SITE }),
    ],
    logger: { disabled: true },
  });
  return { auth, db };
}

/** What the Expo client sends for an idToken: no cookie and no expo-origin. */
function signInNatively(
  auth: ReturnType<typeof createTestAuth>["auth"],
  idToken: { token: string; nonce?: string; user?: unknown },
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skip-oauth-proxy": "true" },
      body: JSON.stringify({ provider: "apple", idToken }),
    }),
  );
}

describe("native Sign in with Apple against the auth stack", () => {
  it("maps a native token to the account a web sign-in created, keeping its web tokens", async () => {
    const { auth, db } = createTestAuth(BUNDLE_ID);
    const context = await auth.$context;
    const { user } = await context.internalAdapter.createOAuthUser(
      { email: "reader@example.test", name: "Reader", emailVerified: true },
      {
        providerId: "apple",
        accountId: "apple-sub",
        refreshToken: "web-refresh-token",
        idToken: "web-id-token",
      },
    );

    const nonce = "raw-nonce";
    const response = await signInNatively(auth, {
      token: await identityToken({
        sub: "apple-sub",
        email: "reader@example.test",
        nonce: await sha256Hex(nonce),
      }),
      nonce,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { redirect: boolean; user: { id: string } };
    expect(body.redirect).toBe(false);
    expect(body.user.id).toBe(user.id);
    expect(db.user).toHaveLength(1);
    expect(db.account).toHaveLength(1);
    // Account deletion still revokes through these, with the web client.
    expect(db.account[0]?.refreshToken).toBe("web-refresh-token");
    expect(db.account[0]?.idToken).toBe("web-id-token");
    // The cookie the Expo client stores; cross-domain must not take it away.
    expect(response.headers.get("set-cookie")).toContain("nemu.session_token=");
  });

  it("matches by sub even when a relay address differs from the stored email", async () => {
    const { auth, db } = createTestAuth(BUNDLE_ID);
    const context = await auth.$context;
    const { user } = await context.internalAdapter.createOAuthUser(
      { email: "first@example.test", name: "Reader", emailVerified: true },
      { providerId: "apple", accountId: "apple-sub" },
    );
    const response = await signInNatively(auth, {
      token: await identityToken({ sub: "apple-sub", email: "other@privaterelay.appleid.com" }),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { user: { id: string } }).user.id).toBe(user.id);
    expect(db.user).toHaveLength(1);
  });

  it("creates a new account holding no Apple token, so deletion must re-authenticate", async () => {
    const { auth, db } = createTestAuth(BUNDLE_ID);
    const response = await signInNatively(auth, {
      token: await identityToken({ sub: "new-sub", email: "new@example.test" }),
      user: { name: { firstName: "New", lastName: "Reader" } },
    });
    expect(response.status).toBe(200);
    expect(db.user[0]?.name).toBe("New Reader");
    expect(db.account[0]?.accountId).toBe("new-sub");
    expect(db.account[0]?.refreshToken ?? null).toBeNull();
    expect(db.account[0]?.idToken ?? null).toBeNull();
  });

  it("rejects a native token while APPLE_APP_BUNDLE_ID is unset, as production is now", async () => {
    const { auth } = createTestAuth(undefined);
    const response = await signInNatively(auth, {
      token: await identityToken({ sub: "apple-sub", email: "a@example.test" }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a token issued to another app", async () => {
    const { auth } = createTestAuth(BUNDLE_ID);
    const response = await signInNatively(auth, {
      token: await identityToken({ sub: "apple-sub", aud: "com.other.app", email: "a@example.test" }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a nonce the token was not issued for", async () => {
    const { auth } = createTestAuth(BUNDLE_ID);
    const response = await signInNatively(auth, {
      token: await identityToken({
        sub: "apple-sub",
        email: "a@example.test",
        nonce: await sha256Hex("the-real-nonce"),
      }),
      nonce: "another-nonce",
    });
    expect(response.status).toBe(401);
  });

  it("rejects a token without an email, which the client answers with the web flow", async () => {
    const { auth } = createTestAuth(BUNDLE_ID);
    const response = await signInNatively(auth, {
      token: await identityToken({ sub: "apple-sub" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("nativeAppleBundleId", () => {
  const ready = {
    APPLE_CLIENT_ID: SERVICES_ID,
    APPLE_CLIENT_SECRET: "web-secret",
    APPLE_APP_BUNDLE_ID: BUNDLE_ID,
    APPLE_NATIVE_CLIENT_SECRET: "native-secret",
  };

  it("answers only when sign-in and the deletion revoke are both configured", () => {
    expect(nativeAppleBundleId(ready)).toBe(BUNDLE_ID);
    for (const missing of Object.keys(ready)) {
      expect(nativeAppleBundleId({ ...ready, [missing]: undefined })).toBeNull();
    }
    expect(nativeAppleBundleId({})).toBeNull();
  });
});
