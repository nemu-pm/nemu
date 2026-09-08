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

    // Subresources: the challenge host tree plus Cloudflare's platform.
    precondition(
      NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://reader.example.com/cdn-cgi/challenge-platform/h/b/x")!,
        challengeHost: host
      )
    )
    precondition(
      NemuCloudflareChallengePolicy.allowsSubresource(
        URL(string: "https://static.reader.example.com/app.js")!,
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

    // Main-frame navigation is narrower: never off the challenge host tree,
    // not even onto Cloudflare's platform host.
    precondition(
      NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
        URL(string: "https://reader.example.com/manga/1")!,
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

    // Non-punycode hosts cannot be expressed in a url-filter at all.
    precondition(NemuCloudflareChallengePolicy.normalizedHost("рид.example") == nil)
    precondition(NemuCloudflareChallengePolicy.normalizedHost("Reader.Example.COM.") == host)

    // The compiled allow-list blocks everything, then re-allows both trees.
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

    // A pathological url must not slip through the subdomain prefix group.
    let filter = NemuCloudflareChallengePolicy.hostTreeURLFilter(host)
    let regex = try! NSRegularExpression(pattern: filter, options: [.caseInsensitive])
    func matches(_ value: String) -> Bool {
      regex.firstMatch(
        in: value,
        range: NSRange(value.startIndex..<value.endIndex, in: value)
      ) != nil
    }
    precondition(matches("https://reader.example.com/"))
    precondition(matches("https://cdn.reader.example.com/a.js"))
    precondition(!matches("https://evil.test/?next=https://reader.example.com/"))
    precondition(!matches("https://xreader.example.com/"))
    precondition(!matches("http://reader.example.com/"))
    precondition(matches("https://reader.example.com:8443/x"))
    precondition(!matches("https://reader.example.com.evil.test/"))
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

    print("NemuCloudflareChallengePolicyTests passed.")
  }
}
