/**
 * Narrow MangaUpdates CORS relay via Convex HTTP actions.
 *
 * MangaUpdates blocks the Worker egress path. This endpoint is intentionally
 * not a generic proxy: keeping the exact host/path/method contract here avoids
 * turning the Convex deployment into an SSRF or arbitrary relay primitive.
 */

import { httpAction } from "./_generated/server";

const MANGAUPDATES_ORIGIN = "https://api.mangaupdates.com";
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_SEARCH_CHARS = 256;
const MAX_RESULTS = 20;

export function validateConvexProxyTarget(
  value: string,
  method: string,
): URL | null {
  try {
    const target = new URL(value);
    if (
      target.origin !== MANGAUPDATES_ORIGIN ||
      target.username ||
      target.password ||
      target.hash
    ) {
      return null;
    }

    const normalizedMethod = method.toUpperCase();
    const isSearch = target.pathname === "/v1/series/search";
    const isDetail = /^\/v1\/(?:series|authors)\/\d+$/.test(target.pathname);
    if (
      (isSearch && normalizedMethod === "POST" && !target.search) ||
      (isDetail && normalizedMethod === "GET" && !target.search)
    ) {
      return target;
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeMangaUpdatesSearchBody(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as {
      search?: unknown;
      per_page?: unknown;
    };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.search !== "string" ||
      parsed.search.trim().length === 0 ||
      parsed.search.length > MAX_SEARCH_CHARS ||
      !Number.isSafeInteger(parsed.per_page) ||
      (parsed.per_page as number) < 1 ||
      (parsed.per_page as number) > MAX_RESULTS
    ) {
      return null;
    }
    return JSON.stringify({
      search: parsed.search,
      per_page: parsed.per_page,
    });
  } catch {
    return null;
  }
}

async function readBodyWithinLimit(
  message: Request | Response,
  limit: number,
): Promise<ArrayBuffer> {
  const declaredLength = Number(message.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error("BODY_LIMIT");
  }
  if (!message.body) return new ArrayBuffer(0);

  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error("BODY_LIMIT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer as ArrayBuffer;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Proxy-User-Agent",
  "Access-Control-Max-Age": "86400",
};

export const proxy = httpAction(async (_, request) => {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  const target = validateConvexProxyTarget(targetUrl, request.method);
  if (!target) {
    return new Response("Unsupported proxy target", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const accept = request.headers.get("accept") ?? "application/json";
  const requestedUserAgent = request.headers.get("x-proxy-user-agent");
  const userAgent =
    requestedUserAgent && requestedUserAgent.length <= 512
      ? requestedUserAgent
      : "Mozilla/5.0 (compatible; Nemu/1.0)";
  const headers: Record<string, string> = {
    Accept: accept.length <= 512 ? accept : "application/json",
    "User-Agent": userAgent,
  };

  try {
    let body: string | undefined;
    if (request.method === "POST") {
      const requestBytes = await readBodyWithinLimit(
        request,
        MAX_REQUEST_BYTES,
      );
      const normalizedBody = normalizeMangaUpdatesSearchBody(
        new TextDecoder().decode(requestBytes),
      );
      if (!normalizedBody) {
        return new Response("Invalid search request", {
          status: 400,
          headers: corsHeaders,
        });
      }
      headers["Content-Type"] = "application/json";
      body = normalizedBody;
    }

    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      return new Response("Upstream redirect refused", {
        status: 502,
        headers: corsHeaders,
      });
    }

    const responseHeaders = new Headers({
      ...corsHeaders,
    });

    // Forward content-type from response
    const contentType = response.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }

    const data = await readBodyWithinLimit(response, MAX_RESPONSE_BYTES);
    responseHeaders.set("Content-Length", String(data.byteLength));
    return new Response(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (!(error instanceof Error && error.message === "BODY_LIMIT")) {
      console.error(
        "[ConvexProxy] Request failed.",
        error instanceof Error ? error.name : "UnknownError",
      );
    }
    return new Response(
      error instanceof Error && error.message === "BODY_LIMIT"
        ? "Proxy body limit exceeded"
        : "Proxy request failed",
      {
        status:
          error instanceof Error && error.message === "BODY_LIMIT" ? 413 : 502,
        headers: corsHeaders,
      },
    );
  }
});

// Handle CORS preflight
export const proxyOptions = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
});
