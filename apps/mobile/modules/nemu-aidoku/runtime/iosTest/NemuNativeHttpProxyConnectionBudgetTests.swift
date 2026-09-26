import Darwin
import Foundation

@main
enum NemuNativeHttpProxyConnectionBudgetTests {
  static func main() {
    let cap = NemuNativeHttpProxyConnectionBudget.maxLiveConnections
    precondition(cap == 64)
    precondition(
      NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: 0) == cap
    )

    // Model the listener: the framework spends one unit per delivered
    // connection; the proxy re-derives the limit after each accept and close.
    // Far more than `cap` sequential connections must all be deliverable.
    var limit = cap
    var live = 0
    var delivered = 0
    for _ in 0..<(cap * 20) {
      precondition(limit > 0, "listener stopped accepting after \(delivered) connections")
      limit -= 1
      live += 1
      delivered += 1
      limit = NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: live)
      live -= 1
      limit = NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: live)
    }
    precondition(delivered == cap * 20)
    precondition(limit == cap)

    // It still caps concurrent tunnels: with `cap` open, nothing new is
    // delivered until one closes.
    precondition(
      NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: cap) == 0
    )
    precondition(
      NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: cap + 3) == 0
    )
    precondition(
      NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: cap - 1) == 1
    )
    precondition(
      NemuNativeHttpProxyConnectionBudget.newConnectionLimit(liveConnections: -1) == cap
    )
    // Exercise the actual listener, not just the budget arithmetic. Each
    // unauthenticated request closes its tunnel without contacting any source.
    // The old listener stopped responding after the 64th connection.
    guard let port = NemuNativeHttpLoopbackProxy.shared.port else {
      preconditionFailure("Loopback proxy failed to start")
    }
    for index in 0..<(cap * 2) {
      checkConnection(port: port, index: index)
    }
    print("NemuNativeHttpProxyConnectionBudgetTests passed.")
  }

  private static func checkConnection(port: UInt16, index: Int) {
    let descriptor = socket(AF_INET, SOCK_STREAM, 0)
    precondition(descriptor >= 0)
    defer { close(descriptor) }
    var timeout = timeval(tv_sec: 3, tv_usec: 0)
    precondition(setsockopt(
      descriptor, SOL_SOCKET, SO_RCVTIMEO, &timeout,
      socklen_t(MemoryLayout<timeval>.size)
    ) == 0)
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let connected = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    precondition(connected == 0, "Connection \(index) failed")
    let request = Array("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n".utf8)
    let sent = request.withUnsafeBytes { send(descriptor, $0.baseAddress, $0.count, 0) }
    precondition(sent == request.count)
    var response = [UInt8](repeating: 0, count: 1024)
    let received = recv(descriptor, &response, response.count, 0)
    precondition(received > 0, "Listener exhausted at connection \(index)")
    precondition(String(decoding: response.prefix(received), as: UTF8.self).contains("407"))
  }
}
