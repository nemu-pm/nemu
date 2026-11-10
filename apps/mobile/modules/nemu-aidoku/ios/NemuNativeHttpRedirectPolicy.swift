import Foundation

/// Per-request redirect policy for credential-bearing native HTTP calls.
/// General Aidoku source traffic may intentionally use HTTP, so callers opt in
/// only when every hop must remain authenticated HTTPS (for example PKCE token
/// exchange). URLSession asks this policy before it follows each redirect.
enum NemuNativeHttpRedirectPolicy {
  static let blockedMessage =
    "Native source networking blocked a redirect that did not remain HTTPS."

  private static let notFollowingRedirectsKey = "pm.nemu.native-http.not-following-redirects"

  /// Marks a request whose redirects are not followed: the 3xx response is
  /// the response, with the same peer validation and final-response cookie
  /// handling as any other. For a login that sets its session cookie on the
  /// redirect (Suwayomi's Simple Login), whose cookie would otherwise be
  /// dropped with the redirect hop. A URLProtocol property travels with the
  /// request into `URLSessionTask.originalRequest`.
  static func markNotFollowingRedirects(_ request: inout URLRequest) {
    guard let mutable = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest else { return }
    URLProtocol.setProperty(true, forKey: notFollowingRedirectsKey, in: mutable)
    request = mutable as URLRequest
  }

  static func followsRedirects(_ request: URLRequest?) -> Bool {
    guard let request else { return true }
    return URLProtocol.property(forKey: notFollowingRedirectsKey, in: request) as? Bool != true
  }

  static func allows(_ url: URL?, requireHttps: Bool) -> Bool {
    guard requireHttps else { return true }
    return url?.scheme?.lowercased() == "https"
  }

  /// A redirect from HTTPS down to plain HTTP on the same host is followed
  /// over HTTPS instead, as HSTS would. Some sites canonicalise URLs through
  /// an `http://` Location (Manhuagui answers `https://www.manhuagui.com//comic/1`
  /// with `301 http://www.manhuagui.com/comic/1/`); the host already served
  /// the original request over HTTPS, so the hop is not downgraded to
  /// cleartext. Every other redirect is returned unchanged.
  static func upgradingSameHostDowngrade(_ redirect: URL, from original: URL?) -> URL {
    guard
      original?.scheme?.lowercased() == "https",
      redirect.scheme?.lowercased() == "http",
      let host = redirect.host?.lowercased(),
      !host.isEmpty,
      host == original?.host?.lowercased(),
      var components = URLComponents(url: redirect, resolvingAgainstBaseURL: false)
    else {
      return redirect
    }
    components.scheme = "https"
    if components.port == 80 { components.port = nil }
    return components.url ?? redirect
  }
}
