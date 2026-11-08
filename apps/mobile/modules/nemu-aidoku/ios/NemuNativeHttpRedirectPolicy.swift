import Foundation

/// Per-request redirect policy for credential-bearing native HTTP calls.
/// General Aidoku source traffic may intentionally use HTTP, so callers opt in
/// only when every hop must remain authenticated HTTPS (for example PKCE token
/// exchange). URLSession asks this policy before it follows each redirect.
enum NemuNativeHttpRedirectPolicy {
  static let blockedMessage =
    "Native source networking blocked a redirect that did not remain HTTPS."

  static func allows(_ url: URL?, requireHttps: Bool) -> Bool {
    guard requireHttps else { return true }
    return url?.scheme?.lowercased() == "https"
  }

  /// A redirect from HTTPS down to plain HTTP on the same host is followed
  /// over HTTPS instead, as HSTS would. Some sites canonicalise URLs through
  /// an `http://` Location (Manhuagui answers `https://www.manhuagui.com//comic/1`
  /// with `301 http://www.manhuagui.com/comic/1/`), which App Transport
  /// Security refuses outright, failing the source request; the host already
  /// served the original request over HTTPS. Every other redirect is returned
  /// unchanged.
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
