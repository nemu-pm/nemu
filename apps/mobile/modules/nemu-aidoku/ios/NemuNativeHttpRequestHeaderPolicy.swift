import Foundation

/// Bounds and canonicalizes source-authored request headers before Foundation
/// sees them. Aidoku sources are untrusted packages, so malformed headers must
/// fail with a stable error instead of reaching URLSession or allocating an
/// unbounded native header block.
enum NemuNativeHttpRequestHeaderPolicy {
  static let maxHeaderCount = 128
  static let maxHeaderNameCharacters = 256
  static let maxHeaderValueCharacters = 16 * 1024
  static let maxHeaderValueWireBytes = 16 * 1024
  static let maxTotalHeaderWireBytes = 64 * 1024

  private static let tokenCharacters = Set(
    "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  )

  static func normalize(_ headers: [String: String]) throws -> [String: String] {
    guard headers.count <= maxHeaderCount else {
      throw PolicyError("Native HTTP request has too many headers.")
    }

    var totalWireBytes = 0
    var normalized: [String: String] = [:]
    var normalizedNames = Set<String>()
    normalized.reserveCapacity(headers.count)
    normalizedNames.reserveCapacity(headers.count)
    for (rawName, rawValue) in headers {
      // Retain the bridge's historical behavior for an empty property name.
      if rawName.allSatisfy(\.isWhitespace) { continue }
      guard
        rawName.utf16.count <= maxHeaderNameCharacters,
        rawName.allSatisfy({ tokenCharacters.contains($0) })
      else {
        throw PolicyError("Native HTTP request has an invalid header name.")
      }
      let normalizedName = rawName.lowercased()
      guard normalizedNames.insert(normalizedName).inserted else {
        throw PolicyError("Native HTTP request has duplicate header names.")
      }
      guard rawValue.utf16.count <= maxHeaderValueCharacters else {
        throw PolicyError("Native HTTP request has an oversized header value.")
      }

      let value = try normalizeURLValue(normalizedName: normalizedName, value: rawValue)
      guard isPrintableASCII(value) else {
        throw PolicyError(
          "Native HTTP request header values must use printable ASCII."
        )
      }
      let valueWireBytes = value.utf8.count
      guard valueWireBytes <= maxHeaderValueWireBytes else {
        throw PolicyError("Native HTTP request has an oversized header value.")
      }
      // Header names and normalized values are ASCII at this point, so UTF-8
      // length is the exact HTTP/1 field-content byte length. Rechecking after
      // URL canonicalization prevents percent-encoding from expanding a small
      // Unicode input past the advertised per-value bound.
      totalWireBytes += rawName.utf8.count + valueWireBytes
      guard totalWireBytes <= maxTotalHeaderWireBytes else {
        throw PolicyError("Native HTTP request headers exceed the safety limit.")
      }
      // Sources never control Nemu's loopback-proxy credential. Validate and
      // count the field first so the reserved name cannot bypass bounds or
      // case-folded duplicate rejection.
      if normalizedName == "proxy-authorization" { continue }
      normalized[rawName] = value
    }
    return normalized
  }

  static func apply(
    _ headers: [String: String],
    to request: inout URLRequest
  ) throws {
    for (name, value) in try normalize(headers) {
      request.setValue(value, forHTTPHeaderField: name)
    }
  }

  private static func normalizeURLValue(
    normalizedName: String,
    value: String
  ) throws -> String {
    if isPrintableASCII(value) { return value }
    guard
      normalizedName == "referer" || normalizedName == "referrer" || normalizedName == "origin"
    else {
      return value
    }
    guard
      let url = URL(string: value),
      let scheme = url.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      url.host?.isEmpty == false,
      isPrintableASCII(url.absoluteString)
    else {
      throw PolicyError("Native HTTP request has an invalid URL header.")
    }
    return url.absoluteString
  }

  private static func isPrintableASCII(_ value: String) -> Bool {
    value.unicodeScalars.allSatisfy {
      $0.value == 0x09 || (0x20...0x7e).contains($0.value)
    }
  }

  private struct PolicyError: LocalizedError {
    let errorDescription: String?

    init(_ description: String) {
      errorDescription = description
    }
  }
}
