package pm.nemu.mobile.aidoku

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import java.util.concurrent.atomic.AtomicLong

private const val AIDOKU_COOKIE_MAX_COUNT = 512
private const val AIDOKU_COOKIE_MAX_CHARACTERS = 256 * 1024
private const val CLOUDFLARE_CLEARANCE_COOKIE = "cf_clearance"

internal fun isAidokuCrossOriginSensitiveHeader(name: String): Boolean {
  val normalized = name.lowercase()
  return normalized == "authorization" ||
    normalized == "proxy-authorization" ||
    normalized == "better-auth-cookie" ||
    normalized == "api-key" ||
    normalized == "x-api-key" ||
    normalized.endsWith("-auth-cookie") ||
    normalized.endsWith("-auth-token") ||
    normalized.endsWith("-access-token") ||
    normalized.endsWith("-session-token") ||
    normalized.endsWith("-api-key")
}

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
    val parsed = cookieHeader
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
    mergeIntoMemory(parsed, System.currentTimeMillis())
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

  @Synchronized
  fun close() {
    closed = true
    generation.incrementAndGet()
    jars.clear()
  }

  @Synchronized
  internal fun sizeForTesting(): Int = jars.size
}
