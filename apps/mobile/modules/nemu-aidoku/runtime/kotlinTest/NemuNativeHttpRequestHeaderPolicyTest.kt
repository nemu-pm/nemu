package pm.nemu.mobile.aidoku

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuNativeHttpRequestHeaderPolicyTest {
  @Test
  fun percentEncodesUnicodeRefererUrlsForOkHttp() {
    val normalized = NemuNativeHttpRequestHeaderPolicy.normalize(
      mapOf(
        "Referer" to
          "https://mangamura.me/manga/\u5f8c\u5bae\u771f\u8d0b\u5224\u5b9a\u4eba/ja/chapter-6-raw/"
      )
    ).getValue("Referer")

    assertEquals(
      "https://mangamura.me/manga/%E5%BE%8C%E5%AE%AE%E7%9C%9F%E8%B4%8B%E5%88%A4%E5%AE%9A%E4%BA%BA/ja/chapter-6-raw/",
      normalized
    )
    assertTrue(normalized.all { it <= '~' })
  }

  @Test
  fun preservesOrdinaryHeadersAndTheirOriginalCasing() {
    assertEquals(
      linkedMapOf(
        "Referer" to "https://example.test/chapter/1",
        "X-Source" to "aidoku"
      ),
      NemuNativeHttpRequestHeaderPolicy.normalize(
        linkedMapOf(
          "Referer" to "https://example.test/chapter/1",
          "X-Source" to "aidoku"
        )
      )
    )
  }

  @Test
  fun stripsProxyAuthorizationRegardlessOfCasing() {
    assertEquals(
      linkedMapOf("Accept" to "image/*"),
      NemuNativeHttpRequestHeaderPolicy.normalize(
        linkedMapOf(
          "Accept" to "image/*",
          "pRoXy-AuThOrIzAtIoN" to "Basic source-secret"
        )
      )
    )
  }

  @Test
  fun rejectsNonUrlUnicodeAndHeaderInjection() {
    assertExactFailure("Native HTTP request has duplicate header names.") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        mapOf(
          "Cookie" to "session=first",
          "cookie" to "session=second"
        )
      )
    }
    assertExactFailure("Native HTTP request has duplicate header names.") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        mapOf(
          "Referer" to "https://example.test/first",
          "referer" to "https://example.test/second"
        )
      )
    }
    assertExactFailure("Native HTTP request has duplicate header names.") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        mapOf(
          "Proxy-Authorization" to "Basic first-secret",
          "proxy-authorization" to "Basic second-secret"
        )
      )
    }
    assertFailure("printable ASCII") {
      NemuNativeHttpRequestHeaderPolicy.normalize(mapOf("X-Title" to "\u5f8c\u5bae"))
    }
    assertFailure("printable ASCII") {
      NemuNativeHttpRequestHeaderPolicy.normalize(mapOf("X-Test" to "ok\r\ninjected"))
    }
  }

  @Test
  fun boundsHeaderCountValuesAndAggregateSize() {
    assertFailure("too many") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        (0..NemuNativeHttpRequestHeaderPolicy.MAX_HEADER_COUNT).associate {
          "X-$it" to "value"
        }
      )
    }
    assertExactFailure("Native HTTP request has an oversized header value.") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        mapOf(
          "X-Large" to "a".repeat(
            NemuNativeHttpRequestHeaderPolicy.MAX_HEADER_VALUE_CHARACTERS + 1
          )
        )
      )
    }
    val expansionBoundary =
      "https://example.test/a" + "\u5f8c".repeat(1_818)
    val boundaryValue = NemuNativeHttpRequestHeaderPolicy.normalize(
      mapOf("Referer" to expansionBoundary)
    ).getValue("Referer")
    assertEquals(
      NemuNativeHttpRequestHeaderPolicy.MAX_HEADER_VALUE_WIRE_BYTES,
      boundaryValue.length
    )
    assertExactFailure("Native HTTP request has an oversized header value.") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        mapOf(
          "Referer" to "https://example.test/aa" + "\u5f8c".repeat(1_818)
        )
      )
    }
    assertFailure("safety limit") {
      NemuNativeHttpRequestHeaderPolicy.normalize(
        (0 until 5).associate {
          "X-$it" to "a".repeat(NemuNativeHttpRequestHeaderPolicy.MAX_HEADER_VALUE_CHARACTERS)
        }
      )
    }
  }

  private fun assertFailure(message: String, block: () -> Unit) {
    val failure = runCatching(block).exceptionOrNull()
    assertTrue(failure is IllegalArgumentException)
    assertTrue(failure?.message.orEmpty().contains(message))
  }

  private fun assertExactFailure(message: String, block: () -> Unit) {
    val failure = runCatching(block).exceptionOrNull()
    assertTrue(failure is IllegalArgumentException)
    assertEquals(message, failure?.message)
  }
}
