/**
 * Nemu Agent Client
 *
 * Communicates with the native Nemu Agent for HTTP requests
 * with native TLS fingerprint and Cloudflare bypass.
 */

const AGENT_URL = "http://localhost:19283";
const AGENT_TIMEOUT = 60000;
const PING_TIMEOUT = 1000;

export interface AgentStatus {
  available: boolean;
  version?: string;
  platform?: string;
}

export interface AgentFetchResponse {
  status: number;
  headers: Record<string, string>;
  body?: string; // Base64 encoded
  cf_challenge?: boolean;
  cf_url?: string;
  error?: string;
}

let cachedStatus: AgentStatus | null = null;
let statusCheckPromise: Promise<AgentStatus> | null = null;
let cacheExpiry = 0;

const CACHE_TTL = 5000; // 5 seconds

/**
 * Check if agent is running (cached)
 */
export async function getAgentStatus(forceRefresh = false): Promise<AgentStatus> {
  const now = Date.now();

  if (!forceRefresh && cachedStatus && now < cacheExpiry) {
    return cachedStatus;
  }

  if (statusCheckPromise) {
    return statusCheckPromise;
  }

  statusCheckPromise = (async () => {
    try {
      const res = await fetch(`${AGENT_URL}/ping`, {
        signal: AbortSignal.timeout(PING_TIMEOUT),
      });

      if (res.ok) {
        const data = await res.json();
        cachedStatus = {
          available: true,
          version: data.version,
          platform: data.platform,
        };
      } else {
        cachedStatus = { available: false };
      }
    } catch {
      cachedStatus = { available: false };
    }

    cacheExpiry = Date.now() + CACHE_TTL;
    statusCheckPromise = null;
    return cachedStatus!;
  })();

  return statusCheckPromise;
}

/**
 * Quick check if agent is available
 */
export async function hasAgent(): Promise<boolean> {
  const status = await getAgentStatus();
  return status.available;
}

/**
 * Synchronous check - returns cached value or false
 * Use this when you need immediate answer without waiting
 */
export function hasAgentSync(): boolean {
  return cachedStatus?.available ?? false;
}

/**
 * Convert headers to plain object
 */
function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};

  if (!headers) return result;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
  } else {
    Object.assign(result, headers);
  }

  return result;
}

/**
 * Convert body to base64
 */
function encodeBody(body?: BodyInit | null): string | undefined {
  if (!body) return undefined;

  if (typeof body === "string") {
    return btoa(unescape(encodeURIComponent(body)));
  }

  if (body instanceof ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(body)));
  }

  if (body instanceof Uint8Array) {
    return btoa(String.fromCharCode(...body));
  }

  // URLSearchParams, FormData, etc - convert to string first
  if (body instanceof URLSearchParams) {
    return btoa(unescape(encodeURIComponent(body.toString())));
  }

  return undefined;
}

/**
 * Decode base64 body to ArrayBuffer
 */
function decodeBody(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Track in-flight CF challenges to avoid duplicates
const pendingChallenges = new Map<string, Promise<boolean>>();

// Progress callback for CF bypass UI
type CfProgressCallback = (status: "opening" | "waiting" | "success" | "failed", url: string) => void;
let cfProgressCallback: CfProgressCallback | null = null;

/**
 * Set callback for CF bypass progress updates
 */
export function setAgentCfProgressCallback(callback: CfProgressCallback | null) {
  cfProgressCallback = callback;
}

/**
 * Solve CF challenge via agent WebView
 */
export async function solveCfChallenge(url: string): Promise<boolean> {
  // Dedupe by domain
  const domain = new URL(url).hostname;
  const existing = pendingChallenges.get(domain);
  if (existing) {
    console.log(`[Agent] CF challenge already in progress for ${domain}`);
    return existing;
  }

  const promise = (async () => {
    try {
      console.log(`[Agent] Starting CF challenge for ${url}`);
      cfProgressCallback?.("opening", url);

      const startRes = await fetch(`${AGENT_URL}/solve-cf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!startRes.ok) {
        console.error(`[Agent] Failed to start CF challenge: ${startRes.status}`);
        cfProgressCallback?.("failed", url);
        return false;
      }

      const { window_id } = await startRes.json();
      console.log(`[Agent] CF challenge window: ${window_id}`);
      cfProgressCallback?.("waiting", url);

      // Poll for result (max 2 minutes)
      const maxAttempts = 120;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1000));

        try {
          const statusRes = await fetch(`${AGENT_URL}/solve-cf/${window_id}`);
          const data = await statusRes.json();

          if (data.status === "solved") {
            console.log(`[Agent] CF challenge solved for ${domain}`);
            cfProgressCallback?.("success", url);
            return true;
          }
          if (data.status === "failed" || data.status === "cancelled") {
            console.log(`[Agent] CF challenge ${data.status} for ${domain}`);
            cfProgressCallback?.("failed", url);
            return false;
          }
          // Continue polling if 'pending'
        } catch (e) {
          console.error(`[Agent] Error polling CF status:`, e);
          cfProgressCallback?.("failed", url);
          return false;
        }
      }

      console.log(`[Agent] CF challenge timed out for ${domain}`);
      cfProgressCallback?.("failed", url);
      return false;
    } finally {
      pendingChallenges.delete(domain);
    }
  })();

  pendingChallenges.set(domain, promise);
  return promise;
}

/**
 * Fetch via Nemu Agent
 *
 * Uses native TLS fingerprint and handles Cloudflare challenges automatically.
 */
export async function agentFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = normalizeHeaders(options.headers);
  const body = encodeBody(options.body);

  console.log(`[Agent] Fetch: ${options.method || "GET"} ${url.substring(0, 60)}...`);

  const res = await fetch(`${AGENT_URL}/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method: options.method || "GET",
      headers,
      body,
    }),
    signal: AbortSignal.timeout(AGENT_TIMEOUT),
  });

  const data: AgentFetchResponse = await res.json();

  console.log(`[Agent] Response: ${data.status}${data.cf_challenge ? " (CF challenge)" : ""}`);

  // Handle CF challenge
  if (data.cf_challenge) {
    console.log(`[Agent] CF challenge detected, solving...`);
    const solved = await solveCfChallenge(data.cf_url || url);
    if (solved) {
      // Retry after solving
      return agentFetch(url, options);
    }
    throw new Error("Cloudflare challenge not solved");
  }

  // Handle error
  if (data.error && !data.body) {
    throw new Error(data.error);
  }

  // Convert response
  const responseBody = data.body ? decodeBody(data.body) : new ArrayBuffer(0);

  return new Response(responseBody, {
    status: data.status,
    headers: new Headers(data.headers || {}),
  });
}

/**
 * High-level proxy fetch for use with aidoku-js customFetch option
 *
 * Use this with aidoku-js customFetch option
 */
export async function agentProxyFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return agentFetch(url, options);
}

