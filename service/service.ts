/**
 * CORS proxy server for Aidoku sources
 * Compatible with Cloudflare Workers and local Bun runtime
 *
 * Features:
 * - Rate limiting per IP (in-memory, resets on cold starts)
 * - Response caching (in-memory)
 * - URL validation
 * - Health check endpoint
 *
 * Deploy to Cloudflare: wrangler deploy
 * Run locally: bun service/service.ts
 */

export interface Env {
  PORT?: string;
  RATE_LIMIT_REQUESTS?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  CACHE_TTL_MS?: string;
  MAX_CACHE_SIZE?: string;
  ALLOWED_DOMAINS?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface CacheEntry {
  data: ArrayBuffer;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
}

// In-memory state (resets on cold starts for Workers)
const rateLimits = new Map<string, RateLimitEntry>();
const cache = new Map<string, CacheEntry>();
const stats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimited: 0,
  errors: 0,
  startTime: Date.now(),
};

function getConfig(env: Env) {
  return {
    rateLimitRequests: parseInt(env.RATE_LIMIT_REQUESTS || "100", 10),
    rateLimitWindowMs: parseInt(env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    cacheTtlMs: parseInt(env.CACHE_TTL_MS || "300000", 10),
    maxCacheSize: parseInt(env.MAX_CACHE_SIZE || "1000", 10),
    allowedDomains: env.ALLOWED_DOMAINS?.split(",").map(d => d.trim()).filter(Boolean) || [],
  };
}

function getClientIp(req: Request): string {
  // CF-Connecting-IP is set by Cloudflare
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return "unknown";
}

function checkRateLimit(
  ip: string,
  config: ReturnType<typeof getConfig>
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  let entry = rateLimits.get(ip);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + config.rateLimitWindowMs };
    rateLimits.set(ip, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= config.rateLimitRequests,
    remaining: Math.max(0, config.rateLimitRequests - entry.count),
    resetTime: entry.resetTime,
  };
}

function validateUrl(urlString: string, allowedDomains: string[]): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, error: "Only HTTP/HTTPS URLs are allowed" };
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname === "::1"
    ) {
      return { valid: false, error: "Internal/localhost URLs are not allowed" };
    }

    if (allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return { valid: false, error: "Domain not in allowed list" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

function getCacheKey(method: string, url: string, headers: Record<string, string>): string {
  const relevantHeaders = ["accept", "accept-language"];
  const headerPart = relevantHeaders
    .map(h => headers[h.toLowerCase()])
    .filter(Boolean)
    .join("|");
  return `${method}:${url}:${headerPart}`;
}

function cleanupCache(config: ReturnType<typeof getConfig>) {
  const now = Date.now();

  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetTime) rateLimits.delete(ip);
  }

  for (const [key, entry] of cache) {
    if (now - entry.timestamp > config.cacheTtlMs) cache.delete(key);
  }

  if (cache.size > config.maxCacheSize) {
    const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = cache.size - config.maxCacheSize + 100;
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

async function handleRequest(req: Request, env: Env): Promise<Response> {
  const config = getConfig(env);
  const url = new URL(req.url);
  const clientIp = getClientIp(req);

  stats.totalRequests++;

  // Periodic cleanup (simple approach, runs on each request)
  if (stats.totalRequests % 100 === 0) {
    cleanupCache(config);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (url.pathname === "/health") {
    return Response.json(
      {
        status: "ok",
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
        stats: { ...stats, cacheSize: cache.size, rateLimitEntries: rateLimits.size },
      },
      { headers: corsHeaders }
    );
  }

  if (url.pathname === "/stats") {
    return Response.json(
      {
        totalRequests: stats.totalRequests,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        cacheHitRate:
          stats.totalRequests > 0
            ? ((stats.cacheHits / stats.totalRequests) * 100).toFixed(2) + "%"
            : "0%",
        rateLimited: stats.rateLimited,
        errors: stats.errors,
        cacheSize: cache.size,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      },
      { headers: corsHeaders }
    );
  }

  if (url.pathname !== "/proxy") {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const rateLimit = checkRateLimit(clientIp, config);
  if (!rateLimit.allowed) {
    stats.rateLimited++;
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
        "X-RateLimit-Limit": config.rateLimitRequests.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": rateLimit.resetTime.toString(),
      },
    });
  }

  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
  }

  const validation = validateUrl(target, config.allowedDomains);
  if (!validation.valid) {
    return new Response(validation.error || "Invalid URL", { status: 400, headers: corsHeaders });
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== "host" &&
      lowerKey !== "origin" &&
      lowerKey !== "referer" &&
      !lowerKey.startsWith("x-proxy-") &&
      !lowerKey.startsWith("cf-")
    ) {
      headers[key] = value;
    }
  });

  req.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("x-proxy-")) {
      headers[key.slice(8)] = value;
    }
  });

  const cacheKey = getCacheKey(req.method, target, headers);
  if (req.method === "GET") {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < config.cacheTtlMs) {
      stats.cacheHits++;
      return new Response(cached.data, {
        status: cached.status,
        headers: {
          ...corsHeaders,
          ...cached.headers,
          "X-Cache": "HIT",
          "X-RateLimit-Limit": config.rateLimitRequests.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
        },
      });
    }
    stats.cacheMisses++;
  }

  try {
    const body =
      req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;

    const res = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "follow",
    });

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "X-Cache": "MISS",
      "X-RateLimit-Limit": config.rateLimitRequests.toString(),
      "X-RateLimit-Remaining": rateLimit.remaining.toString(),
    };

    const headersToForward: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "content-encoding" &&
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "content-length" &&
        !lowerKey.startsWith("access-control-")
      ) {
        responseHeaders[key] = value;
        headersToForward[key] = value;
      }
    });

    const data = await res.arrayBuffer();
    responseHeaders["Content-Length"] = data.byteLength.toString();

    if (req.method === "GET" && res.status >= 200 && res.status < 400) {
      cache.set(cacheKey, {
        data,
        headers: headersToForward,
        status: res.status,
        timestamp: Date.now(),
      });
    }

    return new Response(data, { status: res.status, headers: responseHeaders });
  } catch (error) {
    stats.errors++;
    console.error("Proxy error:", error);
    return new Response(`Proxy error: ${error}`, { status: 500, headers: corsHeaders });
  }
}

// Cloudflare Workers export
export default {
  fetch: handleRequest,
};

export { handleRequest, getConfig, type Env };

