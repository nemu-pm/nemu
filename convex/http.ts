import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { proxy, proxyOptions } from "./proxy";

const http = httpRouter();

// Generic CORS proxy (for APIs that block Cloudflare)
http.route({
  path: "/proxy",
  method: "GET",
  handler: proxy,
});
http.route({
  path: "/proxy",
  method: "POST",
  handler: proxy,
});
http.route({
  path: "/proxy",
  method: "OPTIONS",
  handler: proxyOptions,
});

const allowedOrigins = [process.env.SITE_URL, process.env.DEV_URL].filter(
  Boolean
) as string[];

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

http.route({
  pathPrefix: "/api/auth/",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const origin = request.headers.get("Origin");
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }),
});

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins,
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  },
});

export default http;
