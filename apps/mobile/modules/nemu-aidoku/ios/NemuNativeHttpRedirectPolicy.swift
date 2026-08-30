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
}
