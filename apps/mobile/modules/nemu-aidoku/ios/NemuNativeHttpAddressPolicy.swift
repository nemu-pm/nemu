import Darwin
import Foundation

enum NemuNativeHttpAddressPolicyError: Error, LocalizedError {
  case invalidURL
  case blockedDestination
  case unresolvedHost

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "Only HTTP and HTTPS source URLs are allowed."
    case .blockedDestination:
      return "Native source networking blocked a private or reserved destination."
    case .unresolvedHost:
      return "Network unavailable or source host could not be resolved safely."
    }
  }
}

/**
 * Address policy for untrusted source-package networking.
 *
 * Every source destination is resolved inside Nemu's authenticated loopback
 * proxy. Private and reserved answers are removed, and at least one public
 * answer must remain. The proxy then opens a socket to one of those exact IP
 * literals, so filtered answers cannot be selected and no second resolver
 * lookup can rebind the connection after validation. URLSession's metrics are
 * retained as a fail-closed assertion that every transaction used that
 * loopback proxy instead of contacting an origin directly.
 */
enum NemuNativeHttpAddressPolicy {
  typealias Resolver = (String) throws -> [[UInt8]]

  private static let validationQueue = DispatchQueue(
    label: "pm.nemu.native-http-address-policy",
    qos: .utility,
    attributes: .concurrent
  )

  static func validatedURL(_ value: String) throws -> URL {
    guard
      let url = URL(string: value),
      let scheme = url.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      url.host?.isEmpty == false
    else {
      throw NemuNativeHttpAddressPolicyError.invalidURL
    }
    try validate(url: url)
    return url
  }

  /// URL.port omits a scheme's default port. Compare effective ports so a
  /// canonical redirect between `https://host` and `https://host:443` (or
  /// HTTP/80) remains same-origin without weakening cross-port isolation.
  static func effectivePort(for url: URL?) -> Int? {
    guard let url else { return nil }
    if let port = url.port { return port }
    switch url.scheme?.lowercased() {
    case "https": return 443
    case "http": return 80
    default: return nil
    }
  }

  static func validate(url: URL) throws {
    try validate(url: url, resolver: resolveAddresses)
  }

  static func validateAsync(
    url: URL,
    completion: @escaping @Sendable (Bool) -> Void
  ) {
    validationQueue.async {
      do {
        try validate(url: url)
        completion(true)
      } catch {
        completion(false)
      }
    }
  }

  static func validate(url: URL, resolver: Resolver) throws {
    guard let host = url.host else {
      throw NemuNativeHttpAddressPolicyError.invalidURL
    }
    _ = try validatedAddresses(hostname: host, resolver: resolver)
  }

  static func validatedAddresses(hostname: String) throws -> [[UInt8]] {
    try validatedAddresses(hostname: hostname, resolver: resolveAddresses)
  }

  static func validatedAddresses(
    hostname: String,
    resolver: Resolver
  ) throws -> [[UInt8]] {
    let normalized = normalizeHostname(hostname)
    guard !isForbiddenHostname(normalized) else {
      throw NemuNativeHttpAddressPolicyError.blockedDestination
    }

    let addresses: [[UInt8]]
    do {
      addresses = try resolver(normalized)
    } catch let error as NemuNativeHttpAddressPolicyError {
      throw error
    } catch {
      throw NemuNativeHttpAddressPolicyError.unresolvedHost
    }
    guard !addresses.isEmpty else {
      throw NemuNativeHttpAddressPolicyError.unresolvedHost
    }
    let allowProxySyntheticAddresses = !isNumericHostname(normalized)
    let validatedAddresses = addresses.filter { address in
      isPublicAddress(address) ||
        (allowProxySyntheticAddresses && isProxySyntheticAddress(address))
    }
    guard !validatedAddresses.isEmpty else {
      throw NemuNativeHttpAddressPolicyError.blockedDestination
    }
    return validatedAddresses
  }

  /// Fail-closed defense in depth for the explicit proxy configuration. The
  /// pre-send guarantee comes from the loopback proxy connecting to a validated
  /// IP literal; this gate prevents a response from crossing into a source if a
  /// future URLSession behavior change ever bypasses that configured proxy.
  static func validateLoopbackProxy(
    remoteAddress: String?,
    remotePort: Int?,
    isProxyConnection: Bool,
    requestScheme: String?,
    expectedPort: UInt16?
  ) throws {
    guard
      // Legacy CFNetwork reports absolute-form HTTP proxy transactions as
      // non-proxy even though remoteAddress/remotePort identify our listener.
      // HTTPS (including CONNECT) must still carry the explicit proxy bit.
      isProxyConnection || requestScheme?.lowercased() == "http",
      let expectedPort,
      remotePort == Int(expectedPort),
      let remoteAddress
    else {
      throw NemuNativeHttpAddressPolicyError.blockedDestination
    }

    var literal = remoteAddress
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    if let zoneIndex = literal.firstIndex(of: "%") {
      literal = String(literal[..<zoneIndex])
    }

    guard literal == "127.0.0.1" || literal == "::1" else {
      throw NemuNativeHttpAddressPolicyError.blockedDestination
    }
  }

  static func isForbiddenHostname(_ hostname: String) -> Bool {
    let normalized = normalizeHostname(hostname)
    if normalized.isEmpty { return true }
    if
      normalized == "localhost" ||
      normalized.hasSuffix(".localhost") ||
      normalized == "local" ||
      normalized.hasSuffix(".local") ||
      normalized == "localdomain" ||
      normalized.hasSuffix(".localdomain") ||
      normalized == "internal" ||
      normalized.hasSuffix(".internal") ||
      normalized == "home.arpa" ||
      normalized.hasSuffix(".home.arpa")
    {
      return true
    }

    return normalized == "metadata" ||
      normalized == "metadata.goog" ||
      normalized.hasSuffix(".metadata.goog") ||
      normalized == "instance-data" ||
      normalized == "instance-data.ec2.internal" ||
      normalized == "metadata.aws.internal" ||
      normalized == "metadata.azure.internal"
  }

  static func isNumericHostname(_ hostname: String) -> Bool {
    if hostname.contains(":") { return true }
    return !hostname.isEmpty && hostname.allSatisfy { character in
      character.isNumber || character == "."
    }
  }

  /// Surge and compatible TUN proxies synthesize DNS answers from RFC 2544's
  /// benchmarking range. These remain non-public everywhere else and are only
  /// eligible when they came from resolving a non-numeric hostname.
  static func isProxySyntheticAddress(_ bytes: [UInt8]) -> Bool {
    return bytes.count == 4 && bytes[0] == 198 && (18...19).contains(Int(bytes[1]))
  }

  static func isPublicAddress(_ bytes: [UInt8]) -> Bool {
    switch bytes.count {
    case 4:
      return isPublicIPv4(bytes, offset: 0)
    case 16:
      return isPublicIPv6(bytes)
    default:
      return false
    }
  }

  private static func isPublicIPv4(_ bytes: [UInt8], offset: Int) -> Bool {
    let first = Int(bytes[offset])
    let second = Int(bytes[offset + 1])
    let third = Int(bytes[offset + 2])
    let fourth = Int(bytes[offset + 3])

    if first == 0 || first == 10 || first == 127 || first >= 224 { return false }
    if first == 100 && (64...127).contains(second) { return false }
    if first == 169 && second == 254 { return false }
    if first == 172 && (16...31).contains(second) { return false }
    if first == 192 && second == 0 && third == 0 && fourth != 9 && fourth != 10 {
      return false
    }
    if first == 192 && second == 0 && third == 2 { return false }
    if first == 192 && second == 88 && third == 99 && fourth != 2 { return false }
    if first == 192 && second == 168 { return false }
    if first == 198 && (18...19).contains(second) { return false }
    if first == 198 && second == 51 && third == 100 { return false }
    if first == 203 && second == 0 && third == 113 { return false }
    return true
  }

  private static func isPublicIPv6(_ bytes: [UInt8]) -> Bool {
    if
      bytes.prefix(10).allSatisfy({ $0 == 0 }) &&
      bytes[10] == 0xff &&
      bytes[11] == 0xff
    {
      return isPublicIPv4(bytes, offset: 12)
    }

    if
      bytes[0] == 0x00 &&
      bytes[1] == 0x64 &&
      bytes[2] == 0xff &&
      bytes[3] == 0x9b &&
      bytes[4..<12].allSatisfy({ $0 == 0 })
    {
      return isPublicIPv4(bytes, offset: 12)
    }

    // Only currently allocated global-unicast space is eligible. This excludes
    // unspecified, loopback, ULA, link/site-local, multicast and reserved space.
    if (bytes[0] & 0xe0) != 0x20 { return false } // 2000::/3

    if bytes[0] == 0x20 && bytes[1] == 0x02 {
      return isPublicIPv4(bytes, offset: 2) // 6to4 embedded IPv4
    }
    if bytes[0] == 0x3f && bytes[1] == 0xff && (bytes[2] & 0xf0) == 0 {
      return false // 3fff::/20 documentation space
    }
    if bytes[0] == 0x20 && bytes[1] == 0x01 {
      let third = bytes[2]
      let fourth = bytes[3]
      if third == 0x00 && fourth == 0x00 { return false } // Teredo special range
      if third == 0x00 && fourth == 0x02 && bytes[4] == 0 && bytes[5] == 0 {
        return false // benchmarking
      }
      if third == 0x0d && fourth == 0xb8 { return false } // documentation
      if third == 0x00 && [UInt8(0x10), 0x20, 0x30].contains(fourth & 0xf0) {
        return false // ORCHID/ORCHIDv2/Drone DETs
      }
    }
    return true
  }

  private static func resolveAddresses(_ hostname: String) throws -> [[UInt8]] {
    var hints = addrinfo()
    hints.ai_family = AF_UNSPEC
    hints.ai_socktype = SOCK_STREAM
    hints.ai_protocol = IPPROTO_TCP

    var head: UnsafeMutablePointer<addrinfo>?
    let status = hostname.withCString { pointer in
      getaddrinfo(pointer, nil, &hints, &head)
    }
    guard status == 0, let first = head else {
      throw NemuNativeHttpAddressPolicyError.unresolvedHost
    }
    defer { freeaddrinfo(first) }

    var output: [[UInt8]] = []
    var current: UnsafeMutablePointer<addrinfo>? = first
    while let pointer = current {
      let info = pointer.pointee
      if info.ai_family == AF_INET, let address = info.ai_addr {
        var value = UnsafeRawPointer(address)
          .assumingMemoryBound(to: sockaddr_in.self)
          .pointee
          .sin_addr
        output.append(withUnsafeBytes(of: &value) { Array($0) })
      } else if info.ai_family == AF_INET6, let address = info.ai_addr {
        var value = UnsafeRawPointer(address)
          .assumingMemoryBound(to: sockaddr_in6.self)
          .pointee
          .sin6_addr
        output.append(withUnsafeBytes(of: &value) { Array($0) })
      }
      current = info.ai_next
    }
    return output
  }

  private static func normalizeHostname(_ hostname: String) -> String {
    return hostname
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
      .trimmingCharacters(in: CharacterSet(charactersIn: "."))
      .lowercased()
  }
}

/// Orders URLSession's completion-handler and metrics callbacks without
/// assuming which one Foundation delivers first. A response waiter is released
/// only after all transaction peers have been accepted; unregistering a task
/// releases retained work fail-closed.
final class NemuNativeHttpPeerValidationGate: @unchecked Sendable {
  private enum State {
    case awaitingMetrics
    case allowed
    case blocked
  }

  private typealias Waiter = @Sendable (Bool) -> Void

  private let lock = NSLock()
  private var states: [Int: State] = [:]
  private var waiters: [Int: [Waiter]] = [:]

  func register(taskIdentifier: Int) {
    lock.lock()
    states[taskIdentifier] = .awaitingMetrics
    lock.unlock()
  }

  func afterValidation(
    taskIdentifier: Int,
    completion: @escaping @Sendable (Bool) -> Void
  ) {
    let immediateResult: Bool?
    lock.lock()
    switch states[taskIdentifier] {
    case .allowed:
      immediateResult = true
    case .blocked, nil:
      immediateResult = false
    case .awaitingMetrics:
      waiters[taskIdentifier, default: []].append(completion)
      immediateResult = nil
    }
    lock.unlock()

    if let immediateResult { completion(immediateResult) }
  }

  func resolve(taskIdentifier: Int, isAllowed: Bool) {
    let callbacks: [Waiter]
    lock.lock()
    guard states[taskIdentifier] != nil else {
      lock.unlock()
      return
    }
    states[taskIdentifier] = isAllowed ? .allowed : .blocked
    callbacks = waiters.removeValue(forKey: taskIdentifier) ?? []
    lock.unlock()

    for callback in callbacks { callback(isAllowed) }
  }

  func unregister(taskIdentifier: Int) {
    let callbacks: [Waiter]
    lock.lock()
    states.removeValue(forKey: taskIdentifier)
    callbacks = waiters.removeValue(forKey: taskIdentifier) ?? []
    lock.unlock()

    for callback in callbacks { callback(false) }
  }
}
