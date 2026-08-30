import Foundation
import Network

private let nemuNativeProxyHeaderLimit = 64 * 1024
private let nemuNativeProxySetupTimeoutSeconds = 12.0

enum NemuNativeHttpProxyRequestError: Error {
  case incomplete
  case invalid
  case unauthorized
  case unsupported
}

/**
 * One authenticated request accepted by Nemu's process-local HTTP proxy.
 *
 * iOS 17+ uses an HTTP CONNECT ProxyConfiguration for every TCP origin. The
 * legacy iOS 16 URL loading stack uses CONNECT for HTTPS and absolute-form HTTP
 * requests, so both forms are parsed. Plain HTTP is deliberately made
 * single-request (`Connection: close`) to ensure every destination is resolved
 * and pinned independently.
 */
struct NemuNativeHttpProxyRequest {
  let host: String
  let port: UInt16
  let isTunnel: Bool
  let upstreamPreamble: Data
  let trailingData: Data

  static func parse(
    _ data: Data,
    expectedBasicToken: String
  ) throws -> NemuNativeHttpProxyRequest {
    let separator = Data([13, 10, 13, 10])
    guard let separatorRange = data.range(of: separator) else {
      throw NemuNativeHttpProxyRequestError.incomplete
    }
    guard separatorRange.lowerBound <= nemuNativeProxyHeaderLimit else {
      throw NemuNativeHttpProxyRequestError.invalid
    }

    let headerData = data.subdata(in: data.startIndex..<separatorRange.lowerBound)
    guard let header = String(data: headerData, encoding: .isoLatin1) else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    let lines = header.components(separatedBy: "\r\n")
    guard let requestLine = lines.first, !requestLine.isEmpty else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    let requestParts = requestLine.split(
      separator: " ",
      maxSplits: 2,
      omittingEmptySubsequences: true
    )
    guard requestParts.count == 3 else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    let method = String(requestParts[0])
    let target = String(requestParts[1])
    let version = String(requestParts[2])
    guard
      isValidMethod(method),
      version == "HTTP/1.1" || version == "HTTP/1.0"
    else {
      throw NemuNativeHttpProxyRequestError.invalid
    }

    var headers: [(name: String, value: String)] = []
    for line in lines.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else {
        throw NemuNativeHttpProxyRequestError.invalid
      }
      let name = line[..<colon].trimmingCharacters(in: .whitespaces)
      let value = line[line.index(after: colon)...]
        .trimmingCharacters(in: .whitespaces)
      guard isValidHeaderName(name), !containsForbiddenHeaderValueByte(value) else {
        throw NemuNativeHttpProxyRequestError.invalid
      }
      headers.append((name, value))
    }

    let credentials = headers.filter {
      $0.name.caseInsensitiveCompare("Proxy-Authorization") == .orderedSame
    }
    guard credentials.count == 1 else {
      throw NemuNativeHttpProxyRequestError.unauthorized
    }
    let authorizationParts = credentials[0].value.split(
      maxSplits: 1,
      omittingEmptySubsequences: true,
      whereSeparator: { $0 == " " || $0 == "\t" }
    )
    guard
      authorizationParts.count == 2,
      authorizationParts[0].caseInsensitiveCompare("Basic") == .orderedSame,
      constantTimeEqual(String(authorizationParts[1]), expectedBasicToken)
    else {
      throw NemuNativeHttpProxyRequestError.unauthorized
    }

    let trailing = data.subdata(in: separatorRange.upperBound..<data.endIndex)
    if method.caseInsensitiveCompare("CONNECT") == .orderedSame {
      let endpoint = try parseConnectTarget(target)
      return NemuNativeHttpProxyRequest(
        host: endpoint.host,
        port: endpoint.port,
        isTunnel: true,
        upstreamPreamble: Data(),
        trailingData: trailing
      )
    }

    guard let components = URLComponents(string: target) else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    guard
      components.scheme?.lowercased() == "http",
      let host = components.host,
      !host.isEmpty,
      components.user == nil,
      components.password == nil,
      components.fragment == nil
    else {
      throw NemuNativeHttpProxyRequestError.unsupported
    }
    let portValue = components.port ?? 80
    guard (1...65_535).contains(portValue) else {
      throw NemuNativeHttpProxyRequestError.invalid
    }

    var originTarget = components.percentEncodedPath
    if originTarget.isEmpty { originTarget = "/" }
    if let query = components.percentEncodedQuery {
      originTarget += "?\(query)"
    }
    let hostHeader = canonicalHostHeader(host: host, port: portValue, defaultPort: 80)
    var forwarded = ["\(method) \(originTarget) \(version)", "Host: \(hostHeader)"]
    let removedHeaders = [
      "Connection",
      "Host",
      "Keep-Alive",
      "Proxy-Authenticate",
      "Proxy-Authorization",
      "Proxy-Connection",
      "TE",
      "Trailer",
      "Upgrade",
    ]
    for header in headers where !removedHeaders.contains(where: {
      $0.caseInsensitiveCompare(header.name) == .orderedSame
    }) {
      forwarded.append("\(header.name): \(header.value)")
    }
    forwarded.append("Connection: close")
    forwarded.append("")
    forwarded.append("")
    guard let preamble = forwarded.joined(separator: "\r\n").data(using: .isoLatin1) else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    return NemuNativeHttpProxyRequest(
      host: host,
      port: UInt16(portValue),
      isTunnel: false,
      upstreamPreamble: preamble,
      trailingData: trailing
    )
  }

  private static func parseConnectTarget(_ target: String) throws -> (host: String, port: UInt16) {
    guard let components = URLComponents(string: "https://\(target)") else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    guard
      let host = components.host,
      !host.isEmpty,
      let port = components.port,
      (1...65_535).contains(port),
      components.user == nil,
      components.password == nil,
      components.path.isEmpty,
      components.query == nil,
      components.fragment == nil
    else {
      throw NemuNativeHttpProxyRequestError.invalid
    }
    return (host, UInt16(port))
  }

  private static func canonicalHostHeader(
    host: String,
    port: Int,
    defaultPort: Int
  ) -> String {
    let bracketed = host.contains(":") ? "[\(host)]" : host
    return port == defaultPort ? bracketed : "\(bracketed):\(port)"
  }

  private static func isValidMethod(_ value: String) -> Bool {
    guard !value.isEmpty else { return false }
    let separators = CharacterSet(charactersIn: "()<>@,;:\\\"/[]?={} \t")
    return value.unicodeScalars.allSatisfy {
      $0.value > 0x20 && $0.value < 0x7f && !separators.contains($0)
    }
  }

  private static func isValidHeaderName(_ value: String) -> Bool {
    return isValidMethod(value)
  }

  private static func containsForbiddenHeaderValueByte(_ value: String) -> Bool {
    return value.unicodeScalars.contains {
      $0.value == 0 || $0.value == 10 || $0.value == 13 ||
        ($0.value < 0x20 && $0.value != 9) || $0.value == 0x7f
    }
  }

  private static func constantTimeEqual(_ lhs: String, _ rhs: String) -> Bool {
    let lhsBytes = Array(lhs.utf8)
    let rhsBytes = Array(rhs.utf8)
    var difference = lhsBytes.count ^ rhsBytes.count
    let length = max(lhsBytes.count, rhsBytes.count)
    for index in 0..<length {
      let left = index < lhsBytes.count ? lhsBytes[index] : 0
      let right = index < rhsBytes.count ? rhsBytes[index] : 0
      difference |= Int(left ^ right)
    }
    return difference == 0
  }
}

private final class NemuNativeHttpProxyReadyLatch: @unchecked Sendable {
  private let lock = NSLock()
  private let semaphore = DispatchSemaphore(value: 0)
  private var result: UInt16?
  private var resolved = false

  func resolve(_ port: UInt16?) {
    lock.lock()
    guard !resolved else {
      lock.unlock()
      return
    }
    resolved = true
    result = port
    lock.unlock()
    semaphore.signal()
  }

  func wait() -> UInt16? {
    guard semaphore.wait(timeout: .now() + 3) == .success else { return nil }
    lock.lock()
    defer { lock.unlock() }
    return result
  }
}

/**
 * Process-local authenticated proxy used by every untrusted-source URLSession.
 * It binds only IPv4 loopback, validates all answers for each requested host,
 * and hands NWConnection an IP-address endpoint rather than a hostname. Packet
 * tunnel VPNs (including a Tailscale exit node) remain below these sockets.
 */
final class NemuNativeHttpLoopbackProxy: @unchecked Sendable {
  static let shared = NemuNativeHttpLoopbackProxy()

  let username = "nemu"
  let password: String
  private(set) var port: UInt16?

  private let queue = DispatchQueue(label: "pm.nemu.native-http-loopback-proxy")
  private let resolverQueue = DispatchQueue(
    label: "pm.nemu.native-http-loopback-proxy.resolver",
    qos: .utility,
    attributes: .concurrent
  )
  private var listener: NWListener?
  private var connections: [UUID: NemuNativeHttpProxyConnection] = [:]

  private init() {
    password = UUID().uuidString.replacingOccurrences(of: "-", with: "") +
      UUID().uuidString.replacingOccurrences(of: "-", with: "")
    port = nil
    listener = nil

    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(
      host: .ipv4(.loopback),
      port: .any
    )
    guard let created = try? NWListener(using: parameters, on: .any) else { return }
    created.newConnectionLimit = 64
    listener = created
    let latch = NemuNativeHttpProxyReadyLatch()
    created.stateUpdateHandler = { state in
      switch state {
      case .ready:
        latch.resolve(created.port?.rawValue)
      case .failed, .cancelled:
        latch.resolve(nil)
      default:
        break
      }
    }
    created.newConnectionHandler = { [weak self] connection in
      self?.accept(connection)
    }
    created.start(queue: queue)
    port = latch.wait()
    if port == nil {
      created.cancel()
      listener = nil
    }
  }

  var basicToken: String {
    Data("\(username):\(password)".utf8).base64EncodedString()
  }

  /** Applies an explicit, no-failover proxy. A listener startup failure points
   * at the closed loopback port 1, failing source networking closed. */
  func harden(_ configuration: URLSessionConfiguration) {
    let configuredPort = port ?? 1
    if #available(iOS 17.0, tvOS 17.0, macOS 14.0, *) {
      guard let endpointPort = NWEndpoint.Port(rawValue: configuredPort) else {
        return
      }
      var proxy = ProxyConfiguration(
        httpCONNECTProxy: .hostPort(
          host: .ipv4(.loopback),
          port: endpointPort
        )
      )
      proxy.allowFailover = false
      proxy.excludedDomains = []
      proxy.applyCredential(username: username, password: password)
      configuration.proxyConfigurations = [proxy]
      configuration.connectionProxyDictionary = nil
      return
    }

    hardenLegacy(configuration, configuredPort: configuredPort)
  }

  func hardenLegacy(
    _ configuration: URLSessionConfiguration,
    configuredPort: UInt16? = nil
  ) {
    let configuredPort = configuredPort ?? port ?? 1
    configuration.connectionProxyDictionary = [
      "HTTPEnable": true,
      "HTTPProxy": "127.0.0.1",
      "HTTPPort": Int(configuredPort),
      "HTTPSEnable": true,
      "HTTPSProxy": "127.0.0.1",
      "HTTPSPort": Int(configuredPort),
      "ExceptionsList": [],
      "ExcludeSimpleHostnames": false,
      "SOCKSEnable": false,
      "ProxyAutoConfigEnable": false,
      "ProxyAutoDiscoveryEnable": false,
    ]
  }

  /// iOS 16 surfaces HTTPS proxy authentication challenges but returns a 407
  /// as an ordinary response for absolute-form HTTP. Authenticate that one
  /// legacy form preemptively; the loopback proxy strips the hop-by-hop field
  /// before forwarding it. iOS 17+ applies credentials to its CONNECT proxy.
  func authorizeLegacyPlainHttp(_ request: inout URLRequest) {
    guard request.url?.scheme?.lowercased() == "http" else { return }
    if #available(iOS 17.0, tvOS 17.0, macOS 14.0, *) { return }
    request.setValue(
      "Basic \(basicToken)",
      forHTTPHeaderField: "Proxy-Authorization"
    )
  }

  func proxyCredential(for challenge: URLAuthenticationChallenge) -> URLCredential? {
    let protectionSpace = challenge.protectionSpace
    guard
      challenge.previousFailureCount == 0,
      protectionSpace.isProxy(),
      protectionSpace.host == "127.0.0.1",
      protectionSpace.port == Int(port ?? 1),
      protectionSpace.authenticationMethod == NSURLAuthenticationMethodHTTPBasic
    else {
      return nil
    }
    return URLCredential(
      user: username,
      password: password,
      persistence: .forSession
    )
  }

  private func accept(_ connection: NWConnection) {
    dispatchPrecondition(condition: .onQueue(queue))
    let id = UUID()
    let handler = NemuNativeHttpProxyConnection(
      client: connection,
      queue: queue,
      resolverQueue: resolverQueue,
      expectedBasicToken: basicToken
    ) { [weak self] in
      self?.connections.removeValue(forKey: id)
    }
    connections[id] = handler
    handler.start()
  }
}

private final class NemuNativeHttpProxyConnection: @unchecked Sendable {
  private let client: NWConnection
  private let queue: DispatchQueue
  private let resolverQueue: DispatchQueue
  private let expectedBasicToken: String
  private let didFinish: () -> Void
  private var upstream: NWConnection?
  private var headerBuffer = Data()
  private var request: NemuNativeHttpProxyRequest?
  private var endpoints: [NWEndpoint] = []
  private var endpointIndex = 0
  private var endedDirections: Set<Int> = []
  private var timeout: DispatchWorkItem?
  private var finished = false

  init(
    client: NWConnection,
    queue: DispatchQueue,
    resolverQueue: DispatchQueue,
    expectedBasicToken: String,
    didFinish: @escaping () -> Void
  ) {
    self.client = client
    self.queue = queue
    self.resolverQueue = resolverQueue
    self.expectedBasicToken = expectedBasicToken
    self.didFinish = didFinish
  }

  func start() {
    scheduleTimeout()
    client.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        self.client.stateUpdateHandler = nil
        self.receiveHeader()
      case .failed, .cancelled:
        self.close()
      default:
        break
      }
    }
    client.start(queue: queue)
  }

  private func scheduleTimeout() {
    let item = DispatchWorkItem { [weak self] in self?.close() }
    timeout = item
    queue.asyncAfter(
      deadline: .now() + nemuNativeProxySetupTimeoutSeconds,
      execute: item
    )
  }

  private func receiveHeader() {
    client.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) {
      [weak self] data, _, complete, error in
      guard let self, !self.finished else { return }
      if let data, !data.isEmpty { self.headerBuffer.append(data) }
      do {
        self.request = try NemuNativeHttpProxyRequest.parse(
          self.headerBuffer,
          expectedBasicToken: self.expectedBasicToken
        )
        self.resolveDestination()
      } catch NemuNativeHttpProxyRequestError.incomplete {
        if complete || error != nil || self.headerBuffer.count > nemuNativeProxyHeaderLimit {
          self.sendError(status: 400, reason: "Bad Request")
        } else {
          self.receiveHeader()
        }
      } catch NemuNativeHttpProxyRequestError.unauthorized {
        self.sendAuthenticationRequired()
      } catch NemuNativeHttpProxyRequestError.unsupported {
        self.sendError(status: 501, reason: "Not Implemented")
      } catch {
        self.sendError(status: 400, reason: "Bad Request")
      }
    }
  }

  private func resolveDestination() {
    guard let request else {
      close()
      return
    }
    let host = request.host
    let port = request.port
    resolverQueue.async { [weak self] in
      let addresses = try? NemuNativeHttpAddressPolicy.validatedAddresses(
        hostname: host
      )
      self?.queue.async { [weak self] in
        guard let self, !self.finished else { return }
        if let addresses {
          self.endpoints = Self.makeEndpoints(addresses: addresses, port: port)
          self.endpointIndex = 0
          guard !self.endpoints.isEmpty else {
            self.sendError(status: 502, reason: "Bad Gateway")
            return
          }
          self.connectNextEndpoint()
        } else {
          self.sendError(status: 403, reason: "Forbidden")
        }
      }
    }
  }

  private static func makeEndpoints(addresses: [[UInt8]], port: UInt16) -> [NWEndpoint] {
    guard let endpointPort = NWEndpoint.Port(rawValue: port) else { return [] }
    var seen: Set<Data> = []
    return addresses.compactMap { bytes in
      let data = Data(bytes)
      guard seen.insert(data).inserted else { return nil }
      if bytes.count == 4, let address = IPv4Address(data) {
        return .hostPort(host: .ipv4(address), port: endpointPort)
      }
      if bytes.count == 16, let address = IPv6Address(data) {
        return .hostPort(host: .ipv6(address), port: endpointPort)
      }
      return nil
    }
  }

  private func connectNextEndpoint() {
    guard endpointIndex < endpoints.count else {
      sendError(status: 502, reason: "Bad Gateway")
      return
    }
    let endpoint = endpoints[endpointIndex]
    endpointIndex += 1
    let tcp = NWProtocolTCP.Options()
    tcp.connectionTimeout = Int(nemuNativeProxySetupTimeoutSeconds)
    tcp.noDelay = true
    let candidate = NWConnection(
      to: endpoint,
      using: NWParameters(tls: nil, tcp: tcp)
    )
    upstream = candidate
    candidate.stateUpdateHandler = { [weak self, weak candidate] state in
      guard let self, let candidate, !self.finished else { return }
      switch state {
      case .ready:
        candidate.stateUpdateHandler = nil
        self.activateTunnel(candidate)
      case .failed, .cancelled:
        candidate.stateUpdateHandler = nil
        candidate.cancel()
        if self.upstream === candidate { self.upstream = nil }
        self.connectNextEndpoint()
      default:
        break
      }
    }
    candidate.start(queue: queue)
  }

  private func activateTunnel(_ upstream: NWConnection) {
    timeout?.cancel()
    timeout = nil
    guard let request else {
      close()
      return
    }
    if request.isTunnel {
      let established = Data(
        "HTTP/1.1 200 Connection Established\r\n\r\n".utf8
      )
      client.send(content: established, completion: .contentProcessed {
        [weak self, weak upstream] error in
        guard let self, let upstream, error == nil else {
          self?.close()
          return
        }
        self.sendInitialUpstreamData(
          request.trailingData,
          upstream: upstream
        )
      })
      return
    }
    var preamble = request.upstreamPreamble
    preamble.append(request.trailingData)
    sendInitialUpstreamData(preamble, upstream: upstream)
  }

  private func sendInitialUpstreamData(_ data: Data, upstream: NWConnection) {
    let startRelay = { [weak self, weak upstream] in
      guard let self, let upstream, !self.finished else { return }
      self.relay(from: self.client, to: upstream, direction: 0)
      self.relay(from: upstream, to: self.client, direction: 1)
    }
    guard !data.isEmpty else {
      startRelay()
      return
    }
    upstream.send(content: data, completion: .contentProcessed { [weak self] error in
      guard error == nil else {
        self?.close()
        return
      }
      startRelay()
    })
  }

  private func relay(from source: NWConnection, to destination: NWConnection, direction: Int) {
    source.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
      [weak self, weak source, weak destination] data, _, complete, error in
      guard
        let self,
        let source,
        let destination,
        !self.finished
      else { return }
      if error != nil {
        self.close()
        return
      }
      if let data, !data.isEmpty {
        destination.send(content: data, completion: .contentProcessed {
          [weak self, weak source, weak destination] sendError in
          guard
            let self,
            let source,
            let destination,
            !self.finished
          else { return }
          if sendError != nil {
            self.close()
          } else if complete {
            self.endDirection(destination: destination, direction: direction)
          } else {
            self.relay(from: source, to: destination, direction: direction)
          }
        })
      } else if complete {
        self.endDirection(destination: destination, direction: direction)
      } else {
        self.relay(from: source, to: destination, direction: direction)
      }
    }
  }

  private func endDirection(destination: NWConnection, direction: Int) {
    guard endedDirections.insert(direction).inserted else { return }
    destination.send(
      content: nil,
      contentContext: .finalMessage,
      isComplete: true,
      completion: .contentProcessed { [weak self] error in
        guard let self else { return }
        if error != nil || self.endedDirections.count == 2 { self.close() }
      }
    )
  }

  private func sendAuthenticationRequired() {
    let response =
      "HTTP/1.1 407 Proxy Authentication Required\r\n" +
      "Proxy-Authenticate: Basic realm=\"Nemu Native HTTP\"\r\n" +
      "Proxy-Connection: close\r\n" +
      "Connection: close\r\nContent-Length: 0\r\n\r\n"
    sendAndClose(Data(response.utf8))
  }

  private func sendError(status: Int, reason: String) {
    let response =
      "HTTP/1.1 \(status) \(reason)\r\n" +
      "Connection: close\r\nContent-Length: 0\r\n\r\n"
    sendAndClose(Data(response.utf8))
  }

  private func sendAndClose(_ response: Data) {
    timeout?.cancel()
    timeout = nil
    client.send(content: response, completion: .contentProcessed {
      [weak self] _ in self?.close()
    })
  }

  private func close() {
    guard !finished else { return }
    finished = true
    timeout?.cancel()
    timeout = nil
    client.stateUpdateHandler = nil
    upstream?.stateUpdateHandler = nil
    client.cancel()
    upstream?.cancel()
    upstream = nil
    didFinish()
  }
}
