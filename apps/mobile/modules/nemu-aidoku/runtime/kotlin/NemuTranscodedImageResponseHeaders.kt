package pm.nemu.mobile.aidoku

import java.util.Locale

/**
 * A transcode creates a different HTTP representation. Preserve transport- and
 * cache-policy metadata that still applies, but never return byte counts,
 * encodings, ranges, validators, filenames, or integrity values for the
 * discarded upstream payload.
 */
internal object NemuTranscodedImageResponseHeaders {
  private val STALE_REPRESENTATION_HEADERS = setOf(
    "accept-ranges",
    "content-disposition",
    "content-encoding",
    "content-length",
    "content-location",
    "content-md5",
    "content-range",
    "digest",
    "etag",
    "last-modified",
    "repr-digest",
    "transfer-encoding"
  )

  internal fun rewrite(
    headers: Map<String, String>,
    mimeType: String
  ): Map<String, String> {
    val rewritten = LinkedHashMap<String, String>()
    headers.forEach { (name, value) ->
      val normalized = name.trim().lowercase(Locale.US)
      if (!isRepresentationSpecific(normalized)) rewritten[name] = value
    }
    rewritten["Content-Type"] = mimeType
    return rewritten
  }

  private fun isRepresentationSpecific(normalizedName: String): Boolean {
    return normalizedName == "content-type" ||
      normalizedName in STALE_REPRESENTATION_HEADERS ||
      normalizedName.contains("digest") ||
      normalizedName.contains("checksum") ||
      normalizedName.endsWith("-hash") ||
      normalizedName.endsWith("-md5") ||
      normalizedName.contains("sha256") ||
      normalizedName.contains("sha-256") ||
      normalizedName.contains("crc32")
  }
}
