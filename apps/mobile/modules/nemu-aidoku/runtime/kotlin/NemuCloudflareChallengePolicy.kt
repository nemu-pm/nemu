package pm.nemu.mobile.aidoku

import android.net.Uri
import java.util.Locale
import okhttp3.HttpUrl

/**
 * Pure network boundary for the on-demand Cloudflare solver's WebView.
 *
 * Direct source HTTP is pinned behind [NemuNativeHttpAddressPolicy] plus
 * OkHttp's DNS and connected-peer interceptors, and an Android WebView cannot
 * be routed through that gate for every subresource, redirect, or worker
 * fetch. The solver therefore gets its own, strictly narrower boundary,
 * enforced twice: `shouldInterceptRequest` answers a blank 403 for anything
 * off the allow-list, and `shouldOverrideUrlLoading` refuses main-frame
 * navigations that leave the challenge host tree. Only two host trees are ever
 * reachable, always over https:
 *
 * 1. the challenge host and its subdomains, and
 * 2. Cloudflare's challenge platform ([CHALLENGE_PLATFORM_HOST], plus the
 *    [CHALLENGE_PLATFORM_PATH_PREFIX] paths the challenge host serves itself).
 *
 * Address literals, private/forbidden hostnames, non-ASCII (non-punycode)
 * hosts, credentials in the url, and every non-https scheme fail closed.
 *
 * Mirrors `ios/NemuCloudflareChallengePolicy.swift`.
 */
internal object NemuCloudflareChallengePolicy {
  /** Cloudflare serves interstitial and Turnstile widget assets from here. */
  const val CHALLENGE_PLATFORM_HOST = "challenges.cloudflare.com"

  /**
   * The orchestration path the challenge host itself serves. Already inside the
   * challenge host tree; kept explicit so the allow-list documents both halves
   * of the challenge platform.
   */
  const val CHALLENGE_PLATFORM_PATH_PREFIX = "/cdn-cgi/challenge-platform/"

  private const val ASCII_HOST_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-."

  /**
   * Lowercases, drops a fully-qualified trailing dot, and rejects anything the
   * allow-list could not compare literally. An IDN host has to already be
   * punycode to be allow-listable at all.
   */
  internal fun normalizedHost(host: String?): String? {
    var value = host?.lowercase(Locale.US) ?: return null
    while (value.endsWith(".")) value = value.dropLast(1)
    if (value.isEmpty() || value.length > 253) return null
    if (value.any { it !in ASCII_HOST_CHARACTERS }) return null
    if (value.startsWith(".") || value.contains("..")) return null
    if (value.startsWith("-") || value.endsWith("-")) return null
    return value
  }

  /**
   * The host tree a solve is pinned to, or null when this url can never be
   * solved safely. A bare registry label ("com") is refused so a malformed
   * challenge url cannot widen the allow-list to an entire suffix.
   */
  internal fun challengeHost(url: HttpUrl): String? {
    if (url.scheme != "https") return null
    if (url.username.isNotEmpty() || url.password.isNotEmpty()) return null
    val host = normalizedHost(url.host) ?: return null
    if (!host.contains(".")) return null
    if (NemuNativeHttpAddressPolicy.isNumericHostname(host)) return null
    if (NemuNativeHttpAddressPolicy.isForbiddenHostname(host)) return null
    return host
  }

  /** [host] is [tree] itself or a subdomain of it. */
  internal fun isWithin(host: String, tree: String): Boolean =
    host == tree || host.endsWith(".$tree")

  /**
   * Every request the web content is allowed to make. Split from the [Uri]
   * overload so the rules stay testable in a plain JVM unit test — `Uri` is a
   * throwing stub outside an instrumented environment.
   */
  internal fun allowsSubresource(
    scheme: String?,
    host: String?,
    hasUserInfo: Boolean,
    challengeHost: String
  ): Boolean {
    val allowable = allowableHost(scheme, host, hasUserInfo) ?: return false
    return isWithin(allowable, challengeHost) || isWithin(allowable, CHALLENGE_PLATFORM_HOST)
  }

  internal fun allowsSubresource(uri: Uri?, challengeHost: String): Boolean {
    if (uri == null) return false
    return allowsSubresource(uri.scheme, uri.host, uri.userInfo != null, challengeHost)
  }

  /**
   * The single decision both `WebViewClient` overrides ask for.
   *
   * `shouldInterceptRequest` and `shouldOverrideUrlLoading` are called for
   * subframe loads as well as the main frame, and the Turnstile widget is a
   * subframe on [CHALLENGE_PLATFORM_HOST] — so applying the main-frame rule to
   * every navigation blocks the widget and every interactive challenge times
   * out. Only a main-frame load is held to the challenge host tree.
   */
  internal fun allowsRequest(
    isForMainFrame: Boolean,
    scheme: String?,
    host: String?,
    hasUserInfo: Boolean,
    challengeHost: String,
    schemeSpecificPart: String? = null
  ): Boolean =
    if (isForMainFrame) {
      allowsMainFrameNavigation(scheme, host, hasUserInfo, challengeHost)
    } else {
      isInertFrameUri(scheme, schemeSpecificPart) ||
        isInertResourceScheme(scheme) ||
        allowsSubresource(scheme, host, hasUserInfo, challengeHost)
    }

  internal fun allowsRequest(
    isForMainFrame: Boolean,
    uri: Uri?,
    challengeHost: String
  ): Boolean {
    if (uri == null) return false
    return allowsRequest(
      isForMainFrame,
      uri.scheme,
      uri.host,
      uri.userInfo != null,
      challengeHost,
      uri.schemeSpecificPart
    )
  }

  /**
   * Inert helper frames the challenge widget creates for itself (`about:blank`,
   * `about:srcdoc`). They have no origin and load nothing on their own; every
   * subresource they request still passes through [allowsRequest]. Refusing
   * them stalls the widget at "Verifying…". Only ever honoured for subframes.
   */
  /**
   * `blob:` and `data:` loads never leave the page: a blob is same-origin memory
   * the document created itself and a data url is inline. The challenge widget
   * runs its proof-of-work in a `blob:` worker, so refusing them stalls it.
   * Never honoured for the main frame.
   */
  internal fun isInertResourceScheme(scheme: String?): Boolean =
    "blob".equals(scheme, ignoreCase = true) || "data".equals(scheme, ignoreCase = true)

  internal fun isInertFrameUri(scheme: String?, schemeSpecificPart: String?): Boolean {
    if (!"about".equals(scheme, ignoreCase = true)) return false
    val rest = schemeSpecificPart?.lowercase(Locale.US) ?: return false
    return rest == "blank" || rest == "srcdoc"
  }

  /**
   * Main-frame navigation is narrower still: it must stay inside the challenge
   * host tree. Cloudflare's platform host only ever loads as a subframe or a
   * subresource, so a top-level hop onto it — or anywhere else — is a redirect
   * away from the challenge and must not be followed.
   */
  internal fun allowsMainFrameNavigation(
    scheme: String?,
    host: String?,
    hasUserInfo: Boolean,
    challengeHost: String
  ): Boolean {
    val allowable = allowableHost(scheme, host, hasUserInfo) ?: return false
    return isWithin(allowable, challengeHost)
  }

  internal fun allowsMainFrameNavigation(uri: Uri?, challengeHost: String): Boolean {
    if (uri == null) return false
    return allowsMainFrameNavigation(uri.scheme, uri.host, uri.userInfo != null, challengeHost)
  }

  private fun allowableHost(scheme: String?, host: String?, hasUserInfo: Boolean): String? {
    if (!"https".equals(scheme, ignoreCase = true)) return null
    if (hasUserInfo) return null
    val normalized = normalizedHost(host) ?: return null
    if (NemuNativeHttpAddressPolicy.isNumericHostname(normalized)) return null
    if (NemuNativeHttpAddressPolicy.isForbiddenHostname(normalized)) return null
    return normalized
  }

  internal fun isChallengePlatformPath(path: String?): Boolean =
    path?.startsWith(CHALLENGE_PLATFORM_PATH_PREFIX) == true

  /**
   * A cookie may only be adopted when its domain covers the challenge host,
   * i.e. the host itself or one of its parents. Third-party cookies (including
   * the Cloudflare platform host's own) never reach the source's jar.
   */
  internal fun cookieDomainCoversChallengeHost(domain: String, challengeHost: String): Boolean {
    var value = domain.lowercase(Locale.US)
    while (value.startsWith(".")) value = value.drop(1)
    val normalized = normalizedHost(value) ?: return false
    if (!normalized.contains(".")) return false
    return isWithin(challengeHost, normalized)
  }
}

/** How long a recorded challenge host stays solvable. */
internal const val NEMU_CLOUDFLARE_CHALLENGE_HOST_TTL_MS = 10 * 60 * 1_000L
internal const val NEMU_CLOUDFLARE_MAX_CHALLENGE_HOSTS_PER_SCOPE = 32
internal const val NEMU_CLOUDFLARE_MAX_CHALLENGE_HOST_SCOPES = 128

private val NEMU_CLOUDFLARE_SERVER_HEADER_VALUES = setOf("cloudflare", "cloudflare-nginx")

/**
 * True when this response is Cloudflare turning the source's request away
 * rather than the origin answering it. Deliberately narrow: a 403/503 plus
 * either Cloudflare's own `server` banner or the `cf-mitigated` marker.
 */
internal fun isNemuCloudflareMitigatedResponse(
  status: Int,
  headers: Map<String, String>
): Boolean {
  if (status != 403 && status != 503) return false
  for ((name, value) in headers) {
    if (name.equals("cf-mitigated", ignoreCase = true) && value.isNotBlank()) return true
    if (
      name.equals("server", ignoreCase = true) &&
      value.trim().lowercase(Locale.US) in NEMU_CLOUDFLARE_SERVER_HEADER_VALUES
    ) {
      return true
    }
  }
  return false
}

/**
 * Hosts that answered one source's own requests with a Cloudflare mitigation.
 *
 * `solveCloudflare` renders a source-named url in an in-app WebView, so the
 * url cannot be taken on the isolate's word alone: a hostile source package
 * could otherwise name any public https origin and have it loaded with
 * scripting on. Only hosts this source actually talked to — and only recently
 * — can be solved.
 *
 * Keyed by the exact cookie scope the source's own requests are made under
 * (`<profileScope>::<registryId>:<sourceId>`), which is the same key
 * `sandboxCookieStore` and `nativeHttpCookieStore` use — so a recorded host
 * and the jar a solve publishes into always belong to the same execution
 * identity. No other spelling of the scope matches.
 *
 * Bounded on both axes and monotonically timed, so it never grows and a system
 * clock change cannot extend an entry's life. Mirrors
 * `NemuCloudflareChallengeHostRegistry` in
 * `ios/NemuCloudflareChallengePolicy.swift`.
 */
internal class NemuCloudflareChallengeHostRegistry(
  private val maxHostsPerScope: Int = NEMU_CLOUDFLARE_MAX_CHALLENGE_HOSTS_PER_SCOPE,
  private val maxScopes: Int = NEMU_CLOUDFLARE_MAX_CHALLENGE_HOST_SCOPES,
  private val ttlMs: Long = NEMU_CLOUDFLARE_CHALLENGE_HOST_TTL_MS,
  private val nowMs: () -> Long = { System.nanoTime() / 1_000_000L }
) {
  private val scopes = object : LinkedHashMap<String, LinkedHashMap<String, Long>>(16, 0.75f, true) {}

  /** Records [host] when [status]/[headers] say Cloudflare turned it away. */
  @Synchronized
  fun record(
    cookieScope: String?,
    host: String?,
    status: Int,
    headers: Map<String, String>
  ) {
    if (!isNemuCloudflareMitigatedResponse(status, headers)) return
    val scopeKey = nemuValidatedCookieScope(cookieScope) ?: return
    val normalizedHost = NemuCloudflareChallengePolicy.normalizedHost(host) ?: return
    if (!normalizedHost.contains(".")) return
    val hosts = scopes.getOrPut(scopeKey) {
      object : LinkedHashMap<String, Long>(16, 0.75f, true) {}
    }
    hosts[normalizedHost] = nowMs()
    prune(hosts)
    while (hosts.size > maxHostsPerScope) {
      val eldest = hosts.entries.iterator()
      if (!eldest.hasNext()) break
      eldest.next()
      eldest.remove()
    }
    while (scopes.size > maxScopes) {
      val eldest = scopes.entries.iterator()
      if (!eldest.hasNext()) break
      eldest.next()
      eldest.remove()
    }
  }

  /** True when this scope reached [host] and the record has not expired. */
  @Synchronized
  fun allows(cookieScope: String?, host: String?): Boolean {
    val scopeKey = nemuValidatedCookieScope(cookieScope) ?: return false
    val normalizedHost = NemuCloudflareChallengePolicy.normalizedHost(host) ?: return false
    val hosts = scopes[scopeKey] ?: return false
    prune(hosts)
    if (hosts.isEmpty()) {
      scopes.remove(scopeKey)
      return false
    }
    return hosts.containsKey(normalizedHost)
  }

  @Synchronized
  fun clear() {
    scopes.clear()
  }

  @Synchronized
  fun clearScope(cookieScope: String?) {
    val scopeKey = nemuValidatedCookieScope(cookieScope) ?: return
    scopes.remove(scopeKey)
  }

  @Synchronized
  internal fun sizeForTesting(cookieScope: String?): Int {
    val scopeKey = nemuValidatedCookieScope(cookieScope) ?: return 0
    val hosts = scopes[scopeKey] ?: return 0
    prune(hosts)
    return hosts.size
  }

  @Synchronized
  internal fun scopeCountForTesting(): Int = scopes.size

  private fun prune(hosts: LinkedHashMap<String, Long>) {
    val now = nowMs()
    hosts.entries.removeAll { now - it.value >= ttlMs }
  }
}
