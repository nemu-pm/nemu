// net namespace - HTTP request handling via CORS proxy (new aidoku-rs ABI)
import { load as cheerioLoad, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { GlobalStore } from "../global-store";
import { proxyUrl } from "@/config";

// Extended Cheerio type with API reference
interface CheerioWithApi extends Cheerio<AnyNode> {
  _cheerioApi?: CheerioAPI;
}

export function createNetImports(store: GlobalStore) {
  return {
    init: (method: number): number => {
      const id = store.createRequest(method);
      return id;
    },

    send: (descriptor: number): void => {
      const req = store.requests.get(descriptor);
      if (!req || !req.url) {
        return; // MissingUrl
      }

      // Use synchronous XMLHttpRequest (required for WASM sync calls)
      const xhr = new XMLHttpRequest();
      xhr.open(req.method || "GET", proxyUrl(req.url), false); // false = synchronous

      // For synchronous XHR on main thread, we can't use responseType = arraybuffer
      // Instead, override mime type to get raw bytes as string
      xhr.overrideMimeType("text/plain; charset=x-user-defined");

      // Add stored cookies for this URL (like Swift's HTTPCookieStorage)
      const storedCookies = store.getCookiesForUrl(req.url);
      if (storedCookies) {
        // Merge with existing cookies if any
        const existingCookie = req.headers["Cookie"];
        req.headers["Cookie"] = existingCookie
          ? `${existingCookie}; ${storedCookies}`
          : storedCookies;
      }

      // Set headers via x-proxy-* prefix
      for (const [key, value] of Object.entries(req.headers)) {
        xhr.setRequestHeader(`x-proxy-${key}`, value);
      }

      try {
        // Convert Uint8Array to ArrayBuffer for XMLHttpRequest compatibility
        xhr.send(req.body ? (req.body.buffer as ArrayBuffer) : null);

        // Parse response headers
        const responseHeaders: Record<string, string> = {};
        xhr
          .getAllResponseHeaders()
          .split("\r\n")
          .forEach((line) => {
            const idx = line.indexOf(": ");
            if (idx > 0) {
              responseHeaders[line.slice(0, idx).toLowerCase()] = line.slice(
                idx + 2
              );
            }
          });

        // Store cookies from response (like Swift's HTTPCookieStorage)
        store.storeCookiesFromResponse(req.url, responseHeaders);

        // Convert raw string to bytes (x-user-defined charset gives us raw bytes)
        const rawText = xhr.responseText || "";
        const data = new Uint8Array(rawText.length);
        for (let i = 0; i < rawText.length; i++) {
          data[i] = rawText.charCodeAt(i) & 0xff;
        }

        req.response = {
          data,
          statusCode: xhr.status,
          headers: responseHeaders,
          bytesRead: 0,
        };
      } catch (error) {
        console.error("[net.send] Request failed:", error);
        req.response = {
          data: new Uint8Array(0),
          statusCode: 0,
          headers: {},
          bytesRead: 0,
        };
      }
    },

    // Send multiple requests in parallel (simplified - just sequential for now)
    send_all: (idsPtr: number, len: number): number => {
      // Read the array of request IDs
      const ids = store.readBytes(idsPtr, len * 4);
      if (!ids) return -1;

      const view = new DataView(ids.buffer, ids.byteOffset);
      let hasError = false;

      for (let i = 0; i < len; i++) {
        const rid = view.getInt32(i * 4, true);
        const result = createNetImports(store).send(rid);
        if (result !== 0) {
          // Store error code back in the array
          view.setInt32(i * 4, result, true);
          hasError = true;
        }
      }

      // Write back the results
      store.writeBytes(ids, idsPtr);

      return hasError ? -1 : 0;
    },

    set_url: (descriptor: number, urlPtr: number, urlLen: number): void => {
      if (descriptor < 0 || urlLen <= 0) return;
      const req = store.requests.get(descriptor);
      const url = store.readString(urlPtr, urlLen);
      if (!req || !url) return;
      req.url = url;
    },

    set_header: (
      descriptor: number,
      keyPtr: number,
      keyLen: number,
      valuePtr: number,
      valueLen: number
    ): void => {
      if (descriptor < 0 || keyLen <= 0) return;
      const req = store.requests.get(descriptor);
      const key = store.readString(keyPtr, keyLen);
      if (!req || !key) return;

      const value = valueLen > 0 ? store.readString(valuePtr, valueLen) : "";
      req.headers[key] = value || "";
    },

    set_body: (descriptor: number, bodyPtr: number, bodyLen: number): number => {
      if (descriptor < 0) return -1;
      const req = store.requests.get(descriptor);
      if (!req) return -1;

      if (bodyLen > 0) {
        const body = store.readBytes(bodyPtr, bodyLen);
        if (body) {
          req.body = body;
        }
      }
      return 0;
    },

    // Get the length of response data
    data_len: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) return -7; // MissingData
      return req.response.data.length;
    },

    // Read response data into WASM memory
    read_data: (descriptor: number, bufferPtr: number, size: number): number => {
      if (descriptor < 0 || size <= 0) return -1;
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) return -7; // MissingData

      const data = req.response.data;
      if (size > data.length) return -6; // InvalidBufferSize

      store.writeBytes(data.slice(0, size), bufferPtr);
      return 0;
    },

    // Get image from response (simplified - just returns descriptor)
    get_image: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) return -7;
      // For now, just return the descriptor - image handling would need more work
      return -12; // NotAnImage - images need special handling
    },

    get_header: (descriptor: number, keyPtr: number, keyLen: number): number => {
      if (descriptor < 0 || keyLen <= 0) return -1;
      const req = store.requests.get(descriptor);
      const key = store.readString(keyPtr, keyLen);
      if (!req?.response?.headers || !key) return -1;

      const value = req.response.headers[key.toLowerCase()];
      if (!value) return -1;
      return store.storeStdValue(value);
    },

    get_status_code: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const req = store.requests.get(descriptor);
      return req?.response?.statusCode ?? -8; // MissingResponse
    },

    html: (descriptor: number): number => {
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) {
        return -7;
      }

      try {
        const text = new TextDecoder().decode(req.response.data);
        const $ = cheerioLoad(text, { baseURI: req.url });
        const root = $.root() as CheerioWithApi;
        root._cheerioApi = $;
        const htmlDescriptor = store.storeStdValue(root);
        return htmlDescriptor;
      } catch (e) {
        console.error("[net.html] Parse error:", e);
        return -5; // InvalidHtml
      }
    },

    json: (descriptor: number): number => {
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) {
        return -7;
      }

      try {
        const text = new TextDecoder().decode(req.response.data);
        const parsed = JSON.parse(text);
        return store.storeStdValue(parsed);
      } catch (e) {
        console.error("[net.json] Parse error:", e);
        return -5; // ParseError
      }
    },

    set_rate_limit: (_permits: number, _period: number, _unit: number): void => {
      // Rate limiting is not strictly enforced in the browser prototype
    },

    set_rate_limit_period: (_permits: number, _period: number): void => {
      // Rate limiting is not strictly enforced in the browser prototype
    },

    // ============ OLD ABI (legacy sources like aidoku-zh) ============
    
    // Close/cleanup a request
    close: (descriptor: number): void => {
      store.requests.delete(descriptor);
    },

    // Get size of response data (OLD ABI name for data_len)
    get_data_size: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) return -7; // MissingData
      return req.response.data.length;
    },

    // Read response data (OLD ABI name for read_data)
    get_data: (descriptor: number, bufferPtr: number, size: number): void => {
      if (descriptor < 0 || size <= 0) return;
      const req = store.requests.get(descriptor);
      if (!req?.response?.data) return;

      const data = req.response.data;
      store.writeBytes(data.slice(0, size), bufferPtr);
    },
  };
}
