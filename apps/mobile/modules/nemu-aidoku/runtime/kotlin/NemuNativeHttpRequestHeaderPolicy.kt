package pm.nemu.mobile.aidoku

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Bounds and canonicalizes source-authored request headers before OkHttp sees
 * them. Aidoku sources are untrusted packages, so malformed headers must fail
 * with a stable error instead of throwing from OkHttp's builder or allocating
 * an unbounded native header block.
 */
internal object NemuNativeHttpRequestHeaderPolicy {
  const val MAX_HEADER_COUNT = 128
  const val MAX_HEADER_NAME_CHARACTERS = 256
  const val MAX_HEADER_VALUE_CHARACTERS = 16 * 1024
  const val MAX_HEADER_VALUE_WIRE_BYTES = 16 * 1024
  const val MAX_TOTAL_HEADER_WIRE_BYTES = 64 * 1024

  private val tokenCharacters =
    "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".toSet()

  /** True when [headers] already names a User-Agent, in any casing. */
  fun hasUserAgent(headers: Map<String, String>): Boolean =
    headers.keys.any { it.equals("User-Agent", ignoreCase = true) }

  /**
   * [headers] with [userAgent] added when they name none; a User-Agent the
   * caller (a source) chose is never replaced.
   */
  fun ensuringUserAgent(headers: Map<String, String>, userAgent: String): Map<String, String> {
    if (hasUserAgent(headers)) return headers
    return LinkedHashMap(headers).apply { put("User-Agent", userAgent) }
  }

  /**
   * The headers a source-owned image request (a cover, a page, a rewritten
   * `modify_image_request` result) is fetched with once native has merged the
   * source's stored cookies into [decorated].
   *
   * When the jar contributed a cookie — the `Cookie` value differs from the
   * one the source itself supplied ([sourceCookie]) — the request now carries
   * the source's session, `cf_clearance` included, and a clearance is only
   * honoured next to the User-Agent that solved it: the source's own, else
   * [sourceUserAgent]. When the jar contributed nothing, the headers are left
   * exactly as the source produced them: a User-Agent there would change the
   * image's cache key (headers are part of it) and buy nothing. Mirrors the
   * iOS policy of the same name.
   */
  fun sourceImageHeaders(
    decorated: Map<String, String>,
    sourceCookie: String?,
    sourceUserAgent: String
  ): Map<String, String> {
    val cookie = decorated.entries.firstOrNull { it.key.equals("Cookie", ignoreCase = true) }?.value
    if (cookie == null || cookie == sourceCookie) return decorated
    return ensuringUserAgent(decorated, sourceUserAgent)
  }

  /**
   * The User-Agent for a request that names none.
   *
   * A request with a cookie scope is a source's: it reads and writes that
   * source's jar, and a `cf_clearance` in the jar only works next to the
   * User-Agent that solved it — the Aidoku runtime default unless the source
   * sets its own (in which case this is never consulted). Unscoped traffic
   * (registry, sync, OCR, metadata) carries no source cookies and keeps the
   * platform browser's UA. Mirrors the iOS policy of the same name.
   */
  fun fallbackUserAgent(
    cookieScope: String?,
    sourceDefault: String,
    platformDefault: String
  ): String = if (cookieScope.isNullOrBlank()) platformDefault else sourceDefault

  fun normalize(headers: Map<String, String>): Map<String, String> {
    if (headers.size > MAX_HEADER_COUNT) {
      throw IllegalArgumentException("Native HTTP request has too many headers.")
    }

    var totalWireBytes = 0
    val normalized = LinkedHashMap<String, String>(headers.size)
    val normalizedNames = HashSet<String>(headers.size)
    headers.forEach { (rawName, rawValue) ->
      // Retain the bridge's historical behavior for an empty property name.
      if (rawName.isBlank()) return@forEach
      if (
        rawName.length > MAX_HEADER_NAME_CHARACTERS ||
        rawName.any { it !in tokenCharacters }
      ) {
        throw IllegalArgumentException("Native HTTP request has an invalid header name.")
      }
      val normalizedName = rawName.lowercase()
      if (!normalizedNames.add(normalizedName)) {
        throw IllegalArgumentException("Native HTTP request has duplicate header names.")
      }
      if (rawValue.length > MAX_HEADER_VALUE_CHARACTERS) {
        throw IllegalArgumentException("Native HTTP request has an oversized header value.")
      }

      val value = normalizeUrlValue(normalizedName, rawValue)
      if (value.any { it != '\t' && (it < ' ' || it > '~') }) {
        throw IllegalArgumentException(
          "Native HTTP request header values must use printable ASCII."
        )
      }
      // Names and normalized values are ASCII at this point, so JVM string
      // length is the exact HTTP/1 field-content byte length. Rechecking after
      // URL canonicalization prevents percent-encoding from expanding a small
      // Unicode input past the advertised per-value bound.
      val valueWireBytes = value.length
      if (valueWireBytes > MAX_HEADER_VALUE_WIRE_BYTES) {
        throw IllegalArgumentException("Native HTTP request has an oversized header value.")
      }
      totalWireBytes += rawName.length + valueWireBytes
      if (totalWireBytes > MAX_TOTAL_HEADER_WIRE_BYTES) {
        throw IllegalArgumentException("Native HTTP request headers exceed the safety limit.")
      }
      // Sources never control Nemu's proxy credential. Validate and count the
      // field first so the reserved name cannot bypass bounds or case-folded
      // duplicate rejection.
      if (normalizedName == "proxy-authorization") return@forEach
      normalized[rawName] = value
    }
    return normalized
  }

  private fun normalizeUrlValue(normalizedName: String, value: String): String {
    if (value.all { it == '\t' || it in ' '..'~' }) return value
    if (
      normalizedName != "referer" &&
      normalizedName != "referrer" &&
      normalizedName != "origin"
    ) {
      return value
    }

    // HttpUrl serializes Unicode hosts and paths into an ASCII wire form.
    // This mirrors browser referrer behavior and avoids OkHttp rejecting the
    // request before it reaches the source site.
    return value.toHttpUrlOrNull()?.toString()
      ?: throw IllegalArgumentException("Native HTTP request has an invalid URL header.")
  }
}
