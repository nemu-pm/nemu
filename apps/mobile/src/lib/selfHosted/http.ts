import { mobileNativeFetch } from "@/sources/mobileNativeHttp";

export type SelfHostedErrorCode =
  | "unreachable"
  /** The server wants a login and none was given. */
  | "login-required"
  /** The login given was refused. */
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "server"
  | "invalid-response"
  | "unsupported"
  /** The server is too old for the API the app speaks. */
  | "outdated";

/** A failure talking to a user's own server; `code` drives the localized message. */
export class SelfHostedError extends Error {
  constructor(
    readonly code: SelfHostedErrorCode,
    message?: string,
    readonly status?: number,
  ) {
    super(message ?? code);
    this.name = "SelfHostedError";
  }
}

export function isSelfHostedError(error: unknown): error is SelfHostedError {
  return error instanceof SelfHostedError;
}

export type SelfHostedRequest = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  /** Serialised JSON body. */
  json?: unknown;
  /** URL-encoded form body (a browser login form). */
  form?: Record<string, string>;
  /**
   * false: a redirect is returned, not followed. Its cookies are kept in the
   * source's own cookie scope, so a session cookie set on a login redirect
   * comes back on this server's later requests.
   */
  followRedirects?: false;
  signal?: AbortSignal;
};

export type SelfHostedResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

/** The one seam to the network: native HTTP in the app, a fixture replay in tests. */
export type SelfHostedTransport = (request: SelfHostedRequest) => Promise<SelfHostedResponse>;

/**
 * Requests go through nemu's native HTTP client with the source's cookie scope,
 * so the scoped local-network grant (exactly the host the user entered, for
 * this source only) applies and loopback / cloud-metadata space stays blocked.
 */
export function createNativeTransport(cookieScope: string): SelfHostedTransport {
  return async (request) => {
    const body =
      request.json !== undefined
        ? { type: "application/json", text: JSON.stringify(request.json) }
        : request.form
          ? { type: "application/x-www-form-urlencoded", text: encodeForm(request.form) }
          : null;
    try {
      const response = await mobileNativeFetch(request.url, {
        method: request.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": body.type } : {}),
          ...request.headers,
        },
        ...(body ? { body: body.text } : {}),
        responseMode: "text",
        cookieScope,
        ...(request.followRedirects === false ? { followRedirects: false } : {}),
        signal: request.signal,
      });
      return { status: response.status, headers: response.headers, body: response.body };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new SelfHostedError("unreachable", error instanceof Error ? error.message : String(error));
    }
  };
}

export function encodeForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function errorForStatus(status: number): SelfHostedError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return new SelfHostedError("unauthorized", "HTTP 401", status);
  if (status === 403) return new SelfHostedError("forbidden", "HTTP 403", status);
  if (status === 404) return new SelfHostedError("not-found", "HTTP 404", status);
  return new SelfHostedError("server", `HTTP ${status}`, status);
}

export function parseJson<T>(response: SelfHostedResponse): T {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new SelfHostedError("invalid-response", "The server did not answer with JSON.", response.status);
  }
}

export async function requestJson<T>(transport: SelfHostedTransport, request: SelfHostedRequest): Promise<T> {
  const response = await transport(request);
  const failure = errorForStatus(response.status);
  if (failure) throw failure;
  return parseJson<T>(response);
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number | boolean)[];

/** `base` + `path` + query; array values repeat the key. Undefined and null are skipped. */
export function buildUrl(base: string, path: string, query: Record<string, QueryValue> = {}): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
  }
  const root = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${root}${suffix}${pairs.length ? `?${pairs.join("&")}` : ""}`;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += BASE64_ALPHABET[a >> 2];
    out += BASE64_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : BASE64_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : BASE64_ALPHABET[c & 63];
  }
  return out;
}

export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${encodeBase64(new TextEncoder().encode(`${username}:${password}`))}`;
}
