package pm.nemu.mobile.aidoku

import java.io.IOException
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuNativeHttpRedirectPolicyTest {
  @Test
  fun credentialBearingRequestIsRejectedBeforeCleartextBodyIsSent() {
    val server = MockWebServer()
    server.enqueue(MockResponse().setResponseCode(200))
    server.start()
    try {
      val client = OkHttpClient.Builder()
        .addNetworkInterceptor(NemuHttpsOnlyRedirectInterceptor())
        .build()
      val request = Request.Builder()
        .url(server.url("/token"))
        .post("code=secret&code_verifier=secret".toRequestBody())
        .tag(
          NemuHttpsOnlyRequestPolicy::class.java,
          NemuHttpsOnlyRequestPolicy
        )
        .build()

      val failure = runCatching { client.newCall(request).execute().close() }
        .exceptionOrNull()
      assertTrue(failure is IOException)
      assertTrue(failure?.message.orEmpty().contains("remain HTTPS"))
      assertEquals(0, server.requestCount)
    } finally {
      server.shutdown()
    }
  }

  @Test
  fun ordinarySourceRequestKeepsCleartextCompatibilityWithoutOptIn() {
    val server = MockWebServer()
    server.enqueue(MockResponse().setResponseCode(204))
    server.start()
    try {
      val client = OkHttpClient.Builder()
        .addNetworkInterceptor(NemuHttpsOnlyRedirectInterceptor())
        .build()
      client.newCall(Request.Builder().url(server.url("/source")).build())
        .execute()
        .use { response -> assertEquals(204, response.code) }
      assertEquals(1, server.requestCount)
    } finally {
      server.shutdown()
    }
  }

  @Test
  fun requestNotFollowingRedirectsKeepsTheSessionCookieOfTheRedirect() {
    // Suwayomi's Simple Login: the form post answers 303 and rotates the
    // session id on that response.
    val server = MockWebServer()
    server.enqueue(
      MockResponse()
        .setResponseCode(303)
        .setHeader("Location", "/")
        .addHeader("Set-Cookie", "JSESSIONID=fresh; Path=/; HttpOnly")
    )
    server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
    server.start()
    try {
      val jar = NemuNativeHttpCookieStore().get("profile::self-hosted:suwayomi.home")
      val client = OkHttpClient.Builder()
        .cookieJar(CookieJar.NO_COOKIES)
        .addNetworkInterceptor(AidokuSandboxCookieInterceptor(jar))
        .followingRedirects(false)
        .build()
      client.newCall(
        Request.Builder()
          .url(server.url("/login.html"))
          .post("user=a&pass=b".toRequestBody())
          .build()
      ).execute().use { response ->
        assertEquals(303, response.code)
        assertEquals("/", response.header("Location"))
      }
      assertEquals(1, server.requestCount)
      server.takeRequest()
      assertEquals(
        "fresh",
        jar.loadForRequest(server.url("/api/graphql")).single { it.name == "JSESSIONID" }.value
      )

      client.newCall(Request.Builder().url(server.url("/api/graphql")).build())
        .execute()
        .close()
      assertEquals("JSESSIONID=fresh", server.takeRequest().getHeader("Cookie"))
      // Only that host's requests carry it.
      val elsewhere: HttpUrl = server.url("/").newBuilder().host("other.test").build()
      assertTrue(jar.loadForRequest(elsewhere).isEmpty())
    } finally {
      server.shutdown()
    }
  }

  @Test
  fun requestsFollowRedirectsByDefault() {
    val server = MockWebServer()
    server.enqueue(MockResponse().setResponseCode(303).setHeader("Location", "/next"))
    server.enqueue(MockResponse().setResponseCode(200).setBody("followed"))
    server.start()
    try {
      val client = OkHttpClient.Builder().followingRedirects(true).build()
      client.newCall(Request.Builder().url(server.url("/login")).build())
        .execute()
        .use { response ->
          assertEquals(200, response.code)
          assertEquals("followed", response.body?.string())
          assertNull(response.priorResponse?.priorResponse)
        }
      assertEquals(2, server.requestCount)
    } finally {
      server.shutdown()
    }
  }
}
