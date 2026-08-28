#!/usr/bin/env bun
/**
 * Local development server - run with: bun services/proxy/dev.ts
 */

import { handleRequest, getConfig, type Env } from "./service";

const port = parseInt(process.env.PORT || "3001", 10);
const hostname = process.env.HOST || "127.0.0.1";
const env: Env = {
  PORT: process.env.PORT,
  RATE_LIMIT_REQUESTS: process.env.RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  CACHE_TTL_MS: process.env.CACHE_TTL_MS,
  MAX_CACHE_SIZE: process.env.MAX_CACHE_SIZE,
  ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
  ALLOWED_ORIGINS:
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173",
  PROXY_ORIGINS: process.env.PROXY_ORIGINS,
  UPSTREAM_TIMEOUT_MS: process.env.UPSTREAM_TIMEOUT_MS,
};

const config = getConfig(env);
const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);
if (!loopbackHostnames.has(hostname) && config.allowedDomains.length === 0) {
  throw new Error(
    "Refusing to expose the development proxy without ALLOWED_DOMAINS. " +
      "Use HOST=127.0.0.1 or configure a trusted domain allowlist and outbound egress controls.",
  );
}

const server = Bun.serve({
  port,
  hostname,
  development: false,
  fetch: (req, server) =>
    handleRequest(req, env, server.requestIP(req)?.address ?? "unknown"),
});

console.log(`
🚀 Service running at http://${server.hostname}:${server.port}

Endpoints:
  /proxy?url=<encoded_url>  - Proxy requests
  /oauth-proxy-v2?url=<encoded_url> - HTTPS OAuth token POST relay
  /health                   - Health check
  /stats                    - Server statistics

Configuration:
  Rate Limit: ${config.rateLimitRequests} requests per ${config.rateLimitWindowMs / 1000}s
  Cache TTL: ${config.cacheTtlMs / 1000}s
  Max Cache Size: ${config.maxCacheSize} entries
  Allowed Domains: ${config.allowedDomains.length > 0 ? config.allowedDomains.join(", ") : "all"}
  Allowed Origins: ${config.allowedOrigins.length > 0 ? config.allowedOrigins.join(", ") : "all"}
  Upstream Timeout: ${config.upstreamTimeoutMs / 1000}s
`);
