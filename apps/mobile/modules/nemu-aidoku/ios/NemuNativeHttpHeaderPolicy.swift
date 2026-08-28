import Foundation

/// Source packages can invent credential header names (for example `X-Auth`),
/// so a cross-origin redirect retains only an explicit protocol/representation
/// safelist. Keep this in parity with Android.
enum NemuNativeHttpHeaderPolicy {
  private static let crossOriginSafeHeaders: Set<String> = [
    "accept",
    "accept-charset",
    "accept-encoding",
    "accept-language",
    "cache-control",
    "connection",
    "content-encoding",
    "content-language",
    "content-length",
    "content-type",
    "date",
    "expect",
    "host",
    "if-match",
    "if-modified-since",
    "if-none-match",
    "if-range",
    "if-unmodified-since",
    "pragma",
    "range",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
  ]

  static func isCrossOriginSensitive(_ name: String) -> Bool {
    !crossOriginSafeHeaders.contains(name.lowercased())
  }

  static func strippingCrossOriginSecrets(from request: URLRequest) -> URLRequest {
    var sanitized = request
    for name in (request.allHTTPHeaderFields ?? [:]).keys
    where isCrossOriginSensitive(name) {
      sanitized.setValue(nil, forHTTPHeaderField: name)
    }
    return sanitized
  }
}
