package okhttp3.internal

import kotlin.js.JsAny
import kotlin.js.JsString

/**
 * JavaScript HTTP bridge for Kotlin/WASM using synchronous XMLHttpRequest.
 * 
 * IMPORTANT: This only works in a Web Worker context.
 * Synchronous XHR is blocked in the main thread of modern browsers,
 * but is allowed in Web Workers.
 * 
 * Pattern borrowed from Aidoku runtime (net.ts).
 */

/**
 * Result from synchronous HTTP request
 */
external interface SyncHttpResult : JsAny {
    val status: Int
    val statusText: String
    val headersJson: String
    val body: String
    val error: String?
}

/**
 * Perform a synchronous HTTP request using XMLHttpRequest.
 * Uses CORS proxy for cross-origin requests.
 */
@JsFun("""
(url, method, headersJson, body) => {
    try {
        const proxyUrl = 'https://service.nemu.pm/proxy?url=' + encodeURIComponent(url);
        const xhr = new XMLHttpRequest();
        xhr.open(method, proxyUrl, false); // false = synchronous
        xhr.responseType = 'text';
        
        // Set headers
        const headers = JSON.parse(headersJson || '{}');
        for (const [key, value] of Object.entries(headers)) {
            try {
                xhr.setRequestHeader(key, value);
            } catch (e) {
                // Some headers can't be set (e.g., User-Agent in browsers)
            }
        }
        
        xhr.send(body || null);
        
        // Collect response headers
        const responseHeaders = {};
        xhr.getAllResponseHeaders().split('\r\n').forEach(line => {
            const idx = line.indexOf(': ');
            if (idx > 0) {
                const key = line.slice(0, idx).toLowerCase();
                const value = line.slice(idx + 2);
                if (responseHeaders[key]) {
                    responseHeaders[key] += ', ' + value;
                } else {
                    responseHeaders[key] = value;
                }
            }
        });
        
        return {
            status: xhr.status,
            statusText: xhr.statusText,
            headersJson: JSON.stringify(responseHeaders),
            body: xhr.responseText,
            error: null
        };
    } catch (e) {
        return {
            status: 0,
            statusText: '',
            headersJson: '{}',
            body: '',
            error: e.message || String(e) || 'Unknown error'
        };
    }
}
""")
external fun syncHttpRequest(url: String, method: String, headersJson: String, body: String?): SyncHttpResult

/**
 * Get bytes from response body as base64 string.
 * Separate call because responseType can only be set before open().
 */
@JsFun("""
(url, method, headersJson, body) => {
    try {
        const proxyUrl = 'https://service.nemu.pm/proxy?url=' + encodeURIComponent(url);
        const xhr = new XMLHttpRequest();
        xhr.open(method, proxyUrl, false); // false = synchronous
        xhr.responseType = 'arraybuffer';
        
        // Set headers
        const headers = JSON.parse(headersJson || '{}');
        for (const [key, value] of Object.entries(headers)) {
            try {
                xhr.setRequestHeader(key, value);
            } catch (e) {
                // Some headers can't be set in browsers
            }
        }
        
        xhr.send(body || null);
        
        // Convert array buffer to base64
        const bytes = new Uint8Array(xhr.response);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        
        // Collect response headers
        const responseHeaders = {};
        xhr.getAllResponseHeaders().split('\r\n').forEach(line => {
            const idx = line.indexOf(': ');
            if (idx > 0) {
                const key = line.slice(0, idx).toLowerCase();
                const value = line.slice(idx + 2);
                responseHeaders[key] = value;
            }
        });
        
        return {
            status: xhr.status,
            statusText: xhr.statusText,
            headersJson: JSON.stringify(responseHeaders),
            body: btoa(binary),
            error: null
        };
    } catch (e) {
        return {
            status: 0,
            statusText: '',
            headersJson: '{}',
            body: '',
            error: e.message || 'Unknown error'
        };
    }
}
""")
external fun syncHttpRequestBytes(url: String, method: String, headersJson: String, body: String?): SyncHttpResult

/**
 * Decode base64 string to bytes
 */
@JsFun("""
(base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
""")
external fun base64ToBytes(base64: String): JsAny

/**
 * Get property from SyncHttpResult
 */
@JsFun("(obj) => obj.status")
external fun getResultStatus(obj: SyncHttpResult): Int

@JsFun("(obj) => obj.statusText") 
external fun getResultStatusText(obj: SyncHttpResult): String

@JsFun("(obj) => obj.headersJson")
external fun getResultHeadersJson(obj: SyncHttpResult): String

@JsFun("(obj) => obj.body")
external fun getResultBody(obj: SyncHttpResult): String

@JsFun("(obj) => obj.error")
external fun getResultError(obj: SyncHttpResult): String?
