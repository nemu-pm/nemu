package pm.nemu.mobile.aidoku

import java.io.IOException
import okhttp3.Interceptor
import okhttp3.Response

/** Marker copied by OkHttp onto follow-up requests for credential-bearing calls. */
internal object NemuHttpsOnlyRequestPolicy {
  const val BLOCKED_MESSAGE =
    "Native source networking blocked a redirect that did not remain HTTPS."

  fun allows(url: okhttp3.HttpUrl): Boolean = url.isHttps
}

/**
 * Network interceptors run for every redirect hop. Rejecting before
 * [Interceptor.Chain.proceed] ensures an authorization code, PKCE verifier, or
 * other request body is never written to a cleartext redirected connection.
 */
internal class NemuHttpsOnlyRedirectInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    if (
      request.tag(NemuHttpsOnlyRequestPolicy::class.java) != null &&
      !NemuHttpsOnlyRequestPolicy.allows(request.url)
    ) {
      throw IOException(NemuHttpsOnlyRequestPolicy.BLOCKED_MESSAGE)
    }
    return chain.proceed(request)
  }
}
