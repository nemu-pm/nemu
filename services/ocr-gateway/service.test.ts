import { describe, expect, test } from "bun:test";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import { handleRequest, verifyConvexToken, type Env } from "./service";

const SITE = "https://convex.example.test";
const env: Env = {
  CONVEX_SITE_URL: SITE,
  OCR_ORIGIN: "https://origin.example.test",
  ORIGIN_SHARED_SECRET: "s3cret",
  ALLOWED_ORIGINS: "https://nemu.pm",
};

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "ES256", kid: "k1" };
  const getKey = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: { iss?: string; aud?: string; exp?: string | number; sub?: string } = {}) =>
    new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(claims.iss ?? SITE)
      .setAudience(claims.aud ?? "convex")
      .setSubject(claims.sub ?? "user-1")
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? "15m")
      .sign(privateKey);
  return { getKey, sign };
}

function post(path: string, token?: string): Request {
  return new Request(`https://ocr.nemu.pm${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ imageBase64: "x", requestId: "r" }),
  });
}

describe("verifyConvexToken", () => {
  test("accepts a token with the right issuer, audience and signature", async () => {
    const { getKey, sign } = await setup();
    expect(await verifyConvexToken(await sign(), SITE, { getKey })).toBe("user-1");
  });
  test("rejects wrong issuer, audience, expiry, signature and garbage", async () => {
    const { getKey, sign } = await setup();
    const other = await setup();
    for (const token of [
      await sign({ iss: "https://evil.test" }),
      await sign({ aud: "other" }),
      await sign({ exp: Math.floor(Date.now() / 1000) - 60 }),
      await other.sign(),
      "not-a-jwt",
    ]) {
      expect(await verifyConvexToken(token, SITE, { getKey })).toBeNull();
    }
  });
});

describe("gateway", () => {
  test("rejects missing or invalid tokens with 401 and never calls the origin", async () => {
    const { getKey } = await setup();
    let called = 0;
    const fetcher = (async () => (called++, new Response("{}"))) as never;
    for (const req of [post("/ocr"), post("/ocr", "bad"), post("/detect")]) {
      const res = await handleRequest(req, env, { getKey, fetcher });
      expect(res.status).toBe(401);
    }
    expect(called).toBe(0);
  });

  test("proxies a valid request with the shared secret, without the user token", async () => {
    const { getKey, sign } = await setup();
    let seen: { url: string; headers: Headers } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers) };
      return new Response("data: ok\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as never;
    const res = await handleRequest(post("/ocr", await sign()), env, { getKey, fetcher });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("data: ok\n\n");
    expect(seen!.url).toBe("https://origin.example.test/ocr");
    expect(seen!.headers.get("x-nemu-gateway-secret")).toBe("s3cret");
    expect(seen!.headers.get("authorization")).toBeNull();
  });

  test("health is open, other paths and methods are 404, preflight is 204", async () => {
    const fetcher = (async () => new Response('{"ok":true}')) as never;
    const health = await handleRequest(new Request("https://ocr.nemu.pm/health"), env, { fetcher });
    expect(health.status).toBe(200);
    expect((await handleRequest(new Request("https://ocr.nemu.pm/admin"), env, { fetcher })).status).toBe(404);
    expect((await handleRequest(new Request("https://ocr.nemu.pm/ocr"), env, { fetcher })).status).toBe(404);
    const pre = await handleRequest(
      new Request("https://ocr.nemu.pm/ocr", { method: "OPTIONS", headers: { origin: "https://nemu.pm" } }),
      env,
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://nemu.pm");
  });

  test("an unconfigured gateway fails closed", async () => {
    const res = await handleRequest(post("/ocr", "x"), {});
    expect(res.status).toBe(500);
  });
});
