package pm.nemu.mobile.aidoku

import org.junit.Assert.assertEquals
import org.junit.Test

class AidokuSandboxCookieHeadersTest {
  @Test
  fun explicitCookieNamesOverrideNativeValues() {
    val merged = mergeAidokuSandboxCookieHeaders(
      mapOf("cookie" to "session=source; theme=dark", "Referer" to "https://example.test"),
      listOf("session" to "native", "cf_clearance" to "clear")
    )

    assertEquals("session=source; theme=dark; cf_clearance=clear", merged["cookie"])
    assertEquals("https://example.test", merged["Referer"])
  }

  @Test
  fun addsCookieHeaderWhenSourceProvidesNone() {
    val merged = mergeAidokuSandboxCookieHeaders(
      mapOf("Referer" to "https://example.test"),
      listOf("session" to "native")
    )

    assertEquals("session=native", merged["Cookie"])
  }
}
