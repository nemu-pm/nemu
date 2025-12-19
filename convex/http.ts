import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

const allowedOrigins = [
  process.env.SITE_URL,
  process.env.DEV_URL,
  "http://localhost:5662",
].filter(Boolean) as string[];

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

// Global OPTIONS handler for all /api/auth routes
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

// Register Better Auth routes with CORS wrapper
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins,
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  },
});

export default http;
