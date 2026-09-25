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
  fun allowsOnlyTheExactChallengeHostAndCloudflaresChallengePlatform() {
    assertTrue(subresource("https", host))
    assertTrue(subresource("https", "challenges.cloudflare.com"))

    // A subdomain of either host was never address-validated: a challenge page
    // naming `gw.<challengeHost>` that resolves into the LAN must not load.
    assertFalse(subresource("https", "static.reader.example.com"))
    assertFalse(subresource("https", "gw.reader.example.com"))
    assertFalse(subresource("https", "assets.challenges.cloudflare.com"))
    assertFalse(subresource("http", host))
    assertFalse(subresource("https", "evil-reader.example.com"))
    assertFalse(subresource("https", "tracker.example.net"))
    assertFalse(subresource("https", "10.0.0.5"))
    assertFalse(subresource("https", "localhost"))
    assertFalse(subresource("https", host, hasUserInfo = true))
    assertFalse(NemuCloudflareChallengePolicy.allowsSubresource(null, host))
  }

  @Test
  fun keepsMainFrameNavigationOnTheExactChallengeHost() {
    assertTrue(mainFrame("https", host))
    assertFalse(mainFrame("https", "www.reader.example.com"))

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
  fun aRegistrySuffixIsNotAParentDomain() {
    assertTrue(NemuCloudflareChallengePolicy.isPublicSuffix("com"))
    assertTrue(NemuCloudflareChallengePolicy.isPublicSuffix("co.uk"))
    assertTrue(NemuCloudflareChallengePolicy.isPublicSuffix("github.io"))
    assertFalse(NemuCloudflareChallengePolicy.isPublicSuffix("example.com"))
    assertFalse(NemuCloudflareChallengePolicy.isPublicSuffix("reader.co.uk"))

    // `co.uk` does not cover `reader.co.uk`; the registrable domain still does.
    assertFalse(NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(".co.uk", "reader.co.uk"))
    assertFalse(NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost("co.uk", "reader.co.uk"))
    assertTrue(NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(".reader.co.uk", "reader.co.uk"))
    assertFalse(
      NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(".github.io", "someone.github.io")
    )
  }

  /**
   * The process-wide `CookieManager` means whatever the pre-solve expiry sweep
   * failed to remove is still readable when a solve finishes. Adoption is
   * therefore a diff against the jar as it stood when the solve began, and the
   * sweep enumerates every `Domain=`/`Path=` spelling a leftover could carry.
   */
  @Test
  fun adoptsOnlyCookiesTheSolveItselfProduced() {
    val pairs = NemuCloudflareChallengePolicy.cookiePairs("a=1; b=2 ; a=3; =x; novalue; c=")
    assertEquals(listOf("a" to "1", "b" to "2", "c" to ""), pairs)

    assertEquals(
      "b=3; c=4",
      NemuCloudflareChallengePolicy.newOrChangedCookieHeader("a=1; b=2", "a=1; b=3; c=4")
    )
    assertEquals(
      "cf_clearance=fresh",
      NemuCloudflareChallengePolicy.newOrChangedCookieHeader("", "cf_clearance=fresh")
    )
    // A stale clearance another scope left behind is unchanged, so it is not
    // adopted — the cross-scope transfer this diff exists to prevent.
    assertEquals(
      "",
      NemuCloudflareChallengePolicy.newOrChangedCookieHeader(
        "cf_clearance=stale",
        "cf_clearance=stale"
      )
    )
  }

  @Test
  fun enumeratesEveryCookieScopeALeftoverCouldHideBehind() {
    assertEquals(
      listOf(null, ".a.b.reader.example.com", ".b.reader.example.com", ".reader.example.com", ".example.com"),
      NemuCloudflareChallengePolicy.cookieExpiryDomains("a.b.reader.example.com")
    )
    // Stops short of a registry suffix: nobody can own a cookie for `co.uk`.
    assertEquals(
      listOf(null, ".reader.co.uk"),
      NemuCloudflareChallengePolicy.cookieExpiryDomains("reader.co.uk")
    )
    assertEquals(listOf<String?>(null), NemuCloudflareChallengePolicy.cookieExpiryDomains("localhost"))

    assertEquals(
      listOf("/", "/manga", "/manga/1", "/manga/1/read"),
      NemuCloudflareChallengePolicy.cookieExpiryPaths("/manga/1/read")
    )
    assertEquals(listOf("/"), NemuCloudflareChallengePolicy.cookieExpiryPaths("/"))
    assertEquals(listOf("/"), NemuCloudflareChallengePolicy.cookieExpiryPaths(""))
    assertEquals(
      NemuCloudflareChallengePolicy.MAX_COOKIE_EXPIRY_PATH_SEGMENTS + 1,
      NemuCloudflareChallengePolicy.cookieExpiryPaths("/a/b/c/d/e/f/g/h/i/j/k").size
    )
  }

  @Test
  fun expiresBothThePartitionedAndTheUnpartitionedIdentity() {
    // Cloudflare's clearance is `Partitioned`; a plain expiry line is a
    // different cookie identity and would leave it in place.
    assertEquals(
      listOf(
        "cf_clearance=; Max-Age=0; Path=/; Secure",
        "cf_clearance=; Max-Age=0; Path=/; Secure; Partitioned"
      ),
      NemuCloudflareChallengePolicy.cookieExpiryLines("cf_clearance", null, "/")
    )
    assertEquals(
      listOf(
        "__cf_bm=; Max-Age=0; Path=/manga; Domain=.example.com; Secure",
        "__cf_bm=; Max-Age=0; Path=/manga; Domain=.example.com; Secure; Partitioned"
      ),
      NemuCloudflareChallengePolicy.cookieExpiryLines("__cf_bm", ".example.com", "/manga")
    )
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
    // Main frame: the exact challenge host only.
    assertTrue(request(isForMainFrame = true, host = host))
    assertFalse(request(isForMainFrame = true, host = "cdn.$host"))
    // The Turnstile iframe's own host is not a main-frame destination: a
    // top-level hop onto it is a redirect away from the challenge.
    assertFalse(
      request(
        isForMainFrame = true,
        host = NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST
      )
    )
    assertFalse(request(isForMainFrame = true, host = "evil.test"))

    // Subframes and subresources: the exact challenge host plus Cloudflare's
    // challenge platform. This is the regression the frame-aware decision
    // fixes — the Turnstile widget is a subframe on the platform host, so
    // holding it to the main-frame rule made every interactive challenge
    // time out. Subdomains of either host stay refused in every frame.
    assertTrue(request(isForMainFrame = false, host = host))
    assertFalse(request(isForMainFrame = false, host = "cdn.$host"))
    assertTrue(
      request(
        isForMainFrame = false,
        host = NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST
      )
    )
    assertFalse(
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

  @Test
  fun onlyANonMitigatedChallengeHostDocumentCountsAsCleared() {
    val page = "https://reader.example.com/newmanga/page/1/"
    fun cleared(url: String?, status: Int, headers: Map<String, String> = emptyMap()) =
      NemuCloudflareChallengePolicy.isClearedDocumentResponse(url, status, headers, host)

    assertTrue(cleared(page, 200, mapOf("Content-Type" to "text/html")))
    assertTrue(cleared("https://READER.example.com./manga/1", 204))
    assertFalse(cleared(page, 403, mapOf("cf-mitigated" to "challenge", "server" to "cloudflare")))
    assertFalse(cleared(page, 200, mapOf("CF-Mitigated" to "challenge")))
    // The marker, not the status, is what identifies Cloudflare's own page:
    // an origin that answers the replayed GET with an unmarked 5xx has let the
    // clearance through, and holding out for a 2xx/4xx left the solve hanging.
    assertTrue(cleared(page, 500))
    assertTrue(cleared(page, 502, mapOf("server" to "cloudflare")))
    assertTrue(cleared(page, 503))
    assertFalse(cleared(page, 503, mapOf("cf-mitigated" to "challenge", "server" to "cloudflare")))
    // A redirect is not a document, whatever its headers.
    assertFalse(cleared(page, 302))
    assertFalse(cleared(page, 301))
    assertFalse(cleared(page, 600))
    assertFalse(cleared(page, 0))
    // An API or POST endpoint replayed as a plain GET answers 404/405 once the
    // edge lets it through; only a mitigated 4xx is Cloudflare's.
    assertTrue(cleared(page, 404))
    assertTrue(cleared(page, 405, mapOf("server" to "cloudflare")))
    assertFalse(cleared(page, 403, mapOf("cf-mitigated" to "block")))
    assertFalse(cleared("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b", 200))
    assertFalse(cleared("https://gw.reader.example.com/", 200))
    assertFalse(cleared(null, 200))
    assertFalse(cleared("not a url", 200))
  }

  @Test
  fun solveSettlesOnlyOnPositiveProofOfAClearedDocument() {
    // The premature success seen on a zh device: Turnstile has written a fresh
    // `cf_clearance` and the (localized) interstitial's probe no longer read
    // as a challenge, but no cleared document is on screen yet.
    assertFalse(
      NemuCloudflareChallengePolicy.isSolveComplete(
        clearance = "fresh",
        baselineClearance = null,
        committedDocumentCleared = false,
        probeReportsChallenge = false
      )
    )
    // The origin page loaded with the fresh clearance: settled.
    assertTrue(
      NemuCloudflareChallengePolicy.isSolveComplete(
        clearance = "fresh",
        baselineClearance = "stale",
        committedDocumentCleared = true,
        probeReportsChallenge = false
      )
    )
    // A cleared response whose document still reads as a challenge, a stale
    // cookie carried over from the failed request, or no cookie at all.
    assertFalse(
      NemuCloudflareChallengePolicy.isSolveComplete("fresh", null, true, true)
    )
    assertFalse(
      NemuCloudflareChallengePolicy.isSolveComplete("stale", "stale", true, false)
    )
    assertFalse(NemuCloudflareChallengePolicy.isSolveComplete(null, null, true, false))
    assertFalse(NemuCloudflareChallengePolicy.isSolveComplete("", null, true, false))
  }

  @Test
  fun mainFrameTrackerKeepsTheInterstitialUnclearedUntilTheOriginAnswers() {
    val page = "https://reader.example.com/newmanga/page/1/"
    val documents = NemuCloudflareMainFrameDocumentTracker(host)
    assertFalse(documents.committedDocumentCleared)

    // The solve's own load: Cloudflare answers with its mitigated 403.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameHttpError(403, mapOf("cf-mitigated" to "challenge"))
    documents.mainFrameStarted()
    documents.mainFrameFinished(page)
    assertFalse(documents.committedDocumentCleared)

    // Turnstile ticks and writes a preliminary `cf_clearance`; the localized
    // interstitial strips its tokens with `history.replaceState`, which is a
    // same-document start/finish with no main-frame request behind it.
    documents.mainFrameStarted()
    documents.mainFrameFinished("$page?stripped")
    assertFalse(documents.committedDocumentCleared)
    assertFalse(
      NemuCloudflareChallengePolicy.isSolveComplete(
        clearance = "preliminary",
        baselineClearance = null,
        committedDocumentCleared = documents.committedDocumentCleared,
        probeReportsChallenge = false
      )
    )

    // The orchestrator's follow-up navigation reaches the origin: no HTTP
    // error was reported for it, so it is the 2xx document that proves it.
    val beforeOrigin = documents.documentGeneration
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameStarted()
    // Between the new document's start and its finish nothing is trusted.
    assertFalse(documents.committedDocumentCleared)
    documents.mainFrameFinished(page)
    assertTrue(documents.committedDocumentCleared)
    assertTrue(documents.documentGeneration > beforeOrigin)
    assertTrue(
      NemuCloudflareChallengePolicy.isSolveComplete(
        clearance = "preliminary",
        baselineClearance = null,
        committedDocumentCleared = documents.committedDocumentCleared,
        probeReportsChallenge = false
      )
    )

    // A same-document navigation on the origin page keeps the verdict.
    documents.mainFrameStarted()
    documents.mainFrameFinished("$page#top")
    assertTrue(documents.committedDocumentCleared)

    // An origin that answers a later navigation with its own (unmarked) 5xx
    // still proves the edge let the clearance through.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameHttpError(502, mapOf("server" to "cloudflare"))
    documents.mainFrameStarted()
    documents.mainFrameFinished(page)
    assertTrue(documents.committedDocumentCleared)

    // A later navigation that is challenged again withdraws it.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameHttpError(503, mapOf("cf-mitigated" to "challenge"))
    documents.mainFrameStarted()
    assertFalse(documents.committedDocumentCleared)
    documents.mainFrameFinished(page)
    assertFalse(documents.committedDocumentCleared)
  }

  @Test
  fun mainFrameTrackerRefusesBlockedFailedAndForeignDocuments() {
    val documents = NemuCloudflareMainFrameDocumentTracker(host)

    // Refused by the solver's own allow-list (answered with a blank 403).
    documents.mainFrameRequestStarted(allowed = false)
    documents.mainFrameStarted()
    documents.mainFrameFinished("https://reader.example.com/")
    assertFalse(documents.committedDocumentCleared)

    // The load failed outright; WebView shows its own error page.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameLoadFailed()
    documents.mainFrameStarted()
    documents.mainFrameFinished("https://reader.example.com/")
    assertFalse(documents.committedDocumentCleared)

    // A document that finished on some other host after a redirect.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameStarted()
    documents.mainFrameFinished("https://elsewhere.example.net/")
    assertFalse(documents.committedDocumentCleared)

    // An error with no request behind it (a stale callback) changes nothing,
    // and a fresh request drops whatever the previous one recorded.
    documents.mainFrameHttpError(403, mapOf("cf-mitigated" to "challenge"))
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameStarted()
    documents.mainFrameFinished("https://reader.example.com/")
    assertTrue(documents.committedDocumentCleared)
  }

  @Test
  fun mainFrameTrackerIgnoresTheLateFinishOfThePreviousDocument() {
    val page = "https://reader.example.com/newmanga/page/1/"
    val documents = NemuCloudflareMainFrameDocumentTracker(host)
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameHttpError(403, mapOf("cf-mitigated" to "challenge"))
    documents.mainFrameStarted()

    // The next navigation's request begins before the interstitial's own
    // finish arrives. That late finish must not be scored with the new
    // request's still-clean state...
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameFinished(page)
    assertFalse(documents.committedDocumentCleared)

    // ...and the new document's own start and finish still decide it.
    documents.mainFrameHttpError(403, mapOf("cf-mitigated" to "challenge"))
    documents.mainFrameStarted()
    documents.mainFrameFinished(page)
    assertFalse(documents.committedDocumentCleared)

    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameStarted()
    documents.mainFrameFinished(page)
    assertTrue(documents.committedDocumentCleared)
  }

  @Test
  fun aClearedDocumentExtendsTheHiddenDeadlineOnce() {
    val grace = NemuCloudflareChallengePolicy.CLEARED_DOCUMENT_GRACE_MS
    assertEquals(
      grace,
      NemuCloudflareChallengePolicy.hiddenDeadlineExtensionMs(
        clearedDocumentCommitted = true,
        alreadyExtended = false,
        sheetVisible = false
      )
    )
    // Not cleared, already extended once, or the user is driving (no deadline).
    assertNull(NemuCloudflareChallengePolicy.hiddenDeadlineExtensionMs(false, false, false))
    assertNull(NemuCloudflareChallengePolicy.hiddenDeadlineExtensionMs(true, true, false))
    assertNull(NemuCloudflareChallengePolicy.hiddenDeadlineExtensionMs(true, false, true))
  }

  @Test
  fun mainFrameStartReportsWhetherTheLoadingDocumentLooksCleared() {
    val page = "https://reader.example.com/newmanga/page/1/"
    val documents = NemuCloudflareMainFrameDocumentTracker(host)

    // The interstitial: a mitigated 403 before its start.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameHttpError(403, mapOf("cf-mitigated" to "challenge"))
    assertFalse(documents.mainFrameStarted(page))
    documents.mainFrameFinished(page)

    // The origin page (slow to finish): looks cleared at start, but the
    // verdict itself still waits for the finish.
    documents.mainFrameRequestStarted(allowed = true)
    assertTrue(documents.mainFrameStarted(page))
    assertFalse(documents.committedDocumentCleared)
    documents.mainFrameFinished(page)
    assertTrue(documents.committedDocumentCleared)

    // A same-document start has no request behind it and reports nothing.
    assertFalse(documents.mainFrameStarted("$page#top"))
    assertTrue(documents.committedDocumentCleared)

    // Refused, foreign, failed, or no url at all.
    documents.mainFrameRequestStarted(allowed = false)
    assertFalse(documents.mainFrameStarted(page))
    documents.mainFrameRequestStarted(allowed = true)
    assertFalse(documents.mainFrameStarted("https://elsewhere.example.net/"))
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameLoadFailed()
    assertFalse(documents.mainFrameStarted(page))
    documents.mainFrameRequestStarted(allowed = true)
    assertFalse(documents.mainFrameStarted(null))
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

  @Test
  fun mainFrameTrackerReportsTheChallengeDocumentFromItsStart() {
    val page = "https://reader.example.com/newmanga/page/1/"
    val documents = NemuCloudflareMainFrameDocumentTracker(host)
    assertFalse(documents.documentChallenged)
    assertFalse(documents.challengeObserved)

    // WebView 133 order, observed on the emulator: the request, the main-frame
    // `onReceivedHttpError` for the 403 interstitial, then `onPageStarted`.
    documents.mainFrameRequestStarted(allowed = true)
    documents.mainFrameHttpError(403, mapOf("cf-mitigated" to "challenge", "server" to "cloudflare"))
    assertFalse(documents.documentChallenged)
    documents.mainFrameStarted(page)
    assertTrue(documents.documentChallenged)
    assertTrue(documents.challengeObserved)
    documents.mainFrameFinished(page)
    assertTrue(documents.documentChallenged)
    assertFalse(documents.committedDocumentCleared)

    // The orchestrator's follow-up navigation withdraws it at once...
    documents.mainFrameRequestStarted(allowed = true)
    assertFalse(documents.documentChallenged)
    // ...and the origin's own page is cleared, not challenged; the solve still
    // remembers that it saw a challenge.
    documents.mainFrameStarted(page)
    documents.mainFrameFinished(page)
    assertFalse(documents.documentChallenged)
    assertTrue(documents.committedDocumentCleared)
    assertTrue(documents.challengeObserved)
  }

  @Test
  fun onlyAChallengeHostInterstitialIsAChallengeDocument() {
    val page = "https://reader.example.com/"
    val challenge = mapOf("cf-mitigated" to "challenge")
    assertTrue(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(page, 403, challenge, host))
    assertTrue(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(page, 503, mapOf("CF-Mitigated" to " Challenge "), host))
    // A plain Cloudflare block page has nothing to solve.
    assertFalse(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(page, 403, mapOf("server" to "cloudflare"), host))
    assertFalse(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(page, 403, mapOf("cf-mitigated" to "block"), host))
    // No error recorded for the load (a 2xx), another host, or no url at all.
    assertFalse(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(page, null, challenge, host))
    assertFalse(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(page, 200, challenge, host))
    assertFalse(NemuCloudflareChallengePolicy.isChallengeDocumentResponse("https://elsewhere.example.net/", 403, challenge, host))
    assertFalse(NemuCloudflareChallengePolicy.isChallengeDocumentResponse(null, 403, challenge, host))

    // A request the solver refused itself (its own blank 403) never counts.
    val documents = NemuCloudflareMainFrameDocumentTracker(host)
    documents.mainFrameRequestStarted(allowed = false)
    documents.mainFrameHttpError(403, challenge)
    documents.mainFrameStarted(page)
    assertFalse(documents.documentChallenged)
    assertFalse(documents.challengeObserved)
  }

  @Test
  fun anUnreadableProbeNeverCompletesButNeverEscalatesEither() {
    assertTrue(NemuCloudflareChallengePolicy.challengeOnScreen(documentChallenged = false, probeInterstitial = null))
    assertTrue(NemuCloudflareChallengePolicy.challengeOnScreen(documentChallenged = false, probeInterstitial = true))
    assertTrue(NemuCloudflareChallengePolicy.challengeOnScreen(documentChallenged = true, probeInterstitial = false))
    assertFalse(NemuCloudflareChallengePolicy.challengeOnScreen(documentChallenged = false, probeInterstitial = false))

    val first = NemuCloudflareChallengePolicy.FIRST_INTERACTION_MS
    assertFalse(NemuCloudflareChallengePolicy.shouldPresentChallenge(false, null, first, sheetVisible = false))
    assertFalse(NemuCloudflareChallengePolicy.shouldPresentChallenge(false, false, first, sheetVisible = false))
    assertTrue(NemuCloudflareChallengePolicy.shouldPresentChallenge(true, null, first, sheetVisible = false))
    assertTrue(NemuCloudflareChallengePolicy.shouldPresentChallenge(false, true, first, sheetVisible = false))
    // Not before the grace a self-clearing challenge gets, and never twice.
    assertFalse(NemuCloudflareChallengePolicy.shouldPresentChallenge(true, true, first - 1, sheetVisible = false))
    assertFalse(NemuCloudflareChallengePolicy.shouldPresentChallenge(true, true, first, sheetVisible = true))
  }

  @Test
  fun aSolveThatWasNeverChallengedIsRecognised() {
    // bakamh.com on Android: the WebView lands on the real page straight away.
    assertTrue(
      NemuCloudflareChallengePolicy.isUnchallengedLoad(
        committedDocumentCleared = true,
        challengeObserved = false,
        challengeOnScreen = false,
        sheetVisible = false
      )
    )
    // A solve that did go through a challenge, is still loading, still shows
    // something challenge-like, or has the user driving, is not that.
    assertFalse(NemuCloudflareChallengePolicy.isUnchallengedLoad(true, challengeObserved = true, challengeOnScreen = false, sheetVisible = false))
    assertFalse(NemuCloudflareChallengePolicy.isUnchallengedLoad(false, challengeObserved = false, challengeOnScreen = false, sheetVisible = false))
    assertFalse(NemuCloudflareChallengePolicy.isUnchallengedLoad(true, challengeObserved = false, challengeOnScreen = true, sheetVisible = false))
    assertFalse(NemuCloudflareChallengePolicy.isUnchallengedLoad(true, challengeObserved = false, challengeOnScreen = false, sheetVisible = true))
  }

  @Test
  fun probeCompletionValuesParse() {
    assertEquals(true, nemuCloudflareParseProbe("{\"interstitial\":true}"))
    assertEquals(false, nemuCloudflareParseProbe("{\"interstitial\":false}"))
    assertNull(nemuCloudflareParseProbe(null))
    assertNull(nemuCloudflareParseProbe("null"))
    assertNull(nemuCloudflareParseProbe("{}"))
    assertNull(nemuCloudflareParseProbe("not json"))
    assertFalse(NEMU_CLOUDFLARE_PROBE_SCRIPT.contains("document"))
  }
}
