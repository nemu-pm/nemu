import Darwin
import Foundation

@main
enum NemuNativeLocalNetworkAllowanceTests {
  static func main() throws {
    configuredEndpoints()
    grantLifecycle()
    policyHonoursOnlyTheGrantedEndpoint()
    redirectsNeedTheirOwnGrant()
    grantedDirectConnections()
    proxyScopesRequestsByCredential()
    print("NemuNativeLocalNetworkAllowanceTests passed")
  }

  // MARK: Configured URL -> endpoint

  private static func configuredEndpoints() {
    let accepted: [(String, String, Int)] = [
      ("http://192.168.1.20:3000", "192.168.1.20", 3000),
      ("http://192.168.1.20", "192.168.1.20", 80),
      ("https://nas.local", "nas.local", 443),
      ("http://NAS.Local.:8080/api", "nas.local", 8080),
      ("http://lanraragi:3000", "lanraragi", 3000),
      ("http://10.0.0.5:3000/", "10.0.0.5", 3000),
      ("http://172.16.4.2:3000", "172.16.4.2", 3000),
      ("http://100.101.102.103:3000", "100.101.102.103", 3000),
      ("http://169.254.12.1:3000", "169.254.12.1", 3000),
      ("http://[fd00::5]:8080", "fd00::5", 8080),
      ("https://reader.example.com", "reader.example.com", 443),
    ]
    for (value, host, port) in accepted {
      guard let endpoint = NemuNativeLocalNetworkAllowance.endpoint(
        fromConfiguredURL: value
      ) else {
        preconditionFailure("Expected \(value) to be grantable")
      }
      precondition(endpoint.host == host, "host of \(value): \(endpoint.host)")
      precondition(endpoint.port == port, "port of \(value): \(endpoint.port)")
    }

    let rejected = [
      "",
      "   ",
      "not a url",
      "file:///etc/passwd",
      "ftp://192.168.1.2/",
      "http://user:secret@192.168.1.2:3000",
      "http://127.0.0.1:3000",
      "http://127.1",
      "http://localhost:3000",
      "http://printer.localhost",
      "http://0.0.0.0",
      "http://169.254.169.254/latest/meta-data",
      "http://169.254.170.2/v2",
      "http://224.0.0.1",
      "http://255.255.255.255",
      "http://240.0.0.1",
      "http://192.0.2.1",
      "http://198.18.0.1",
      "http://[::1]:3000",
      "http://[fe80::1]",
      "http://[ff02::1]",
      "http://metadata.goog",
      "http://instance-data",
      "http://8.8.8.8",
      "http://0192.168.1.1",
      "http://3232235777",
      "http://192.168.1.20:0",
      "http://192.168.1.20:70000",
      "http://\(String(repeating: "a", count: 2_100)).local",
    ]
    for value in rejected {
      precondition(
        NemuNativeLocalNetworkAllowance.endpoint(fromConfiguredURL: value) == nil,
        "Expected \(value) to be rejected"
      )
    }
  }

  // MARK: Grants are per source and replaceable

  private static func grantLifecycle() {
    NemuNativeLocalNetworkAllowance.clearAllGrants()
    let a = "local::a:multi.lanraragi"
    let b = "local::a:other.source"

    precondition(
      NemuNativeLocalNetworkAllowance.setGrant(
        scope: a,
        configuredURLs: ["http://192.168.1.20:3000", "http://127.0.0.1", "junk"]
      ) == ["192.168.1.20:3000"]
    )
    let grantA = NemuNativeLocalNetworkAllowance.grant(forScope: a)
    precondition(grantA.allows(host: "192.168.1.20", port: 3000))
    precondition(!grantA.allows(host: "192.168.1.20", port: 3001), "port is part of the grant")
    precondition(!grantA.allows(host: "192.168.1.21", port: 3000), "no subnet grant")
    precondition(grantA.allowsHost("192.168.1.20"))

    let grantB = NemuNativeLocalNetworkAllowance.grant(forScope: b)
    precondition(!grantB.allows(host: "192.168.1.20", port: 3000), "another source gets nothing")
    precondition(NemuNativeLocalNetworkAllowance.grant(forScope: nil).endpoints.isEmpty)
    precondition(NemuNativeLocalNetworkAllowance.grant(forScope: "  ").endpoints.isEmpty)

    // Replacing drops the old endpoint at once.
    _ = NemuNativeLocalNetworkAllowance.setGrant(
      scope: a,
      configuredURLs: ["http://nas.local:8080"]
    )
    let replaced = NemuNativeLocalNetworkAllowance.grant(forScope: a)
    precondition(!replaced.allows(host: "192.168.1.20", port: 3000))
    precondition(replaced.allows(host: "NAS.local.", port: 8080))

    // Nothing grantable clears it.
    precondition(
      NemuNativeLocalNetworkAllowance.setGrant(scope: a, configuredURLs: ["http://localhost"]).isEmpty
    )
    precondition(NemuNativeLocalNetworkAllowance.grant(forScope: a).endpoints.isEmpty)

    // Bounded: endpoints per scope and scopes overall.
    let many = (1...10).map { "http://192.168.1.\($0):3000" }
    precondition(
      NemuNativeLocalNetworkAllowance.setGrant(scope: a, configuredURLs: many).count
        == NemuNativeLocalNetworkAllowance.maxEndpointsPerScope
    )
    for index in 0..<(NemuNativeLocalNetworkAllowance.maxScopes + 5) {
      _ = NemuNativeLocalNetworkAllowance.setGrant(
        scope: "scope-\(index)",
        configuredURLs: ["http://10.0.0.1:3000"]
      )
    }
    precondition(
      NemuNativeLocalNetworkAllowance.grant(forScope: "scope-0").endpoints.isEmpty,
      "oldest scope is evicted"
    )
    precondition(
      !NemuNativeLocalNetworkAllowance.grant(
        forScope: "scope-\(NemuNativeLocalNetworkAllowance.maxScopes + 4)"
      ).endpoints.isEmpty
    )

    NemuNativeLocalNetworkAllowance.clearAllGrants()
    precondition(NemuNativeLocalNetworkAllowance.grant(forScope: "scope-70").endpoints.isEmpty)
  }

  // MARK: Address policy

  // MARK: Direct connections to a granted literal

  /// iOS keeps local-network IP literals out of the proxy configuration, so a
  /// granted server is reached directly. The peer gate accepts that only when it
  /// is exactly the granted literal and port.
  private static func grantedDirectConnections() {
    let lan = grant(["http://192.168.2.109:25600", "https://10.0.0.5:8443", "http://nas.local:8080", "http://[fd00::5]:3000"])

    func direct(
      _ host: String?,
      _ port: Int?,
      scheme: String? = "http",
      peer: String?,
      peerPort: Int?,
      grant: NemuLocalNetworkGrant? = nil
    ) -> Bool {
      NemuNativeLocalNetworkAllowance.isGrantedDirectConnection(
        requestHost: host,
        requestPort: port,
        requestScheme: scheme,
        remoteAddress: peer,
        remotePort: peerPort,
        grant: grant ?? lan
      )
    }

    // The granted literal, reached at the granted port, is accepted.
    precondition(direct("192.168.2.109", 25600, peer: "192.168.2.109", peerPort: 25600))
    precondition(direct("10.0.0.5", 8443, scheme: "https", peer: "10.0.0.5", peerPort: 8443))
    precondition(direct("fd00::5", 3000, peer: "fd00::5", peerPort: 3000))
    // IPv4-mapped peers and zone suffixes are the same address.
    precondition(direct("192.168.2.109", 25600, peer: "::ffff:192.168.2.109", peerPort: 25600))
    precondition(direct("fd00::5", 3000, peer: "fd00::5%en0", peerPort: 3000))
    // A default port is the scheme's.
    let defaultPort = grant(["http://192.168.2.50"])
    precondition(direct("192.168.2.50", nil, peer: "192.168.2.50", peerPort: 80, grant: defaultPort))

    // No grant, or a grant for another scope, refuses it.
    precondition(!direct("192.168.2.109", 25600, peer: "192.168.2.109", peerPort: 25600, grant: NemuLocalNetworkGrant.none))

    // A different port, host or peer than the grant names is refused.
    precondition(!direct("192.168.2.109", 22, peer: "192.168.2.109", peerPort: 22))
    precondition(!direct("192.168.2.110", 25600, peer: "192.168.2.110", peerPort: 25600))
    precondition(!direct("192.168.2.109", 25600, peer: "192.168.2.110", peerPort: 25600))
    precondition(!direct("192.168.2.109", 25600, peer: "192.168.2.109", peerPort: 25601))
    // The connection must have reached what the request named.
    precondition(!direct("192.168.2.109", 25600, peer: "127.0.0.1", peerPort: 25600))
    precondition(!direct("192.168.2.109", 25600, peer: "169.254.169.254", peerPort: 25600))

    // Missing fields and non-http(s) schemes are refused.
    precondition(!direct(nil, 25600, peer: "192.168.2.109", peerPort: 25600))
    precondition(!direct("192.168.2.109", 25600, peer: nil, peerPort: 25600))
    precondition(!direct("192.168.2.109", 25600, peer: "192.168.2.109", peerPort: nil))
    precondition(!direct("192.168.2.109", 25600, scheme: "ftp", peer: "192.168.2.109", peerPort: 25600))

    // A granted *name* is never accepted directly: the system would have
    // resolved it, where the proxy pins the validated address.
    precondition(!direct("nas.local", 8080, peer: "192.168.1.5", peerPort: 8080))

    // Loopback and cloud-metadata literals can never be granted, so they can
    // never be reached directly either.
    // (Built by hand: the public constructor refuses to create such endpoints.)
    let tricky = NemuLocalNetworkGrant(endpoints: [
      NemuLocalNetworkEndpoint(host: "127.0.0.1", port: 3000),
      NemuLocalNetworkEndpoint(host: "169.254.169.254", port: 80),
      NemuLocalNetworkEndpoint(host: "localhost", port: 3000),
    ])
    precondition(!direct("127.0.0.1", 3000, peer: "127.0.0.1", peerPort: 3000, grant: tricky))
    precondition(!direct("169.254.169.254", 80, peer: "169.254.169.254", peerPort: 80, grant: tricky))
    precondition(!direct("localhost", 3000, peer: "127.0.0.1", peerPort: 3000, grant: tricky))
  }

  private static func policyHonoursOnlyTheGrantedEndpoint() {
    let lan = grant(["http://192.168.1.20:3000", "http://nas.local:8080"])

    // Without a grant every private destination is still refused.
    expectBlocked("no grant, literal") {
      _ = try NemuNativeHttpAddressPolicy.validatedAddresses(
        hostname: "192.168.1.20",
        port: 3000,
        grant: .none,
        resolver: identityResolver
      )
    }
    expectBlocked("no grant, .local") {
      _ = try NemuNativeHttpAddressPolicy.validatedAddresses(
        hostname: "nas.local",
        port: 8080,
        grant: .none,
        resolver: { _ in [[192, 168, 1, 5]] }
      )
    }

    // The granted literal at the granted port passes.
    let literal = try? NemuNativeHttpAddressPolicy.validatedAddresses(
      hostname: "192.168.1.20",
      port: 3000,
      grant: lan,
      resolver: identityResolver
    )
    precondition(literal == [[192, 168, 1, 20]])

    // Other port, other host in the same subnet, other private host: refused.
    for (host, port) in [("192.168.1.20", 22), ("192.168.1.21", 3000), ("10.0.0.1", 3000)] {
      expectBlocked("\(host):\(port) outside the grant") {
        _ = try NemuNativeHttpAddressPolicy.validatedAddresses(
          hostname: host,
          port: port,
          grant: lan,
          resolver: identityResolver
        )
      }
    }

    // A granted .local name resolves through mDNS to a private address.
    let named = try? NemuNativeHttpAddressPolicy.validatedAddresses(
      hostname: "nas.local",
      port: 8080,
      grant: lan,
      resolver: { _ in [[192, 168, 1, 5]] }
    )
    precondition(named == [[192, 168, 1, 5]])
    let mixed = try? NemuNativeHttpAddressPolicy.validatedAddresses(
      hostname: "nas.local",
      port: 8080,
      grant: lan,
      resolver: { _ in [[127, 0, 0, 1], [192, 168, 1, 5], [169, 254, 169, 254]] }
    )
    precondition(mixed == [[192, 168, 1, 5]], "loopback and metadata answers are filtered")

    // A granted name can never be steered at the device or at metadata.
    for answer: [UInt8] in [[127, 0, 0, 1], [0, 0, 0, 0], [169, 254, 169, 254], [224, 0, 0, 1]] {
      expectBlocked("granted name answering \(answer)") {
        _ = try NemuNativeHttpAddressPolicy.validatedAddresses(
          hostname: "nas.local",
          port: 8080,
          grant: lan,
          resolver: { _ in [answer] }
        )
      }
    }

    // Public answers stay fine for a granted name (split-horizon setups).
    let publicAnswer = try? NemuNativeHttpAddressPolicy.validatedAddresses(
      hostname: "nas.local",
      port: 8080,
      grant: lan,
      resolver: { _ in [[1, 1, 1, 1]] }
    )
    precondition(publicAnswer == [[1, 1, 1, 1]])

    // validatedURL / validate(url:) use the URL's effective port.
    precondition((try? NemuNativeHttpAddressPolicy.validatedURL(
      "http://192.168.1.20:3000/api/search",
      grant: lan
    )) != nil)
    expectBlocked("validatedURL default port") {
      _ = try NemuNativeHttpAddressPolicy.validatedURL(
        "http://192.168.1.20/api/search",
        grant: lan
      )
    }
    expectBlocked("validatedURL without grant") {
      _ = try NemuNativeHttpAddressPolicy.validatedURL(
        "http://192.168.1.20:3000/api/search"
      )
    }
  }

  private static func redirectsNeedTheirOwnGrant() {
    let lan = grant(["http://192.168.1.20:3000"])
    let resolver: NemuNativeHttpAddressPolicy.Resolver = identityResolver
    guard
      let internalRedirect = URL(string: "http://192.168.1.99:3000/admin"),
      let metadataRedirect = URL(string: "http://169.254.169.254/latest/meta-data"),
      let sameServer = URL(string: "http://192.168.1.20:3000/api/archives")
    else {
      preconditionFailure("test URLs")
    }
    do {
      try NemuNativeHttpAddressPolicy.validate(
        url: sameServer,
        resolver: resolver,
        grant: lan
      )
    } catch {
      preconditionFailure("The granted server itself must validate: \(error)")
    }
    expectBlocked("redirect to another private host") {
      try NemuNativeHttpAddressPolicy.validate(
        url: internalRedirect,
        resolver: resolver,
        grant: lan
      )
    }
    expectBlocked("redirect to metadata") {
      try NemuNativeHttpAddressPolicy.validate(
        url: metadataRedirect,
        resolver: resolver,
        grant: lan
      )
    }
  }

  // MARK: Proxy credentials

  private static func proxyScopesRequestsByCredential() {
    let shared = Data("nemu:shared-secret".utf8).base64EncodedString()
    let scoped = Data("nemu-0123456789abcdef:shared-secret".utf8).base64EncodedString()
    let scopeForToken: (String) -> String? = { token in
      token == scoped ? "local::a:multi.lanraragi" : nil
    }

    func request(token: String?) -> Data {
      var lines = [
        "CONNECT 192.168.1.20:3000 HTTP/1.1",
        "Host: 192.168.1.20:3000",
      ]
      if let token { lines.append("Proxy-Authorization: Basic \(token)") }
      return Data((lines.joined(separator: "\r\n") + "\r\n\r\n").utf8)
    }

    let sharedRequest = try? NemuNativeHttpProxyRequest.parse(
      request(token: shared),
      expectedBasicToken: shared,
      scopeForToken: scopeForToken
    )
    precondition(sharedRequest != nil)
    precondition(sharedRequest?.scope == nil, "the shared credential carries no scope")

    let scopedRequest = try? NemuNativeHttpProxyRequest.parse(
      request(token: scoped),
      expectedBasicToken: shared,
      scopeForToken: scopeForToken
    )
    precondition(scopedRequest?.scope == "local::a:multi.lanraragi")
    precondition(scopedRequest?.host == "192.168.1.20")
    precondition(scopedRequest?.port == 3000)

    for (label, token) in [
      ("wrong secret", Data("nemu-0123456789abcdef:other".utf8).base64EncodedString()),
      ("unknown user", Data("nemu-ffffffffffffffff:shared-secret".utf8).base64EncodedString()),
    ] {
      do {
        _ = try NemuNativeHttpProxyRequest.parse(
          request(token: token),
          expectedBasicToken: shared,
          scopeForToken: scopeForToken
        )
        preconditionFailure("\(label) must not authenticate")
      } catch NemuNativeHttpProxyRequestError.unauthorized {
        continue
      } catch {
        preconditionFailure("\(label): unexpected \(error)")
      }
    }
    // A scoped token is rejected when the caller supplies no scope resolver.
    do {
      _ = try NemuNativeHttpProxyRequest.parse(
        request(token: scoped),
        expectedBasicToken: shared
      )
      preconditionFailure("scoped token without a resolver must not authenticate")
    } catch NemuNativeHttpProxyRequestError.unauthorized {
      // expected
    } catch {
      preconditionFailure("unexpected \(error)")
    }
  }

  // MARK: Helpers

  private static let identityResolver: NemuNativeHttpAddressPolicy.Resolver = { host in
    guard let bytes = NemuNativeLocalNetworkAllowance.parseIPLiteral(host) else {
      throw NemuNativeHttpAddressPolicyError.unresolvedHost
    }
    return [bytes]
  }

  private static func grant(_ urls: [String]) -> NemuLocalNetworkGrant {
    let endpoints = urls.compactMap {
      NemuNativeLocalNetworkAllowance.endpoint(fromConfiguredURL: $0)
    }
    precondition(endpoints.count == urls.count, "test grant URLs must be grantable")
    return NemuLocalNetworkGrant(endpoints: Set(endpoints))
  }

  private static func expectBlocked(_ label: String, _ operation: () throws -> Void) {
    do {
      try operation()
      preconditionFailure("Expected a policy failure: \(label)")
    } catch is NemuNativeHttpAddressPolicyError {
      return
    } catch {
      preconditionFailure("Unexpected error for \(label): \(error)")
    }
  }
}
