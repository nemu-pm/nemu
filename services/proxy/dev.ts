#!/usr/bin/env bun
/**
 * Local development server - run with: bun service/dev.ts
 */

import { handleRequest, getConfig, type Env } from "./service.ts";

const port = parseInt(process.env.PORT || "3001", 10);
const env: Env = {
  PORT: process.env.PORT,
  RATE_LIMIT_REQUESTS: process.env.RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  CACHE_TTL_MS: process.env.CACHE_TTL_MS,
  MAX_CACHE_SIZE: process.env.MAX_CACHE_SIZE,
  ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
};

const config = getConfig(env);

const server = Bun.serve({
  port,
  development: false,
  fetch: (req) => handleRequest(req, env),
});

console.log(`
🚀 Service running at http://localhost:${server.port}

Endpoints:
  /proxy?url=<encoded_url>  - Proxy requests
  /health                   - Health check
  /stats                    - Server statistics

Configuration:
  Rate Limit: ${config.rateLimitRequests} requests per ${config.rateLimitWindowMs / 1000}s
  Cache TTL: ${config.cacheTtlMs / 1000}s
  Max Cache Size: ${config.maxCacheSize} entries
  Allowed Domains: ${config.allowedDomains.length > 0 ? config.allowedDomains.join(", ") : "all"}
`);

