/**
 * Common proxy request utilities for test scripts
 * 
 * Provides synchronous HTTP via curl through the CORS proxy.
 * Battle-tested from test-aidoku-source.ts
 */

export const PROXY_URL = process.env.PROXY_URL || "https://service.nemu.pm";

export interface ProxyRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  wantBytes?: boolean;
  debug?: boolean;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;        // text (or base64 if wantBytes)
  bodyBuffer: Buffer;  // raw bytes
  error: string | null;
}

/**
 * Parse curl -i output to separate headers and body
 */
function parseCurlOutput(rawBuffer: Buffer): {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyBuffer: Buffer;
} {
  // Find header/body separator (\r\n\r\n or \n\n)
  let headerEnd = -1;
  let separatorLen = 4;
  
  for (let i = 0; i < rawBuffer.length - 3; i++) {
    if (rawBuffer[i] === 0x0d && rawBuffer[i+1] === 0x0a && 
        rawBuffer[i+2] === 0x0d && rawBuffer[i+3] === 0x0a) {
      headerEnd = i;
      break;
    }
  }
  
  if (headerEnd === -1) {
    for (let i = 0; i < rawBuffer.length - 1; i++) {
      if (rawBuffer[i] === 0x0a && rawBuffer[i+1] === 0x0a) {
        headerEnd = i;
        separatorLen = 2;
        break;
      }
    }
  }
  
  let status = 200;
  let statusText = "OK";
  const headers: Record<string, string> = {};
  let bodyBuffer: Buffer;
  
  if (headerEnd !== -1) {
    const headerPart = rawBuffer.slice(0, headerEnd).toString("utf-8");
    bodyBuffer = rawBuffer.slice(headerEnd + separatorLen) as Buffer;
    
    // Parse status from last HTTP line (handles redirects)
    const lastHttpIndex = headerPart.lastIndexOf("HTTP/");
    if (lastHttpIndex !== -1) {
      const statusLine = headerPart.slice(lastHttpIndex).split(/\r?\n/)[0];
      const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)\s*(.*)/);
      if (statusMatch) {
        status = parseInt(statusMatch[1], 10);
        statusText = statusMatch[2] || "OK";
      }
      
      // Parse headers (from last HTTP response)
      const headerLines = headerPart.slice(lastHttpIndex).split(/\r?\n/).slice(1);
      for (const line of headerLines) {
        const idx = line.indexOf(": ");
        if (idx > 0) {
          headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
        }
      }
    }
  } else {
    bodyBuffer = rawBuffer;
  }
  
  return { status, statusText, headers, bodyBuffer };
}

/**
 * Synchronous HTTP request through CORS proxy using curl
 */
export function proxyRequest(url: string, options: ProxyRequestOptions = {}): ProxyResponse {
  const { method = "GET", headers = {}, body = null, wantBytes = false, debug = false } = options;
  
  // Extract original URL if already proxied
  let targetUrl = url;
  const proxyMatch = url.match(/\/proxy\?url=(.+)/);
  if (proxyMatch) {
    targetUrl = decodeURIComponent(proxyMatch[1]);
  }
  
  // Build proxy URL
  const proxyTarget = `${PROXY_URL}/proxy?url=${encodeURIComponent(targetUrl)}`;
  
  // Build curl headers with x-proxy- prefix
  const curlHeaders: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    // Skip if already has x-proxy- prefix
    if (k.toLowerCase().startsWith("x-proxy-")) {
      curlHeaders.push("-H", `${k}: ${v}`);
    } else {
      curlHeaders.push("-H", `x-proxy-${k}: ${v}`);
    }
  }
  
  if (debug) {
    console.log(`[HTTP] ${method} ${targetUrl}`);
    if (Object.keys(headers).length > 0) {
      console.log(`[HTTP] Headers:`, headers);
    }
  }
  
  try {
    const result = Bun.spawnSync([
      "curl", "-s", "-i",
      "-X", method,
      "-L",
      "--max-time", "30",
      ...curlHeaders,
      ...(body ? ["-d", body] : []),
      proxyTarget,
    ]);
    
    if (result.exitCode !== 0) {
      const stderr = result.stderr?.toString() || "";
      return {
        status: 0,
        statusText: "",
        headers: {},
        body: "",
        bodyBuffer: Buffer.alloc(0),
        error: `curl failed (exit ${result.exitCode}): ${stderr}`,
      };
    }
    
    const rawBuffer = result.stdout as Buffer;
    const parsed = parseCurlOutput(rawBuffer);
    
    // Convert body to string or base64
    let bodyStr: string;
    if (wantBytes) {
      bodyStr = parsed.bodyBuffer.toString("base64");
    } else {
      // Try UTF-8 first, fall back to latin1 for binary
      try {
        bodyStr = parsed.bodyBuffer.toString("utf-8");
      } catch {
        bodyStr = parsed.bodyBuffer.toString("latin1");
      }
    }
    
    return {
      status: parsed.status,
      statusText: parsed.statusText,
      headers: parsed.headers,
      body: bodyStr,
      bodyBuffer: parsed.bodyBuffer,
      error: null,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (debug) {
      console.error("[HTTP] Error:", errMsg);
    }
    return {
      status: 0,
      statusText: "",
      headers: {},
      body: "",
      bodyBuffer: Buffer.alloc(0),
      error: errMsg,
    };
  }
}

/**
 * Polyfill XMLHttpRequest using proxyRequest
 * For Aidoku WASM runtime that expects sync XHR
 */
export class ProxiedXMLHttpRequest {
  private _method = "GET";
  private _url = "";
  private _headers: Record<string, string> = {};
  private _response: ProxyResponse | null = null;

  readyState = 0;
  responseType: XMLHttpRequestResponseType = "";
  
  onload: (() => void) | null = null;
  onerror: ((e: Error) => void) | null = null;
  onreadystatechange: (() => void) | null = null;

  get status() { return this._response?.status ?? 0; }
  get statusText() { return this._response?.statusText ?? ""; }
  get responseText() { return this._response?.body ?? ""; }
  get response() { 
    if (!this._response) return null;
    const buf = this._response.bodyBuffer;
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  open(method: string, url: string, _async = true) {
    this._method = method;
    this._url = url;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this._headers[name] = value;
  }

  overrideMimeType(_mimeType: string) {}

  getAllResponseHeaders(): string {
    if (!this._response) return "";
    return Object.entries(this._response.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    const bodyStr = body ? body.toString() : null;
    
    this._response = proxyRequest(this._url, {
      method: this._method,
      headers: this._headers,
      body: bodyStr,
      debug: process.env.DEBUG === "1",
    });

    this.readyState = 4;
    this.onreadystatechange?.();
    
    if (this._response.error) {
      this.onerror?.(new Error(this._response.error));
    } else {
      this.onload?.();
    }
  }

  abort() {}
}

/**
 * Install XMLHttpRequest polyfill globally
 */
export function installXHRPolyfill() {
  // @ts-expect-error - polyfill
  globalThis.XMLHttpRequest = ProxiedXMLHttpRequest;
}

