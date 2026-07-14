package pm.nemu.mobile.aidoku

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class NativeHttpCookieIsolationTest {
  private val url = "https://example.test/path".toHttpUrl()

  @Test
  fun directNativeCookieJarsAreIsolatedByProfileSourceScope() {
    val store = NemuNativeHttpCookieStore()
    val profileSourceA = store.get("profile-a/source")
    val profileSourceB = store.get("profile-b/source")

    profileSourceA.saveFromCookieHeader(url, "session=profile-a")

    assertEquals(
      "profile-a",
      profileSourceA.loadForRequest(url).single { it.name == "session" }.value
    )
    assertTrue(profileSourceB.loadForRequest(url).none { it.name == "session" })
  }

  @Test
  fun profileResetInvalidatesOldJarBeforeALateResponseCanWrite() {
    val store = NemuNativeHttpCookieStore()
    val oldProfileJar = store.get("profile-a/source")
    oldProfileJar.saveFromCookieHeader(url, "session=before-reset")

    store.clear()
    oldProfileJar.saveFromCookieHeader(url, "session=late-old-profile")

    assertEquals(0, oldProfileJar.sizeForTesting())
    assertTrue(oldProfileJar.loadForRequest(url).isEmpty())
    val newProfileJar = store.get("profile-b/source")
    assertNotSame(oldProfileJar, newProfileJar)
    assertTrue(newProfileJar.loadForRequest(url).isEmpty())
  }

  @Test
  fun directNativeCookieStoreIsBoundedAndRejectsUseAfterDestroy() {
    val store = NemuNativeHttpCookieStore(maxScopes = 32)
    repeat(33) { index -> store.get("profile/source-$index") }
    assertEquals(32, store.sizeForTesting())

    store.close()
    try {
      store.get("late-profile/source")
      fail("A destroyed module must not recreate a native cookie scope.")
    } catch (_: IllegalStateException) {
      // Expected.
    }
  }
}
