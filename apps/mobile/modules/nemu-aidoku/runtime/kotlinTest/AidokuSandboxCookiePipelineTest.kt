package pm.nemu.mobile.aidoku

import java.util.concurrent.TimeUnit
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AidokuSandboxCookiePipelineTest {
  private lateinit var server: MockWebServer

  @Before
  fun setUp() {
    server = MockWebServer()
    server.start()
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  private fun sandboxClient(jar: NemuCookieJar?): OkHttpClient =
    OkHttpClient.Builder()
      .cookieJar(CookieJar.NO_COOKIES)
      .addInterceptor(AidokuExplicitCookiePolicyInterceptor())
      .addNetworkInterceptor(AidokuSandboxCookieInterceptor(jar))
      .build()

  @Test
  fun redirectPersistsEverySetCookieWhileExplicitCookieNamesWin() {
    val jar = NemuCookieJar(
      webViewCookiePolicy = AidokuWebViewCookiePolicy.NONE,
      persistClearanceToWebView = false
    )
    val client = sandboxClient(jar)
    server.enqueue(
      MockResponse()
        .setResponseCode(302)
        .addHeader("Location", "/next")
        .addHeader("Set-Cookie", "session=native-old; Path=/; HttpOnly")
        .addHeader("Set-Cookie", "other=persisted; Path=/")
    )
    server.enqueue(MockResponse().setResponseCode(200).setBody("ready"))

    client.newCall(
      Request.Builder()
        .url(server.url("/start"))
        .header("Cookie", "session=source-explicit; theme=dark")
        .header("Better-Auth-Cookie", "app-session")
        .header("X-Api-Key", "source-key")
        .build()
    ).execute().use { response ->
      assertEquals(200, response.code)
    }

    val first = server.takeRequest(2, TimeUnit.SECONDS)
    val redirected = server.takeRequest(2, TimeUnit.SECONDS)
    assertEquals("session=source-explicit; theme=dark", first?.getHeader("Cookie"))
    assertEquals("app-session", first?.getHeader("Better-Auth-Cookie"))
    assertEquals("app-session", redirected?.getHeader("Better-Auth-Cookie"))
    assertEquals("source-key", redirected?.getHeader("X-Api-Key"))
    val redirectedCookie = redirected?.getHeader("Cookie").orEmpty()
    assertTrue(redirectedCookie.contains("session=source-explicit"))
    assertTrue(redirectedCookie.contains("theme=dark"))
    assertTrue(redirectedCookie.contains("other=persisted"))
    assertFalse(redirectedCookie.contains("session=native-old"))
    assertEquals(2, jar.sizeForTesting())

    // A later request with no source-authored header receives the exact cookies
    // persisted from the two distinct Set-Cookie response fields.
    server.enqueue(MockResponse().setResponseCode(200))
    client.newCall(Request.Builder().url(server.url("/later")).build())
      .execute().close()
    val laterCookie = server.takeRequest(2, TimeUnit.SECONDS)
      ?.getHeader("Cookie")
      .orEmpty()
    assertTrue(laterCookie.contains("session=native-old"))
    assertTrue(laterCookie.contains("other=persisted"))
  }

  @Test
  fun aDifferentSourceJarNeverReceivesTheFirstSourcesCookies() {
    val sourceA = NemuCookieJar(
      webViewCookiePolicy = AidokuWebViewCookiePolicy.NONE,
      persistClearanceToWebView = false
    )
    val sourceB = NemuCookieJar(
      webViewCookiePolicy = AidokuWebViewCookiePolicy.NONE,
      persistClearanceToWebView = false
    )
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .addHeader("Set-Cookie", "auth=source-a; Path=/")
    )
    sandboxClient(sourceA).newCall(
      Request.Builder().url(server.url("/source-a")).build()
    ).execute().close()
    server.takeRequest(2, TimeUnit.SECONDS)

    server.enqueue(MockResponse().setResponseCode(200))
    sandboxClient(sourceB).newCall(
      Request.Builder().url(server.url("/source-b")).build()
    ).execute().close()
    val sourceBRequest = server.takeRequest(2, TimeUnit.SECONDS)
    assertNull(sourceBRequest?.getHeader("Cookie"))
  }

  @Test
  fun crossOriginRedirectNeverForwardsExplicitOrStoredCookies() {
    val redirectTarget = MockWebServer()
    redirectTarget.start()
    try {
      val jar = NemuCookieJar(
        webViewCookiePolicy = AidokuWebViewCookiePolicy.NONE,
        persistClearanceToWebView = false
      )
      server.enqueue(
        MockResponse()
          .setResponseCode(302)
          .addHeader(
            "Location",
            redirectTarget.url("/target").newBuilder().host("127.0.0.1").build()
          )
          .addHeader("Set-Cookie", "stored=origin-a; Path=/")
      )
      redirectTarget.enqueue(MockResponse().setResponseCode(200))

      sandboxClient(jar).newCall(
        Request.Builder()
          .url(server.url("/start"))
          .header("Cookie", "session=source-secret")
          .header("Better-Auth-Cookie", "app-session-secret")
          .header("X-Api-Key", "source-api-secret")
          .header("X-CSRF-Token", "csrf-secret")
          .header("Vendor-Credential", "vendor-secret")
          .header("X-Auth", "unrecognized-secret")
          .header("Authentication", "also-secret")
          .header("X-Api-Version", "private-custom-value")
          .header("Accept", "application/json")
          .build()
      ).execute().close()

      val originalRequest = server.takeRequest(2, TimeUnit.SECONDS)
      val redirectedRequest = redirectTarget.takeRequest(2, TimeUnit.SECONDS)
      assertEquals("session=source-secret", originalRequest?.getHeader("Cookie"))
      assertEquals(
        "app-session-secret",
        originalRequest?.getHeader("Better-Auth-Cookie")
      )
      assertNull(redirectedRequest?.getHeader("Cookie"))
      assertNull(redirectedRequest?.getHeader("Better-Auth-Cookie"))
      assertNull(redirectedRequest?.getHeader("X-Api-Key"))
      assertNull(redirectedRequest?.getHeader("X-CSRF-Token"))
      assertNull(redirectedRequest?.getHeader("Vendor-Credential"))
      assertNull(redirectedRequest?.getHeader("X-Auth"))
      assertNull(redirectedRequest?.getHeader("Authentication"))
      assertNull(redirectedRequest?.getHeader("X-Api-Version"))
      assertEquals("application/json", redirectedRequest?.getHeader("Accept"))
    } finally {
      redirectTarget.shutdown()
    }
  }

  @Test
  fun statelessInterceptorNeverPersistsResponseCookies() {
    val client = sandboxClient(null)
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .addHeader("Set-Cookie", "session=must-not-persist; Path=/")
    )
    client.newCall(Request.Builder().url(server.url("/first")).build())
      .execute().close()
    server.takeRequest(2, TimeUnit.SECONDS)

    server.enqueue(MockResponse().setResponseCode(200))
    client.newCall(Request.Builder().url(server.url("/second")).build())
      .execute().close()
    val secondRequest = server.takeRequest(2, TimeUnit.SECONDS)
    assertNull(secondRequest?.getHeader("Cookie"))
  }

  @Test
  fun sourceCookieStoreUsesABoundedLru() {
    val store = AidokuSandboxCookieStore(maxSources = 32)
    repeat(33) { index -> store.get("source-$index") }
    assertEquals(32, store.sizeForTesting())
    store.close()
    try {
      store.get("late-source")
      throw AssertionError("A destroyed module must not recreate a cookie scope.")
    } catch (_: IllegalStateException) {
      // Expected.
    }
  }
}
