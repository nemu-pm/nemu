import Foundation

@main
enum NemuNativeHttpRequestHeaderPolicyTests {
  static func main() throws {
    testUserAgentDefaults()
    let unicodeHeaders = [
      "Referer":
        "https://mangamura.me/manga/\u{5f8c}\u{5bae}\u{771f}\u{8d0b}\u{5224}\u{5b9a}\u{4eba}/ja/chapter-6-raw/",
      "Origin": "https://\u{4f8b}\u{3048}.\u{30c6}\u{30b9}\u{30c8}",
    ]
    let expectedReferer =
      "https://mangamura.me/manga/%E5%BE%8C%E5%AE%AE%E7%9C%9F%E8%B4%8B%E5%88%A4%E5%AE%9A%E4%BA%BA/ja/chapter-6-raw/"
    let expectedOrigin = "https://xn--r8jz45g.xn--zckzah"

    let normalized = try NemuNativeHttpRequestHeaderPolicy.normalize(
      unicodeHeaders
    )
    precondition(normalized["Referer"] == expectedReferer)
    precondition(normalized["Origin"] == expectedOrigin)

    // Both public native seams converge on the same URLRequest builder. Apply
    // the pure policy to representatives of each seam to prevent a future
    // file-download path from regressing independently of byte responses.
    var byteRequest = URLRequest(url: URL(string: "https://source.example/api")!)
    try NemuNativeHttpRequestHeaderPolicy.apply(
      unicodeHeaders,
      to: &byteRequest
    )
    assertUnicodeHeaders(
      byteRequest,
      seam: "byte response",
      referer: expectedReferer,
      origin: expectedOrigin
    )

    var fileRequest = URLRequest(url: URL(string: "https://source.example/page.jpg")!)
    try NemuNativeHttpRequestHeaderPolicy.apply(
      unicodeHeaders,
      to: &fileRequest
    )
    assertUnicodeHeaders(
      fileRequest,
      seam: "file download",
      referer: expectedReferer,
      origin: expectedOrigin
    )

    let ordinary = try NemuNativeHttpRequestHeaderPolicy.normalize([
      "Referer": "https://example.test/chapter/1",
      "X-Source": "aidoku",
      "   ": "ignored",
    ])
    precondition(ordinary["Referer"] == "https://example.test/chapter/1")
    precondition(ordinary["X-Source"] == "aidoku")
    precondition(ordinary["   "] == nil)

    let strippedProxyHeaders = try NemuNativeHttpRequestHeaderPolicy.normalize([
      "Accept": "image/*",
      "pRoXy-AuThOrIzAtIoN": "Basic source-secret",
    ])
    precondition(strippedProxyHeaders["Accept"] == "image/*")
    precondition(
      !strippedProxyHeaders.keys.contains {
        $0.caseInsensitiveCompare("Proxy-Authorization") == .orderedSame
      }
    )

    var proxyRequest = URLRequest(url: URL(string: "https://source.example")!)
    try NemuNativeHttpRequestHeaderPolicy.apply(
      [
        "Accept": "image/*",
        "Proxy-Authorization": "Basic source-secret",
      ], to: &proxyRequest)
    precondition(proxyRequest.value(forHTTPHeaderField: "Accept") == "image/*")
    precondition(
      proxyRequest.value(forHTTPHeaderField: "Proxy-Authorization") == nil
    )

    expectFailure("invalid header name") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "X-Injected\r\nHeader": "value"
      ])
    }
    expectExactFailure("Native HTTP request has duplicate header names.") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "Cookie": "session=first",
        "cookie": "session=second",
      ])
    }
    expectExactFailure("Native HTTP request has duplicate header names.") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "Referer": "https://example.test/first",
        "referer": "https://example.test/second",
      ])
    }
    var duplicateProxyRequest = URLRequest(
      url: URL(string: "https://source.example")!
    )
    expectExactFailure("Native HTTP request has duplicate header names.") {
      try NemuNativeHttpRequestHeaderPolicy.apply(
        [
          "Proxy-Authorization": "Basic first-secret",
          "proxy-authorization": "Basic second-secret",
        ],
        to: &duplicateProxyRequest
      )
    }
    precondition(
      duplicateProxyRequest.value(forHTTPHeaderField: "Proxy-Authorization") == nil
    )
    expectFailure("printable ASCII") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "X-Title": "\u{5f8c}\u{5bae}"
      ])
    }
    expectFailure("printable ASCII") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "X-Test": "ok\r\ninjected"
      ])
    }
    expectFailure("invalid URL header") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "Referer": "not a URL \u{5f8c}\u{5bae}"
      ])
    }
    expectFailure("too many headers") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize(
        Dictionary(
          uniqueKeysWithValues: (0...NemuNativeHttpRequestHeaderPolicy.maxHeaderCount).map {
            ("X-\($0)", "value")
          }
        )
      )
    }
    expectExactFailure("Native HTTP request has an oversized header value.") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "X-Large": String(
          repeating: "a",
          count: NemuNativeHttpRequestHeaderPolicy.maxHeaderValueCharacters + 1
        )
      ])
    }
    let expansionBoundary =
      "https://example.test/a" + String(repeating: "\u{5f8c}", count: 1_818)
    let boundaryValue = try NemuNativeHttpRequestHeaderPolicy.normalize([
      "Referer": expansionBoundary
    ])["Referer"]
    precondition(
      boundaryValue?.utf8.count == NemuNativeHttpRequestHeaderPolicy.maxHeaderValueWireBytes
    )
    expectExactFailure("Native HTTP request has an oversized header value.") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize([
        "Referer":
          "https://example.test/aa" + String(repeating: "\u{5f8c}", count: 1_818)
      ])
    }
    expectFailure("safety limit") {
      _ = try NemuNativeHttpRequestHeaderPolicy.normalize(
        Dictionary(
          uniqueKeysWithValues: (0..<5).map {
            (
              "X-\($0)",
              String(
                repeating: "a",
                count: NemuNativeHttpRequestHeaderPolicy.maxHeaderValueCharacters
              )
            )
          })
      )
    }

    print("NemuNativeHttpRequestHeaderPolicyTests passed.")
  }

  private static func assertUnicodeHeaders(
    _ request: URLRequest,
    seam: String,
    referer: String,
    origin: String
  ) {
    precondition(
      request.value(forHTTPHeaderField: "Referer") == referer,
      "Unicode Referer was not canonicalized at the \(seam) seam."
    )
    precondition(
      request.value(forHTTPHeaderField: "Origin") == origin,
      "Unicode Origin was not canonicalized at the \(seam) seam."
    )
  }

  /// A source's cookies (a `cf_clearance` among them) only work next to the
  /// User-Agent that solved the challenge, so source-owned requests never
  /// fall through to the platform browser UA.
  private static func testUserAgentDefaults() {
    let source = "Source-UA/17"
    let platform = "Platform-UA/26"

    // A source's own UA always wins, whatever its casing.
    let custom = ["user-agent": "Custom/1", "Referer": "https://example.test/"]
    precondition(NemuNativeHttpRequestHeaderPolicy.hasUserAgent(custom))
    precondition(
      NemuNativeHttpRequestHeaderPolicy.ensuringUserAgent(custom, source) == custom
    )

    let bare = ["Cookie": "cf_clearance=abc", "Referer": "https://example.test/"]
    precondition(!NemuNativeHttpRequestHeaderPolicy.hasUserAgent(bare))
    let ensured = NemuNativeHttpRequestHeaderPolicy.ensuringUserAgent(bare, source)
    precondition(ensured["User-Agent"] == source)
    precondition(ensured["Cookie"] == "cf_clearance=abc")
    precondition(ensured["Referer"] == "https://example.test/")
    precondition(ensured.count == 3)

    // Scoped (source) requests fall back to the source default; unscoped
    // traffic keeps the platform UA. A blank scope is unscoped, matching the
    // HTTP path's own normalization.
    precondition(
      NemuNativeHttpRequestHeaderPolicy.fallbackUserAgent(
        cookieScope: "profile::registry:source",
        sourceDefault: source,
        platformDefault: platform
      ) == source
    )
    for scope in [nil, "", "  \n"] as [String?] {
      precondition(
        NemuNativeHttpRequestHeaderPolicy.fallbackUserAgent(
          cookieScope: scope,
          sourceDefault: source,
          platformDefault: platform
        ) == platform
      )
    }

    // Source-owned image requests: the source UA follows the source's stored
    // cookies. The jar contributed a cookie (none of the source's own, or more
    // than the source's own): the UA the clearance is bound to rides along.
    let jarOnly = NemuNativeHttpRequestHeaderPolicy.sourceImageHeaders(
      ["Cookie": "cf_clearance=abc"],
      sourceCookie: nil,
      sourceUserAgent: source
    )
    precondition(jarOnly == ["Cookie": "cf_clearance=abc", "User-Agent": source])
    let merged = NemuNativeHttpRequestHeaderPolicy.sourceImageHeaders(
      ["cookie": "cf_clearance=abc; lang=en", "Referer": "https://example.test/"],
      sourceCookie: "lang=en",
      sourceUserAgent: source
    )
    precondition(merged["User-Agent"] == source)
    // A source's own UA is never replaced.
    precondition(
      NemuNativeHttpRequestHeaderPolicy.sourceImageHeaders(
        ["Cookie": "cf_clearance=abc", "User-Agent": "Custom/1"],
        sourceCookie: nil,
        sourceUserAgent: source
      ) == ["Cookie": "cf_clearance=abc", "User-Agent": "Custom/1"]
    )
    // The jar contributed nothing: the request stays exactly as the source
    // produced it, so its image cache key does not change for nothing.
    for (headers, sourceCookie) in [
      ([:], nil),
      (["Referer": "https://example.test/"], nil),
      (["Cookie": "lang=en"], "lang=en"),
    ] as [([String: String], String?)] {
      precondition(
        NemuNativeHttpRequestHeaderPolicy.sourceImageHeaders(
          headers,
          sourceCookie: sourceCookie,
          sourceUserAgent: source
        ) == headers
      )
    }
  }

  private static func expectFailure(
    _ message: String,
    operation: () throws -> Void
  ) {
    do {
      try operation()
      preconditionFailure("Expected policy failure containing: \(message)")
    } catch {
      precondition(
        error.localizedDescription.contains(message),
        "Unexpected policy failure: \(error.localizedDescription)"
      )
    }
  }

  private static func expectExactFailure(
    _ message: String,
    operation: () throws -> Void
  ) {
    do {
      try operation()
      preconditionFailure("Expected exact policy failure: \(message)")
    } catch {
      precondition(
        error.localizedDescription == message,
        "Unexpected policy failure: \(error.localizedDescription)"
      )
    }
  }
}
