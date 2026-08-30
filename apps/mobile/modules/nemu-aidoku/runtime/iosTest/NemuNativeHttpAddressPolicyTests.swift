import Darwin
import Foundation

@main
enum NemuNativeHttpAddressPolicyTests {
  static func main() throws {
    [
      "1.1.1.1",
      "8.8.8.8",
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
    ].forEach { expectPublic($0) }

    [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "100.100.100.200",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "::",
      "::1",
      "fc00::1",
      "fd00:ec2::254",
      "fe80::1",
      "2001:2::1",
      "2001:db8::1",
      "3fff::1",
      "ff02::1",
    ].forEach { expectBlocked($0) }

    expectBlocked("2002:7f00:1::")
    expectPublic("2002:0808:0808::")

    try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
      remoteAddress: "127.0.0.1",
      remotePort: 47_123,
      isProxyConnection: true,
      requestScheme: "https",
      expectedPort: 47_123
    )
    try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
      remoteAddress: "[::1]",
      remotePort: 47_123,
      isProxyConnection: true,
      requestScheme: "https",
      expectedPort: 47_123
    )
    expectPolicyFailure("direct proxy bypass") {
      try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
        remoteAddress: "1.1.1.1",
        remotePort: 443,
        isProxyConnection: false,
        requestScheme: "https",
        expectedPort: 47_123
      )
    }
    expectPolicyFailure("non-loopback proxy") {
      try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
        remoteAddress: "1.1.1.1",
        remotePort: 47_123,
        isProxyConnection: true,
        requestScheme: "https",
        expectedPort: 47_123
      )
    }
    expectPolicyFailure("wrong loopback proxy port") {
      try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
        remoteAddress: "127.0.0.1",
        remotePort: 47_124,
        isProxyConnection: true,
        requestScheme: "https",
        expectedPort: 47_123
      )
    }
    try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
      remoteAddress: "127.0.0.1",
      remotePort: 47_123,
      isProxyConnection: false,
      requestScheme: "http",
      expectedPort: 47_123
    )
    expectPolicyFailure("HTTPS missing proxy flag") {
      try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
        remoteAddress: "127.0.0.1",
        remotePort: 47_123,
        isProxyConnection: false,
        requestScheme: "https",
        expectedPort: 47_123
      )
    }

    let gate = NemuNativeHttpPeerValidationGate()
    let gateResults = LockedBoolResults()
    gate.register(taskIdentifier: 1)
    gate.afterValidation(taskIdentifier: 1) { gateResults.append($0) }
    precondition(gateResults.values().isEmpty, "Response must wait for peer metrics.")
    gate.resolve(taskIdentifier: 1, isAllowed: true)
    precondition(gateResults.values() == [true], "Allowed peer must release response.")
    gate.afterValidation(taskIdentifier: 1) { gateResults.append($0) }
    precondition(gateResults.values() == [true, true], "Resolved gate must be immediate.")
    gate.register(taskIdentifier: 2)
    gate.afterValidation(taskIdentifier: 2) { gateResults.append($0) }
    gate.unregister(taskIdentifier: 2)
    precondition(
      gateResults.values() == [true, true, false],
      "Unregister must release pending response fail-closed."
    )

    let publicAddress = addressBytes("1.1.1.1")
    let privateAddress = addressBytes("192.168.0.1")
    let publicURL = URL(string: "https://source.example/path")!
    try NemuNativeHttpAddressPolicy.validate(url: publicURL) { _ in
      [publicAddress]
    }
    let validatedAddresses = try NemuNativeHttpAddressPolicy.validatedAddresses(
      hostname: "source.example",
      resolver: { _ in [publicAddress] }
    )
    precondition(validatedAddresses == [publicAddress])
    expectPolicyFailure("mixed DNS answers") {
      try NemuNativeHttpAddressPolicy.validate(url: publicURL) { _ in
        [publicAddress, privateAddress]
      }
    }

    var resolverCalled = false
    expectPolicyFailure("metadata hostname") {
      try NemuNativeHttpAddressPolicy.validate(
        url: URL(string: "http://metadata.google.internal/latest")!
      ) { _ in
        resolverCalled = true
        return [publicAddress]
      }
    }
    precondition(!resolverCalled, "Forbidden hostnames must be rejected before DNS.")

    precondition(
      NemuNativeHttpAddressPolicy.effectivePort(
        for: URL(string: "https://source.example/path")!
      ) == 443
    )
    precondition(
      NemuNativeHttpAddressPolicy.effectivePort(
        for: URL(string: "https://source.example:443/path")!
      ) == 443
    )
    precondition(
      NemuNativeHttpAddressPolicy.effectivePort(
        for: URL(string: "http://source.example/path")!
      ) == 80
    )
    precondition(
      NemuNativeHttpAddressPolicy.effectivePort(
        for: URL(string: "https://source.example:8443/path")!
      ) == 8443
    )

    let credential = "test-token"
    let connect = try NemuNativeHttpProxyRequest.parse(
      Data(
        (
          "CONNECT source.example:443 HTTP/1.1\r\n" +
          "Host: source.example:443\r\n" +
          "Proxy-Authorization: Basic \(credential)\r\n\r\n"
        ).utf8
      ),
      expectedBasicToken: credential
    )
    precondition(connect.host == "source.example")
    precondition(connect.port == 443)
    precondition(connect.isTunnel)

    let forward = try NemuNativeHttpProxyRequest.parse(
      Data(
        (
          "POST http://source.example:8080/path?q=1 HTTP/1.1\r\n" +
          "Host: ignored.example\r\n" +
          "Proxy-Authorization: Basic \(credential)\r\n" +
          "Content-Length: 4\r\n\r\ntest"
        ).utf8
      ),
      expectedBasicToken: credential
    )
    precondition(forward.host == "source.example")
    precondition(forward.port == 8080)
    precondition(!forward.isTunnel)
    let forwardedHeader = String(decoding: forward.upstreamPreamble, as: UTF8.self)
    precondition(forwardedHeader.contains("POST /path?q=1 HTTP/1.1"))
    precondition(forwardedHeader.contains("Host: source.example:8080"))
    precondition(!forwardedHeader.lowercased().contains("proxy-authorization"))
    precondition(forward.trailingData == Data("test".utf8))

    expectProxyParseFailure("missing proxy credential", type: .unauthorized) {
      _ = try NemuNativeHttpProxyRequest.parse(
        Data("CONNECT source.example:443 HTTP/1.1\r\n\r\n".utf8),
        expectedBasicToken: credential
      )
    }
    expectProxyParseFailure("HTTPS absolute form", type: .unsupported) {
      _ = try NemuNativeHttpProxyRequest.parse(
        Data(
          (
            "GET https://source.example/path HTTP/1.1\r\n" +
            "Proxy-Authorization: Basic \(credential)\r\n\r\n"
          ).utf8
        ),
        expectedBasicToken: credential
      )
    }

    // A hermetic test process may be denied permission to bind even loopback.
    // Verify the deterministic fail-closed configuration rather than making
    // the policy suite depend on host sandbox networking privileges.
    let proxyConfiguration = URLSessionConfiguration.ephemeral
    NemuNativeHttpLoopbackProxy.shared.hardenLegacy(
      proxyConfiguration,
      configuredPort: 47_123
    )
    let proxyDictionary = proxyConfiguration.connectionProxyDictionary ?? [:]
    precondition(proxyDictionary["HTTPProxy"] as? String == "127.0.0.1")
    precondition(proxyDictionary["HTTPSProxy"] as? String == "127.0.0.1")
    precondition(proxyDictionary["HTTPPort"] as? Int == 47_123)
    precondition(proxyDictionary["HTTPSPort"] as? Int == 47_123)
    precondition(proxyDictionary["ProxyAutoConfigEnable"] as? Bool == false)
  }

  private static func expectPublic(_ literal: String) {
    precondition(
      NemuNativeHttpAddressPolicy.isPublicAddress(addressBytes(literal)),
      "Expected public address: \(literal)"
    )
  }

  private static func expectBlocked(_ literal: String) {
    precondition(
      !NemuNativeHttpAddressPolicy.isPublicAddress(addressBytes(literal)),
      "Expected blocked address: \(literal)"
    )
  }

  private static func expectPolicyFailure(
    _ label: String,
    operation: () throws -> Void
  ) {
    do {
      try operation()
      preconditionFailure("Expected policy failure: \(label)")
    } catch is NemuNativeHttpAddressPolicyError {
      return
    } catch {
      preconditionFailure("Unexpected error for \(label): \(error)")
    }
  }

  private static func expectProxyParseFailure(
    _ label: String,
    type: NemuNativeHttpProxyRequestError,
    operation: () throws -> Void
  ) {
    do {
      try operation()
      preconditionFailure("Expected proxy parse failure: \(label)")
    } catch let error as NemuNativeHttpProxyRequestError {
      switch (error, type) {
      case (.incomplete, .incomplete), (.invalid, .invalid),
        (.unauthorized, .unauthorized), (.unsupported, .unsupported):
        return
      default:
        preconditionFailure("Wrong proxy parse failure for \(label): \(error)")
      }
    } catch {
      preconditionFailure("Unexpected error for \(label): \(error)")
    }
  }

  private static func addressBytes(_ literal: String) -> [UInt8] {
    var ipv4 = in_addr()
    if literal.withCString({ inet_pton(AF_INET, $0, &ipv4) }) == 1 {
      return withUnsafeBytes(of: &ipv4) { Array($0) }
    }

    var ipv6 = in6_addr()
    if literal.withCString({ inet_pton(AF_INET6, $0, &ipv6) }) == 1 {
      return withUnsafeBytes(of: &ipv6) { Array($0) }
    }
    preconditionFailure("Invalid test IP literal: \(literal)")
  }
}

private final class LockedBoolResults: @unchecked Sendable {
  private let lock = NSLock()
  private var storage: [Bool] = []

  func append(_ value: Bool) {
    lock.lock()
    storage.append(value)
    lock.unlock()
  }

  func values() -> [Bool] {
    lock.lock()
    defer { lock.unlock() }
    return storage
  }
}
