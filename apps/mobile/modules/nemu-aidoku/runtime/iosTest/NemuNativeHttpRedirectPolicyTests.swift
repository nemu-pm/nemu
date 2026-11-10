import Foundation
import Network

/// A loopback HTTP server: `/login` answers 303 to `/next` with a session
/// cookie (as Suwayomi's Simple Login does), `/next` answers 200.
private final class LoopbackRedirectServer: @unchecked Sendable {
  private let listener: NWListener
  private let queue = DispatchQueue(label: "redirect-tests.server")
  let port: UInt16

  init() {
    listener = try! NWListener(using: .tcp, on: .any)
    let ready = DispatchSemaphore(value: 0)
    listener.stateUpdateHandler = { state in
      if case .ready = state { ready.signal() }
    }
    listener.newConnectionHandler = { connection in
      connection.start(queue: DispatchQueue(label: "redirect-tests.connection"))
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, _, _ in
        let head = String(decoding: data ?? Data(), as: UTF8.self)
        let reply = head.hasPrefix("POST /login") || head.hasPrefix("GET /login")
          ? "HTTP/1.1 303 See Other\r\nLocation: /next\r\nSet-Cookie: JSESSIONID=fresh; Path=/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
          : "HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nfollowed"
        connection.send(content: Data(reply.utf8), completion: .contentProcessed { _ in
          connection.cancel()
        })
      }
    }
    listener.start(queue: queue)
    precondition(ready.wait(timeout: .now() + 5) == .success, "loopback listener did not start")
    port = listener.port!.rawValue
  }

  func stop() { listener.cancel() }
}

/// Mirrors the module's session delegate: a marked request is not redirected.
private final class RedirectDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(NemuNativeHttpRedirectPolicy.followsRedirects(task.originalRequest) ? request : nil)
  }
}

private final class ResponseBox: @unchecked Sendable {
  var response: HTTPURLResponse?
  var body = Data()
}

private func send(_ request: URLRequest, session: URLSession, download: Bool) -> ResponseBox {
  let box = ResponseBox()
  let done = DispatchSemaphore(value: 0)
  if download {
    session.downloadTask(with: request) { location, response, _ in
      box.response = response as? HTTPURLResponse
      box.body = location.flatMap { try? Data(contentsOf: $0) } ?? Data()
      done.signal()
    }.resume()
  } else {
    session.dataTask(with: request) { data, response, _ in
      box.response = response as? HTTPURLResponse
      box.body = data ?? Data()
      done.signal()
    }.resume()
  }
  precondition(done.wait(timeout: .now() + 10) == .success, "loopback request timed out")
  return box
}

private func testNotFollowingRedirects() {
  var unmarked = URLRequest(url: URL(string: "http://127.0.0.1/login")!)
  precondition(NemuNativeHttpRedirectPolicy.followsRedirects(unmarked))
  precondition(NemuNativeHttpRedirectPolicy.followsRedirects(nil))
  NemuNativeHttpRedirectPolicy.markNotFollowingRedirects(&unmarked)
  precondition(!NemuNativeHttpRedirectPolicy.followsRedirects(unmarked))

  let server = LoopbackRedirectServer()
  defer { server.stop() }
  let configuration = URLSessionConfiguration.ephemeral
  configuration.httpCookieAcceptPolicy = .never
  configuration.httpShouldSetCookies = false
  let session = URLSession(configuration: configuration, delegate: RedirectDelegate(), delegateQueue: nil)
  defer { session.invalidateAndCancel() }

  for download in [false, true] {
    var login = URLRequest(url: URL(string: "http://127.0.0.1:\(server.port)/login")!)
    login.httpMethod = download ? "GET" : "POST"
    login.httpBody = download ? nil : Data("user=a&pass=b".utf8)
    let followed = send(login, session: session, download: download)
    precondition(followed.response?.statusCode == 200, "an unmarked request follows the redirect")
    precondition(String(decoding: followed.body, as: UTF8.self) == "followed")

    NemuNativeHttpRedirectPolicy.markNotFollowingRedirects(&login)
    let kept = send(login, session: session, download: download)
    precondition(kept.response?.statusCode == 303, "a marked request returns the 303 itself (download: \(download))")
    precondition(kept.response?.url?.path == "/login")
    precondition(kept.response?.value(forHTTPHeaderField: "Location") == "/next")
    let cookies = HTTPCookie.cookies(
      withResponseHeaderFields: kept.response?.allHeaderFields as? [String: String] ?? [:],
      for: kept.response!.url!
    )
    precondition(cookies.map(\.name) == ["JSESSIONID"] && cookies.first?.value == "fresh")
  }
}

@main
enum NemuNativeHttpRedirectPolicyTests {
  static func main() {
    precondition(
      NemuNativeHttpRedirectPolicy.allows(
        URL(string: "https://tokens.example/exchange"),
        requireHttps: true
      )
    )
    precondition(
      !NemuNativeHttpRedirectPolicy.allows(
        URL(string: "http://attacker.example/steal"),
        requireHttps: true
      )
    )
    precondition(
      NemuNativeHttpRedirectPolicy.allows(
        URL(string: "http://legacy-source.example/page"),
        requireHttps: false
      )
    )
    precondition(
      !NemuNativeHttpRedirectPolicy.allows(nil, requireHttps: true)
    )
    // Same-host HTTPS -> HTTP downgrades are followed over HTTPS.
    let upgraded = NemuNativeHttpRedirectPolicy.upgradingSameHostDowngrade(
      URL(string: "http://www.manhuagui.com/comic/19430/?a=1")!,
      from: URL(string: "https://www.manhuagui.com//comic/19430")
    )
    precondition(upgraded.absoluteString == "https://www.manhuagui.com/comic/19430/?a=1", upgraded.absoluteString)
    let defaultPort = NemuNativeHttpRedirectPolicy.upgradingSameHostDowngrade(
      URL(string: "http://Example.com:80/x")!,
      from: URL(string: "https://example.com/y")
    )
    precondition(defaultPort.absoluteString == "https://Example.com/x", defaultPort.absoluteString)
    // Another host, an HTTP original, or an HTTPS target are left alone.
    for (redirect, original) in [
      ("http://m.manhuagui.com/comic/1/", "https://www.manhuagui.com/comic/1"),
      ("http://legacy-source.example/b", "http://legacy-source.example/a"),
      ("https://example.com/b", "https://example.com/a"),
    ] {
      let unchanged = NemuNativeHttpRedirectPolicy.upgradingSameHostDowngrade(
        URL(string: redirect)!,
        from: URL(string: original)
      )
      precondition(unchanged.absoluteString == redirect, unchanged.absoluteString)
    }
    precondition(
      NemuNativeHttpRedirectPolicy.upgradingSameHostDowngrade(
        URL(string: "http://example.com/b")!,
        from: nil
      ).absoluteString == "http://example.com/b"
    )
    testNotFollowingRedirects()
    print("NemuNativeHttpRedirectPolicyTests passed.")
  }
}
