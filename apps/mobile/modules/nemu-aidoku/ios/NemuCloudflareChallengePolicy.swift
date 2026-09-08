import Foundation

/// Pure network boundary for the on-demand Cloudflare solver's WebView.
///
/// Direct source HTTP is pinned behind `NemuNativeHttpAddressPolicy` plus the
/// authenticated loopback proxy, and a WKWebView cannot be routed through that
/// gate for every subresource, redirect, or worker fetch. The solver therefore
/// gets its own, strictly narrower boundary, enforced twice: once by a compiled
/// `WKContentRuleList` (every request the web content makes) and again in
/// `decidePolicyFor` (main-frame navigations). Only two host trees are ever
/// reachable, always over https:
///
/// 1. the challenge host and its subdomains, and
/// 2. Cloudflare's challenge platform (`challenges.cloudflare.com`, plus the
///    `/cdn-cgi/challenge-platform/` paths the challenge host serves itself).
///
/// Address literals, private/forbidden hostnames, non-ASCII (non-punycode)
/// hosts, credentials in the url, and every non-https scheme fail closed.
enum NemuCloudflareChallengePolicy {
  /// Cloudflare serves interstitial and Turnstile widget assets from here.
  static let challengePlatformHost = "challenges.cloudflare.com"

  /// The orchestration path the challenge host itself serves. Already inside
  /// the challenge host tree; kept explicit so the allow-list documents both
  /// halves of the challenge platform.
  static let challengePlatformPathPrefix = "/cdn-cgi/challenge-platform/"

  /// Schemes that resolve inside the page without a network destination.
  static let inertResourceSchemes = ["blob", "data"]

  private static let asciiHostCharacters = Set("abcdefghijklmnopqrstuvwxyz0123456789-.")

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

  /// The host tree a solve is pinned to, or nil when this url can never be
  /// solved safely. A bare registry label ("com") is refused so a malformed
  /// challenge url cannot widen the allow-list to an entire suffix.
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

  /// `host` is `tree` itself or a subdomain of it.
  static func isWithin(_ host: String, tree: String) -> Bool {
    host == tree || host.hasSuffix(".\(tree)")
  }

  /// Every request the web content is allowed to make.
  static func allowsSubresource(_ url: URL, challengeHost: String) -> Bool {
    guard let host = allowableHost(of: url) else { return false }
    return isWithin(host, tree: challengeHost) || isWithin(host, tree: challengePlatformHost)
  }

  /// Main-frame navigation is narrower still: it must stay inside the challenge
  /// host tree. Cloudflare's platform host only ever loads as a subframe or a
  /// subresource, so a top-level hop onto it — or anywhere else — is a redirect
  /// away from the challenge and must not be followed.
  static func allowsMainFrameNavigation(_ url: URL, challengeHost: String) -> Bool {
    guard let host = allowableHost(of: url) else { return false }
    return isWithin(host, tree: challengeHost)
  }

  /// Inert helper frames the challenge widget creates for itself (`about:blank`,
  /// `about:srcdoc`). They have no origin and load nothing on their own; every
  /// subresource they request still goes through the rule list and
  /// `allowsSubresource`. Refusing them stalls the widget at "Verifying…".
  static func isInertFrameURL(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "about" else { return false }
    let rest = url.absoluteString.dropFirst("about:".count).lowercased()
    return rest == "blank" || rest == "srcdoc"
  }

  /// A subframe navigation: an inert `about:` frame, or a url the subresource
  /// rule allows. Never used for the main frame.
  static func allowsSubframeNavigation(_ url: URL, challengeHost: String) -> Bool {
    isInertFrameURL(url) || allowsSubresource(url, challengeHost: challengeHost)
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
  /// the Cloudflare platform host's own) never reach the source's jar.
  static func cookieDomainCoversChallengeHost(_ domain: String, challengeHost: String) -> Bool {
    var value = domain.lowercased()
    while value.hasPrefix(".") { value.removeFirst() }
    guard let normalized = normalizedHost(value), normalized.contains(".") else { return false }
    return isWithin(challengeHost, tree: normalized)
  }

  /// WebKit's `url-filter` accepts only a small regex subset: no lookahead, no
  /// non-capturing groups and no alternation (`a|b` fails compilation with
  /// "Disjunctions are not supported"), so the pattern is built from plain
  /// groups and character classes only. `[a-z0-9.-]` cannot match `/`, `:` or
  /// `?`, which is what keeps the optional subdomain prefix from reaching past
  /// the authority into a path or query (`https://evil.example/?u=https://host/`).
  /// The trailing `[:/]` stops `https://evil-host.example` from matching the
  /// `host.example` tree; WebKit always hands the matcher a URL with at least
  /// a `/` path, so requiring the delimiter never rejects a bare origin.
  static func hostTreeURLFilter(_ host: String) -> String {
    let escaped = host.replacingOccurrences(of: ".", with: "\\.")
    return "^https://([a-z0-9.-]*\\.)?\(escaped)[:/]"
  }

  /// Blocks every request, then re-allows exactly the two host trees over
  /// https. WebKit evaluates rules in order, so the trailing
  /// `ignore-previous-rules` entries are the entire allow-list. Serialized with
  /// `JSONSerialization` so the regex backslashes are escaped correctly.
  static func contentRuleListJSON(challengeHost: String) -> String? {
    guard let challengeHost = normalizedHost(challengeHost) else { return nil }
    var rules: [[String: Any]] = [
      ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
    ]
    for tree in [challengeHost, challengePlatformHost] {
      rules.append([
        "trigger": ["url-filter": hostTreeURLFilter(tree)],
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
/// `solveCloudflare` renders a source-named url in an in-app WebView, so the
/// url cannot be taken on the isolate's word alone: a hostile source package
/// could otherwise name any public https origin and have it loaded with
/// scripting on. Only hosts this source actually talked to — and only
/// recently — can be solved.
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

  /// True when this response is Cloudflare turning the source's request away
  /// rather than the origin answering it. Deliberately narrow: a 403/503 plus
  /// either Cloudflare's own `server` banner or the `cf-mitigated` marker.
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
