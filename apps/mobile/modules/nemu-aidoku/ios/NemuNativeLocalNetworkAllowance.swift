import Darwin
import Foundation

/**
 * Scoped allowance for self-hosted servers on the user's own network.
 *
 * Source packages are untrusted, so `NemuNativeHttpAddressPolicy` refuses every
 * private, loopback and reserved destination. A self-hosted source (LANraragi,
 * a Komga on the home server, ...) legitimately lives on exactly such an
 * address, so one narrow exception exists:
 *
 * - the endpoint (host + port) must come from a setting the *user* typed into
 *   that source's server-URL field. The host app derives it from its own
 *   settings store and hands it here; a package cannot call this API;
 * - it applies to that source's requests only, keyed by the source's cookie
 *   scope, so no other source can reach the endpoint;
 * - it covers that one host and port, not the subnet or the host's other ports;
 * - even for a granted endpoint, answers in loopback, unspecified, multicast,
 *   reserved and cloud-metadata space stay blocked, so a hostname the user
 *   typed cannot be turned (DNS rebinding) into a path to the device itself or
 *   to an instance-metadata service.
 */
struct NemuLocalNetworkEndpoint: Hashable {
  let host: String
  let port: Int
}

struct NemuLocalNetworkGrant {
  let endpoints: Set<NemuLocalNetworkEndpoint>

  static let none = NemuLocalNetworkGrant(endpoints: [])

  func allows(host: String, port: Int) -> Bool {
    return endpoints.contains(
      NemuLocalNetworkEndpoint(
        host: NemuNativeLocalNetworkAllowance.normalizeHost(host),
        port: port
      )
    )
  }

  /// Whether any port of `host` is granted. DNS answers are classified per
  /// host, before a port is known to every caller.
  func allowsHost(_ host: String) -> Bool {
    let normalized = NemuNativeLocalNetworkAllowance.normalizeHost(host)
    return endpoints.contains { $0.host == normalized }
  }
}

enum NemuNativeLocalNetworkAllowance {
  static let maxEndpointsPerScope = 4
  static let maxScopes = 64
  static let maxURLLength = 2_048

  private static let lock = NSLock()
  private static var grants: [String: NemuLocalNetworkGrant] = [:]
  private static var order: [String] = []

  static func normalizeHost(_ host: String) -> String {
    return host
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
      .trimmingCharacters(in: CharacterSet(charactersIn: "."))
      .lowercased()
  }

  /// The endpoint a user-typed server URL names, or nil when it must never be
  /// granted: not http(s), credentials in the URL, no host, loopback or
  /// metadata hosts, or an IP literal in loopback/unspecified/multicast/
  /// reserved/metadata space.
  static func endpoint(fromConfiguredURL value: String) -> NemuLocalNetworkEndpoint? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      !trimmed.isEmpty,
      trimmed.utf8.count <= maxURLLength,
      let components = URLComponents(string: trimmed),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      components.user == nil,
      components.password == nil,
      let rawHost = components.host
    else {
      return nil
    }
    let host = normalizeHost(rawHost)
    guard !host.isEmpty, !isNeverGrantableHostname(host) else { return nil }
    if NemuNativeHttpAddressPolicy.isNumericHostname(host) {
      guard
        let bytes = parseIPLiteral(host),
        isLocalNetworkAddress(bytes)
      else {
        return nil
      }
    }
    let port = components.port ?? (scheme == "https" ? 443 : 80)
    guard (1...65_535).contains(port) else { return nil }
    return NemuLocalNetworkEndpoint(host: host, port: port)
  }

  /// Replaces the source's grant. Returns the accepted endpoints as
  /// `host:port` strings. An empty result clears the grant.
  @discardableResult
  static func setGrant(scope: String, configuredURLs: [String]) -> [String] {
    let normalizedScope = scope.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedScope.isEmpty else { return [] }
    var endpoints = Set<NemuLocalNetworkEndpoint>()
    for value in configuredURLs {
      guard endpoints.count < maxEndpointsPerScope else { break }
      if let endpoint = endpoint(fromConfiguredURL: value) {
        endpoints.insert(endpoint)
      }
    }
    lock.lock()
    defer { lock.unlock() }
    if endpoints.isEmpty {
      grants.removeValue(forKey: normalizedScope)
      order.removeAll { $0 == normalizedScope }
      return []
    }
    if grants[normalizedScope] == nil {
      order.append(normalizedScope)
      while order.count > maxScopes {
        grants.removeValue(forKey: order.removeFirst())
      }
    }
    grants[normalizedScope] = NemuLocalNetworkGrant(endpoints: endpoints)
    return endpoints
      .map { "\($0.host):\($0.port)" }
      .sorted()
  }

  static func clearGrant(scope: String) {
    _ = setGrant(scope: scope, configuredURLs: [])
  }

  static func clearAllGrants() {
    lock.lock()
    grants.removeAll()
    order.removeAll()
    lock.unlock()
  }

  static func grant(forScope scope: String?) -> NemuLocalNetworkGrant {
    guard
      let scope = scope?.trimmingCharacters(in: .whitespacesAndNewlines),
      !scope.isEmpty
    else {
      return .none
    }
    lock.lock()
    defer { lock.unlock() }
    return grants[scope] ?? .none
  }

  /// Hostnames a grant can never name, whatever the user typed.
  static func isNeverGrantableHostname(_ host: String) -> Bool {
    return host == "localhost" ||
      host.hasSuffix(".localhost") ||
      host == "metadata" ||
      host == "metadata.goog" ||
      host.hasSuffix(".metadata.goog") ||
      host == "instance-data" ||
      host == "instance-data.ec2.internal" ||
      host == "metadata.aws.internal" ||
      host == "metadata.azure.internal"
  }

  /// Private answers a granted endpoint may resolve to: RFC 1918, shared
  /// (CGNAT, e.g. Tailscale), IPv4 link-local and IPv6 unique-local space.
  /// Loopback, unspecified, multicast, reserved space and the link-local
  /// addresses cloud providers use for instance metadata remain blocked.
  static func isLocalNetworkAddress(_ bytes: [UInt8]) -> Bool {
    switch bytes.count {
    case 4:
      return isLocalNetworkIPv4(bytes, offset: 0)
    case 16:
      if
        bytes.prefix(10).allSatisfy({ $0 == 0 }) &&
        bytes[10] == 0xff &&
        bytes[11] == 0xff
      {
        return isLocalNetworkIPv4(bytes, offset: 12)
      }
      return (bytes[0] & 0xfe) == 0xfc // fc00::/7 unique-local
    default:
      return false
    }
  }

  private static func isLocalNetworkIPv4(_ bytes: [UInt8], offset: Int) -> Bool {
    let first = Int(bytes[offset])
    let second = Int(bytes[offset + 1])
    let third = Int(bytes[offset + 2])
    let fourth = Int(bytes[offset + 3])
    if first == 10 { return true }
    if first == 172 && (16...31).contains(second) { return true }
    if first == 192 && second == 168 { return true }
    if first == 100 && (64...127).contains(second) { return true }
    if first == 169 && second == 254 {
      // 169.254.169.254 (AWS/GCP/Azure/OpenStack metadata) and 169.254.170.2
      // (ECS task credentials) must stay unreachable.
      if third == 169 && fourth == 254 { return false }
      if third == 170 && fourth == 2 { return false }
      return true
    }
    return false
  }

  /// Strict IPv4/IPv6 literal parser (no octal, short or decimal spellings).
  static func parseIPLiteral(_ value: String) -> [UInt8]? {
    if value.contains(":") {
      var address = in6_addr()
      guard inet_pton(AF_INET6, value, &address) == 1 else { return nil }
      return withUnsafeBytes(of: &address) { Array($0) }
    }
    let parts = value.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4 else { return nil }
    var bytes: [UInt8] = []
    for part in parts {
      guard
        !part.isEmpty,
        part.count <= 3,
        !(part.count > 1 && part.first == "0"),
        part.allSatisfy({ $0.isASCII && $0.isNumber }),
        let octet = UInt8(part)
      else {
        return nil
      }
      bytes.append(octet)
    }
    return bytes
  }
}
