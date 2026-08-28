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
