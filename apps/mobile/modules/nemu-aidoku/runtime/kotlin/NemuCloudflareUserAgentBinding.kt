package pm.nemu.mobile.aidoku

import java.util.Locale
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response

/**
 * The User-Agent the Android solver's WebView presents: Chrome for Android,
 * derived from this device's own WebView default so the engine, version and
 * device model it claims are the ones actually running.
 *
 * **Why not the Aidoku default.** Every other source request keeps the
 * runtime's iPhone Safari UA ([NEMU_AIDOKU_DEFAULT_USER_AGENT]), and on iOS
 * the solver presents it too. On Android that UA sits on a Chromium engine,
 * and Turnstile notices: verified on the emulator (WebView 133) against a
 * persistent Cloudflare challenge, the Safari UA got a `cf_clearance` the edge
 * refused on the very next navigation (an endless checkbox), while the WebView
 * default and a Chrome-for-Android UA both passed in one tick.
 *
 * **Derivation.** The WebView default is Chrome's UA plus the WebView markers
 * `; wv` and `Version/4.0`; dropping those two yields the UA Chrome itself
 * sends on this device. WebView 133 still sends its own `Sec-CH-UA` client
 * hints (`"Android WebView";v="133", "Chromium";v="133"`) with an overridden
 * UA, so deriving the string from the running engine keeps the UA and the
 * hints consistent — the iPhone UA contradicted them. Returns null when
 * [webViewDefault] does not look like a Chromium UA; the caller then keeps
 * the requested UA.
 */
internal fun nemuCloudflareChromeUserAgent(webViewDefault: String?): String? {
  if (webViewDefault == null || webViewDefault.any { it.isISOControl() }) return null
  val value = webViewDefault.trim()
  if (value.isEmpty() || value.length > 512) return null
  if (!value.contains("Chrome/") || !value.contains("Android")) return null
  val chrome = value
    .replace(Regex(";\\s*wv\\)"), ")")
    .replace(Regex("\\s*Version/\\d+(?:\\.\\d+)*"), "")
    .replace(Regex("\\s{2,}"), " ")
    .trim()
  return chrome.takeIf { it.contains("Chrome/") }
}

internal const val NEMU_CLOUDFLARE_MAX_UA_BINDINGS_PER_SCOPE = 16
internal const val NEMU_CLOUDFLARE_MAX_UA_BINDING_SCOPES = 128

/**
 * Which User-Agent a solved `cf_clearance` is bound to, per source.
 *
 * A clearance only works next to the UA that earned it. On Android the solver
 * presents a Chrome UA ([nemuCloudflareChromeUserAgent]) while every source
 * request defaults to the Aidoku runtime's iPhone UA, so after a solve that one
 * source's requests to the solved host must switch to the solver's UA — and
 * nothing else may.
 *
 * **Scope.** Keyed by the exact cookie scope the solve adopted its cookies
 * into (the same key both source jars use), so a binding never reaches another
 * source, even one on the same host whose jar happens to import the same
 * clearance from the shared WebView cookie store.
 *
 * **Lifetime = the clearance's.** A binding applies to a request only while
 * the request actually carries the clearance value that was adopted with it
 * (after the jar merged its cookies): when the cookie expires, is replaced by
 * a newer one, or the jar is cleared, the request no longer carries that value
 * and gets the default UA again. The request's host must also be the solved
 * host or a subdomain of it, the hosts the adopted cookie can cover. The store
 * itself is cleared with the jars (source log out, profile reset) and bounded
 * on both axes.
 *
 * Thread-safe; read from OkHttp network interceptors and the image decorator.
 */
internal class NemuCloudflareUserAgentBindings(
  private val maxPerScope: Int = NEMU_CLOUDFLARE_MAX_UA_BINDINGS_PER_SCOPE,
  private val maxScopes: Int = NEMU_CLOUDFLARE_MAX_UA_BINDING_SCOPES
) {
  private data class Binding(val host: String, val clearance: String, val userAgent: String)

  private val scopes =
    object : LinkedHashMap<String, LinkedHashMap<String, Binding>>(16, 0.75f, true) {}

  /**
   * Records that [cookieScope]'s clearance for [host] was solved with
   * [userAgent]. A later solve for the same host replaces the binding.
   */
  @Synchronized
  fun record(cookieScope: String?, host: String?, clearance: String?, userAgent: String?) {
    val scope = nemuValidatedCookieScope(cookieScope) ?: return
    val normalizedHost = NemuCloudflareChallengePolicy.normalizedHost(host) ?: return
    val value = clearance?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val ua = userAgent?.trim()?.takeIf {
      it.isNotEmpty() && it.length <= 512 && it.none { c -> c.isISOControl() }
    } ?: return
    val bindings = scopes.getOrPut(scope) {
      object : LinkedHashMap<String, Binding>(16, 0.75f, true) {}
    }
    bindings[normalizedHost] = Binding(normalizedHost, value, ua)
    trim(bindings, maxPerScope)
    trim(scopes, maxScopes)
  }

  /**
   * The UA [cookieScope]'s request to [host] must send, given the `Cookie`
   * header it is about to send, or null to keep whatever it has.
   */
  @Synchronized
  fun userAgentFor(cookieScope: String?, host: String?, cookieHeader: String?): String? {
    val scope = nemuValidatedCookieScope(cookieScope) ?: return null
    val requestHost = NemuCloudflareChallengePolicy.normalizedHost(host) ?: return null
    val sent = clearanceIn(cookieHeader) ?: return null
    val bindings = scopes[scope] ?: return null
    return bindings.values.firstOrNull { binding ->
      binding.clearance == sent &&
        (requestHost == binding.host || requestHost.endsWith(".${binding.host}"))
    }?.userAgent
  }

  @Synchronized
  fun clearScope(cookieScope: String?) {
    val scope = nemuValidatedCookieScope(cookieScope) ?: return
    scopes.remove(scope)
  }

  @Synchronized
  fun clear() {
    scopes.clear()
  }

  @Synchronized
  internal fun sizeForTesting(): Int = scopes.values.sumOf { it.size }

  private fun <V> trim(map: LinkedHashMap<String, V>, max: Int) {
    while (map.size > max) {
      val eldest = map.entries.iterator()
      if (!eldest.hasNext()) break
      eldest.next()
      eldest.remove()
    }
  }

  companion object {
    /** The first `cf_clearance` a `Cookie:` header sends, as a server reads it. */
    internal fun clearanceIn(cookieHeader: String?): String? {
      if (cookieHeader.isNullOrBlank()) return null
      return NemuCloudflareChallengePolicy.cookiePairs(cookieHeader)
        .firstOrNull { (name, _) -> name == NEMU_CLOUDFLARE_CLEARANCE_COOKIE }
        ?.second
        ?.takeIf { it.isNotEmpty() }
    }
  }
}

/** Replaces [headers]' User-Agent (whatever its spelling) with [userAgent]. */
internal fun nemuHeadersWithUserAgent(
  headers: Map<String, String>,
  userAgent: String
): Map<String, String> {
  val next = LinkedHashMap<String, String>(headers.size + 1)
  headers.forEach { (name, value) ->
    if (!name.equals("User-Agent", ignoreCase = true)) next[name] = value
  }
  next["User-Agent"] = userAgent
  return next
}

/**
 * Applies [NemuCloudflareUserAgentBindings] on every hop of a source's OkHttp
 * call. Must be added as a network interceptor *after*
 * [AidokuSandboxCookieInterceptor], so it sees the `Cookie` header the jar
 * merged for this exact hop (a redirect to another host is re-evaluated).
 */
internal class NemuCloudflareUserAgentInterceptor(
  private val cookieScope: String?,
  private val bindings: NemuCloudflareUserAgentBindings
) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    val bound = bindings.userAgentFor(cookieScope, request.url.host, request.header("Cookie"))
    if (bound == null || request.header("User-Agent") == bound) return chain.proceed(request)
    return chain.proceed(request.newBuilder().header("User-Agent", bound).build())
  }
}

/** The solved url's host, lowercased, for [NemuCloudflareUserAgentBindings.record]. */
internal fun nemuCloudflareBindingHost(url: HttpUrl): String = url.host.lowercase(Locale.US)
