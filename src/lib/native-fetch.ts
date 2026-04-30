/**
 * Native HTTP fetcher.
 *
 * On Capacitor (iOS/Android), source HTTP traffic does NOT go through the
 * CORS proxy. Instead we route directly through CapacitorHttp, which uses
 * the platform's native networking stack (URLSession on iOS, OkHttp on
 * Android) and bypasses webview CORS entirely.
 *
 * On the web, the CapacitorHttp plugin is unavailable, so callers must
 * keep using the existing proxyUrl() path.
 *
 * Shape matches `fetch(url, init): Promise<Response>` so it can be used
 * as a drop-in `customFetch`/`ProxyFetch` for source runtimes.
 *
 * Important Capacitor quirks handled here:
 * - When `responseType: 'arraybuffer'` is requested, the native bridge
 *   returns `data` as a **base64 string**, not raw bytes. We decode it.
 * - When the response Content-Type is `application/json`, Capacitor
 *   FORCES `responseType` to `'json'` regardless of what we asked for, and
 *   `data` comes back as an already-parsed object. We re-stringify it so
 *   `Response.json()` keeps working for callers.
 */
import { Capacitor } from "@capacitor/core";
import { CapacitorHttp, type HttpResponse } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { out[k] = v; });
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = v;
  } else {
    Object.assign(out, headers);
  }
  return out;
}

async function bodyToData(body?: BodyInit | null): Promise<string | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) {
    return base64FromBytes(new Uint8Array(body));
  }
  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    return base64FromBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  if (body instanceof Blob) {
    return base64FromBytes(new Uint8Array(await body.arrayBuffer()));
  }
  // FormData and ReadableStream are not supported here; sources don't use them.
  return undefined;
}

function base64FromBytes(bytes: Uint8Array): string {
  // Chunked btoa to avoid stack overflow on large bodies.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeResponseBody(res: HttpResponse): BodyInit | null {
  const data = res.data;
  if (data == null) return null;

  // We always request `responseType: "arraybuffer"` below, so Capacitor
  // returns ANY response body as a base64 string — including plain text
  // and HTML. Decoding produces a Uint8Array of the original bytes (UTF-8
  // for text, raw bytes for binary). Callers that read `response.text()`
  // get the original characters back; callers that read `response.blob()`
  // / `arrayBuffer()` get the original bytes. The catch fallback below is
  // only reached for malformed base64, which Capacitor shouldn't produce.
  if (typeof data === "string") {
    try {
      const u8 = bytesFromBase64(data);
      // Detach to a fresh ArrayBuffer so TS treats it as BodyInit.
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
    } catch {
      // Not valid base64 — fall through to treat it as plain text.
      return data;
    }
  }

  // Already-parsed JSON (Capacitor's content-type sniffing path).
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Blob) return data;
  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

/**
 * Drop-in replacement for `fetch(url, init)` that routes through native HTTP
 * when running on Capacitor. Always returns a real `Response`.
 */
export async function nativeFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  const data = await bodyToData(init?.body);

  // Guard against sources requesting dangerous protocols (file://, intent://,
  // javascript:, etc.). Only http and https are allowed through the native bridge.
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`nativeFetch blocked non-HTTP URL: ${parsed.protocol}`);
  }

  // Use 'arraybuffer' so binary payloads (images) survive the bridge intact
  // (returned as base64 we decode below). Text/JSON also pass through fine.
  const res = await CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    responseType: "arraybuffer",
  });

  const body = decodeResponseBody(res);
  const responseHeaders = new Headers();
  // Capacitor headers can have casing inconsistencies between platforms.
  if (res.headers) {
    for (const [k, v] of Object.entries(res.headers)) {
      if (typeof v === "string") responseHeaders.set(k, v);
    }
  }
  return new Response(body as BodyInit | null, {
    status: res.status,
    headers: responseHeaders,
  });
}
