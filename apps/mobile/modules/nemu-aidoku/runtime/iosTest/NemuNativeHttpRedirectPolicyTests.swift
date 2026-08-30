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
    print("NemuNativeHttpRedirectPolicyTests passed.")
  }
}
