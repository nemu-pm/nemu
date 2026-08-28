import { afterEach, describe, expect, test } from "bun:test";
import worker, { handleRequest, validateUrl, type Env } from "./service";

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
let requestSequence = 0;
const validOAuthTokenBody = new URLSearchParams({
  grant_type: "authorization_code",
  code: "secret-code",
  code_verifier: "v".repeat(43),
}).toString();

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
});

function proxyRequest(target: string, init: RequestInit = {}): Request {
  requestSequence += 1;
  const headers = new Headers(init.headers);
  headers.set("cf-connecting-ip", `203.0.113.${requestSequence}`);
  return new Request(
    `https://service.nemu.pm/proxy?url=${encodeURIComponent(target)}`,
    { ...init, headers },
  );
}

function oauthProxyRequest(target: string, init: RequestInit = {}): Request {
  requestSequence += 1;
  const headers = new Headers(init.headers);
  headers.set("cf-connecting-ip", `203.0.113.${requestSequence}`);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/x-www-form-urlencoded");
  }
  const method = init.method ?? "POST";
  const body =
    init.body ??
    (method.toUpperCase() === "POST" ? validOAuthTokenBody : undefined);
  return new Request(
    `https://service.nemu.pm/oauth-proxy-v2?url=${encodeURIComponent(target)}`,
    { ...init, method, body, headers },
  );
}

const env: Env = {
  RATE_LIMIT_REQUESTS: "1000",
  CACHE_TTL_MS: "300000",
};

test("Worker config enables cache and incoming-signal compatibility gates", async () => {
  const config = await Bun.file(
    new URL("./wrangler.toml", import.meta.url),
  ).text();
  expect(config).toContain('"cache_option_enabled"');
  expect(config).toContain('"enable_request_signal"');
  expect(config).toContain('"global_fetch_strictly_public"');
});

describe("proxy URL policy", () => {
  test("accepts public HTTP(S) hostnames", () => {
    expect(validateUrl("https://example.com/path", []).valid).toBe(true);
    expect(validateUrl("http://example.com/path", []).valid).toBe(true);
  });

  test("rejects credentials, internal names, and every IP-literal form", () => {
    for (const target of [
      "https://user:secret@example.com/",
      "https://example.com:8443/",
      "https://intranet/",
      "http://nas/",
      "http://localhost./",
      "http://service.internal/",
      "http://metadata.google.internal/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::127.0.0.1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[64:ff9b::127.0.0.1]/",
      "https://192.0.2.1/",
      "https://[2606:4700:4700::1111]/",
      "http://[fc00::1]/",
      "http://[fec0::1]/",
    ]) {
      expect(validateUrl(target, []).valid, target).toBe(false);
    }
  });

  test("matches allowlisted domains on a label boundary", () => {
    expect(validateUrl("https://cdn.example.com/", ["example.com"]).valid).toBe(
      true,
    );
    expect(
      validateUrl("https://example.com.attacker.test/", ["example.com"]).valid,
    ).toBe(false);
  });
});

describe("OAuth proxy v2 policy", () => {
  test("enforces HTTPS, POST, and form encoding before any subrequest", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("unexpected");
    }) as typeof fetch;

    const insecure = await handleRequest(
      oauthProxyRequest("http://auth.example/token", { body: "code=secret" }),
      env,
    );
    expect(insecure.status).toBe(400);
    expect(await insecure.text()).toContain("HTTPS");

    const get = await handleRequest(
      oauthProxyRequest("https://auth.example/token", { method: "GET" }),
      env,
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST, OPTIONS");

    const json = await handleRequest(
      oauthProxyRequest("https://auth.example/token", {
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(json.status).toBe(415);

    const malformedForm = await handleRequest(
      oauthProxyRequest("https://auth.example/token", {
        body: "grant_type=authorization_code&code=secret",
      }),
      env,
    );
    expect(malformedForm.status).toBe(400);
    expect(calls).toBe(0);
  });

  test("unconditionally refuses redirects and caps request and response bytes", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, {
        status: 307,
        headers: { Location: "https://auth.example/redirected-token" },
      });
    }) as typeof fetch;

    const redirect = await handleRequest(
      oauthProxyRequest("https://auth.example/token", {
        headers: {
          "x-nemu-proxy-redirect": "follow",
          "x-nemu-proxy-max-response-bytes": "16777216",
        },
        body: validOAuthTokenBody,
      }),
      env,
    );
    expect(redirect.status).toBe(502);
    expect(await redirect.text()).toContain("redirect refused");
    expect(calls).toBe(1);

    const oversizedRequest = await handleRequest(
      oauthProxyRequest("https://auth.example/token", {
        body: `code=${"x".repeat(64 * 1024)}`,
      }),
      env,
    );
    expect(oversizedRequest.status).toBe(413);
    expect(calls).toBe(1);

    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(new Uint8Array(128 * 1024 + 1), {
        headers: { "content-length": String(128 * 1024 + 1) },
      });
    }) as typeof fetch;
    const oversizedResponse = await handleRequest(
      oauthProxyRequest("https://auth.example/token", {
        headers: { "x-nemu-proxy-max-response-bytes": "16777216" },
        body: validOAuthTokenBody,
      }),
      env,
    );
    expect(oversizedResponse.status).toBe(413);
    expect(calls).toBe(2);
  });

  test("supports only POST preflight and rejects recursion through either route", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("unexpected");
    }) as typeof fetch;

    const postPreflight = await handleRequest(
      new Request("https://service.nemu.pm/oauth-proxy-v2", {
        method: "OPTIONS",
        headers: {
          Origin: "https://nemu.pm",
          "Access-Control-Request-Method": "POST",
        },
      }),
      { ...env, ALLOWED_ORIGINS: "https://nemu.pm" },
    );
    expect(postPreflight.status).toBe(204);
    expect(postPreflight.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );

    const getPreflight = await handleRequest(
      new Request("https://service.nemu.pm/oauth-proxy-v2", {
        method: "OPTIONS",
        headers: { "Access-Control-Request-Method": "GET" },
      }),
      env,
    );
    expect(getPreflight.status).toBe(405);

    for (const path of ["proxy", "oauth-proxy-v2"]) {
      const recursive = await handleRequest(
        oauthProxyRequest(
          `https://service.nemu.pm/${path}?url=https://auth.example/token`,
          { body: "code=secret" },
        ),
        { ...env, PROXY_ORIGINS: "https://service.nemu.pm" },
      );
      expect(recursive.status, path).toBe(400);
    }
    expect(calls).toBe(0);
  });

  test("forwards a bounded form request without caching the subrequest", async () => {
    let receivedInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      receivedInit = init;
      return new Response('{"access_token":"ok"}', {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await handleRequest(
      oauthProxyRequest("https://auth.example/token", {
        headers: { "x-proxy-accept-encoding": "identity" },
        body: validOAuthTokenBody,
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ access_token: "ok" });
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(receivedInit?.redirect).toBe("manual");
    expect(receivedInit?.cache).toBe("no-store");
    expect(new Headers(receivedInit?.headers).get("accept-encoding")).toBe(
      "identity",
    );
  });
});

describe("proxy upstream cancellation", () => {
  test("returns 504 and aborts a subrequest at the configured deadline", async () => {
    let observedSignal: AbortSignal | null | undefined;
    globalThis.fetch = ((_input, init) => {
      observedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        const abort = () =>
          reject(observedSignal?.reason ?? new Error("aborted"));
        if (observedSignal?.aborted) abort();
        else observedSignal?.addEventListener("abort", abort, { once: true });
      });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/slow"),
      { ...env, UPSTREAM_TIMEOUT_MS: "5" },
    );
    expect(response.status).toBe(504);
    expect(await response.text()).toContain("timed out");
    expect(observedSignal?.aborted).toBe(true);
  });

  test("keeps the deadline active while an OAuth response body is read", async () => {
    globalThis.fetch = (async (_input, init) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const abort = () =>
              controller.error(signal?.reason ?? new Error("aborted"));
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
          },
        }),
      );
    }) as typeof fetch;

    const response = await handleRequest(
      oauthProxyRequest("https://auth.example/slow-token", {
        body: validOAuthTokenBody,
      }),
      { ...env, UPSTREAM_TIMEOUT_MS: "5" },
    );
    expect(response.status).toBe(504);
    expect(await response.text()).toContain("timed out");
  });

  test("propagates the incoming request abort to the subrequest", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => {
      started = resolve;
    });
    let observedSignal: AbortSignal | null | undefined;
    globalThis.fetch = ((_input, init) => {
      observedSignal = init?.signal;
      started();
      return new Promise<Response>((_resolve, reject) => {
        const abort = () =>
          reject(observedSignal?.reason ?? new Error("aborted"));
        if (observedSignal?.aborted) abort();
        else observedSignal?.addEventListener("abort", abort, { once: true });
      });
    }) as typeof fetch;

    const pending = handleRequest(
      proxyRequest("https://public.example/cancelled", {
        signal: controller.signal,
      }),
      env,
    );
    await didStart;
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(499);
    expect(await response.text()).toContain("cancelled");
    expect(observedSignal?.aborted).toBe(true);
  });
});

describe("proxy redirect and body policy", () => {
  test("refuses OAuth/manual redirects without replaying a POST body", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(null, {
        status: 307,
        headers: { Location: "http://169.254.169.254/token" },
      });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://auth.example/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-nemu-proxy-redirect": "manual",
          "x-nemu-proxy-max-response-bytes": "131072",
        },
        body: "code=secret&code_verifier=also-secret",
      }),
      env,
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toContain("redirect refused");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(calls[0]?.init?.cache).toBe("no-store");
  });

  test("blocks a followed redirect to a private destination", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, {
        status: 307,
        headers: { Location: "http://127.0.0.1/private" },
      });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/start"),
      env,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toContain("IP-literal");
    expect(calls).toBe(1);
  });

  test("refuses invalid and recursively proxied redirect destinations", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            calls === 1
              ? "http://[invalid"
              : "https://service.nemu.pm/oauth-proxy-v2?url=https://example.com/token",
        },
      });
    }) as typeof fetch;

    const invalid = await handleRequest(
      proxyRequest("https://public.example/invalid-redirect"),
      env,
    );
    expect(invalid.status).toBe(502);
    expect(await invalid.text()).toContain("invalid redirect URL");

    const recursive = await handleRequest(
      proxyRequest("https://public.example/recursive-redirect"),
      { ...env, PROXY_ORIGINS: "https://service.nemu.pm" },
    );
    expect(recursive.status).toBe(502);
    expect(await recursive.text()).toContain("Recursive proxy redirect");
    expect(calls).toBe(2);
  });

  test("never replays a request body across origins", async () => {
    const calls: Array<{ input: string; body: BodyInit | null | undefined }> =
      [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input: String(input), body: init?.body });
      return new Response(null, {
        status: 307,
        headers: { Location: "https://attacker.example/collect" },
      });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://api.example/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: "secret" }),
      }),
      env,
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toContain("replay a request body");
    expect(calls).toHaveLength(1);
  });

  test("refuses HTTPS downgrade redirects", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, {
        status: 301,
        headers: { Location: "http://public.example/insecure" },
      });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/secure"),
      env,
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toContain("HTTPS downgrade");
    expect(calls).toBe(1);
  });

  test("preserves HEAD across a 303 and the origin representation length", async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return methods.length === 1
        ? new Response(null, {
            status: 303,
            headers: { Location: "https://public.example/final" },
          })
        : new Response(null, {
            status: 200,
            headers: {
              "content-length": "123",
              "content-encoding": "gzip",
            },
          });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/head", { method: "HEAD" }),
      env,
    );

    expect(methods).toEqual(["HEAD", "HEAD"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("123");
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(await response.text()).toBe("");
  });

  test("returns null bodies for upstream null-body statuses", async () => {
    for (const status of [204, 205, 304]) {
      globalThis.fetch = (async () =>
        new Response(null, {
          status,
          headers: status === 304 ? { "content-length": "321" } : undefined,
        })) as typeof fetch;

      const response = await handleRequest(
        proxyRequest(`https://public.example/null-${status}`),
        env,
      );
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
      expect(response.headers.get("content-length")).toBe(
        status === 304 ? "321" : null,
      );
    }
  });

  test("strips source secrets before a public cross-origin redirect", async () => {
    const headersByHop: Headers[] = [];
    globalThis.fetch = (async (_input, init) => {
      headersByHop.push(new Headers(init?.headers));
      return headersByHop.length === 1
        ? new Response(null, {
            status: 307,
            headers: { Location: "https://cdn.example/asset" },
          })
        : new Response("ok", { status: 200 });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://origin.example/asset", {
        headers: {
          "x-proxy-x-api-key": "secret",
          "x-proxy-authorization": "Bearer secret",
          "x-proxy-accept": "text/plain",
        },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(headersByHop).toHaveLength(2);
    expect(headersByHop[0]?.get("x-api-key")).toBe("secret");
    expect(headersByHop[1]?.get("x-api-key")).toBeNull();
    expect(headersByHop[1]?.get("authorization")).toBeNull();
    expect(headersByHop[1]?.get("accept")).toBe("text/plain");
  });

  test("enforces the caller's bounded response limit", async () => {
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(16), {
        headers: { "content-length": "16" },
      })) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/large", {
        headers: { "x-nemu-proxy-max-response-bytes": "8" },
      }),
      env,
    );
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("8 byte safety limit");
  });

  test("enforces a smaller caller bound on an existing cache entry", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(new Uint8Array(16), {
        headers: {
          "cache-control": "public, max-age=300",
          "content-length": "16",
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/cache-bound";
    const fill = await handleRequest(
      proxyRequest(target, {
        headers: { "x-nemu-proxy-max-response-bytes": "32" },
      }),
      env,
    );
    expect(fill.status).toBe(200);

    const boundedHit = await handleRequest(
      proxyRequest(target, {
        headers: { "x-nemu-proxy-max-response-bytes": "8" },
      }),
      env,
    );
    expect(boundedHit.status).toBe(413);
    expect(await boundedHit.text()).toContain("8 byte safety limit");
    expect(calls).toBe(1);
  });

  test("evicts cached entries immediately at the configured entry cap", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `public-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": "public, max-age=300",
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;
    const oneEntryEnv = { ...env, MAX_CACHE_SIZE: "1" };

    await handleRequest(
      proxyRequest("https://public.example/cache-cap-a"),
      oneEntryEnv,
    );
    await handleRequest(
      proxyRequest("https://public.example/cache-cap-b"),
      oneEntryEnv,
    );
    await handleRequest(
      proxyRequest("https://public.example/cache-cap-a"),
      oneEntryEnv,
    );

    expect(calls).toBe(3);
  });

  test("does not cache a response that requires immediate revalidation", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(`fresh-${calls}`, {
        headers: { "cache-control": "public, max-age=0" },
      });
    }) as typeof fetch;

    const target = "https://public.example/revalidate";
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "fresh-1",
    );
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "fresh-2",
    );
    expect(calls).toBe(2);
  });

  test("does not cache wildcard-vary or conflicting freshness directives", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `fresh-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control":
            calls <= 2
              ? "public, max-age=300"
              : "public, max-age=300, max-age=600",
          "content-length": String(body.length),
          ...(calls <= 2 ? { vary: "Accept, *" } : {}),
        },
      });
    }) as typeof fetch;

    const wildcardTarget = "https://public.example/vary-wildcard";
    await handleRequest(proxyRequest(wildcardTarget), env);
    await handleRequest(proxyRequest(wildcardTarget), env);
    const duplicateTarget = "https://public.example/duplicate-freshness";
    await handleRequest(proxyRequest(duplicateTarget), env);
    await handleRequest(proxyRequest(duplicateTarget), env);
    expect(calls).toBe(4);
  });

  test("canonicalizes fragments before caching the HTTP resource", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("same-resource", {
        headers: {
          "cache-control": "public, max-age=300",
          "content-length": "13",
        },
      });
    }) as typeof fetch;

    await handleRequest(
      proxyRequest("https://public.example/fragmented#first"),
      env,
    );
    const hit = await handleRequest(
      proxyRequest("https://public.example/fragmented#second"),
      env,
    );
    expect(await hit.text()).toBe("same-resource");
    expect(hit.headers.get("x-cache")).toBe("HIT");
    expect(calls).toBe(1);
  });

  test("honors an origin freshness lifetime shorter than the service TTL", async () => {
    let now = 1_900_000_000_000;
    Date.now = () => now;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `fresh-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": "public, max-age=1",
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/short-freshness";
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "fresh-1",
    );
    now += 500;
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "fresh-1",
    );
    now += 600;
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "fresh-2",
    );
    expect(calls).toBe(2);
  });

  test("accounts for an origin Date older than its freshness lifetime", async () => {
    const now = 1_900_000_000_000;
    Date.now = () => now;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `stale-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": "public, max-age=60",
          date: new Date(now - 60 * 60 * 1000).toUTCString(),
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/already-stale-date";
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "stale-1",
    );
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "stale-2",
    );
    expect(calls).toBe(2);
  });

  test("includes upstream response delay in corrected Age", async () => {
    let now = 1_900_000_000_000;
    Date.now = () => now;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      now += 30_000;
      const body = `delayed-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": "public, max-age=60",
          date: new Date(now).toUTCString(),
          age: "40",
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/corrected-age-delay";
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "delayed-1",
    );
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "delayed-2",
    );
    expect(calls).toBe(2);
  });

  test("reports corrected Age and expires after Date-derived apparent age", async () => {
    let now = 1_900_000_000_000;
    Date.now = () => now;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `dated-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": "public, max-age=60",
          date: new Date(1_900_000_000_000 - 30_000).toUTCString(),
          age: "5",
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/apparent-age";
    await (await handleRequest(proxyRequest(target), env)).arrayBuffer();
    now += 20_000;
    const hit = await handleRequest(proxyRequest(target), env);
    expect(hit.headers.get("x-cache")).toBe("HIT");
    expect(Number(hit.headers.get("age"))).toBeGreaterThanOrEqual(50);
    await hit.arrayBuffer();
    now += 11_000;
    expect(await (await handleRequest(proxyRequest(target), env)).text()).toBe(
      "dated-2",
    );
    expect(calls).toBe(2);
  });

  test("does not cache malformed Age or Date metadata", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `invalid-age-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": "public, max-age=300",
          ...(calls <= 2 ? { age: "1, 2" } : { date: "not-a-date" }),
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;

    const ageTarget = "https://public.example/malformed-age";
    await (await handleRequest(proxyRequest(ageTarget), env)).arrayBuffer();
    await (await handleRequest(proxyRequest(ageTarget), env)).arrayBuffer();
    const dateTarget = "https://public.example/malformed-date";
    await (await handleRequest(proxyRequest(dateTarget), env)).arrayBuffer();
    await (await handleRequest(proxyRequest(dateTarget), env)).arrayBuffer();
    expect(calls).toBe(4);
  });

  test("does not cache an unmatched quoted freshness lifetime", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const body = `invalid-lifetime-${calls}`;
      return new Response(body, {
        headers: {
          "cache-control": 'public, max-age="300',
          "content-length": String(body.length),
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/unmatched-cache-quote";
    await (await handleRequest(proxyRequest(target), env)).arrayBuffer();
    await (await handleRequest(proxyRequest(target), env)).arrayBuffer();
    expect(calls).toBe(2);
  });

  test("accounts for an evicted cache buffer until its active stream closes", async () => {
    const bodySize = 128 * 1024;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(bodySize), {
        headers: {
          "cache-control": "public, max-age=300",
          "content-length": String(bodySize),
        },
      })) as typeof fetch;
    const oneEntryEnv = { ...env, MAX_CACHE_SIZE: "1" };

    const first = await handleRequest(
      proxyRequest("https://public.example/active-cache-a"),
      oneEntryEnv,
    );
    const second = await handleRequest(
      proxyRequest("https://public.example/active-cache-b"),
      oneEntryEnv,
    );
    await second.arrayBuffer();

    const before = (await (
      await handleRequest(
        new Request("https://service.nemu.pm/health"),
        oneEntryEnv,
      )
    ).json()) as { stats: { cacheBytes: number } };
    await first.body?.cancel();
    const after = (await (
      await handleRequest(
        new Request("https://service.nemu.pm/health"),
        oneEntryEnv,
      )
    ).json()) as { stats: { cacheBytes: number } };
    expect(
      before.stats.cacheBytes - after.stats.cacheBytes,
    ).toBeGreaterThanOrEqual(bodySize);
  });

  test("reserves proxy metadata response headers", async () => {
    globalThis.fetch = (async () =>
      new Response("ok", {
        headers: {
          "x-cache": "FORGED",
          "x-ratelimit-limit": "999999",
          "x-ratelimit-remaining": "999999",
        },
      })) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/metadata-spoof"),
      env,
    );
    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(response.headers.get("x-ratelimit-limit")).toBe("1000");
    expect(response.headers.get("x-ratelimit-remaining")).not.toBe("999999");
  });

  test("proxies a real OPTIONS request but handles a CORS preflight locally", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("target-options");
    }) as typeof fetch;

    const target = "https://public.example/options";
    const actual = await handleRequest(
      proxyRequest(target, { method: "OPTIONS" }),
      env,
    );
    expect(await actual.text()).toBe("target-options");
    expect(calls).toBe(1);

    const preflight = await handleRequest(
      proxyRequest(target, {
        method: "OPTIONS",
        headers: { "access-control-request-method": "POST" },
      }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(calls).toBe(1);
  });

  test("strips downstream client-routing identity headers", async () => {
    let targetHeaders = new Headers();
    globalThis.fetch = (async (_input, init) => {
      targetHeaders = new Headers(init?.headers);
      return new Response("ok");
    }) as typeof fetch;

    await handleRequest(
      proxyRequest("https://public.example/routing", {
        headers: {
          Forwarded: "for=10.0.0.1",
          "X-Forwarded-For": "10.0.0.1",
          "X-Real-IP": "10.0.0.2",
          "X-Proxy-X-Forwarded-Host": "internal.example",
          "X-Proxy-Origin": "https://trusted.example",
          "X-Proxy-Referer": "https://attacker.example/",
          "X-Proxy-Proxy-Authorization": "Basic secret",
          "X-Proxy-Sec-Fetch-Site": "same-origin",
          "Sec-CH-UA": '"Forged"',
          Via: "attacker",
        },
      }),
      env,
    );

    for (const name of [
      "forwarded",
      "x-forwarded-for",
      "x-real-ip",
      "x-forwarded-host",
      "origin",
      "referer",
      "proxy-authorization",
      "sec-fetch-site",
      "sec-ch-ua",
      "via",
    ]) {
      expect(targetHeaders.get(name), name).toBeNull();
    }
  });

  test("allows only the target's bare origin as an explicit Referer", async () => {
    let targetHeaders = new Headers();
    globalThis.fetch = (async (_input, init) => {
      targetHeaders = new Headers(init?.headers);
      return new Response("ok");
    }) as typeof fetch;

    await handleRequest(
      proxyRequest("https://images.example/page.jpg", {
        headers: { "X-Proxy-Referer": "https://images.example/" },
      }),
      env,
    );
    expect(targetHeaders.get("referer")).toBe("https://images.example/");
  });

  test("rejects recursive targets and disallowed browser origins", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("unexpected");
    }) as typeof fetch;

    const recursive = await handleRequest(
      proxyRequest("https://service.nemu.pm/proxy?url=https://example.com"),
      { ...env, PROXY_ORIGINS: "https://service.nemu.pm" },
    );
    expect(recursive.status).toBe(400);

    const disallowed = await handleRequest(
      proxyRequest("https://public.example/data", {
        headers: { Origin: "https://attacker.example" },
      }),
      { ...env, ALLOWED_ORIGINS: "https://nemu.pm" },
    );
    expect(disallowed.status).toBe(403);
    expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();

    const invalidAllowlist = await handleRequest(
      proxyRequest("https://public.example/data", {
        headers: { Origin: "https://attacker.example" },
      }),
      { ...env, ALLOWED_ORIGINS: "not-an-origin" },
    );
    expect(invalidAllowlist.status).toBe(403);
    expect(calls).toBe(0);
  });

  test("strips hop-by-hop and connection-nominated response headers", async () => {
    globalThis.fetch = (async () =>
      new Response("ok", {
        headers: {
          Connection: "X-Remove-Me",
          "Keep-Alive": "timeout=5",
          Via: "upstream-proxy",
          "X-Forwarded-For": "10.0.0.1",
          "X-Remove-Me": "secret-routing-state",
        },
      })) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/response-routing"),
      env,
    );
    for (const name of [
      "connection",
      "keep-alive",
      "via",
      "x-forwarded-for",
      "x-remove-me",
    ]) {
      expect(response.headers.get(name), name).toBeNull();
    }
  });

  test("strips origin-scoped reporting, authentication, and policy headers", async () => {
    const originScopedHeaders = {
      "Alt-Svc": 'h3=":443"',
      "Clear-Site-Data": '"cookies"',
      NEL: '{"report_to":"default"}',
      "Report-To": '{"group":"default","endpoints":[]}',
      "Reporting-Endpoints": 'default="https://reports.example/"',
      "WWW-Authenticate": 'Basic realm="upstream"',
      "Proxy-Authenticate": 'Basic realm="proxy"',
      "Strict-Transport-Security": "max-age=31536000",
      "Accept-CH": "Sec-CH-UA-Model",
      "Origin-Trial": "token",
      "Permissions-Policy": "camera=()",
      "Content-Security-Policy": "default-src 'none'",
      "Cross-Origin-Opener-Policy": "same-origin",
      Refresh: "0;url=https://attacker.example/",
    };
    globalThis.fetch = (async () =>
      new Response("ok", { headers: originScopedHeaders })) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/origin-policy"),
      env,
    );
    for (const name of Object.keys(originScopedHeaders).filter(
      (name) => name !== "Content-Security-Policy",
    )) {
      expect(response.headers.get(name), name).toBeNull();
    }
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("streams uncached bodies and aborts a chunked response at the caller cap", async () => {
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(16));
            controller.close();
          },
        }),
      )) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/chunked-limit", {
        headers: { "x-nemu-proxy-max-response-bytes": "8" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow("8 byte safety limit");
  });

  test("never shares cached authenticated responses", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(`private-${calls}`, {
        headers: { "cache-control": "public, max-age=300" },
      });
    }) as typeof fetch;

    for (const credential of ["Bearer a", "Bearer b", "Bearer a"]) {
      const response = await handleRequest(
        proxyRequest("https://public.example/account", {
          headers: { "x-proxy-authorization": credential },
        }),
        env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(calls).toBe(3);
  });

  test("does not retain credential-like query parameters in the shared cache", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(`secret-query-${calls}`, {
        headers: {
          "cache-control": "public, max-age=300",
          "content-length": "14",
        },
      });
    }) as typeof fetch;

    const target = "https://public.example/data?access_token=secret";
    await (await handleRequest(proxyRequest(target), env)).arrayBuffer();
    await (await handleRequest(proxyRequest(target), env)).arrayBuffer();
    expect(calls).toBe(2);
  });

  test("keeps translated Vary responses out of the browser cache", async () => {
    globalThis.fetch = (async () =>
      new Response("localized", {
        headers: {
          "cache-control": "public, max-age=300",
          vary: "Accept-Language",
        },
      })) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/localized", {
        headers: { "x-proxy-accept-language": "ja" },
      }),
      env,
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("the Worker entrypoint ignores ExecutionContext when rate limiting", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("ok");
    }) as typeof fetch;
    const limitedEnv: Env = {
      RATE_LIMIT_REQUESTS: "1",
      RATE_LIMIT_WINDOW_MS: "60000",
    };
    const makeRequest = () =>
      new Request(
        "https://service.nemu.pm/proxy?url=https%3A%2F%2Fpublic.example%2Fworker-entrypoint",
        { headers: { "cf-connecting-ip": "203.0.113.250" } },
      );

    const first = await worker.fetch(makeRequest(), limitedEnv, {
      waitUntil() {},
    });
    const second = await worker.fetch(makeRequest(), limitedEnv, {
      waitUntil() {},
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("cache-control")).toBe("private, no-store");
    expect(calls).toBe(1);
  });

  test("marks health and statistics responses no-store", async () => {
    for (const path of ["health", "stats"]) {
      const response = await handleRequest(
        new Request(`https://service.nemu.pm/${path}`),
        env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  test("does not forward proxy-domain cookies or origin Set-Cookie", async () => {
    let targetHeaders = new Headers();
    globalThis.fetch = (async (_input, init) => {
      targetHeaders = new Headers(init?.headers);
      return new Response("ok", {
        headers: { "set-cookie": "session=target-secret" },
      });
    }) as typeof fetch;

    const response = await handleRequest(
      proxyRequest("https://public.example/cookies", {
        headers: { Cookie: "proxy-domain-cookie=secret" },
      }),
      env,
    );
    expect(targetHeaders.get("cookie")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
