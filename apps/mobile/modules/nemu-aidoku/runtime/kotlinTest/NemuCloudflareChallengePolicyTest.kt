package pm.nemu.mobile.aidoku

import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuCloudflareChallengePolicyTest {
  private val host = "reader.example.com"

  @Test
  fun pinsASolvableChallengeUrlToItsHostTree() {
    assertEquals(
      host,
      NemuCloudflareChallengePolicy.challengeHost(
        "https://reader.example.com/manga/1?cf=1".toHttpUrl()
      )
    )
    assertEquals(
      host,
      NemuCloudflareChallengePolicy.normalizedHost("Reader.Example.COM.")
    )
  }

  @Test
  fun refusesUrlsThatCanNeverBeSolvedSafely() {
    listOf(
      "http://reader.example.com/manga/1",
      "https://user:secret@reader.example.com/",
      "https://93.184.216.34/manga/1",
      "https://127.0.0.1/manga/1",
      "https://localhost/manga/1",
      "https://metadata.goog/computeMetadata",
      "https://com/manga/1"
    ).forEach { candidate ->
      assertNull(
        candidate,
        candidate.toHttpUrlOrNull()?.let(NemuCloudflareChallengePolicy::challengeHost)
      )
    }
  }

  @Test
  fun rejectsHostsAnAllowListCouldNotCompareLiterally() {
    assertNull(NemuCloudflareChallengePolicy.normalizedHost("рид.example"))
    assertNull(NemuCloudflareChallengePolicy.normalizedHost(""))
    assertNull(NemuCloudflareChallengePolicy.normalizedHost(".example.com"))
    assertNull(NemuCloudflareChallengePolicy.normalizedHost("a..example.com"))
    assertNull(NemuCloudflareChallengePolicy.normalizedHost("-example.com"))
    assertNull(NemuCloudflareChallengePolicy.normalizedHost(null))
  }

  @Test
  fun allowsOnlyTheChallengeHostTreeAndCloudflaresChallengePlatform() {
    assertTrue(subresource("https", host))
    assertTrue(subresource("https", "static.reader.example.com"))
    assertTrue(subresource("https", "challenges.cloudflare.com"))
    assertTrue(subresource("https", "assets.challenges.cloudflare.com"))

    assertFalse(subresource("http", host))
    assertFalse(subresource("https", "evil-reader.example.com"))
    assertFalse(subresource("https", "tracker.example.net"))
    assertFalse(subresource("https", "10.0.0.5"))
    assertFalse(subresource("https", "localhost"))
    assertFalse(subresource("https", host, hasUserInfo = true))
    assertFalse(NemuCloudflareChallengePolicy.allowsSubresource(null, host))
  }

  @Test
  fun keepsMainFrameNavigationInsideTheChallengeHostTree() {
    assertTrue(mainFrame("https", host))
    assertTrue(mainFrame("https", "www.reader.example.com"))

    // Cloudflare's platform host is a subframe/subresource, never a top-level
    // destination — a main-frame hop onto it is a redirect off the challenge.
    assertFalse(mainFrame("https", "challenges.cloudflare.com"))
    assertFalse(mainFrame("https", "phish.example.net"))
    assertFalse(mainFrame("http", host))
    assertFalse(NemuCloudflareChallengePolicy.allowsMainFrameNavigation(null, host))
  }

  @Test
  fun adoptsOnlyCookieDomainsThatCoverTheChallengeHost() {
    assertTrue(covers(".example.com"))
    assertTrue(covers("example.com"))
    assertTrue(covers("reader.example.com"))

    assertFalse(covers("challenges.cloudflare.com"))
    assertFalse(covers("other.example.net"))
    assertFalse(covers("static.reader.example.com"))
    assertFalse(covers("com"))
    assertFalse(covers(""))
  }

  @Test
  fun recognizesTheChallengePlatformPath() {
    assertTrue(
      NemuCloudflareChallengePolicy.isChallengePlatformPath(
        "/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"
      )
    )
    assertFalse(NemuCloudflareChallengePolicy.isChallengePlatformPath("/manga/1"))
    assertFalse(NemuCloudflareChallengePolicy.isChallengePlatformPath(null))
  }

  /**
   * `SolverWebViewClient` cannot be built in a JVM unit test — it extends the
   * `WebViewClient` stub in android.jar, is file-private, and reads
   * `WebResourceRequest.url` as a `Uri` (also a throwing stub). Both of its
   * overrides now route through this one decision, so the matrix below is the
   * behaviour they enforce: `shouldInterceptRequest` answers a blank 403 and
   * `shouldOverrideUrlLoading` returns `true` ("app handled it") exactly when
   * this is false.
   */
  @Test
  fun webViewRequestDecisionIsFrameAwareForBothOverrides() {
    // Main frame: the challenge host tree only.
    assertTrue(request(isForMainFrame = true, host = host))
    assertTrue(request(isForMainFrame = true, host = "cdn.$host"))
    // The Turnstile iframe's own host is not a main-frame destination: a
    // top-level hop onto it is a redirect away from the challenge.
    assertFalse(
      request(
        isForMainFrame = true,
        host = NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST
      )
    )
    assertFalse(request(isForMainFrame = true, host = "evil.test"))

    // Subframes and subresources: the challenge host tree plus Cloudflare's
    // challenge platform. This is the regression the frame-aware decision
    // fixes — the Turnstile widget is a subframe on the platform host, so
    // holding it to the main-frame rule made every interactive challenge
    // time out.
    assertTrue(request(isForMainFrame = false, host = host))
    assertTrue(request(isForMainFrame = false, host = "cdn.$host"))
    assertTrue(
      request(
        isForMainFrame = false,
        host = NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST
      )
    )
    assertTrue(
      request(
        isForMainFrame = false,
        host = "static.${NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST}"
      )
    )
    assertFalse(request(isForMainFrame = false, host = "evil.test"))

    // Scheme, credentials, and host-shape rules apply in both frames.
    for (isForMainFrame in listOf(true, false)) {
      assertFalse(request(isForMainFrame, host = host, scheme = "http"))
      assertFalse(request(isForMainFrame, host = host, hasUserInfo = true))
      assertFalse(request(isForMainFrame, host = "127.0.0.1"))
      assertFalse(request(isForMainFrame, host = "x$host"))
      assertFalse(request(isForMainFrame, host = null))
    }
  }

  @Test
  fun recordsOnlyCloudflareMitigationsAndOnlyForTheRequestingScope() {
    var clock = 0L
    val registry = NemuCloudflareChallengeHostRegistry(nowMs = { clock })
    val scope = "local::aidoku-community:en.example"
    val other = "local::aidoku-community:en.other"
    val cloudflare403 = 403 to mapOf("server" to "cloudflare")

    // A plain origin 403/503, and a Cloudflare-fronted 200, are not challenges.
    registry.record(scope, host, 403, mapOf("server" to "nginx"))
    registry.record(scope, host, 200, mapOf("server" to "cloudflare"))
    registry.record(scope, host, 404, mapOf("cf-mitigated" to "challenge"))
    assertFalse(registry.allows(scope, host))

    registry.record(scope, host, cloudflare403.first, cloudflare403.second)
    assertTrue(registry.allows(scope, host))
    // A different source never inherits another source's solvable hosts, and a
    // host the source never reached stays unsolvable.
    assertFalse(registry.allows(other, host))
    assertFalse(registry.allows(scope, "evil.test"))
    // A subdomain is a different host: the record is exact.
    assertFalse(registry.allows(scope, "cdn.$host"))
    // No scope at all can never be solved.
    assertFalse(registry.allows(null, host))
    assertFalse(registry.allows("   ", host))

    // `cf-mitigated` alone qualifies, and the header/host lookups are
    // case-insensitive.
    registry.record(scope, "Other.Example.COM.", 503, mapOf("CF-Mitigated" to "challenge"))
    assertTrue(registry.allows(scope, "other.example.com"))

    // The scope is matched verbatim: the canonical source key names a
    // different jar than the profile-scoped execution key the source's own
    // requests (and a solve's cookie adoption) use, so it must not match.
    assertFalse(registry.allows("aidoku-community:en.example", host))
    assertFalse(registry.allows("other-profile::aidoku-community:en.example", host))
    // Only the HTTP path's own scope rules are applied to it.
    assertTrue(registry.allows("  $scope  ", host))
    assertFalse(registry.allows("a".repeat(NEMU_COOKIE_SCOPE_MAX_CHARACTERS + 1), host))
    assertFalse(registry.allows("sco\u0000pe", host))

    // Expiry is monotonic and exclusive at the TTL boundary.
    clock += NEMU_CLOUDFLARE_CHALLENGE_HOST_TTL_MS - 1
    assertTrue(registry.allows(scope, host))
    clock += 1
    assertFalse(registry.allows(scope, host))
    assertEquals(0, registry.scopeCountForTesting())
  }

  @Test
  fun challengeHostRegistryIsBoundedPerScopeAndOverall() {
    val registry = NemuCloudflareChallengeHostRegistry(
      maxHostsPerScope = 4,
      maxScopes = 2,
      nowMs = { 0L }
    )
    repeat(6) { index ->
      registry.record("scope-a", "host-$index.example.com", 403, mapOf("server" to "cloudflare"))
    }
    assertEquals(4, registry.sizeForTesting("scope-a"))
    // The oldest hosts are the ones dropped.
    assertFalse(registry.allows("scope-a", "host-0.example.com"))
    assertTrue(registry.allows("scope-a", "host-5.example.com"))

    for (scope in listOf("scope-b", "scope-c")) {
      registry.record(scope, host, 403, mapOf("server" to "cloudflare"))
    }
    assertEquals(2, registry.scopeCountForTesting())
    assertFalse(registry.allows("scope-a", "host-5.example.com"))

    registry.clearScope("scope-c")
    assertFalse(registry.allows("scope-c", host))
    registry.clear()
    assertEquals(0, registry.scopeCountForTesting())
  }

  @Test
  fun inertWidgetFramesAreAllowedOnlyAsSubframes() {
    assertTrue(NemuCloudflareChallengePolicy.isInertFrameUri("about", "blank"))
    assertTrue(NemuCloudflareChallengePolicy.isInertFrameUri("about", "srcdoc"))
    assertFalse(NemuCloudflareChallengePolicy.isInertFrameUri("about", "config"))
    assertFalse(NemuCloudflareChallengePolicy.isInertFrameUri("https", "//reader.example.com/"))
    assertTrue(
      NemuCloudflareChallengePolicy.allowsRequest(false, "about", null, false, host, "blank")
    )
    assertTrue(
      NemuCloudflareChallengePolicy.allowsRequest(false, "about", null, false, host, "srcdoc")
    )
    assertFalse(
      NemuCloudflareChallengePolicy.allowsRequest(true, "about", null, false, host, "blank")
    )
    assertFalse(
      NemuCloudflareChallengePolicy.allowsRequest(false, "about", null, false, host, "config")
    )
    // Inert in-page schemes are subresource-only as well.
    assertTrue(NemuCloudflareChallengePolicy.allowsRequest(false, "blob", null, false, host))
    assertTrue(NemuCloudflareChallengePolicy.allowsRequest(false, "data", null, false, host))
    assertFalse(NemuCloudflareChallengePolicy.allowsRequest(true, "blob", null, false, host))
    assertFalse(NemuCloudflareChallengePolicy.allowsRequest(false, "file", null, false, host))
    assertFalse(NemuCloudflareChallengePolicy.allowsRequest(false, "wss", "challenges.cloudflare.com", false, host))
  }

  private fun request(
    isForMainFrame: Boolean,
    host: String?,
    scheme: String = "https",
    hasUserInfo: Boolean = false
  ): Boolean =
    NemuCloudflareChallengePolicy.allowsRequest(
      isForMainFrame,
      scheme,
      host,
      hasUserInfo,
      this.host
    )

  private fun subresource(
    scheme: String,
    candidate: String,
    hasUserInfo: Boolean = false
  ): Boolean =
    NemuCloudflareChallengePolicy.allowsSubresource(scheme, candidate, hasUserInfo, host)

  private fun mainFrame(
    scheme: String,
    candidate: String,
    hasUserInfo: Boolean = false
  ): Boolean =
    NemuCloudflareChallengePolicy.allowsMainFrameNavigation(scheme, candidate, hasUserInfo, host)

  private fun covers(domain: String): Boolean =
    NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(domain, host)
}
