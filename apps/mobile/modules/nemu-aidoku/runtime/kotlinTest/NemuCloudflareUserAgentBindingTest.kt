package pm.nemu.mobile.aidoku

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NemuCloudflareUserAgentBindingTest {
  private val scope = "profile::aidoku-zh:zh.bakamh"
  private val otherScope = "profile::aidoku-community:multi.mangadex"
  private val chrome =
    "Mozilla/5.0 (Linux; Android 16; sdk_gphone64_arm64 Build/BE2A.250530.026.F3) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.137 Mobile Safari/537.36"

  @Test
  fun derivesChromeForAndroidFromTheWebViewDefault() {
    val webView =
      "Mozilla/5.0 (Linux; Android 16; sdk_gphone64_arm64 Build/BE2A.250530.026.F3; wv) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36"
    assertEquals(chrome, nemuCloudflareChromeUserAgent(webView))
    // Already a Chrome UA: unchanged.
    assertEquals(chrome, nemuCloudflareChromeUserAgent(chrome))
    // Not a Chromium Android UA, or unusable: the caller keeps its own.
    assertNull(nemuCloudflareChromeUserAgent(NEMU_AIDOKU_DEFAULT_USER_AGENT))
    assertNull(nemuCloudflareChromeUserAgent(null))
    assertNull(nemuCloudflareChromeUserAgent(""))
    assertNull(nemuCloudflareChromeUserAgent("Mozilla/5.0 (Linux; Android 16) Chrome/1\n"))
  }

  @Test
  fun appliesOnlyToTheSolvingSourceWhileItSendsThatClearance() {
    val bindings = NemuCloudflareUserAgentBindings()
    bindings.record(scope, "bakamh.com", "abc", chrome)

    // The solved host (and its subdomains) with the adopted clearance.
    assertEquals(chrome, bindings.userAgentFor(scope, "bakamh.com", "a=1; cf_clearance=abc"))
    assertEquals(chrome, bindings.userAgentFor(scope, "img.bakamh.com", "cf_clearance=abc"))
    // Another source, even on the same host with the same clearance: never.
    assertNull(bindings.userAgentFor(otherScope, "bakamh.com", "cf_clearance=abc"))
    assertNull(bindings.userAgentFor(null, "bakamh.com", "cf_clearance=abc"))
    // Another host, or a look-alike suffix.
    assertNull(bindings.userAgentFor(scope, "example.com", "cf_clearance=abc"))
    assertNull(bindings.userAgentFor(scope, "notbakamh.com", "cf_clearance=abc"))
    // The clearance expired / was cleared (not sent), or was replaced.
    assertNull(bindings.userAgentFor(scope, "bakamh.com", "a=1"))
    assertNull(bindings.userAgentFor(scope, "bakamh.com", null))
    assertNull(bindings.userAgentFor(scope, "bakamh.com", "cf_clearance=newer"))
  }

  @Test
  fun aNewSolveReplacesTheBindingAndClearingDropsIt() {
    val bindings = NemuCloudflareUserAgentBindings()
    bindings.record(scope, "bakamh.com", "old", chrome)
    bindings.record(scope, "bakamh.com", "new", "UA2")
    assertNull(bindings.userAgentFor(scope, "bakamh.com", "cf_clearance=old"))
    assertEquals("UA2", bindings.userAgentFor(scope, "bakamh.com", "cf_clearance=new"))

    bindings.record(otherScope, "example.com", "x", chrome)
    bindings.clearScope(scope)
    assertNull(bindings.userAgentFor(scope, "bakamh.com", "cf_clearance=new"))
    assertEquals(chrome, bindings.userAgentFor(otherScope, "example.com", "cf_clearance=x"))
    bindings.clear()
    assertEquals(0, bindings.sizeForTesting())
  }

  @Test
  fun rejectsUnusableInputAndStaysBounded() {
    val bindings = NemuCloudflareUserAgentBindings(maxPerScope = 2, maxScopes = 2)
    bindings.record(scope, "bakamh.com", "", chrome)
    bindings.record(scope, "bakamh.com", "abc", "bad\nua")
    bindings.record(" ", "bakamh.com", "abc", chrome)
    bindings.record(scope, "not a host", "abc", chrome)
    assertEquals(0, bindings.sizeForTesting())

    bindings.record(scope, "a.example", "1", chrome)
    bindings.record(scope, "b.example", "2", chrome)
    bindings.record(scope, "c.example", "3", chrome)
    assertEquals(2, bindings.sizeForTesting())
    assertNull(bindings.userAgentFor(scope, "a.example", "cf_clearance=1"))

    bindings.record("s2", "d.example", "4", chrome)
    bindings.record("s3", "e.example", "5", chrome)
    assertNull(bindings.userAgentFor(scope, "c.example", "cf_clearance=3"))
    assertEquals(chrome, bindings.userAgentFor("s3", "e.example", "cf_clearance=5"))
  }

  @Test
  fun theInterceptorRewritesOnlyBoundHopsAfterTheJarMergedItsCookies() {
    MockWebServer().use { server ->
      server.enqueue(MockResponse().setBody("ok"))
      server.enqueue(MockResponse().setBody("ok"))
      server.enqueue(MockResponse().setBody("ok"))
      server.start()
      val url = server.url("/page")
      val jar = NemuCookieJar(
        webViewCookiePolicy = AidokuWebViewCookiePolicy.NONE,
        persistClearanceToWebView = false
      )
      jar.adoptSolvedCookies(url, "cf_clearance=abc")
      val bindings = NemuCloudflareUserAgentBindings()
      bindings.record(scope, url.host, "abc", chrome)

      fun client(forScope: String, withJar: NemuCookieJar?) = OkHttpClient.Builder()
        .addNetworkInterceptor(AidokuSandboxCookieInterceptor(withJar))
        .addNetworkInterceptor(NemuCloudflareUserAgentInterceptor(forScope, bindings))
        .build()
      fun get(c: OkHttpClient) = c.newCall(
        Request.Builder().url(url).header("User-Agent", NEMU_AIDOKU_DEFAULT_USER_AGENT).build()
      ).execute().close()

      get(client(scope, jar))
      val solved = server.takeRequest()
      assertEquals(chrome, solved.getHeader("User-Agent"))
      assertEquals("cf_clearance=abc", solved.getHeader("Cookie"))

      // Same host, another source (its own, empty jar): the default UA.
      get(client(otherScope, NemuCookieJar(AidokuWebViewCookiePolicy.NONE, false)))
      assertEquals(NEMU_AIDOKU_DEFAULT_USER_AGENT, server.takeRequest().getHeader("User-Agent"))

      // The jar lost the clearance (log out): back to the default UA.
      jar.clear()
      get(client(scope, jar))
      assertEquals(NEMU_AIDOKU_DEFAULT_USER_AGENT, server.takeRequest().getHeader("User-Agent"))
    }
  }

  @Test
  fun bindingHostIsLowercased() {
    assertEquals("bakamh.com", nemuCloudflareBindingHost("https://BakaMH.com/x".toHttpUrl()))
  }
}
