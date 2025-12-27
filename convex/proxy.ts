/**
 * Generic CORS proxy via Convex HTTP actions.
 * Use this when Cloudflare Workers proxy is blocked (e.g., MangaUpdates).
 */

import { httpAction } from "./_generated/server";

export const proxy = httpAction(async (_, request) => {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  // Validate URL
  let target: URL;
  try {
    target = new URL(targetUrl);
    if (!["http:", "https:"].includes(target.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  // Build headers for the proxied request
  const headers: Record<string, string> = {};
  
  // Forward specific headers, convert x-proxy-* to real headers
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    
    // Convert x-proxy-* headers
    if (lowerKey.startsWith("x-proxy-")) {
      headers[key.slice(8)] = value;
    }
    // Forward content-type and accept
    else if (lowerKey === "content-type" || lowerKey === "accept") {
      headers[key] = value;
    }
  });

  // Default headers if not provided
  if (!headers["User-Agent"] && !headers["user-agent"]) {
    headers["User-Agent"] = "Mozilla/5.0 (compatible; Nemu/1.0)";
  }

  try {
    // Get request body for POST/PUT/PATCH
    let body: ArrayBuffer | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.arrayBuffer();
    }

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    // Build response headers
    const responseHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
      "Access-Control-Allow-Headers": "*",
    });

    // Forward content-type from response
    const contentType = response.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }

    const data = await response.arrayBuffer();
    return new Response(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[ConvexProxy] Error:", error);
    return new Response(`Proxy error: ${error}`, { status: 500 });
  }
});

// Handle CORS preflight
export const proxyOptions = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
});

