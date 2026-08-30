import Foundation

@main
enum NemuNativeHttpHeaderPolicyTests {
  static func main() {
    for name in [
      "Authorization",
      "Cookie",
      "proxy-authorization",
      "BETTER-AUTH-COOKIE",
      "Api-Key",
      "X-Api-Key",
      "Source-Auth-Cookie",
      "Source-Auth-Token",
      "Source-Access-Token",
      "Source-Session-Token",
      "Source-Api-Key",
      "X-CSRF-Token",
      "Vendor-Credential",
      "Vendor-Secret",
      "Vendor-Password",
      "Vendor-Token",
      "Vendor-Cookie",
      "Vendor-Session",
      "X-Auth",
      "Authentication",
      "X-Api-Version",
      "Arbitrary-Custom-Header",
    ] {
      precondition(
        NemuNativeHttpHeaderPolicy.isCrossOriginSensitive(name),
        "Expected a sensitive header: \(name)"
      )
    }
    for name in ["Accept", "Content-Type", "Accept-Language", "Range", "User-Agent"] {
      precondition(
        !NemuNativeHttpHeaderPolicy.isCrossOriginSensitive(name),
        "Expected a non-sensitive header: \(name)"
      )
    }

    var request = URLRequest(url: URL(string: "https://other.example/redirect")!)
    request.setValue("Bearer secret", forHTTPHeaderField: "Authorization")
    request.setValue("source-secret", forHTTPHeaderField: "X-Api-Key")
    request.setValue("session-secret", forHTTPHeaderField: "Vendor-Session-Token")
    request.setValue("unrecognized-secret", forHTTPHeaderField: "X-Auth")
    request.setValue("also-secret", forHTTPHeaderField: "Authentication")
    request.setValue("custom-secret", forHTTPHeaderField: "X-Api-Version")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let sanitized = NemuNativeHttpHeaderPolicy.strippingCrossOriginSecrets(
      from: request
    )
    precondition(sanitized.value(forHTTPHeaderField: "Authorization") == nil)
    precondition(sanitized.value(forHTTPHeaderField: "X-Api-Key") == nil)
    precondition(sanitized.value(forHTTPHeaderField: "Vendor-Session-Token") == nil)
    precondition(sanitized.value(forHTTPHeaderField: "X-Auth") == nil)
    precondition(sanitized.value(forHTTPHeaderField: "Authentication") == nil)
    precondition(sanitized.value(forHTTPHeaderField: "X-Api-Version") == nil)
    precondition(sanitized.value(forHTTPHeaderField: "Accept") == "application/json")
    print("NemuNativeHttpHeaderPolicyTests passed.")
  }
}
