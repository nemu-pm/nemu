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
 * enforced in three places: `shouldInterceptRequest` answers a blank 403 for
 * anything off the allow-list, `shouldOverrideUrlLoading` refuses navigations
 * that leave it, and a process-global `ServiceWorkerClient` applies the same
 * decision to fetches a service worker makes (those never reach the
 * `WebViewClient`). Exactly two hosts are ever reachable, always over https
 * and never with credentials in the url:
 *
 * 1. the challenge host itself — the *exact* host the address policy already
 *    resolved and validated, never a sibling or a subdomain of it, and
 * 2. Cloudflare's challenge platform ([CHALLENGE_PLATFORM_HOST], the only host
 *    Cloudflare's own CSP guidance names for Turnstile; the
 *    [CHALLENGE_PLATFORM_PATH_PREFIX] paths are served by the challenge host
 *    itself and so are already inside rule 1).
 *
 * The subtree spelling this used to carry (`*.challengeHost`) was a hole: only
 * the initial url is address-validated, so a source-controlled challenge page
 * could name `gw.<challengeHost>`, have it resolve to 192.168.0.1 or
 * 169.254.169.254, and probe the LAN from inside the WebView. Matching the one
 * validated host exactly is what closes that, and it costs nothing real: a
 * Cloudflare interstitial is served by the origin it protects and pulls its
 * widget from `challenges.cloudflare.com`.
 *
 * Address literals, private/forbidden hostnames, non-ASCII (non-punycode)
 * hosts, credentials in the url, and every non-https scheme fail closed.
 *
 * **WebSockets are not covered on Android.** See the header of
 * `NemuCloudflareSolver.kt` for what that leaves open and why there is no fix
 * available in the stable WebView API. iOS is stronger here: a compiled
 * `WKContentRuleList` covers WebSocket handshakes and service-worker loads too.
 *
 * Mirrors `ios/NemuCloudflareChallengePolicy.swift`.
 */
internal object NemuCloudflareChallengePolicy {
  /**
   * Cloudflare serves interstitial and Turnstile widget assets from here, and
   * only from here: Cloudflare's own CSP guidance for Turnstile asks for
   * `script-src`/`frame-src https://challenges.cloudflare.com` and names no
   * other origin, so no subdomain of it is allow-listed either.
   */
  const val CHALLENGE_PLATFORM_HOST = "challenges.cloudflare.com"

  /**
   * The orchestration path the challenge host itself serves. Already inside the
   * challenge host's own allow-list entry; kept explicit so the allow-list
   * documents both halves of the challenge platform.
   */
  const val CHALLENGE_PLATFORM_PATH_PREFIX = "/cdn-cgi/challenge-platform/"

  /** Every `Path=` variant [cookieExpiryPaths] will enumerate for one url. */
  const val MAX_COOKIE_EXPIRY_PATH_SEGMENTS = 8

  private const val ASCII_HOST_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-."

  /**
   * A deliberately small, hand-maintained set of multi-label public suffixes.
   *
   * It exists for one job: stop [cookieDomainCoversChallengeHost] from treating
   * a registry suffix as a "parent domain" and letting a cookie set for `co.uk`
   * follow `reader.co.uk` home. It is **not** a public-suffix list; it carries
   * the suffixes the sources this app talks to actually live under plus the
   * common hosting suffixes, and anything missing from it degrades to the old
   * (permissive) behaviour for that one suffix rather than failing closed.
   * Nothing else in this file depends on it, and no security decision other
   * than cookie adoption is gated on it.
   */
  internal val KNOWN_MULTI_LABEL_PUBLIC_SUFFIXES: Set<String> = setOf(
    "ac.jp", "ac.uk", "co.id", "co.il", "co.in", "co.jp", "co.kr", "co.nz",
    "co.th", "co.uk", "co.za", "com.ar", "com.au", "com.br", "com.cn",
    "com.hk", "com.mx", "com.my", "com.ph", "com.pl", "com.sg", "com.tr",
    "com.tw", "com.ua", "com.vn", "edu.au", "go.jp", "gov.au", "gov.uk",
    "me.uk", "ne.jp", "net.au", "net.cn", "net.in", "net.uk", "or.jp",
    "or.kr", "org.au", "org.cn", "org.in", "org.uk", "sch.uk",
    "blogspot.com", "firebaseapp.com", "github.io", "gitlab.io", "glitch.me",
    "herokuapp.com", "netlify.app", "onrender.com", "pages.dev", "r2.dev",
    "vercel.app", "web.app", "workers.dev"
  )

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
   * True for a bare registry suffix nobody can own a cookie for: a single label
   * ("com"), or one of [KNOWN_MULTI_LABEL_PUBLIC_SUFFIXES].
   */
  internal fun isPublicSuffix(host: String): Boolean {
    val normalized = normalizedHost(host) ?: return true
    if (!normalized.contains(".")) return true
    return normalized in KNOWN_MULTI_LABEL_PUBLIC_SUFFIXES
  }

  /**
   * The host a solve is pinned to, or null when this url can never be solved
   * safely. A bare registry label ("com") is refused so a malformed challenge
   * url cannot widen the allow-list to an entire suffix.
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

  /**
   * [host] is [tree] itself or a subdomain of it. Only cookie-domain coverage
   * uses this now; the request allow-list is exact-host.
   */
  internal fun isWithin(host: String, tree: String): Boolean =
    host == tree || host.endsWith(".$tree")

  /**
   * Every request the web content is allowed to make: the one validated
   * challenge host, or Cloudflare's challenge platform. Exact hosts only.
   *
   * Split from the [Uri] overload so the rules stay testable in a plain JVM
   * unit test — `Uri` is a throwing stub outside an instrumented environment.
   */
  internal fun allowsSubresource(
    scheme: String?,
    host: String?,
    hasUserInfo: Boolean,
    challengeHost: String
  ): Boolean {
    val allowable = allowableHost(scheme, host, hasUserInfo) ?: return false
    return allowable == challengeHost || allowable == CHALLENGE_PLATFORM_HOST
  }

  internal fun allowsSubresource(uri: Uri?, challengeHost: String): Boolean {
    if (uri == null) return false
    return allowsSubresource(uri.scheme, uri.host, uri.userInfo != null, challengeHost)
  }

  /**
   * The single decision every request callback asks for.
   *
   * `shouldInterceptRequest` and `shouldOverrideUrlLoading` are called for
   * subframe loads as well as the main frame, and the Turnstile widget is a
   * subframe on [CHALLENGE_PLATFORM_HOST] — so applying the main-frame rule to
   * every navigation blocks the widget and every interactive challenge times
   * out. Only a main-frame load is held to the challenge host itself. The
   * solver's `ServiceWorkerClient` routes through here too, always as a
   * non-main-frame request.
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
   * `blob:` and `data:` loads never leave the page: a blob is same-origin memory
   * the document created itself and a data url is inline. The challenge widget
   * runs its proof-of-work in a `blob:` worker, so refusing them stalls it.
   * Never honoured for the main frame.
   */
  internal fun isInertResourceScheme(scheme: String?): Boolean =
    "blob".equals(scheme, ignoreCase = true) || "data".equals(scheme, ignoreCase = true)

  /**
   * Inert helper frames the challenge widget creates for itself (`about:blank`,
   * `about:srcdoc`). They have no origin and load nothing on their own; every
   * subresource they request still passes through [allowsRequest]. Refusing
   * them stalls the widget at "Verifying…". Only ever honoured for subframes,
   * and only for those two exact spellings: `about:blank#…` carries
   * attacker-chosen text into the frame's url and fails closed.
   */
  internal fun isInertFrameUri(scheme: String?, schemeSpecificPart: String?): Boolean {
    if (!"about".equals(scheme, ignoreCase = true)) return false
    val rest = schemeSpecificPart?.lowercase(Locale.US) ?: return false
    return rest == "blank" || rest == "srcdoc"
  }

  /**
   * Main-frame navigation is narrower still: it must stay on the challenge
   * host. Cloudflare's platform host only ever loads as a subframe or a
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
    return allowable == challengeHost
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
   * the Cloudflare platform host's own) never reach the source's jar, and a
   * registry suffix is not a parent: `co.uk` does not cover `reader.co.uk`.
   * The suffix check is best-effort — see [KNOWN_MULTI_LABEL_PUBLIC_SUFFIXES].
   */
  internal fun cookieDomainCoversChallengeHost(domain: String, challengeHost: String): Boolean {
    var value = domain.lowercase(Locale.US)
    while (value.startsWith(".")) value = value.drop(1)
    val normalized = normalizedHost(value) ?: return false
    if (isPublicSuffix(normalized)) return false
    return isWithin(challengeHost, normalized)
  }

  // MARK: - Cookie-jar diffing

  /**
   * Ordered `name=value` pairs of a `Cookie:`-style header. The first spelling
   * of a name wins, which is what a server reads off the wire. Pairs without a
   * `=`, or with an empty name, are dropped.
   */
  internal fun cookiePairs(header: String): List<Pair<String, String>> {
    val seen = HashSet<String>()
    val pairs = ArrayList<Pair<String, String>>()
    for (piece in header.split(";")) {
      val trimmed = piece.trim()
      val separator = trimmed.indexOf('=')
      if (separator <= 0) continue
      val name = trimmed.substring(0, separator).trim()
      if (name.isEmpty() || !seen.add(name)) continue
      pairs.add(name to trimmed.substring(separator + 1).trim())
    }
    return pairs
  }

  /**
   * The pairs in [after] that [before] did not already carry with the same
   * value, rendered back as a `Cookie:` header.
   *
   * The solver needs this because Android's [android.webkit.CookieManager] is
   * process-wide: whatever the pre-solve expiry sweep failed to remove (a
   * `Domain=.parent` or `Path=/x` cookie some *other* scope's earlier solve
   * left behind) is still readable when this solve finishes, and adopting it
   * would move one source's session into another's jar. Diffing against the
   * header as it stood at the start of this solve means only what this solve
   * actually produced is adopted.
   */
  internal fun newOrChangedCookieHeader(before: String, after: String): String {
    val baseline = cookiePairs(before).toMap()
    return cookiePairs(after)
      .filter { (name, value) -> baseline[name] != value }
      .joinToString("; ") { (name, value) -> "$name=$value" }
  }

  /**
   * Every `Domain=` spelling a cookie readable by [host] could have been set
   * with, narrowest first: the host itself (a host-only cookie, written with no
   * `Domain` attribute at all — represented by `null`), then `.host` and each
   * parent up to, but never including, a registry suffix.
   *
   * A cookie's identity is (name, domain, path), so expiring `name=` at
   * `https://host/` alone leaves every `Domain=.parent` sibling in place.
   */
  internal fun cookieExpiryDomains(host: String): List<String?> {
    val normalized = normalizedHost(host)
    if (normalized == null || !normalized.contains(".")) return listOf(null)
    val domains = ArrayList<String?>()
    domains.add(null)
    val labels = normalized.split(".")
    for (index in labels.indices) {
      val candidate = labels.subList(index, labels.size).joinToString(".")
      if (!candidate.contains(".") || isPublicSuffix(candidate)) break
      domains.add(".$candidate")
    }
    return domains
  }

  /**
   * Every `Path=` a cookie set during this solve could plausibly be scoped to,
   * from `/` down to the url's own path. Bounded: a path deeper than
   * [MAX_COOKIE_EXPIRY_PATH_SEGMENTS] is truncated rather than enumerated.
   */
  internal fun cookieExpiryPaths(path: String): List<String> {
    val paths = ArrayList<String>()
    paths.add("/")
    var current = StringBuilder()
    for (segment in path.split("/").filter { it.isNotEmpty() }.take(MAX_COOKIE_EXPIRY_PATH_SEGMENTS)) {
      current.append("/").append(segment)
      paths.add(current.toString())
    }
    return paths
  }
}

/** How long a recorded challenge host stays solvable. */
internal const val NEMU_CLOUDFLARE_CHALLENGE_HOST_TTL_MS = 10 * 60 * 1_000L
internal const val NEMU_CLOUDFLARE_MAX_CHALLENGE_HOSTS_PER_SCOPE = 32
internal const val NEMU_CLOUDFLARE_MAX_CHALLENGE_HOST_SCOPES = 128

private val NEMU_CLOUDFLARE_SERVER_HEADER_VALUES = setOf("cloudflare", "cloudflare-nginx")

/**
 * True when this response *looks like* Cloudflare turning the source's request
 * away rather than the origin answering it: a 403/503 plus either Cloudflare's
 * own `server` banner or the `cf-mitigated` marker.
 *
 * Both signals are remote-controlled strings, so this is a relevance filter,
 * not proof of anything — it keeps ordinary 404s, 200s and non-Cloudflare 403s
 * from filling the registry, and nothing more. Treat a `true` here as "this
 * host is worth offering the user a solve for", never as "this host is safe to
 * load".
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
 * **What this gate is for.** `solveCloudflare` renders a source-named url in an
 * in-app WebView with scripting on, so the url cannot be taken on the isolate's
 * word alone. The registry narrows the set of urls a source can aim that WebView
 * at from "any public https origin" down to "an origin this same source reached
 * in the last ten minutes, which answered with something that looks like a
 * Cloudflare mitigation".
 *
 * **What it does not do.** It is a rate-and-relevance gate, not an authorization
 * check. A source chooses its own request targets, so it can put a host in here
 * on purpose simply by requesting it — a source that wants `cdn.partner.example`
 * solved need only fetch it first and have it answer 403 behind Cloudflare. The
 * header test above is a heuristic on attacker-adjacent input (`server:` and
 * `cf-mitigated:` are just strings the remote sent), so any origin willing to
 * send `server: cloudflare` with a 403 qualifies. What the registry actually
 * guarantees is narrower and still worth having: no source can have a host
 * solved that *it* never talked to, no source inherits another source's hosts, a
 * recorded host expires, and the jar a solve publishes into is the same jar the
 * recording request used. The thing that keeps a solved WebView from being
 * useful as a probe is the address policy plus the exact-host allow-list above,
 * not this registry.
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
