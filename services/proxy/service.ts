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
 * Run locally: bun run service
 */

export interface Env {
  PORT?: string;
  RATE_LIMIT_REQUESTS?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  CACHE_TTL_MS?: string;
  MAX_CACHE_SIZE?: string;
  ALLOWED_DOMAINS?: string;
  ALLOWED_ORIGINS?: string;
  PROXY_ORIGINS?: string;
  UPSTREAM_TIMEOUT_MS?: string;
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
  expiresAt: number;
  sizeBytes: number;
  ageAtResponseMs: number;
  activeReaders: number;
  inCache: boolean;
  accounted: boolean;
}

const PROXY_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const PROXY_DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const OAUTH_PROXY_MAX_REQUEST_BYTES = 64 * 1024;
const OAUTH_PROXY_MAX_RESPONSE_BYTES = 128 * 1024;
const OAUTH_PROXY_MAX_CODE_BYTES = 4 * 1024;
const OAUTH_PROXY_ALLOWED_FORM_FIELDS = new Set([
  "grant_type",
  "code",
  "code_verifier",
  "redirect_uri",
  "client_id",
]);
const PROXY_MAX_CACHEABLE_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROXY_MAX_TRANSIENT_BUFFER_BYTES = 32 * 1024 * 1024;
const PROXY_MAX_REDIRECTS = 5;
const PROXY_MAX_RATE_LIMIT_ENTRIES = 50_000;
const PROXY_MAX_CACHE_ENTRIES = 10_000;
const PROXY_MAX_CACHE_BYTES = 32 * 1024 * 1024;
const PROXY_MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROXY_MAX_CACHE_KEY_BYTES = 64 * 1024;
const PROXY_CACHE_ENTRY_OVERHEAD_BYTES = 512;
const PROXY_REDIRECT_POLICY_HEADER = "x-nemu-proxy-redirect";
const PROXY_MAX_RESPONSE_BYTES_HEADER = "x-nemu-proxy-max-response-bytes";
const PROXY_UPSTREAM_TIMEOUT_MS = 30_000;
const PROXY_MAX_UPSTREAM_TIMEOUT_MS = 60_000;
const PROXY_POLICY_VERSION = 2;
const PROXY_PATH = "/proxy";
const OAUTH_PROXY_V2_PATH = "/oauth-proxy-v2";
const PROXY_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";

class ProxyBodyLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Proxy body exceeds the ${limit} byte safety limit.`);
    this.name = "ProxyBodyLimitError";
  }
}

class ProxyRedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyRedirectError";
  }
}

class ProxyRequestPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyRequestPolicyError";
  }
}

class ProxyCapacityError extends Error {
  constructor() {
    super("Proxy is temporarily at its safe buffering capacity.");
    this.name = "ProxyCapacityError";
  }
}

class ProxyTimeoutError extends Error {
  constructor() {
    super("Proxy upstream request timed out.");
    this.name = "ProxyTimeoutError";
  }
}

class ProxyClientAbortError extends Error {
  constructor() {
    super("Proxy request was cancelled by the client.");
    this.name = "ProxyClientAbortError";
  }
}

// In-memory state (resets on cold starts for Workers)
const rateLimits = new Map<string, RateLimitEntry>();
const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;
let transientBufferBytes = 0;
const stats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimited: 0,
  errors: 0,
  startTime: null as number | null,
};

function getConfig(env: Env) {
  const positiveInteger = (value: string | undefined, fallback: number) => {
    const normalized = value?.trim() ?? "";
    if (!/^\d+$/.test(normalized)) return fallback;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const originList = (value: string | undefined) =>
    value
      ?.split(",")
      .map((origin) => {
        try {
          const url = new URL(origin.trim());
          return ["http:", "https:"].includes(url.protocol) &&
            url.pathname === "/" &&
            !url.search &&
            !url.hash
            ? url.origin
            : "";
        } catch {
          return "";
        }
      })
      .filter(Boolean) || [];
  return {
    rateLimitRequests: positiveInteger(env.RATE_LIMIT_REQUESTS, 2000),
    rateLimitWindowMs: positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60_000),
    cacheTtlMs: Math.min(
      positiveInteger(env.CACHE_TTL_MS, 300_000),
      PROXY_MAX_CACHE_TTL_MS,
    ),
    maxCacheSize: Math.min(
      positiveInteger(env.MAX_CACHE_SIZE, 1000),
      PROXY_MAX_CACHE_ENTRIES,
    ),
    allowedDomains:
      env.ALLOWED_DOMAINS?.split(",")
        .map((d) => d.trim())
        .filter(Boolean) || [],
    allowedOrigins: originList(env.ALLOWED_ORIGINS),
    allowedOriginsConfigured: env.ALLOWED_ORIGINS !== undefined,
    proxyOrigins: originList(env.PROXY_ORIGINS),
    upstreamTimeoutMs: Math.min(
      positiveInteger(env.UPSTREAM_TIMEOUT_MS, PROXY_UPSTREAM_TIMEOUT_MS),
      PROXY_MAX_UPSTREAM_TIMEOUT_MS,
    ),
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
  config: ReturnType<typeof getConfig>,
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  let entry = rateLimits.get(ip);

  if (!entry || now > entry.resetTime) {
    if (!entry && rateLimits.size >= PROXY_MAX_RATE_LIMIT_ENTRIES) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + config.rateLimitWindowMs,
      };
    }
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

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function parseIpv6(hostname: string): number[] | null {
  let value = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!value || value.includes("%")) return null;

  const embeddedIpv4 = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (embeddedIpv4) {
    const bytes = parseIpv4(embeddedIpv4);
    if (!bytes) return null;
    const replacement = `${((bytes[0] << 8) | bytes[1]).toString(16)}:${(
      (bytes[2] << 8) |
      bytes[3]
    ).toString(16)}`;
    value = `${value.slice(0, -embeddedIpv4.length)}${replacement}`;
  }

  if (value.indexOf("::") !== value.lastIndexOf("::")) return null;
  const compressed = value.includes("::");
  const [headText, tailText = ""] = compressed
    ? value.split("::")
    : [value, ""];
  const head = headText ? headText.split(":") : [];
  const tail = tailText ? tailText.split(":") : [];
  if ([...head, ...tail].some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  if (
    (!compressed && head.length !== 8) ||
    (compressed && head.length + tail.length >= 8)
  ) {
    return null;
  }
  const groups = [
    ...head,
    ...Array(compressed ? 8 - head.length - tail.length : 0).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    const parsed = Number.parseInt(group, 16);
    bytes.push(parsed >>> 8, parsed & 0xff);
  }
  return bytes;
}

function normalizedHostname(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isForbiddenHostname(hostname: string): boolean {
  return (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "local" ||
    hostname.endsWith(".local") ||
    hostname === "localdomain" ||
    hostname.endsWith(".localdomain") ||
    hostname === "internal" ||
    hostname.endsWith(".internal") ||
    hostname === "home.arpa" ||
    hostname.endsWith(".home.arpa") ||
    hostname === "metadata" ||
    hostname === "metadata.goog" ||
    hostname.endsWith(".metadata.goog") ||
    hostname === "instance-data" ||
    hostname === "instance-data.ec2.internal" ||
    hostname === "metadata.aws.internal" ||
    hostname === "metadata.azure.internal"
  );
}

export function validateUrl(
  urlString: string,
  allowedDomains: string[],
): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, error: "Only HTTP/HTTPS URLs are allowed" };
    }

    if (url.username || url.password) {
      return { valid: false, error: "Credentialed URLs are not allowed" };
    }

    // Keep Bun and Cloudflare behavior identical. Workers without the broader
    // custom-port compatibility flag only route HTTP(S) to their default
    // ports; accepting another port here would validate one destination and
    // potentially fetch a different one.
    if (url.port) {
      return {
        valid: false,
        error: "Only default HTTP/HTTPS ports are allowed",
      };
    }

    const hostname = normalizedHostname(url);
    const ipv4 = parseIpv4(hostname);
    const ipv6 = hostname.includes(":") ? parseIpv6(hostname) : null;
    const unqualifiedHostname =
      ipv4 === null && ipv6 === null && !hostname.includes(".");
    if (ipv4 !== null || ipv6 !== null) {
      // Cloudflare Workers do not support direct IP-literal subrequests. Keep
      // the local Bun validator identical so a URL cannot pass local tests and
      // then fail (or route differently) in production.
      return { valid: false, error: "IP-literal URLs are not supported" };
    }

    if (
      isForbiddenHostname(hostname) ||
      unqualifiedHostname ||
      (hostname.includes(":") && ipv6 === null)
    ) {
      return { valid: false, error: "Internal/localhost URLs are not allowed" };
    }

    if (allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some((domain) => {
        const normalizedDomain = domain
          .trim()
          .toLowerCase()
          .replace(/^\./, "")
          .replace(/\.$/, "");
        return (
          hostname === normalizedDomain ||
          hostname.endsWith(`.${normalizedDomain}`)
        );
      });
      if (!isAllowed) {
        return { valid: false, error: "Domain not in allowed list" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

function isSensitiveHeaderName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "cookie" ||
    normalized === "authorization" ||
    normalized === "proxy-authorization" ||
    normalized === "better-auth-cookie" ||
    /(?:auth|credential|secret|token|session|api[-_]?key)/i.test(normalized)
  );
}

function isHopByHopOrRoutingHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "host" ||
    normalized === "connection" ||
    normalized === "content-length" ||
    normalized === "keep-alive" ||
    normalized === "proxy-connection" ||
    normalized === "proxy-authorization" ||
    normalized === "te" ||
    normalized === "trailer" ||
    normalized === "transfer-encoding" ||
    normalized === "upgrade" ||
    normalized === "forwarded" ||
    normalized === "via" ||
    normalized === "x-real-ip" ||
    normalized === "true-client-ip" ||
    normalized === "client-ip" ||
    normalized === "fastly-client-ip" ||
    normalized === "x-cluster-client-ip" ||
    normalized === "x-original-forwarded-for" ||
    normalized === "x-envoy-external-address" ||
    normalized === "x-forwarded-client-cert" ||
    normalized.startsWith("x-forwarded-") ||
    normalized.startsWith("cf-")
  );
}

function isBrowserContextHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "origin" ||
    normalized === "referer" ||
    normalized.startsWith("sec-fetch-") ||
    normalized.startsWith("sec-ch-")
  );
}

function isTargetOriginReferer(value: string, target: URL): boolean {
  try {
    const referer = new URL(value);
    return (
      !referer.username &&
      !referer.password &&
      referer.origin === target.origin &&
      referer.pathname === "/" &&
      !referer.search &&
      !referer.hash
    );
  } catch {
    return false;
  }
}

function stripCrossOriginSecrets(headers: Record<string, string>): void {
  for (const name of Object.keys(headers)) {
    if (isSensitiveHeaderName(name)) delete headers[name];
  }
}

function hasSensitiveHeaders(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(isSensitiveHeaderName);
}

function hasSensitiveQueryParameters(url: URL): boolean {
  for (const name of url.searchParams.keys()) {
    if (isSensitiveHeaderName(name)) return true;
  }
  return false;
}

function getCacheKey(
  method: string,
  url: string,
  headers: Record<string, string>,
): string {
  const headerPart = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("\n");
  return `${method}:${url}\n${headerPart}`;
}

function approximateStringBytes(value: string): number {
  // JavaScript strings may occupy two bytes per UTF-16 code unit. Deliberately
  // over-count ASCII so the in-memory cache bound remains conservative.
  return value.length * 2;
}

function approximateHeadersBytes(headers: Record<string, string>): number {
  return Object.entries(headers).reduce(
    (total, [name, value]) =>
      total + approximateStringBytes(name) + approximateStringBytes(value),
    0,
  );
}

function approximateCacheEntryBytes(
  key: string,
  headers: Record<string, string>,
  data: ArrayBuffer,
): number {
  return (
    PROXY_CACHE_ENTRY_OVERHEAD_BYTES +
    approximateStringBytes(key) +
    approximateHeadersBytes(headers) +
    data.byteLength
  );
}

interface SharedCacheFreshness {
  freshnessMs: number;
  ageAtResponseMs: number;
}

function sharedCacheFreshness(
  response: Response,
  maximumTtlMs: number,
  requestTimeMs: number,
  responseTimeMs: number,
): SharedCacheFreshness | null {
  const directives = new Map<string, Array<string | null>>();
  for (const part of response.headers.get("cache-control")?.split(",") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");
    const name = rawName.toLowerCase();
    if (!name) continue;
    const values = directives.get(name) ?? [];
    values.push(rawValue.length > 0 ? rawValue.join("=").trim() : null);
    directives.set(name, values);
  }
  const varyHasWildcard =
    response.headers
      .get("vary")
      ?.split(",")
      .some((name) => name.trim() === "*") ?? false;
  if (
    !directives.has("public") ||
    directives.has("private") ||
    directives.has("no-store") ||
    directives.has("no-cache") ||
    response.headers.get("set-cookie") !== null ||
    response.headers.get("set-cookie2") !== null ||
    varyHasWildcard ||
    (directives.get("s-maxage")?.length ?? 0) > 1 ||
    (directives.get("max-age")?.length ?? 0) > 1
  ) {
    return null;
  }

  const rawLifetime = directives.has("s-maxage")
    ? directives.get("s-maxage")?.[0]
    : directives.get("max-age")?.[0];
  if (rawLifetime === null || rawLifetime === undefined) return null;
  const startsQuoted = rawLifetime.startsWith('"');
  const endsQuoted = rawLifetime.endsWith('"');
  if (startsQuoted !== endsQuoted) return null;
  const normalizedLifetime = startsQuoted
    ? rawLifetime.slice(1, -1)
    : rawLifetime;
  if (!/^\d+$/.test(normalizedLifetime)) return null;
  const lifetimeSeconds = Number(normalizedLifetime);
  const rawAge = response.headers.get("age")?.trim();
  if (rawAge !== undefined && !/^\d+$/.test(rawAge)) return null;
  const ageSeconds = rawAge === undefined ? 0 : Number(rawAge);
  if (
    !Number.isSafeInteger(lifetimeSeconds) ||
    !Number.isSafeInteger(ageSeconds) ||
    lifetimeSeconds > Number.MAX_SAFE_INTEGER / 1000 ||
    ageSeconds > Number.MAX_SAFE_INTEGER / 1000
  ) {
    return null;
  }

  const rawDate = response.headers.get("date")?.trim();
  const parsedDateMs = rawDate === undefined ? null : Date.parse(rawDate);
  if (rawDate !== undefined && !Number.isFinite(parsedDateMs)) return null;
  const apparentAgeMs =
    parsedDateMs === null ? 0 : Math.max(0, responseTimeMs - parsedDateMs);
  const responseDelayMs = Math.max(0, responseTimeMs - requestTimeMs);
  const ageValueMs = ageSeconds * 1000;
  if (
    !Number.isSafeInteger(responseDelayMs) ||
    ageValueMs > Number.MAX_SAFE_INTEGER - responseDelayMs
  ) {
    return null;
  }
  const ageAtResponseMs = Math.max(apparentAgeMs, ageValueMs + responseDelayMs);
  const remainingMs = lifetimeSeconds * 1000 - ageAtResponseMs;
  if (remainingMs <= 0) return null;
  return {
    freshnessMs: Math.min(remainingMs, maximumTtlMs),
    ageAtResponseMs,
  };
}

function isProxyOwnedResponseHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === "x-cache" || normalized.startsWith("x-ratelimit-");
}

function isOriginScopedResponseHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "alt-svc" ||
    normalized === "clear-site-data" ||
    normalized === "nel" ||
    normalized === "report-to" ||
    normalized === "reporting-endpoints" ||
    normalized === "proxy-authenticate" ||
    normalized === "proxy-authentication-info" ||
    normalized === "www-authenticate" ||
    normalized === "authentication-info" ||
    normalized === "strict-transport-security" ||
    normalized === "expect-ct" ||
    normalized === "public-key-pins" ||
    normalized === "public-key-pins-report-only" ||
    normalized === "accept-ch" ||
    normalized === "accept-ch-lifetime" ||
    normalized === "critical-ch" ||
    normalized === "origin-trial" ||
    normalized === "origin-agent-cluster" ||
    normalized === "permissions-policy" ||
    normalized === "document-policy" ||
    normalized === "referrer-policy" ||
    normalized === "refresh" ||
    normalized === "x-frame-options" ||
    normalized === "content-security-policy" ||
    normalized === "content-security-policy-report-only" ||
    normalized === "x-content-security-policy" ||
    normalized === "x-webkit-csp" ||
    normalized.startsWith("cross-origin-")
  );
}

function parseBoundedResponseLimit(req: Request): number {
  const raw = req.headers.get(PROXY_MAX_RESPONSE_BYTES_HEADER);
  if (raw === null) return PROXY_DEFAULT_MAX_RESPONSE_BYTES;
  if (!/^\d+$/.test(raw.trim())) {
    throw new ProxyRequestPolicyError("Invalid proxy response byte limit.");
  }
  const requested = Number(raw);
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new ProxyRequestPolicyError("Invalid proxy response byte limit.");
  }
  return Math.min(requested, PROXY_DEFAULT_MAX_RESPONSE_BYTES);
}

function declaredBodyLength(message: Request | Response): number | null {
  const raw = message.headers.get("content-length")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function reserveTransientBuffer(bytes: number): () => void {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    transientBufferBytes + bytes > PROXY_MAX_TRANSIENT_BUFFER_BYTES
  ) {
    throw new ProxyCapacityError();
  }
  transientBufferBytes += bytes;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    transientBufferBytes = Math.max(0, transientBufferBytes - bytes);
  };
}

async function readBodyWithinLimit(
  message: Request | Response,
  limit: number,
): Promise<ArrayBuffer> {
  const contentLength = declaredBodyLength(message);
  if (contentLength !== null && contentLength > limit) {
    await message.body?.cancel().catch(() => undefined);
    throw new ProxyBodyLimitError(limit);
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
        throw new ProxyBodyLimitError(limit);
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
  return output.buffer;
}

function hasAsciiControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return true;
  }
  return false;
}

function isValidOAuthTokenExchangeBody(body: ArrayBuffer): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return false;
  }
  const params = new URLSearchParams(text);
  for (const name of params.keys()) {
    if (!OAUTH_PROXY_ALLOWED_FORM_FIELDS.has(name)) return false;
  }
  const grantTypes = params.getAll("grant_type");
  const codes = params.getAll("code");
  const verifiers = params.getAll("code_verifier");
  const redirectUris = params.getAll("redirect_uri");
  const clientIds = params.getAll("client_id");
  const code = codes[0] ?? "";
  const verifier = verifiers[0] ?? "";
  return (
    grantTypes.length === 1 &&
    grantTypes[0] === "authorization_code" &&
    codes.length === 1 &&
    code.length > 0 &&
    new TextEncoder().encode(code).byteLength <= OAUTH_PROXY_MAX_CODE_BYTES &&
    !hasAsciiControlCharacters(code) &&
    verifiers.length === 1 &&
    verifier.length >= 43 &&
    verifier.length <= 128 &&
    /^[A-Za-z0-9\-._~]+$/.test(verifier) &&
    redirectUris.length <= 1 &&
    clientIds.length <= 1 &&
    (redirectUris.length === 0 || redirectUris[0].length > 0) &&
    (clientIds.length === 0 || clientIds[0].length > 0)
  );
}

function streamBodyWithinLimit(
  message: Response,
  limit: number,
  onFinish: () => void = () => undefined,
  translateError: (error: unknown) => unknown = (error) => error,
): ReadableStream<Uint8Array> | null {
  const contentLength = declaredBodyLength(message);
  if (contentLength !== null && contentLength > limit) {
    void message.body?.cancel().catch(() => undefined);
    onFinish();
    throw new ProxyBodyLimitError(limit);
  }
  if (!message.body) {
    onFinish();
    return null;
  }

  const reader = message.body.getReader();
  let total = 0;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
    onFinish();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          release();
          controller.error(new ProxyBodyLimitError(limit));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        release();
        controller.error(translateError(error));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      release();
    },
  });
}

function streamArrayBuffer(
  data: ArrayBuffer,
  onFinish: () => void,
): ReadableStream<Uint8Array> {
  const chunkSize = 64 * 1024;
  let offset = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinish();
  };
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.byteLength) {
        finish();
        controller.close();
        return;
      }
      const length = Math.min(chunkSize, data.byteLength - offset);
      controller.enqueue(new Uint8Array(data, offset, length));
      offset += length;
    },
    cancel() {
      finish();
    },
  });
}

function releaseCacheEntryIfUnused(entry: CacheEntry): void {
  if (entry.inCache || entry.activeReaders > 0 || !entry.accounted) return;
  entry.accounted = false;
  cacheBytes = Math.max(0, cacheBytes - entry.sizeBytes);
}

function removeCacheEntry(key: string, entry: CacheEntry): void {
  if (cache.get(key) !== entry) return;
  cache.delete(key);
  entry.inCache = false;
  releaseCacheEntryIfUnused(entry);
}

function streamCachedEntry(entry: CacheEntry): ReadableStream<Uint8Array> {
  entry.activeReaders += 1;
  return streamArrayBuffer(entry.data, () => {
    entry.activeReaders = Math.max(0, entry.activeReaders - 1);
    releaseCacheEntryIfUnused(entry);
  });
}

function isRedirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function isNullBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

function isRecursiveProxyTarget(
  url: URL,
  proxyOrigins: readonly string[],
): boolean {
  return (
    proxyOrigins.includes(url.origin) &&
    (url.pathname === PROXY_PATH || url.pathname === OAUTH_PROXY_V2_PATH)
  );
}

interface UpstreamAbortScope {
  signal: AbortSignal;
  dispose: () => void;
  translate: (error: unknown) => unknown;
}

function createUpstreamAbortScope(
  requestSignal: AbortSignal,
  timeoutMs: number,
): UpstreamAbortScope {
  const controller = new AbortController();
  let timedOut = false;
  let clientAborted = requestSignal.aborted;
  const onClientAbort = () => {
    clientAborted = true;
    controller.abort(requestSignal.reason);
  };
  if (requestSignal.aborted) {
    controller.abort(requestSignal.reason);
  } else {
    requestSignal.addEventListener("abort", onClientAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new ProxyTimeoutError());
  }, timeoutMs);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", onClientAbort);
  };
  return {
    signal: controller.signal,
    dispose,
    translate(error: unknown): unknown {
      if (clientAborted || requestSignal.aborted) {
        return new ProxyClientAbortError();
      }
      if (timedOut) return new ProxyTimeoutError();
      return error;
    },
  };
}

async function fetchWithValidatedRedirects(args: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: ArrayBuffer | undefined;
  allowedDomains: string[];
  proxyOrigins: string[];
  followRedirects: boolean;
  signal: AbortSignal;
}): Promise<Response> {
  let currentUrl = new URL(args.url);
  currentUrl.hash = "";
  let method = args.method;
  let body = args.body;
  const headers = { ...args.headers };
  const visited = new Set<string>([currentUrl.toString()]);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      redirect: "manual",
      // The bounded module cache below is the sole cache authority. In
      // particular, Cloudflare's subrequest cache must never reuse a public
      // origin response across x-proxy-* credentials or translated Vary
      // dimensions before this Worker can apply its policy.
      cache: "no-store",
      signal: args.signal,
    });
    if (!isRedirectStatus(response.status)) return response;
    if (!args.followRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError("Proxy redirect refused by request policy.");
    }
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectCount >= PROXY_MAX_REDIRECTS) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError("Proxy redirect limit exceeded.");
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError("Proxy received an invalid redirect URL.");
    }
    nextUrl.hash = "";
    const validation = validateUrl(nextUrl.toString(), args.allowedDomains);
    if (
      !validation.valid ||
      isRecursiveProxyTarget(nextUrl, args.proxyOrigins)
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError(
        validation.error ?? "Recursive proxy redirect refused.",
      );
    }
    if (visited.has(nextUrl.toString())) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError("Proxy redirect loop detected.");
    }
    visited.add(nextUrl.toString());

    const redirectsToGet =
      (response.status === 303 && method !== "GET" && method !== "HEAD") ||
      ((response.status === 301 || response.status === 302) &&
        method === "POST");
    if (currentUrl.protocol === "https:" && nextUrl.protocol !== "https:") {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError(
        "Proxy refused an HTTPS downgrade redirect.",
      );
    }
    if (
      nextUrl.origin !== currentUrl.origin &&
      body !== undefined &&
      !redirectsToGet
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProxyRedirectError(
        "Proxy refused to replay a request body across origins.",
      );
    }
    if (nextUrl.origin !== currentUrl.origin) {
      stripCrossOriginSecrets(headers);
    }
    if (redirectsToGet) {
      method = "GET";
      body = undefined;
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase().startsWith("content-")) delete headers[name];
      }
    }
    await response.body?.cancel().catch(() => undefined);
    currentUrl = nextUrl;
  }
}

function enforceCacheCapacity(config: ReturnType<typeof getConfig>) {
  while (
    cache.size > config.maxCacheSize ||
    cacheBytes > PROXY_MAX_CACHE_BYTES
  ) {
    const oldest = cache.entries().next().value as
      | [string, CacheEntry]
      | undefined;
    if (!oldest) break;
    removeCacheEntry(oldest[0], oldest[1]);
  }
  cacheBytes = Math.max(0, cacheBytes);
}

function makeRoomForCacheEntry(
  config: ReturnType<typeof getConfig>,
  entrySize: number,
): boolean {
  while (
    cache.size >= config.maxCacheSize ||
    cacheBytes + entrySize > PROXY_MAX_CACHE_BYTES
  ) {
    const oldest = cache.entries().next().value as
      | [string, CacheEntry]
      | undefined;
    if (!oldest) break;
    removeCacheEntry(oldest[0], oldest[1]);
  }
  return (
    cache.size < config.maxCacheSize &&
    cacheBytes + entrySize <= PROXY_MAX_CACHE_BYTES
  );
}

function cleanupCache(config: ReturnType<typeof getConfig>) {
  const now = Date.now();

  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetTime) rateLimits.delete(ip);
  }

  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt || now - entry.timestamp > config.cacheTtlMs) {
      removeCacheEntry(key, entry);
    }
  }

  enforceCacheCapacity(config);
}

const baseCorsHeaders = {
  "Access-Control-Allow-Methods":
    "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

function corsHeadersFor(
  req: Request,
  config: ReturnType<typeof getConfig>,
): Record<string, string> | null {
  const origin = req.headers.get("origin");
  if (origin && config.allowedOriginsConfigured) {
    if (!config.allowedOrigins.includes(origin)) return null;
    return {
      ...baseCorsHeaders,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }
  return { ...baseCorsHeaders, "Access-Control-Allow-Origin": "*" };
}

function mergeVary(existing: string | undefined, value: string): string {
  const names = new Set(
    (existing ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  names.add(value);
  return [...names].join(", ");
}

function buildProxyResponseHeaders(
  upstream: Record<string, string>,
  cors: Record<string, string>,
  metadata: Record<string, string>,
): Headers {
  const headers = new Headers(upstream);
  for (const [name, value] of Object.entries(cors)) {
    if (name.toLowerCase() === "vary") {
      headers.set("Vary", mergeVary(headers.get("Vary") ?? undefined, value));
    } else {
      headers.set(name, value);
    }
  }
  for (const [name, value] of Object.entries(metadata)) {
    headers.set(name, value);
  }
  // Browser caches key the proxy URL and its browser-visible request headers,
  // which do not safely model translated x-proxy-* headers or credentials.
  // Keep the private bounded module cache, but make every returned proxy
  // representation non-storable outside this process.
  headers.set("Cache-Control", "private, no-store");
  // The relay can return attacker-controlled HTML/SVG. If someone navigates to
  // a proxy URL, keep that content inert under the service.nemu.pm origin and
  // never disclose a credential-bearing target query through Referer.
  headers.set("Content-Security-Policy", PROXY_CONTENT_SECURITY_POLICY);
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function noStoreProxyHeaders(
  cors: Record<string, string>,
): Record<string, string> {
  return {
    ...cors,
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": PROXY_CONTENT_SECURITY_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

async function handleRequest(
  req: Request,
  env: Env,
  clientIpOverride?: string,
): Promise<Response> {
  const config = getConfig(env);
  const url = new URL(req.url);
  const clientIp = clientIpOverride ?? getClientIp(req);
  if (stats.startTime === null) stats.startTime = Date.now();
  const corsHeaders = corsHeadersFor(req, config);

  if (!corsHeaders) {
    return new Response("Origin not allowed", { status: 403 });
  }
  if (url.pathname === OAUTH_PROXY_V2_PATH) {
    corsHeaders["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }

  if (
    req.method === "OPTIONS" &&
    req.headers.has("access-control-request-method")
  ) {
    const isProxyPreflight = url.pathname === PROXY_PATH;
    const isOAuthProxyPreflight = url.pathname === OAUTH_PROXY_V2_PATH;
    if (!isProxyPreflight && !isOAuthProxyPreflight) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }
    const requestedMethod = req.headers
      .get("access-control-request-method")
      ?.toUpperCase();
    const allowedMethods = isOAuthProxyPreflight
      ? ["POST"]
      : ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"];
    if (!requestedMethod || !allowedMethods.includes(requestedMethod)) {
      return new Response("Method not allowed", {
        status: 405,
        headers: {
          ...corsHeaders,
          Allow: [...allowedMethods, "OPTIONS"].join(", "),
        },
      });
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": [...allowedMethods, "OPTIONS"].join(
          ", ",
        ),
      },
    });
  }

  if (url.pathname === "/health") {
    return Response.json(
      {
        status: "ok",
        policyVersion: PROXY_POLICY_VERSION,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
        stats: {
          ...stats,
          cacheSize: cache.size,
          cacheBytes,
          rateLimitEntries: rateLimits.size,
        },
      },
      { headers: noStoreProxyHeaders(corsHeaders) },
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
        cacheBytes,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      },
      { headers: noStoreProxyHeaders(corsHeaders) },
    );
  }

  const isGenericProxy = url.pathname === PROXY_PATH;
  const isOAuthProxy = url.pathname === OAUTH_PROXY_V2_PATH;
  if (!isGenericProxy && !isOAuthProxy) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  if (isOAuthProxy && req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        ...noStoreProxyHeaders(corsHeaders),
        Allow: "POST, OPTIONS",
      },
    });
  }

  stats.totalRequests++;
  if (stats.totalRequests % 100 === 0) cleanupCache(config);

  const rateLimit = checkRateLimit(clientIp, config);
  if (!rateLimit.allowed) {
    stats.rateLimited++;
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: {
        ...noStoreProxyHeaders(corsHeaders),
        "Retry-After": Math.ceil(
          (rateLimit.resetTime - Date.now()) / 1000,
        ).toString(),
        "X-RateLimit-Limit": config.rateLimitRequests.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": rateLimit.resetTime.toString(),
      },
    });
  }

  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing url parameter", {
      status: 400,
      headers: noStoreProxyHeaders(corsHeaders),
    });
  }

  const validation = validateUrl(target, config.allowedDomains);
  const targetUrl = validation.valid ? new URL(target) : null;
  if (targetUrl) targetUrl.hash = "";
  const canonicalTarget = targetUrl?.toString() ?? target;
  const proxyOrigins = [...new Set([url.origin, ...config.proxyOrigins])];
  const recursiveTarget =
    targetUrl !== null && isRecursiveProxyTarget(targetUrl, proxyOrigins);
  const oauthRequiresHttps = isOAuthProxy && targetUrl?.protocol !== "https:";
  if (!validation.valid || recursiveTarget || oauthRequiresHttps) {
    return new Response(
      validation.error ||
        (recursiveTarget
          ? "Recursive proxy target refused"
          : oauthRequiresHttps
            ? "OAuth proxy targets must use HTTPS"
            : "Invalid URL"),
      {
        status: 400,
        headers: noStoreProxyHeaders(corsHeaders),
      },
    );
  }
  if (isOAuthProxy) {
    const contentType = req.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") {
      return new Response("Unsupported OAuth request content type", {
        status: 415,
        headers: noStoreProxyHeaders(corsHeaders),
      });
    }
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== "origin" &&
      lowerKey !== "referer" &&
      lowerKey !== "cookie" &&
      lowerKey !== PROXY_REDIRECT_POLICY_HEADER &&
      lowerKey !== PROXY_MAX_RESPONSE_BYTES_HEADER &&
      !isHopByHopOrRoutingHeader(lowerKey) &&
      !isBrowserContextHeader(lowerKey) &&
      !isSensitiveHeaderName(lowerKey) &&
      !lowerKey.startsWith("x-proxy-") &&
      !lowerKey.startsWith("x-nemu-proxy-")
    ) {
      headers[key] = value;
    }
  });

  req.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("x-proxy-")) {
      const targetName = key.slice(8);
      if (
        targetName.toLowerCase() === "referer" &&
        targetUrl !== null &&
        isTargetOriginReferer(value, targetUrl)
      ) {
        headers.Referer = value;
        return;
      }
      if (
        !isHopByHopOrRoutingHeader(targetName) &&
        !isBrowserContextHeader(targetName)
      ) {
        headers[targetName] = value;
      }
    }
  });

  const cacheKey = getCacheKey(req.method, canonicalTarget, headers);
  const cacheEligibleRequest =
    isGenericProxy &&
    req.method === "GET" &&
    targetUrl !== null &&
    !hasSensitiveQueryParameters(targetUrl) &&
    !hasSensitiveHeaders(headers) &&
    approximateStringBytes(cacheKey) <= PROXY_MAX_CACHE_KEY_BYTES;

  let upstreamAbortScope: UpstreamAbortScope | undefined;
  let upstreamRequestTimeMs = Date.now();
  try {
    const maxResponseBytes = isOAuthProxy
      ? OAUTH_PROXY_MAX_RESPONSE_BYTES
      : parseBoundedResponseLimit(req);
    if (cacheEligibleRequest) {
      const cached = cache.get(cacheKey);
      if (
        cached &&
        Date.now() < cached.expiresAt &&
        Date.now() - cached.timestamp < config.cacheTtlMs
      ) {
        if (cached.data.byteLength > maxResponseBytes) {
          throw new ProxyBodyLimitError(maxResponseBytes);
        }
        stats.cacheHits++;
        cache.delete(cacheKey);
        cache.set(cacheKey, cached);
        const cachedHeaders = { ...cached.headers };
        cachedHeaders.age = String(
          Math.max(
            0,
            Math.floor(
              (cached.ageAtResponseMs + Date.now() - cached.timestamp) / 1000,
            ),
          ),
        );
        return new Response(streamCachedEntry(cached), {
          status: cached.status,
          headers: buildProxyResponseHeaders(cachedHeaders, corsHeaders, {
            "X-Cache": "HIT",
            "X-RateLimit-Limit": config.rateLimitRequests.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          }),
        });
      }
      if (cached) {
        removeCacheEntry(cacheKey, cached);
      }
      stats.cacheMisses++;
    }

    let body: ArrayBuffer | undefined;
    let releaseRequestBuffer: (() => void) | undefined;
    let res: Response;
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        releaseRequestBuffer = reserveTransientBuffer(
          (isOAuthProxy
            ? OAUTH_PROXY_MAX_REQUEST_BYTES * 2
            : PROXY_MAX_REQUEST_BYTES) * 2,
        );
        body = await readBodyWithinLimit(
          req,
          isOAuthProxy
            ? OAUTH_PROXY_MAX_REQUEST_BYTES
            : PROXY_MAX_REQUEST_BYTES,
        );
        if (isOAuthProxy && !isValidOAuthTokenExchangeBody(body)) {
          throw new ProxyRequestPolicyError(
            "Invalid OAuth token exchange body.",
          );
        }
      }
      upstreamAbortScope = createUpstreamAbortScope(
        req.signal,
        config.upstreamTimeoutMs,
      );
      upstreamRequestTimeMs = Date.now();
      try {
        res = await fetchWithValidatedRedirects({
          url: canonicalTarget,
          method: req.method,
          headers,
          body,
          allowedDomains: config.allowedDomains,
          proxyOrigins,
          followRedirects:
            !isOAuthProxy &&
            req.headers
              .get(PROXY_REDIRECT_POLICY_HEADER)
              ?.trim()
              .toLowerCase() !== "manual",
          signal: upstreamAbortScope.signal,
        });
      } catch (error) {
        throw upstreamAbortScope.translate(error);
      }
    } finally {
      body = undefined;
      releaseRequestBuffer?.();
    }

    const proxyMetadataHeaders: Record<string, string> = {
      "X-Cache": "MISS",
      "X-RateLimit-Limit": config.rateLimitRequests.toString(),
      "X-RateLimit-Remaining": rateLimit.remaining.toString(),
    };
    const responseTimeMs = Date.now();

    if (res.status === 101) {
      await res.body?.cancel().catch(() => undefined);
      upstreamAbortScope.dispose();
      throw new ProxyRequestPolicyError(
        "Switching-protocol responses are not supported by this proxy.",
      );
    }

    const headersToForward: Record<string, string> = {};
    const connectionNamedHeaders = new Set(
      (res.headers.get("connection") ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    );
    const preserveRepresentationHeaders =
      req.method === "HEAD" || res.status === 304;
    res.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "set-cookie" ||
        lowerKey === "set-cookie2" ||
        lowerKey.startsWith("access-control-") ||
        isProxyOwnedResponseHeader(lowerKey) ||
        isOriginScopedResponseHeader(lowerKey) ||
        connectionNamedHeaders.has(lowerKey)
      ) {
        return;
      }
      if (
        preserveRepresentationHeaders &&
        (lowerKey === "content-length" || lowerKey === "content-encoding")
      ) {
        headersToForward[key] = value;
        return;
      }
      if (
        lowerKey !== "content-encoding" &&
        lowerKey !== "content-length" &&
        !isHopByHopOrRoutingHeader(lowerKey)
      ) {
        headersToForward[key] = value;
      }
    });

    if (req.method === "HEAD" || isNullBodyStatus(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      upstreamAbortScope.dispose();
      return new Response(null, {
        status: res.status,
        headers: buildProxyResponseHeaders(
          headersToForward,
          corsHeaders,
          proxyMetadataHeaders,
        ),
      });
    }

    if (isOAuthProxy) {
      const releaseOAuthResponseBuffer = reserveTransientBuffer(
        OAUTH_PROXY_MAX_RESPONSE_BYTES * 2,
      );
      let data: ArrayBuffer;
      try {
        data = await readBodyWithinLimit(res, OAUTH_PROXY_MAX_RESPONSE_BYTES);
      } catch (error) {
        releaseOAuthResponseBuffer();
        throw upstreamAbortScope.translate(error);
      }
      upstreamAbortScope.dispose();
      headersToForward["Content-Length"] = data.byteLength.toString();
      return new Response(streamArrayBuffer(data, releaseOAuthResponseBuffer), {
        status: res.status,
        headers: buildProxyResponseHeaders(
          headersToForward,
          corsHeaders,
          proxyMetadataHeaders,
        ),
      });
    }

    const freshness = sharedCacheFreshness(
      res,
      config.cacheTtlMs,
      upstreamRequestTimeMs,
      responseTimeMs,
    );
    const declaredResponseBytes = declaredBodyLength(res);
    const shouldBufferForCache =
      cacheEligibleRequest &&
      res.status >= 200 &&
      res.status < 300 &&
      freshness !== null &&
      declaredResponseBytes !== null &&
      declaredResponseBytes <= maxResponseBytes &&
      declaredResponseBytes <= PROXY_MAX_CACHEABLE_RESPONSE_BYTES;

    if (shouldBufferForCache) {
      const releaseResponseBuffer = reserveTransientBuffer(
        Math.min(maxResponseBytes, PROXY_MAX_CACHEABLE_RESPONSE_BYTES) * 2,
      );
      let data: ArrayBuffer;
      try {
        data = await readBodyWithinLimit(
          res,
          Math.min(maxResponseBytes, PROXY_MAX_CACHEABLE_RESPONSE_BYTES),
        );
      } catch (error) {
        releaseResponseBuffer();
        throw upstreamAbortScope.translate(error);
      }
      upstreamAbortScope.dispose();
      headersToForward["Content-Length"] = data.byteLength.toString();
      const entrySize = approximateCacheEntryBytes(
        cacheKey,
        headersToForward,
        data,
      );
      const existing = cache.get(cacheKey);
      if (existing) removeCacheEntry(cacheKey, existing);
      const expiresAt = responseTimeMs + freshness.freshnessMs;
      let storedEntry: CacheEntry | null = null;
      if (
        entrySize <= PROXY_MAX_CACHE_BYTES &&
        Date.now() < expiresAt &&
        makeRoomForCacheEntry(config, entrySize)
      ) {
        storedEntry = {
          data,
          headers: headersToForward,
          status: res.status,
          timestamp: responseTimeMs,
          expiresAt,
          sizeBytes: entrySize,
          ageAtResponseMs: freshness.ageAtResponseMs,
          activeReaders: 0,
          inCache: true,
          accounted: true,
        };
        cache.set(cacheKey, storedEntry);
        cacheBytes += entrySize;
      }
      const bodyStream = storedEntry
        ? streamCachedEntry(storedEntry)
        : streamArrayBuffer(data, releaseResponseBuffer);
      if (storedEntry) releaseResponseBuffer();
      return new Response(bodyStream, {
        status: res.status,
        headers: buildProxyResponseHeaders(
          headersToForward,
          corsHeaders,
          proxyMetadataHeaders,
        ),
      });
    }

    const streamedBody = streamBodyWithinLimit(
      res,
      maxResponseBytes,
      upstreamAbortScope.dispose,
      upstreamAbortScope.translate,
    );
    return new Response(streamedBody, {
      status: res.status,
      headers: buildProxyResponseHeaders(
        headersToForward,
        corsHeaders,
        proxyMetadataHeaders,
      ),
    });
  } catch (error) {
    const handledError = upstreamAbortScope?.signal.aborted
      ? upstreamAbortScope.translate(error)
      : error;
    upstreamAbortScope?.dispose();
    stats.errors++;
    const expectedPolicyFailure =
      handledError instanceof ProxyBodyLimitError ||
      handledError instanceof ProxyRedirectError ||
      handledError instanceof ProxyRequestPolicyError ||
      handledError instanceof ProxyCapacityError ||
      handledError instanceof ProxyTimeoutError ||
      handledError instanceof ProxyClientAbortError;
    if (!expectedPolicyFailure) {
      // Fetch errors may embed a credential-bearing target URL. Keep
      // operational telemetry useful without copying that value into logs.
      console.error(
        "Proxy request failed.",
        handledError instanceof Error ? handledError.name : "UnknownError",
      );
    }
    const status =
      handledError instanceof ProxyBodyLimitError
        ? 413
        : handledError instanceof ProxyCapacityError
          ? 503
          : handledError instanceof ProxyTimeoutError
            ? 504
            : handledError instanceof ProxyClientAbortError
              ? 499
              : handledError instanceof ProxyRequestPolicyError
                ? 400
                : 502;
    const message = expectedPolicyFailure
      ? handledError.message
      : "Proxy request failed.";
    return new Response(message, {
      status,
      headers: noStoreProxyHeaders(corsHeaders),
    });
  }
}

// Cloudflare Workers export
const worker = {
  fetch(req: Request, env: Env, _context?: unknown) {
    void _context;
    // Workerd's third argument is ExecutionContext. Never pass it through as
    // the local development IP override, or each request becomes a distinct
    // rate-limit key and leaks that context into the limiter map.
    return handleRequest(req, env);
  },
};

export default worker;

export { handleRequest, getConfig };
