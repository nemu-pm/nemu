package pm.nemu.mobile.aidoku

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import java.util.concurrent.atomic.AtomicLong

internal const val NEMU_COOKIE_SCOPE_MAX_CHARACTERS = 512

/**
 * The scope a cookie API may act on, or null when the caller's scope is not
 * one the native HTTP path would accept. Blank scopes are rejected rather than
 * treated as stateless: there is no jar there to clear.
 */
internal fun nemuValidatedCookieScope(raw: String?): String? {
  val trimmed = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
  if (trimmed.length > NEMU_COOKIE_SCOPE_MAX_CHARACTERS) return null
  if (trimmed.any { it.isISOControl() }) return null
  return trimmed
}

private const val AIDOKU_COOKIE_MAX_COUNT = 512
private const val AIDOKU_COOKIE_MAX_CHARACTERS = 256 * 1024
private const val CLOUDFLARE_CLEARANCE_COOKIE = "cf_clearance"

private val AIDOKU_CROSS_ORIGIN_SAFE_HEADERS = setOf(
  "accept",
  "accept-charset",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-encoding",
  "content-language",
  "content-length",
  "content-type",
  "date",
  "expect",
  "host",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "pragma",
  "range",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent"
)

/**
 * Source packages can invent credential header names (for example `X-Auth`).
 * Treat every non-protocol header as secret on a cross-origin redirect rather
 * than trying to recognize secrets by name.
 */
internal fun isAidokuCrossOriginSensitiveHeader(name: String): Boolean =
  name.lowercase() !in AIDOKU_CROSS_ORIGIN_SAFE_HEADERS

internal enum class AidokuWebViewCookiePolicy {
  NONE,
  CLEARANCE_ONLY,
  ALL
}

/**
 * A bounded in-memory cookie jar. Sandbox instances use one jar per source key,
 * while direct native HTTP instances use one jar per profile/source scope.
 * This prevents an installed source from receiving another profile's or
 * source's authenticated cookies.
 */
internal class NemuCookieJar(
  private val webViewCookiePolicy: AidokuWebViewCookiePolicy =
    AidokuWebViewCookiePolicy.ALL,
  private val persistClearanceToWebView: Boolean = true,
  private val isActive: () -> Boolean = { true }
) : CookieJar {
  private val cookies = mutableListOf<Cookie>()

  @Synchronized
  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
    if (!isActive()) return
    val now = System.currentTimeMillis()
    mergeIntoMemory(cookies, now)

    if (!persistClearanceToWebView) return
    val clearanceCookies = cookies.filter {
      it.name == CLOUDFLARE_CLEARANCE_COOKIE && it.expiresAt >= now
    }
    if (clearanceCookies.isNotEmpty()) {
      runCatching {
        val manager = CookieManager.getInstance()
        clearanceCookies.forEach { manager.setCookie(url.toString(), it.toString()) }
        manager.flush()
      }
    }
  }

  @Synchronized
  override fun loadForRequest(url: HttpUrl): List<Cookie> {
    if (!isActive()) return emptyList()
    if (webViewCookiePolicy != AidokuWebViewCookiePolicy.NONE) {
      val persistedHeader = runCatching {
        CookieManager.getInstance().getCookie(url.toString()).orEmpty()
      }.getOrDefault("")
      if (persistedHeader.isNotBlank()) {
        saveFromCookieHeader(url, persistedHeader) { name ->
          webViewCookiePolicy == AidokuWebViewCookiePolicy.ALL ||
            name == CLOUDFLARE_CLEARANCE_COOKIE
        }
      }
    }

    val now = System.currentTimeMillis()
    trimToBounds(now)
    // RFC 6265 sends longer (more specific) paths before shorter paths.
    return cookies
      .asSequence()
      .filter { it.matches(url) }
      .sortedByDescending { it.path.length }
      .toList()
  }

  @Synchronized
  fun saveFromCookieHeader(
    url: HttpUrl,
    cookieHeader: String,
    includeName: (String) -> Boolean = { true }
  ) {
    if (!isActive()) return
    mergeIntoMemory(parseCookieHeader(url, cookieHeader, includeName), System.currentTimeMillis())
  }

  /**
   * Adopts the cookies an interactive Cloudflare solve produced for [url].
   *
   * Any existing cookie of the same name whose domain covers the url's host is
   * dropped first: `mergeIntoMemory` only replaces an exact
   * (name, domain, path) match, so a stale `cf_clearance` stored from a
   * `domain=.example.com` Set-Cookie would otherwise survive next to the
   * freshly issued host-only one and could win RFC 6265's path ordering.
   */
  @Synchronized
  fun adoptSolvedCookies(url: HttpUrl, cookieHeader: String) {
    if (!isActive()) return
    val parsed = parseCookieHeader(url, cookieHeader) { true }
    if (parsed.isEmpty()) return
    val names = parsed.mapTo(mutableSetOf()) { it.name }
    cookies.removeAll { existing ->
      existing.name in names && domainCoversHost(existing.domain, url.host)
    }
    mergeIntoMemory(parsed, System.currentTimeMillis())
  }

  private fun domainCoversHost(domain: String, host: String): Boolean {
    val normalized = domain.removePrefix(".")
    return host == normalized || host.endsWith(".$normalized")
  }

  private fun parseCookieHeader(
    url: HttpUrl,
    cookieHeader: String,
    includeName: (String) -> Boolean
  ): List<Cookie> {
    return cookieHeader
      .split(";")
      .asSequence()
      .map { it.trim() }
      .mapNotNull { cookie ->
        val separator = cookie.indexOf('=')
        if (separator <= 0) return@mapNotNull null
        val name = cookie.substring(0, separator).trim()
        if (!includeName(name)) return@mapNotNull null
        Cookie.parse(url, cookie)
      }
      .toList()
  }

  /** Drops every cookie this jar holds, for one source's log out. */
  @Synchronized
  fun clear() {
    cookies.clear()
  }

  @Synchronized
  internal fun sizeForTesting(): Int {
    if (!isActive()) return 0
    trimToBounds(System.currentTimeMillis())
    return cookies.size
  }

  private fun mergeIntoMemory(nextCookies: List<Cookie>, now: Long) {
    cookies.removeAll { existing ->
      existing.expiresAt < now ||
        nextCookies.any { next ->
          next.name == existing.name &&
            next.domain == existing.domain &&
            next.path == existing.path
        }
    }
    cookies.addAll(nextCookies.filter { it.expiresAt >= now })
    trimToBounds(now)
  }

  private fun trimToBounds(now: Long) {
    cookies.removeAll { it.expiresAt < now }
    var characterCount = cookies.sumOf { it.toString().length }
    while (
      cookies.size > AIDOKU_COOKIE_MAX_COUNT ||
      characterCount > AIDOKU_COOKIE_MAX_CHARACTERS
    ) {
      if (cookies.isEmpty()) break
      characterCount -= cookies.removeAt(0).toString().length
    }
  }
}

/**
 * Bounded direct-native cookie jars keyed by the JS-provided profile/source
 * scope. Clearing the store advances a generation before dropping its map, so
 * a response already unwinding from a cancelled old-profile request cannot
 * repopulate an old jar or publish cookies into the next profile.
 */
internal class NemuNativeHttpCookieStore(
  private val maxScopes: Int = 128
) {
  private val generation = AtomicLong(0)
  private val jars = object : LinkedHashMap<String, NemuCookieJar>(16, 0.75f, true) {}
  private var closed = false

  @Synchronized
  fun get(cookieScope: String): NemuCookieJar {
    check(!closed) { "The native HTTP cookie store is closed." }
    val normalizedScope = cookieScope.trim()
    require(normalizedScope.isNotEmpty()) { "A native HTTP cookie scope cannot be blank." }
    jars[normalizedScope]?.let { return it }

    val jarGeneration = generation.get()
    val jar = NemuCookieJar(
      // The interactive solver owns WebView cookies. Direct source responses
      // stay inside this scope and may only import its host's cf_clearance.
      webViewCookiePolicy = AidokuWebViewCookiePolicy.CLEARANCE_ONLY,
      persistClearanceToWebView = false,
      isActive = { generation.get() == jarGeneration }
    )
    jars[normalizedScope] = jar
    while (jars.size > maxScopes) {
      val eldest = jars.entries.iterator()
      if (!eldest.hasNext()) break
      eldest.next()
      eldest.remove()
    }
    return jar
  }

  @Synchronized
  fun clear() {
    generation.incrementAndGet()
    jars.clear()
  }

  /**
   * Drops one scope's cookies on a source log out, leaving every other scope
   * alone. The jar is emptied and then dropped from the map, so a response
   * already in flight for that scope reads nothing and writes into an orphan
   * jar the next request never sees.
   */
  @Synchronized
  fun clearScope(cookieScope: String) {
    val normalizedScope = cookieScope.trim()
    if (normalizedScope.isEmpty()) return
    jars.remove(normalizedScope)?.clear()
  }

  @Synchronized
  fun close() {
    closed = true
    generation.incrementAndGet()
    jars.clear()
  }

  @Synchronized
  internal fun sizeForTesting(): Int = jars.size
}

/** Keeps raw source-authored cookies on the request's original origin only. */
internal data class AidokuExplicitCookiePolicy(
  private val originalScheme: String,
  private val originalHost: String,
  private val originalPort: Int,
  private val explicitCookieHeader: String?
) {
  constructor(url: HttpUrl, explicitCookieHeader: String?) : this(
    originalScheme = url.scheme,
    originalHost = url.host,
    originalPort = url.port,
    explicitCookieHeader = explicitCookieHeader?.takeIf { it.isNotBlank() }
  )

  fun isOriginalOrigin(url: HttpUrl): Boolean =
    url.scheme == originalScheme &&
      url.host == originalHost &&
      url.port == originalPort

  fun headerFor(url: HttpUrl): String? {
    return explicitCookieHeader?.takeIf { isOriginalOrigin(url) }
  }
}

/** Tags the user request before OkHttp's redirect interceptor creates hops. */
internal class AidokuExplicitCookiePolicyInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    if (request.tag(AidokuExplicitCookiePolicy::class.java) != null) {
      return chain.proceed(request)
    }
    val policy = AidokuExplicitCookiePolicy(request.url, request.header("Cookie"))
    return chain.proceed(
      request.newBuilder()
        .tag(AidokuExplicitCookiePolicy::class.java, policy)
        .build()
    )
  }
}

/**
 * Runs as an OkHttp network interceptor so every redirect hop can persist all
 * Set-Cookie fields before OkHttp constructs the follow-up request. The client
 * itself uses CookieJar.NO_COOKIES; otherwise BridgeInterceptor would replace
 * the source's explicit Cookie header before this interceptor runs.
 */
internal class AidokuSandboxCookieInterceptor(
  private val cookieJar: NemuCookieJar?
) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    val explicitPolicy = request.tag(AidokuExplicitCookiePolicy::class.java)
      ?: AidokuExplicitCookiePolicy(request.url, request.header("Cookie"))
    val explicitCookieHeader = explicitPolicy.headerFor(request.url)
    val mergedHeaders = mergeAidokuSandboxCookieHeaders(
      explicitCookieHeader?.let { mapOf("Cookie" to it) }.orEmpty(),
      cookieJar?.loadForRequest(request.url)?.map { it.name to it.value }.orEmpty()
    )
    val mergedCookie = mergedHeaders.entries.firstOrNull {
      it.key.equals("cookie", ignoreCase = true)
    }?.value
    val nextRequest = request.newBuilder().apply {
      tag(AidokuExplicitCookiePolicy::class.java, explicitPolicy)
      if (!explicitPolicy.isOriginalOrigin(request.url)) {
        request.headers.names()
          .filter(::isAidokuCrossOriginSensitiveHeader)
          .forEach(::removeHeader)
      }
      if (mergedCookie.isNullOrBlank()) removeHeader("Cookie")
      else header("Cookie", mergedCookie)
    }.build()

    val response = chain.proceed(nextRequest)
    val responseCookies = Cookie.parseAll(response.request.url, response.headers)
    if (cookieJar != null && responseCookies.isNotEmpty()) {
      cookieJar.saveFromResponse(response.request.url, responseCookies)
    }
    return response
  }
}

/**
 * Keeps bounded, independently scoped sandbox cookie jars by source key.
 * Clearing the store advances a generation before dropping its map, mirroring
 * [NemuNativeHttpCookieStore] so a sandbox response already unwinding from a
 * cancelled old-profile request cannot repopulate an old jar or publish its
 * cookies into the next profile.
 */
internal class AidokuSandboxCookieStore(
  private val maxSources: Int = 128
) {
  private val generation = AtomicLong(0)
  private val jars = object : LinkedHashMap<String, NemuCookieJar>(16, 0.75f, true) {}
  private var closed = false

  @Synchronized
  fun get(sourceKey: String): NemuCookieJar {
    check(!closed) { "The Aidoku sandbox cookie store is closed." }
    jars[sourceKey]?.let { return it }
    val jarGeneration = generation.get()
    val jar = NemuCookieJar(
      webViewCookiePolicy = AidokuWebViewCookiePolicy.CLEARANCE_ONLY,
      persistClearanceToWebView = false,
      isActive = { generation.get() == jarGeneration }
    )
    jars[sourceKey] = jar
    while (jars.size > maxSources) {
      val eldest = jars.entries.iterator()
      if (!eldest.hasNext()) break
      eldest.next()
      eldest.remove()
    }
    return jar
  }

  /** Drops every source's sandbox cookies on an account/profile transition. */
  @Synchronized
  fun clear() {
    generation.incrementAndGet()
    jars.clear()
  }

  /**
   * Drops one source's sandbox cookies on its own log out, leaving every other
   * source's jar alone. Keyed exactly like [get], which takes the sandbox
   * session's source key verbatim.
   */
  @Synchronized
  fun clearScope(sourceKey: String) {
    jars.remove(sourceKey)?.clear()
  }

  @Synchronized
  fun close() {
    closed = true
    generation.incrementAndGet()
    jars.clear()
  }

  @Synchronized
  internal fun sizeForTesting(): Int = jars.size
}
