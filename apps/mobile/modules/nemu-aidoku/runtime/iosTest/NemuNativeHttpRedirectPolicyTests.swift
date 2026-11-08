import Foundation

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
    print("NemuNativeHttpRedirectPolicyTests passed.")
  }
}
