import { afterEach, describe, expect, test } from "bun:test";
import { createNativeTransport, encodeForm } from "./http";

const realFetch = globalThis.fetch;

/** The web fallback of the native fetch: what reaches `fetch` is what native gets. */
function captureFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("", { status: 303, headers: { location: "/" } });
  }) as typeof fetch;
  return calls;
}

describe("self-hosted transport", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("encodes a login form", () => {
    expect(encodeForm({ user: "a b", pass: "p&=?", "csrf-token": "x" })).toBe("user=a%20b&pass=p%26%3D%3F&csrf-token=x");
  });

  test("a form post that keeps its redirect", async () => {
    const calls = captureFetch();
    const response = await createNativeTransport("scope")({
      url: "http://nas.example.com:4567/login.html",
      method: "POST",
      form: { user: "reader", pass: "pw" },
      followRedirects: false,
    });
    expect(response.status).toBe(303);
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      body: "user=reader&pass=pw",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  });

  test("redirects are followed unless asked", async () => {
    const calls = captureFetch();
    await createNativeTransport("scope")({ url: "http://nas.example.com:4567/api/graphql", method: "POST", json: { query: "{a}" } });
    expect(calls[0]?.init.redirect).toBeUndefined();
    expect(calls[0]?.init).toMatchObject({ body: '{"query":"{a}"}', headers: { "Content-Type": "application/json" } });
  });
});
