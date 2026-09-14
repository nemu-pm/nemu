import Foundation

/// Pure network boundary for the on-demand Cloudflare solver's WebView.
///
/// Direct source HTTP is pinned behind `NemuNativeHttpAddressPolicy` plus the
/// authenticated loopback proxy, and a WKWebView cannot be routed through that
/// gate for every subresource, redirect, or worker fetch. The solver therefore
/// gets its own, strictly narrower boundary, enforced twice: once by a compiled
/// `WKContentRuleList` (every request the web content makes) and again in
/// `decidePolicyFor` (navigations and their responses). Exactly two hosts are
/// ever reachable, always over https and never with credentials in the url:
///
/// 1. the challenge host itself — the *exact* host the address policy already
///    resolved and validated, never a sibling or a subdomain of it, and
/// 2. Cloudflare's challenge platform (`challenges.cloudflare.com`, which is
///    the only host Cloudflare's own CSP guidance names for Turnstile; the
///    `/cdn-cgi/challenge-platform/` paths are served by the challenge host
///    itself and so are already inside rule 1).
///
/// The subtree spelling this used to carry (`*.challengeHost`) was a hole: only
/// the initial url is address-validated, so a source-controlled challenge page
/// could name `gw.<challengeHost>`, have it resolve to 192.168.0.1 or
/// 169.254.169.254, and probe the LAN from inside the WebView. Matching the one
/// validated host exactly is what closes that, and it costs nothing real: a
/// Cloudflare interstitial is served by the origin it protects and pulls its
/// widget from `challenges.cloudflare.com`.
///
/// Address literals, private/forbidden hostnames, non-ASCII (non-punycode)
/// hosts, credentials in the url, and every non-https scheme fail closed.
///
/// **What the rule list does and does not cover on iOS.** WebKit consults
/// content rule lists for WebSocket handshakes
/// (`ThreadableWebSocketChannel::create` runs `processContentRuleListsForLoad`
/// with `ResourceType::WebSocket`) and for fetches made from inside a service
/// worker (`LayoutTests/http/tests/contentextensions/service-worker.https.html`
/// covers exactly that). A trigger with no `resource-type` key matches every
/// resource type, so the blanket `.*` block below — and the two allow rules
/// that follow it — apply to `wss:` and to worker traffic as well as to page
/// subresources. This is the one place iOS is genuinely stronger than the
/// Android twin, which has to gate service workers separately and cannot see
/// WebSockets at all; see the header of `runtime/kotlin/NemuCloudflareSolver.kt`.
enum NemuCloudflareChallengePolicy {
  /// Cloudflare serves interstitial and Turnstile widget assets from here, and
  /// only from here: Cloudflare's own CSP guidance for Turnstile asks for
  /// `script-src`/`frame-src https://challenges.cloudflare.com` and names no
  /// other origin, so no subdomain of it is allow-listed either.
  static let challengePlatformHost = "challenges.cloudflare.com"

  /// The orchestration path the challenge host itself serves. Already inside
  /// the challenge host's own allow-list entry; kept explicit so the allow-list
  /// documents both halves of the challenge platform.
  static let challengePlatformPathPrefix = "/cdn-cgi/challenge-platform/"

  /// Schemes that resolve inside the page without a network destination.
  static let inertResourceSchemes = ["blob", "data"]

  private static let asciiHostCharacters = Set("abcdefghijklmnopqrstuvwxyz0123456789-.")

  /// A deliberately small, hand-maintained set of multi-label public suffixes.
  ///
  /// It exists for one job: stop `cookieDomainCoversChallengeHost` from
  /// treating a registry suffix as a "parent domain" and letting a cookie set
  /// for `co.uk` follow `reader.co.uk` home. It is **not** a public-suffix
  /// list; it carries the suffixes the sources this app talks to actually live
  /// under plus the common hosting suffixes, and anything missing from it
  /// degrades to the old (permissive) behaviour for that one suffix rather
  /// than failing closed. Nothing else in this file depends on it, and no
  /// security decision other than cookie adoption is gated on it.
  static let knownMultiLabelPublicSuffixes: Set<String> = [
    "ac.jp", "ac.uk", "co.id", "co.il", "co.in", "co.jp", "co.kr", "co.nz",
    "co.th", "co.uk", "co.za", "com.ar", "com.au", "com.br", "com.cn",
    "com.hk", "com.mx", "com.my", "com.ph", "com.pl", "com.sg", "com.tr",
    "com.tw", "com.ua", "com.vn", "edu.au", "go.jp", "gov.au", "gov.uk",
    "me.uk", "ne.jp", "net.au", "net.cn", "net.in", "net.uk", "or.jp",
    "or.kr", "org.au", "org.cn", "org.in", "org.uk", "sch.uk",
    "blogspot.com", "firebaseapp.com", "github.io", "gitlab.io", "glitch.me",
    "herokuapp.com", "netlify.app", "onrender.com", "pages.dev", "r2.dev",
    "vercel.app", "web.app", "workers.dev",
  ]

  /// Lowercases, drops a fully-qualified trailing dot, and rejects anything a
  /// content-rule-list `url-filter` could not match literally. An IDN host has
  /// to already be punycode to be allow-listable at all.
  static func normalizedHost(_ host: String?) -> String? {
    guard var value = host?.lowercased() else { return nil }
    while value.hasSuffix(".") { value.removeLast() }
    guard !value.isEmpty, value.count <= 253 else { return nil }
    guard value.allSatisfy(asciiHostCharacters.contains) else { return nil }
    guard !value.hasPrefix("."), !value.contains("..") else { return nil }
    guard !value.hasPrefix("-"), !value.hasSuffix("-") else { return nil }
    return value
  }

  /// True for a bare registry suffix nobody can own a cookie for: a single
  /// label ("com"), or one of the multi-label suffixes listed above.
  static func isPublicSuffix(_ host: String) -> Bool {
    guard let normalized = normalizedHost(host) else { return true }
    if !normalized.contains(".") { return true }
    return knownMultiLabelPublicSuffixes.contains(normalized)
  }

  /// The host a solve is pinned to, or nil when this url can never be solved
  /// safely. A bare registry label ("com") is refused so a malformed challenge
  /// url cannot widen the allow-list to an entire suffix.
  static func challengeHost(for url: URL) -> String? {
    guard url.scheme?.lowercased() == "https" else { return nil }
    guard urlCarriesNoCredentials(url) else { return nil }
    guard let host = normalizedHost(url.host) else { return nil }
    guard host.contains(".") else { return nil }
    guard !NemuNativeHttpAddressPolicy.isNumericHostname(host) else { return nil }
    guard !NemuNativeHttpAddressPolicy.isForbiddenHostname(host) else { return nil }
    return host
  }

  static func urlCarriesNoCredentials(_ url: URL) -> Bool {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return false
    }
    return components.user == nil && components.password == nil
  }

  /// `host` is `tree` itself or a subdomain of it. Only cookie-domain coverage
  /// uses this now; the request allow-list is exact-host.
  static func isWithin(_ host: String, tree: String) -> Bool {
    host == tree || host.hasSuffix(".\(tree)")
  }

  /// Every request the web content is allowed to make: the one validated
  /// challenge host, or Cloudflare's challenge platform. Exact hosts only.
  static func allowsSubresource(_ url: URL, challengeHost: String) -> Bool {
    guard let host = allowableHost(of: url) else { return false }
    return host == challengeHost || host == challengePlatformHost
  }

  /// Main-frame navigation is narrower still: it must stay on the challenge
  /// host. Cloudflare's platform host only ever loads as a subframe or a
  /// subresource, so a top-level hop onto it — or anywhere else — is a redirect
  /// away from the challenge and must not be followed.
  static func allowsMainFrameNavigation(_ url: URL, challengeHost: String) -> Bool {
    guard let host = allowableHost(of: url) else { return false }
    return host == challengeHost
  }

  /// Inert helper frames the challenge widget creates for itself (`about:blank`,
  /// `about:srcdoc`). They have no origin and load nothing on their own; every
  /// subresource they request still goes through the rule list and
  /// `allowsSubresource`. Refusing them stalls the widget at "Verifying…".
  /// Anything else spelled `about:` — including `about:blank#…`, which carries
  /// attacker-chosen text into the frame's url — fails closed.
  static func isInertFrameURL(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "about" else { return false }
    let rest = url.absoluteString.dropFirst("about:".count).lowercased()
    return rest == "blank" || rest == "srcdoc"
  }

  /// `blob:` and `data:` loads never leave the page: a blob is same-origin
  /// memory the document created itself and a data url is inline. The challenge
  /// widget runs its proof-of-work in a `blob:` worker, so refusing them stalls
  /// it. Never honoured for the main frame.
  static func isInertResourceURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else { return false }
    return inertResourceSchemes.contains(scheme)
  }

  /// A subframe navigation: an inert `about:` frame, an inert in-page scheme,
  /// or a url the subresource rule allows. Never used for the main frame.
  static func allowsSubframeNavigation(_ url: URL, challengeHost: String) -> Bool {
    isInertFrameURL(url)
      || isInertResourceURL(url)
      || allowsSubresource(url, challengeHost: challengeHost)
  }

  /// The single decision every WebKit policy callback asks for, mirroring the
  /// Kotlin twin's `allowsRequest`. Both the navigation-action phase and the
  /// navigation-response phase route through it, so a subframe cannot be
  /// admitted by one phase and judged by a different rule in the other.
  static func allowsRequest(
    isForMainFrame: Bool,
    url: URL,
    challengeHost: String
  ) -> Bool {
    isForMainFrame
      ? allowsMainFrameNavigation(url, challengeHost: challengeHost)
      : allowsSubframeNavigation(url, challengeHost: challengeHost)
  }

  private static func allowableHost(of url: URL) -> String? {
    guard url.scheme?.lowercased() == "https" else { return nil }
    // Same rule as the Kotlin twin's `allowableHost`: a url carrying
    // credentials would hand them to the challenge host on the WebView's first
    // request, and `challengeHost(for:)` already refuses them for the target.
    guard urlCarriesNoCredentials(url) else { return nil }
    guard let host = normalizedHost(url.host) else { return nil }
    guard !NemuNativeHttpAddressPolicy.isNumericHostname(host) else { return nil }
    guard !NemuNativeHttpAddressPolicy.isForbiddenHostname(host) else { return nil }
    return host
  }

  static func isChallengePlatformPath(_ url: URL) -> Bool {
    url.path.hasPrefix(challengePlatformPathPrefix)
  }

  /// A cookie may only be adopted when its domain covers the challenge host,
  /// i.e. the host itself or one of its parents. Third-party cookies (including
  /// the Cloudflare platform host's own) never reach the source's jar, and a
  /// registry suffix is not a parent: `co.uk` does not cover `reader.co.uk`.
  /// The suffix check is best-effort — see `knownMultiLabelPublicSuffixes`.
  static func cookieDomainCoversChallengeHost(_ domain: String, challengeHost: String) -> Bool {
    var value = domain.lowercased()
    while value.hasPrefix(".") { value.removeFirst() }
    guard let normalized = normalizedHost(value) else { return false }
    guard !isPublicSuffix(normalized) else { return false }
    return isWithin(challengeHost, tree: normalized)
  }

  // MARK: - Cookie-jar diffing

  /// Ordered `name=value` pairs of a `Cookie:`-style header. The first spelling
  /// of a name wins, which is what a server reads off the wire. Pairs without a
  /// `=`, or with an empty name, are dropped.
  static func cookiePairs(in header: String) -> [(name: String, value: String)] {
    var seen = Set<String>()
    var pairs: [(name: String, value: String)] = []
    for piece in header.split(separator: ";") {
      let trimmed = piece.trimmingCharacters(in: .whitespaces)
      guard let separator = trimmed.firstIndex(of: "=") , separator != trimmed.startIndex else {
        continue
      }
      let name = String(trimmed[trimmed.startIndex..<separator])
        .trimmingCharacters(in: .whitespaces)
      guard !name.isEmpty, !seen.contains(name) else { continue }
      seen.insert(name)
      let value = String(trimmed[trimmed.index(after: separator)...])
        .trimmingCharacters(in: .whitespaces)
      pairs.append((name: name, value: value))
    }
    return pairs
  }

  /// The pairs in `after` that `before` did not already carry with the same
  /// value, rendered back as a `Cookie:` header.
  ///
  /// The Android solver needs this because its `CookieManager` is process-wide:
  /// whatever the pre-solve expiry sweep failed to remove (a `Domain=.parent`
  /// or `Path=/x` cookie some *other* scope's earlier solve left behind) is
  /// still readable when this solve finishes, and adopting it would move one
  /// source's session into another's jar. Diffing against the header as it
  /// stood at the start of this solve means only what this solve actually
  /// produced is adopted.
  static func newOrChangedCookieHeader(before: String, after: String) -> String {
    var baseline: [String: String] = [:]
    for pair in cookiePairs(in: before) { baseline[pair.name] = pair.value }
    let fresh = cookiePairs(in: after).filter { baseline[$0.name] != $0.value }
    return fresh.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
  }

  /// Every `Domain=` spelling a cookie readable by `host` could have been set
  /// with, narrowest first: the host itself (a host-only cookie, written with
  /// no `Domain` attribute at all — represented by `nil`), then `.host` and
  /// each parent up to, but never including, a registry suffix.
  ///
  /// A cookie's identity is (name, domain, path), so expiring `name=` at
  /// `https://host/` alone leaves every `Domain=.parent` sibling in place.
  static func cookieExpiryDomains(for host: String) -> [String?] {
    guard let normalized = normalizedHost(host), normalized.contains(".") else { return [nil] }
    var domains: [String?] = [nil]
    let labels = normalized.split(separator: ".").map(String.init)
    for index in 0..<labels.count {
      let candidate = labels[index...].joined(separator: ".")
      if !candidate.contains(".") || isPublicSuffix(candidate) { break }
      domains.append(".\(candidate)")
    }
    return domains
  }

  /// Every `Path=` a cookie set during this solve could plausibly be scoped to,
  /// from `/` down to the url's own path. Bounded: a path deeper than
  /// `maxCookieExpiryPathSegments` is truncated rather than enumerated.
  static let maxCookieExpiryPathSegments = 8

  static func cookieExpiryPaths(for path: String) -> [String] {
    var paths = ["/"]
    let segments = path.split(separator: "/").prefix(maxCookieExpiryPathSegments)
    var current = ""
    for segment in segments {
      current += "/\(segment)"
      paths.append(current)
    }
    return paths
  }

  // MARK: - Compiled allow-list

  /// WebKit's `url-filter` accepts only a small regex subset: no lookahead, no
  /// non-capturing groups and no alternation (`a|b` fails compilation with
  /// "Disjunctions are not supported"), so the pattern is built from plain
  /// groups and character classes only.
  ///
  /// The authority is pinned exactly: after the host the pattern demands either
  /// `/` or `:<digits>/`, which is the only shape a real origin can take. That
  /// is what keeps a userinfo url out — `https://reader.example.com@evil.test/`
  /// and `https://reader.example.com:pw@evil.test/` both fail the `(:[0-9]+)?/`
  /// tail even though they *start* with the allow-listed host — and it is also
  /// why `https://evil.test/?u=https://reader.example.com/` cannot match: `^`
  /// anchors the pattern at the start of the url. WebKit always hands the
  /// matcher a url with at least a `/` path, so requiring the delimiter never
  /// rejects a bare origin.
  static func exactHostURLFilter(_ host: String) -> String {
    let escaped = host.replacingOccurrences(of: ".", with: "\\.")
    return "^https://\(escaped)(:[0-9]+)?/"
  }

  /// Blocks every request, then re-allows exactly the two hosts over https.
  /// WebKit evaluates rules in order, so the trailing `ignore-previous-rules`
  /// entries are the entire allow-list. Serialized with `JSONSerialization` so
  /// the regex backslashes are escaped correctly.
  ///
  /// No trigger carries a `resource-type`, which in WebKit means "every
  /// resource type": documents, subresources, `fetch`, `ping`, WebSocket
  /// handshakes and service-worker loads are all subject to these rules.
  static func contentRuleListJSON(challengeHost: String) -> String? {
    guard let challengeHost = normalizedHost(challengeHost) else { return nil }
    var rules: [[String: Any]] = [
      ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
    ]
    for host in [challengeHost, challengePlatformHost] {
      rules.append([
        "trigger": ["url-filter": exactHostURLFilter(host)],
        "action": ["type": "ignore-previous-rules"],
      ])
    }
    // `blob:` and `data:` loads never leave the page: a blob is same-origin
    // memory the document created itself and a data url is inline. The
    // challenge widget runs its proof-of-work in a `blob:` worker, so blocking
    // them leaves it spinning forever without ever touching the network.
    for scheme in inertResourceSchemes {
      rules.append([
        "trigger": ["url-filter": "^\(scheme):"],
        "action": ["type": "ignore-previous-rules"],
      ])
    }
    guard
      let data = try? JSONSerialization.data(withJSONObject: rules, options: []),
      let json = String(data: data, encoding: .utf8)
    else {
      return nil
    }
    return json
  }
}

/// Hosts that answered one source's own requests with a Cloudflare mitigation.
///
/// **What this gate is for.** `solveCloudflare` renders a source-named url in
/// an in-app WebView with scripting on, so the url cannot be taken on the
/// isolate's word alone. The registry narrows the set of urls a source can aim
/// that WebView at from "any public https origin" down to "an origin this same
/// source reached in the last ten minutes, which answered with something that
/// looks like a Cloudflare mitigation".
///
/// **What it does not do.** It is a rate-and-relevance gate, not an
/// authorization check. A source chooses its own request targets, so it can
/// put a host in here on purpose simply by requesting it — a source that wants
/// `cdn.partner.example` solved need only fetch it first and have it answer
/// 403 behind Cloudflare. The header test below is a heuristic on
/// attacker-adjacent input (`server:` and `cf-mitigated:` are just strings the
/// remote sent), so any origin willing to send `server: cloudflare` with a 403
/// qualifies. What the registry actually guarantees is narrower and still
/// worth having: no source can have a host solved that *it* never talked to,
/// no source inherits another source's hosts, a recorded host expires, and the
/// jar a solve publishes into is the same jar the recording request used. The
/// thing that keeps a solved WebView from being useful as a probe is the
/// address policy plus the exact-host allow-list above, not this registry.
///
/// Keyed by the exact cookie scope the source's own requests are made under
/// (`<profileScope>::<registryId>:<sourceId>`), which is the same key
/// `NemuSyncHttpCoordinator.sessionContext(cookieScope:)` uses — so a
/// recorded host and the jar a solve publishes into always belong to the same
/// execution identity. No other spelling of the scope matches.
///
/// Bounded on both axes and monotonically timed, so it never grows and a
/// system clock change cannot extend an entry's life. Mirrors
/// `NemuCloudflareChallengeHostRegistry` in
/// `runtime/kotlin/NemuCloudflareChallengePolicy.kt`.
final class NemuCloudflareChallengeHostRegistry: @unchecked Sendable {
  static let maxHostsPerScopeDefault = 32
  static let maxScopesDefault = 128
  static let hostTTLDefault: TimeInterval = 10 * 60

  static let shared = NemuCloudflareChallengeHostRegistry()

  private let maxHostsPerScope: Int
  private let maxScopes: Int
  private let ttl: TimeInterval
  private let now: () -> TimeInterval
  private let lock = NSLock()
  private var scopes: [String: [String: TimeInterval]] = [:]

  init(
    maxHostsPerScope: Int = NemuCloudflareChallengeHostRegistry.maxHostsPerScopeDefault,
    maxScopes: Int = NemuCloudflareChallengeHostRegistry.maxScopesDefault,
    ttl: TimeInterval = NemuCloudflareChallengeHostRegistry.hostTTLDefault,
    now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }
  ) {
    self.maxHostsPerScope = maxHostsPerScope
    self.maxScopes = maxScopes
    self.ttl = ttl
    self.now = now
  }

  /// True when this response *looks like* Cloudflare turning the source's
  /// request away rather than the origin answering it: a 403/503 plus either
  /// Cloudflare's own `server` banner or the `cf-mitigated` marker.
  ///
  /// Both signals are remote-controlled strings, so this is a relevance filter,
  /// not proof of anything — it keeps ordinary 404s, 200s and non-Cloudflare
  /// 403s from filling the registry, and nothing more. Treat a `true` here as
  /// "this host is worth offering the user a solve for", never as "this host
  /// is safe to load".
  static func isMitigatedResponse(status: Int, headers: [String: String]) -> Bool {
    guard status == 403 || status == 503 else { return false }
    for (name, value) in headers {
      if name.caseInsensitiveCompare("cf-mitigated") == .orderedSame,
         !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return true
      }
      if name.caseInsensitiveCompare("server") == .orderedSame {
        let banner = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if banner == "cloudflare" || banner == "cloudflare-nginx" { return true }
      }
    }
    return false
  }

  /// Registry key for a cookie scope: the scope itself, matched verbatim.
  ///
  /// Callers pass the profile-scoped execution key
  /// (`<profileScope>::<registryId>:<sourceId>`) that the source's own
  /// requests are made under, which is also the key
  /// `sessionContext(cookieScope:)` uses for its jar. Only the same rules the
  /// HTTP path applies are enforced here; no other spelling matches.
  static func scopeKey(_ cookieScope: String?) -> String? {
    guard let trimmed = cookieScope?.trimmingCharacters(in: .whitespacesAndNewlines),
          !trimmed.isEmpty,
          trimmed.count <= 512,
          !trimmed.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    else {
      return nil
    }
    return trimmed
  }

  /// Records `host` when the status and headers say Cloudflare turned it away.
  func record(cookieScope: String?, host: String?, status: Int, headers: [String: String]) {
    guard Self.isMitigatedResponse(status: status, headers: headers) else { return }
    guard
      let scopeKey = Self.scopeKey(cookieScope),
      let normalizedHost = NemuCloudflareChallengePolicy.normalizedHost(host),
      normalizedHost.contains(".")
    else {
      return
    }
    lock.lock()
    defer { lock.unlock() }
    var hosts = prunedHosts(scopes[scopeKey] ?? [:])
    hosts[normalizedHost] = now()
    while hosts.count > maxHostsPerScope, let oldest = oldestKey(in: hosts) {
      hosts.removeValue(forKey: oldest)
    }
    scopes[scopeKey] = hosts
    while scopes.count > maxScopes, let staleScope = oldestScopeKey() {
      scopes.removeValue(forKey: staleScope)
    }
  }

  /// True when this scope reached `host` and the record has not expired.
  func allows(cookieScope: String?, host: String?) -> Bool {
    guard
      let scopeKey = Self.scopeKey(cookieScope),
      let normalizedHost = NemuCloudflareChallengePolicy.normalizedHost(host)
    else {
      return false
    }
    lock.lock()
    defer { lock.unlock() }
    guard let stored = scopes[scopeKey] else { return false }
    let hosts = prunedHosts(stored)
    if hosts.isEmpty {
      scopes.removeValue(forKey: scopeKey)
      return false
    }
    scopes[scopeKey] = hosts
    return hosts[normalizedHost] != nil
  }

  func clear() {
    lock.lock()
    scopes = [:]
    lock.unlock()
  }

  func clearScope(_ cookieScope: String?) {
    guard let scopeKey = Self.scopeKey(cookieScope) else { return }
    lock.lock()
    scopes.removeValue(forKey: scopeKey)
    lock.unlock()
  }

  func hostCountForTesting(_ cookieScope: String?) -> Int {
    guard let scopeKey = Self.scopeKey(cookieScope) else { return 0 }
    lock.lock()
    defer { lock.unlock() }
    return prunedHosts(scopes[scopeKey] ?? [:]).count
  }

  func scopeCountForTesting() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return scopes.count
  }

  private func prunedHosts(_ hosts: [String: TimeInterval]) -> [String: TimeInterval] {
    let deadline = now()
    return hosts.filter { deadline - $0.value < ttl }
  }

  private func oldestKey(in hosts: [String: TimeInterval]) -> String? {
    hosts.min { $0.value < $1.value }?.key
  }

  private func oldestScopeKey() -> String? {
    scopes.min { ($0.value.values.max() ?? 0) < ($1.value.values.max() ?? 0) }?.key
  }
}
