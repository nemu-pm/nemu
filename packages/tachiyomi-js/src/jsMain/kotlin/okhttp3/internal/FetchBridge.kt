package okhttp3.internal

/**
 * HTTP bridge for Kotlin/JS - delegates to runtime-provided implementation.
 * 
 * The actual HTTP implementation is provided by the host environment (e.g., Web Worker).
 * This allows the tachiyomi-js package to be runtime-agnostic - no knowledge of
 * CORS proxies, rate limiting, or other infrastructure concerns.
 * 
 * Host must provide: globalThis.tachiyomiHttpRequest(url, method, headersJson, body, wantBytes)
 */

/**
 * Result from HTTP request - matches what host implementation returns
 */
data class SyncHttpResult(
    val status: Int,
    val statusText: String,
    val headersJson: String,
    val body: String,  // text or base64 depending on wantBytes
    val error: String?
)

/**
 * External function that must be provided by the host environment.
 * 
 * @param url The request URL
 * @param method HTTP method (GET, POST, etc.)
 * @param headersJson JSON object of request headers
 * @param body Request body (null for GET)
 * @param wantBytes If true, body in response is base64-encoded bytes
 * @returns Object with { status, statusText, headersJson, body, error }
 */
@JsName("tachiyomiHttpRequest")
private external fun externalHttpRequest(
    url: String,
    method: String,
    headersJson: String,
    body: String?,
    wantBytes: Boolean
): dynamic

/**
 * Perform a synchronous HTTP request - delegates to host implementation.
 */
fun syncHttpRequest(url: String, method: String, headersJson: String, body: String?): SyncHttpResult {
    return try {
        val result = externalHttpRequest(url, method, headersJson, body, false)
        SyncHttpResult(
            status = (result.status as Number).toInt(),
            statusText = result.statusText as String,
            headersJson = result.headersJson as String,
            body = result.body as String,
            error = result.error as String?
        )
    } catch (e: dynamic) {
        SyncHttpResult(
            status = 0,
            statusText = "",
            headersJson = "{}",
            body = "",
            error = e.message?.toString() ?: e.toString() ?: "Unknown error"
        )
    }
}

/**
 * Perform a synchronous HTTP request returning bytes as base64.
 */
fun syncHttpRequestBytes(url: String, method: String, headersJson: String, body: String?): SyncHttpResult {
    return try {
        val result = externalHttpRequest(url, method, headersJson, body, true)
        SyncHttpResult(
            status = (result.status as Number).toInt(),
            statusText = result.statusText as String,
            headersJson = result.headersJson as String,
            body = result.body as String,  // base64 encoded
            error = result.error as String?
        )
    } catch (e: dynamic) {
        SyncHttpResult(
            status = 0,
            statusText = "",
            headersJson = "{}",
            body = "",
            error = e.message?.toString() ?: "Unknown error"
        )
    }
}

/**
 * Decode base64 string to bytes
 */
fun base64ToBytes(base64: String): ByteArray {
    val binary = js("atob")(base64) as String
    val bytes = ByteArray(binary.length)
    for (i in binary.indices) {
        bytes[i] = binary[i].code.toByte()
    }
    return bytes
}
