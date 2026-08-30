package pm.nemu.mobile.aidoku

import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
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
}
