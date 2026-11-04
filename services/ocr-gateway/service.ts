/**
 * Authenticated front door for the OCR service (replaces direct access to the
 * vast.ai host). The caller's Convex/Better Auth JWT is verified locally against
 * the deployment's JWKS (cached by jose); anything else gets 401. Valid requests
 * are proxied to OCR_ORIGIN with a shared-secret header, so the GPU box needs no
 * Convex access and the origin can refuse everything else.
 *
 * JWT facts (from @convex-dev/better-auth): issuer = CONVEX_SITE_URL, audience =
 * "convex", JWKS at `${CONVEX_SITE_URL}/api/auth/convex/jwks`, short-lived
 * (default 15 minutes), `sub` = the user id.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface Env {
  CONVEX_SITE_URL?: string;
  OCR_ORIGIN?: string;
  ORIGIN_SHARED_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  MAX_BODY_BYTES?: string;
}

const PROTECTED_PATHS = new Set(["/ocr", "/detect"]);
const OPEN_PATHS = new Set(["/health"]);

const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(siteUrl: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(siteUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${siteUrl}/api/auth/convex/jwks`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
    jwksCache.set(siteUrl, jwks);
  }
  return jwks;
}

export type VerifyOptions = { getKey?: JWTVerifyGetKey; now?: Date };

/** Returns the user id of a valid token, or null. */
export async function verifyConvexToken(
  token: string,
  siteUrl: string,
  options: VerifyOptions = {},
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, options.getKey ?? jwksFor(siteUrl), {
      issuer: siteUrl,
      audience: "convex",
      ...(options.now ? { currentDate: options.now } : {}),
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]!.trim() : null;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

export async function handleRequest(
  request: Request,
  env: Env,
  options: VerifyOptions & { fetcher?: typeof fetch } = {},
): Promise<Response> {
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.CONVEX_SITE_URL || !env.OCR_ORIGIN) {
    return json(500, { code: "gateway_not_configured" }, cors);
  }

  const open = OPEN_PATHS.has(url.pathname) && request.method === "GET";
  const protectedPath = PROTECTED_PATHS.has(url.pathname) && request.method === "POST";
  if (!open && !protectedPath) return json(404, { code: "not_found" }, cors);

  if (protectedPath) {
    const token = bearer(request);
    const userId = token ? await verifyConvexToken(token, env.CONVEX_SITE_URL, options) : null;
    if (!userId) return json(401, { code: "unauthorized" }, cors);
    const limit = Number(env.MAX_BODY_BYTES ?? 25_000_000);
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > limit) return json(413, { code: "too_large" }, cors);
  }

  const upstreamHeaders = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) upstreamHeaders.set("content-type", contentType);
  if (env.ORIGIN_SHARED_SECRET) upstreamHeaders.set("x-nemu-gateway-secret", env.ORIGIN_SHARED_SECRET);

  const upstream = await (options.fetcher ?? fetch)(`${env.OCR_ORIGIN}${url.pathname}`, {
    method: request.method,
    headers: upstreamHeaders,
    body: request.method === "POST" ? request.body : undefined,
    signal: request.signal,
  });
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
