package pm.nemu.mobile.aidoku

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuTranscodedImageResponseHeadersTest {
  @Test
  fun replacesMimeAndStripsAllStaleRepresentationMetadata() {
    val rewritten = NemuTranscodedImageResponseHeaders.rewrite(
      linkedMapOf(
        "content-type" to "image/avif",
        "Content-Length" to "12345",
        "CONTENT-ENCODING" to "br",
        "Content-Range" to "bytes 0-99/12345",
        "ETag" to "upstream-etag",
        "Last-Modified" to "yesterday",
        "Digest" to "sha-256=old",
        "Content-Digest" to "sha-256=:old:",
        "Repr-Digest" to "sha-256=:old:",
        "Content-MD5" to "old",
        "X-Goog-Hash" to "crc32c=old",
        "X-Amz-Checksum-Sha256" to "old",
        "X-Checksum-Sha256" to "old",
        "X-Amz-Meta-MD5" to "old",
        "X-Asset-Checksum" to "old",
        "X-Asset-Hash" to "old",
        "Accept-Ranges" to "bytes",
        "Transfer-Encoding" to "chunked",
        "Content-Disposition" to "inline; filename=old.avif",
        "Content-Location" to "/old.avif",
        "Cache-Control" to "max-age=3600",
        "X-Request-Id" to "safe-to-preserve"
      ),
      "image/png"
    )

    assertEquals("image/png", rewritten["Content-Type"])
    assertEquals("max-age=3600", rewritten["Cache-Control"])
    assertEquals("safe-to-preserve", rewritten["X-Request-Id"])
    val normalizedNames = rewritten.keys.map { it.lowercase() }.toSet()
    assertTrue("content-type" in normalizedNames)
    listOf(
      "content-length",
      "content-encoding",
      "content-range",
      "etag",
      "last-modified",
      "digest",
      "content-digest",
      "repr-digest",
      "content-md5",
      "x-goog-hash",
      "x-amz-checksum-sha256",
      "x-checksum-sha256",
      "x-amz-meta-md5",
      "x-asset-checksum",
      "x-asset-hash",
      "accept-ranges",
      "transfer-encoding",
      "content-disposition",
      "content-location"
    ).forEach { stale -> assertFalse(stale in normalizedNames) }
  }

  @Test
  fun cannotLeaveASecondCaseVariantOfContentType() {
    val rewritten = NemuTranscodedImageResponseHeaders.rewrite(
      linkedMapOf(
        "CONTENT-TYPE" to "image/jpeg",
        "Content-Type" to "image/webp"
      ),
      "image/png"
    )

    assertEquals(mapOf("Content-Type" to "image/png"), rewritten)
  }
}
