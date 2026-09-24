import Foundation

@main
enum NemuCloudflareChallengePolicyTests {
  static func main() {
    let host = "reader.example.com"

    // A solvable challenge url.
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "https://reader.example.com/manga/1?cf=1")!
      ) == host
    )

    // Plain HTTP, credentials, address literals, private and forbidden names,
    // and bare registry labels can never be solved.
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "http://reader.example.com/manga/1")!
      ) == nil
    )
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "https://user:secret@reader.example.com/")!
      ) == nil
    )
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "https://93.184.216.34/manga/1")!
      ) == nil
    )
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "https://127.0.0.1/manga/1")!
      ) == nil
    )
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "https://localhost/manga/1")!
      ) == nil
    )
    precondition(
      NemuCloudflareChallengePolicy.challengeHost(
        for: URL(string: "https://com/manga/1")!
      ) == nil
    )

    // Subresources: exactly the validated challenge host plus Cloudflare's
    // platform host. A sibling or a subdomain of either is a different host
    // that was never address-validated, so it is refused.
    precondition(
      NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://reader.example.com/cdn-cgi/challenge-platform/h/b/x")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://static.reader.example.com/app.js")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://gw.reader.example.com/probe")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://assets.challenges.cloudflare.com/x.js")!,
        challengeHost: host
      )
    )
    precondition(
      NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://challenges.cloudflare.com/turnstile/v0/api.js")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://tracker.example.net/beacon")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "http://reader.example.com/insecure.js")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://evil-reader.example.com/steal")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://10.0.0.5/metadata")!,
        challengeHost: host
      )
    )

    // Inert widget frames are allowed as subframes only; nothing else about:.
    precondition(NemuCloudflareChallengePolicy.isInertFrameURL(URL(string: "about:blank")!))
    precondition(NemuCloudflareChallengePolicy.isInertFrameURL(URL(string: "about:srcdoc")!))
    precondition(!NemuCloudflareChallengePolicy.isInertFrameURL(URL(string: "about:config")!))
    precondition(!NemuCloudflareChallengePolicy.isInertFrameURL(URL(string: "https://reader.example.com/")!))
    precondition(
      NemuCloudflareChallengePolicy.allowsSubframeNavigation(
        URL(string: "about:blank")!,
        challengeHost: host
      )
    )
    precondition(
      NemuCloudflareChallengePolicy.allowsSubframeNavigation(
        URL(string: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/x")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubframeNavigation(
        URL(string: "https://tracker.example.net/frame")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "about:blank")!,
        challengeHost: host
      )
    )

    // Credentials in a subresource url are refused the same way the Kotlin
    // twin refuses them: the WebView must never hand them to the host.
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://user:secret@reader.example.com/app.js")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://user@challenges.cloudflare.com/turnstile/v0/api.js")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "https://user:secret@reader.example.com/manga/1")!,
        challengeHost: host
      )
    )

    // Main-frame navigation is narrower: never off the exact challenge host,
    // not onto a subdomain of it and not onto Cloudflare's platform host.
    precondition(
      NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "https://reader.example.com/manga/1")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "https://www.reader.example.com/manga/1")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "https://challenges.cloudflare.com/turnstile")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "https://phish.example.net/login")!,
        challengeHost: host
      )
    )

    // The single decision both WebKit policy phases route through.
    precondition(
      NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: true,
        url: URL(string: "https://reader.example.com/manga/1")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: true,
        url: URL(string: "https://challenges.cloudflare.com/turnstile")!,
        challengeHost: host
      )
    )
    precondition(
      NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: false,
        url: URL(string: "https://challenges.cloudflare.com/turnstile/v0/api.js")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: false,
        url: URL(string: "https://cdn.reader.example.com/a.js")!,
        challengeHost: host
      )
    )
    // Inert in-page schemes are subframe-only: the widget's blob: worker must
    // run, but nothing inert may ever become the top-level document.
    precondition(NemuCloudflareChallengePolicy.isInertResourceURL(URL(string: "blob:https://reader.example.com/uuid")!))
    precondition(NemuCloudflareChallengePolicy.isInertResourceURL(URL(string: "data:text/html,hi")!))
    precondition(!NemuCloudflareChallengePolicy.isInertResourceURL(URL(string: "https://reader.example.com/")!))
    precondition(
      NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: false,
        url: URL(string: "blob:https://reader.example.com/uuid")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: true,
        url: URL(string: "blob:https://reader.example.com/uuid")!,
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.allowsRequest(
        isForMainFrame: false,
        url: URL(string: "file:///etc/hosts")!,
        challengeHost: host
      )
    )

    // Cookie adoption: only domains that cover the challenge host.
    precondition(
      NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        ".example.com",
        challengeHost: host
      )
    )
    precondition(
      NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        "reader.example.com",
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        "challenges.cloudflare.com",
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        "other.example.net",
        challengeHost: host
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        "com",
        challengeHost: host
      )
    )

    // CHIPS: Cloudflare sets `cf_clearance` `Partitioned`, and WebKit hands it
    // back tagged with the solve's top-level site. A partition covering the
    // challenge host is dropped on adoption; any other partition is refused.
    let partitionKey = NemuCloudflareChallengePolicy.cookieStoragePartitionKey
    let clearanceProperties: [HTTPCookiePropertyKey: Any] = [
      .name: "cf_clearance",
      .value: "solved",
      .domain: ".example.com",
      .path: "/",
      .secure: "TRUE",
      .expires: Date().addingTimeInterval(3_600),
    ]
    var partitioned = clearanceProperties
    partitioned[partitionKey] = "https://example.com"
    let adopted = NemuCloudflareChallengePolicy.adoptableCookieProperties(
      partitioned,
      challengeHost: host
    )
    precondition(adopted != nil)
    precondition(adopted?[partitionKey] == nil)
    precondition(adopted?[.value] as? String == "solved")
    var ownHostPartition = clearanceProperties
    ownHostPartition[partitionKey] = "https://reader.example.com"
    precondition(
      NemuCloudflareChallengePolicy.adoptableCookieProperties(
        ownHostPartition,
        challengeHost: host
      ) != nil
    )
    precondition(
      NemuCloudflareChallengePolicy.adoptableCookieProperties(
        clearanceProperties,
        challengeHost: host
      )?[.value] as? String == "solved"
    )
    for foreign in ["https://other.example.net", "http://example.com", "https://com", "not a url"] {
      var properties = clearanceProperties
      properties[partitionKey] = foreign
      precondition(
        NemuCloudflareChallengePolicy.adoptableCookieProperties(
          properties,
          challengeHost: host
        ) == nil
      )
    }
    // The failure this guards against: a plain `cookies(for:)` lookup — what
    // the source's own requests use — never returns the partitioned cookie,
    // and does return the adopted one.
    if let jar = URLSessionConfiguration.ephemeral.httpCookieStorage,
       let partitionedCookie = HTTPCookie(properties: partitioned),
       let adoptedProperties = adopted,
       let adoptedCookie = HTTPCookie(properties: adoptedProperties) {
      let target = URL(string: "https://reader.example.com/manga/1")!
      jar.setCookie(partitionedCookie)
      let partitionedVisible = jar.cookies(for: target)?.contains { $0.name == "cf_clearance" } ?? false
      jar.setCookie(adoptedCookie)
      precondition(jar.cookies(for: target)?.contains { $0.name == "cf_clearance" } == true)
      if partitionedVisible {
        print("note: this Foundation returns partitioned cookies from cookies(for:)")
      }
    }

    // A registry suffix is not a parent domain: `co.uk` does not cover
    // `reader.co.uk`, while the host's own registrable domain still does.
    precondition(NemuCloudflareChallengePolicy.isPublicSuffix("com"))
    precondition(NemuCloudflareChallengePolicy.isPublicSuffix("co.uk"))
    precondition(NemuCloudflareChallengePolicy.isPublicSuffix("github.io"))
    precondition(!NemuCloudflareChallengePolicy.isPublicSuffix("example.com"))
    precondition(!NemuCloudflareChallengePolicy.isPublicSuffix("reader.co.uk"))
    precondition(
      !NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        ".co.uk",
        challengeHost: "reader.co.uk"
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        "co.uk",
        challengeHost: "reader.co.uk"
      )
    )
    precondition(
      NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        ".reader.co.uk",
        challengeHost: "reader.co.uk"
      )
    )
    precondition(
      !NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        ".github.io",
        challengeHost: "someone.github.io"
      )
    )

    // Cookie-jar diffing (the Android solver's process-wide CookieManager):
    // only what a solve produced is adopted, and expiry enumerates every
    // Domain=/Path= spelling a leftover cookie could hide behind.
    let pairs = NemuCloudflareChallengePolicy.cookiePairs(in: "a=1; b=2 ; a=3; =x; novalue; c=")
    precondition(pairs.map { $0.name } == ["a", "b", "c"])
    precondition(pairs.map { $0.value } == ["1", "2", ""])
    precondition(
      NemuCloudflareChallengePolicy.newOrChangedCookieHeader(
        before: "a=1; b=2",
        after: "a=1; b=3; c=4"
      ) == "b=3; c=4"
    )
    precondition(
      NemuCloudflareChallengePolicy.newOrChangedCookieHeader(
        before: "",
        after: "cf_clearance=fresh"
      ) == "cf_clearance=fresh"
    )
    // A stale clearance another scope left behind is unchanged, so it is not
    // adopted — the cross-scope transfer this diff exists to prevent.
    precondition(
      NemuCloudflareChallengePolicy.newOrChangedCookieHeader(
        before: "cf_clearance=stale",
        after: "cf_clearance=stale"
      ) == ""
    )
    precondition(
      NemuCloudflareChallengePolicy.cookieExpiryDomains(for: "a.b.reader.example.com")
        == [nil, ".a.b.reader.example.com", ".b.reader.example.com", ".reader.example.com", ".example.com"]
    )
    precondition(
      NemuCloudflareChallengePolicy.cookieExpiryDomains(for: "reader.co.uk") == [nil, ".reader.co.uk"]
    )
    precondition(NemuCloudflareChallengePolicy.cookieExpiryDomains(for: "localhost") == [nil])
    precondition(
      NemuCloudflareChallengePolicy.cookieExpiryPaths(for: "/manga/1/read")
        == ["/", "/manga", "/manga/1", "/manga/1/read"]
    )
    precondition(NemuCloudflareChallengePolicy.cookieExpiryPaths(for: "/") == ["/"])
    precondition(NemuCloudflareChallengePolicy.cookieExpiryPaths(for: "") == ["/"])
    precondition(
      NemuCloudflareChallengePolicy.cookieExpiryPaths(
        for: "/a/b/c/d/e/f/g/h/i/j/k"
      ).count == NemuCloudflareChallengePolicy.maxCookieExpiryPathSegments + 1
    )

    // Non-punycode hosts cannot be expressed in a url-filter at all.
    precondition(NemuCloudflareChallengePolicy.normalizedHost("рид.example") == nil)
    precondition(NemuCloudflareChallengePolicy.normalizedHost("Reader.Example.COM.") == host)

    // The compiled allow-list blocks everything, then re-allows exactly the
    // two hosts.
    let json = NemuCloudflareChallengePolicy.contentRuleListJSON(challengeHost: host)!
    precondition(json.contains("\"block\""))
    precondition(json.contains("ignore-previous-rules"))
    precondition(json.contains("reader\\\\.example\\\\.com"))
    precondition(json.contains("challenges\\\\.cloudflare\\\\.com"))
    let rules = try! JSONSerialization.jsonObject(
      with: json.data(using: .utf8)!
    ) as! [[String: Any]]
    precondition(rules.count == 5)
    precondition((rules[0]["trigger"] as! [String: Any])["url-filter"] as! String == ".*")
    precondition((rules[0]["action"] as! [String: Any])["type"] as! String == "block")
    var filters: [String] = []
    for rule in rules.dropFirst() {
      precondition((rule["action"] as! [String: Any])["type"] as! String == "ignore-previous-rules")
      let filter = (rule["trigger"] as! [String: Any])["url-filter"] as! String
      precondition(filter.hasPrefix("^https://") || filter == "^blob:" || filter == "^data:")
      filters.append(filter)
    }
    // Inert in-page schemes are re-allowed so the widget's blob: worker runs;
    // no other scheme (http, ws, file) is.
    precondition(filters.contains("^blob:") && filters.contains("^data:"))
    precondition(!filters.contains { $0.hasPrefix("^http:") || $0.hasPrefix("^ws") || $0.hasPrefix("^file") })

    // The authority is pinned exactly: no subdomain prefix, no userinfo shape,
    // no host that merely starts with the allow-listed one.
    let filter = NemuCloudflareChallengePolicy.exactHostURLFilter(host)
    let regex = try! NSRegularExpression(pattern: filter, options: [.caseInsensitive])
    func matches(_ value: String) -> Bool {
      regex.firstMatch(
        in: value,
        range: NSRange(value.startIndex..<value.endIndex, in: value)
      ) != nil
    }
    precondition(matches("https://reader.example.com/"))
    precondition(matches("https://reader.example.com/manga/1?cf=1"))
    precondition(matches("https://reader.example.com:8443/x"))
    precondition(!matches("https://cdn.reader.example.com/a.js"))
    precondition(!matches("https://evil.test/?next=https://reader.example.com/"))
    precondition(!matches("https://xreader.example.com/"))
    precondition(!matches("http://reader.example.com/"))
    precondition(!matches("https://reader.example.com.evil.test/"))
    precondition(!matches("https://reader.example.com@evil.test/"))
    precondition(!matches("https://reader.example.com:pw@evil.test/"))
    // WebKit's content-blocker regex has no alternation; the filter must not
    // contain one or the rule list fails to compile at runtime.
    precondition(!filter.contains("|"))

    // The challenge-host registry: only hosts this source's own traffic saw a
    // Cloudflare mitigation on, only recently, and never across sources.
    var clock: TimeInterval = 0
    let registry = NemuCloudflareChallengeHostRegistry(now: { clock })
    let scope = "local::aidoku-community:en.example"
    let otherScope = "local::aidoku-community:en.other"

    // A plain origin 403/503, and a Cloudflare-fronted 200, are not challenges.
    registry.record(cookieScope: scope, host: host, status: 403, headers: ["server": "nginx"])
    registry.record(cookieScope: scope, host: host, status: 200, headers: ["server": "cloudflare"])
    registry.record(
      cookieScope: scope,
      host: host,
      status: 404,
      headers: ["cf-mitigated": "challenge"]
    )
    precondition(!registry.allows(cookieScope: scope, host: host))

    registry.record(cookieScope: scope, host: host, status: 403, headers: ["server": "cloudflare"])
    precondition(registry.allows(cookieScope: scope, host: host))
    precondition(!registry.allows(cookieScope: otherScope, host: host))
    precondition(!registry.allows(cookieScope: scope, host: "evil.test"))
    // A subdomain is a different host: the record is exact.
    precondition(!registry.allows(cookieScope: scope, host: "cdn.\(host)"))
    // No scope at all can never be solved.
    precondition(!registry.allows(cookieScope: nil, host: host))
    precondition(!registry.allows(cookieScope: "   ", host: host))

    // `cf-mitigated` alone qualifies; header and host lookups are
    // case-insensitive.
    registry.record(
      cookieScope: scope,
      host: "Other.Example.COM.",
      status: 503,
      headers: ["CF-Mitigated": "challenge"]
    )
    precondition(registry.allows(cookieScope: scope, host: "other.example.com"))

    // The scope is matched verbatim: the canonical source key names a
    // different jar than the profile-scoped execution key the source's own
    // requests (and a solve's cookie adoption) use, so it must not match.
    precondition(!registry.allows(cookieScope: "aidoku-community:en.example", host: host))
    precondition(
      !registry.allows(
        cookieScope: "other-profile::aidoku-community:en.example",
        host: host
      )
    )
    // Only the HTTP path's own scope rules are applied to it.
    precondition(registry.allows(cookieScope: "  \(scope)  ", host: host))
    precondition(!registry.allows(cookieScope: String(repeating: "a", count: 513), host: host))
    precondition(!registry.allows(cookieScope: "sco\u{0000}pe", host: host))

    // Expiry is monotonic and exclusive at the TTL boundary.
    clock += NemuCloudflareChallengeHostRegistry.hostTTLDefault - 1
    precondition(registry.allows(cookieScope: scope, host: host))
    clock += 1
    precondition(!registry.allows(cookieScope: scope, host: host))
    precondition(registry.scopeCountForTesting() == 0)

    // Bounded per scope and overall, dropping the oldest records first.
    let bounded = NemuCloudflareChallengeHostRegistry(
      maxHostsPerScope: 4,
      maxScopes: 2,
      now: { clock }
    )
    for index in 0..<6 {
      clock += 1
      bounded.record(
        cookieScope: "scope-a",
        host: "host-\(index).example.com",
        status: 403,
        headers: ["server": "cloudflare"]
      )
    }
    precondition(bounded.hostCountForTesting("scope-a") == 4)
    precondition(!bounded.allows(cookieScope: "scope-a", host: "host-0.example.com"))
    precondition(bounded.allows(cookieScope: "scope-a", host: "host-5.example.com"))

    for name in ["scope-b", "scope-c"] {
      clock += 1
      bounded.record(
        cookieScope: name,
        host: host,
        status: 403,
        headers: ["server": "cloudflare"]
      )
    }
    precondition(bounded.scopeCountForTesting() == 2)
    precondition(!bounded.allows(cookieScope: "scope-a", host: "host-5.example.com"))

    bounded.clearScope("scope-c")
    precondition(!bounded.allows(cookieScope: "scope-c", host: host))
    bounded.clear()
    precondition(bounded.scopeCountForTesting() == 0)

    // Only the origin answering the WebView proves a clearance works: the
    // challenge host itself, a 2xx or 4xx, and no `cf-mitigated` marker at all.
    let challengePage = URL(string: "https://reader.example.com/newmanga/page/1/")!
    precondition(NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 200,
      headers: ["Content-Type": "text/html"],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 403,
      headers: ["cf-mitigated": "challenge", "server": "cloudflare"],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 200,
      headers: ["CF-Mitigated": "challenge"],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 503,
      headers: [:],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 302,
      headers: [:],
      challengeHost: host
    ))
    // An API or POST endpoint replayed as a plain GET answers 404/405 once the
    // edge lets it through; only a mitigated 4xx is Cloudflare's.
    precondition(NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 404,
      headers: [:],
      challengeHost: host
    ))
    precondition(NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 405,
      headers: ["server": "cloudflare"],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: challengePage,
      status: 403,
      headers: ["cf-mitigated": "block"],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: URL(string: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b")!,
      status: 200,
      headers: [:],
      challengeHost: host
    ))
    precondition(!NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: nil,
      status: 200,
      headers: [:],
      challengeHost: host
    ))

    // The premature success the owner hit on device: Turnstile has written a
    // fresh `cf_clearance` and the (localized) interstitial's probe no longer
    // reads as a challenge, but no cleared document has committed yet. That
    // must not settle the solve.
    precondition(!NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: "fresh",
      baselineClearance: nil,
      committedDocumentCleared: false,
      probeReportsChallenge: false
    ))
    // The origin page committed with the fresh clearance: settled.
    precondition(NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: "fresh",
      baselineClearance: "stale",
      committedDocumentCleared: true,
      probeReportsChallenge: false
    ))
    // A cleared response whose document still reads as a challenge, a stale
    // cookie carried over from the failed request, or no cookie at all.
    precondition(!NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: "fresh",
      baselineClearance: nil,
      committedDocumentCleared: true,
      probeReportsChallenge: true
    ))
    precondition(!NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: "stale",
      baselineClearance: "stale",
      committedDocumentCleared: true,
      probeReportsChallenge: false
    ))
    precondition(!NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: nil,
      baselineClearance: nil,
      committedDocumentCleared: true,
      probeReportsChallenge: false
    ))
    precondition(!NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: "",
      baselineClearance: nil,
      committedDocumentCleared: true,
      probeReportsChallenge: false
    ))

    print("NemuCloudflareChallengePolicyTests passed.")
  }
}
