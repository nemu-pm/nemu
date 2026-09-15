import Foundation

@main
enum NemuAidokuSandboxSessionPolicyTests {
  static func main() {
    testLostRegistrationDetection()
    testRegistrationRequirement()
    print("NemuAidokuSandboxSessionPolicyTests passed.")
  }

  private static func statusObject(_ json: String) -> [String: Any] {
    guard
      let data = json.data(using: .utf8),
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return [:]
    }
    return parsed
  }

  private static func expect(
    _ condition: Bool,
    _ message: String,
    file: StaticString = #file,
    line: UInt = #line
  ) {
    precondition(condition, message, file: file, line: line)
  }

  private static func testLostRegistrationDetection() {
    // The exact reply a recreated Worker produces for a session it never saw.
    expect(
      NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject(
          "{\"status\":\"error\",\"code\":\"operation-rejected\",\"detail\":\"Aidoku session expired.\"}"
        )
      ),
      "beginOperation's session-expiry rejection must be recoverable."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject(
          "{\"status\":\"error\",\"code\":\"session-missing\",\"detail\":\"Aidoku session expired.\"}"
        )
      ),
      "runOperation's session-missing result must be recoverable."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject(
          "{\"status\":\"error\",\"code\":\"operation-missing\",\"detail\":\"Aidoku operation expired.\"}"
        )
      ),
      "A Worker recycled mid-operation must be recoverable."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject(
          "{\"status\":\"error\",\"code\":\"settings-rejected\",\"detail\":\"Aidoku session expired.\"}"
        )
      ),
      "updateSessionSettings' session-expiry rejection must be recoverable."
    )

    // Real source/runtime failures must not trigger a re-register and replay.
    expect(
      !NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject(
          "{\"status\":\"error\",\"code\":\"operation-rejected\",\"detail\":\"Another isolated Aidoku operation is still running.\"}"
        )
      ),
      "A concurrency rejection is not a lost registration."
    )
    expect(
      !NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject(
          "{\"status\":\"error\",\"code\":\"replay-rejected\",\"detail\":\"Aidoku replay cursor is invalid.\"}"
        )
      ),
      "A replay mismatch is not a lost registration."
    )
    expect(
      !NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(
        status: statusObject("{\"status\":\"registered\"}")
      ),
      "A success envelope is never a lost registration."
    )
    expect(
      !NemuAidokuSandboxSessionPolicy.indicatesLostRegistration(status: [:]),
      "An unparsable envelope is not treated as a lost registration."
    )
  }

  private static func testRegistrationRequirement() {
    let generation = 4
    let registered = NemuAidokuSandboxWorkerIdentity(generation: generation, epoch: 7)

    expect(
      NemuAidokuSandboxSessionPolicy.requiresRegistration(
        recorded: .unregistered,
        observed: registered,
        generation: generation
      ),
      "A session that never registered must register."
    )
    expect(
      !NemuAidokuSandboxSessionPolicy.requiresRegistration(
        recorded: registered,
        observed: registered,
        generation: generation
      ),
      "A session registered with the live Worker must not re-register."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.requiresRegistration(
        recorded: registered,
        observed: NemuAidokuSandboxWorkerIdentity(generation: generation, epoch: 8),
        generation: generation
      ),
      "A page-side Worker restart must invalidate the registration."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.requiresRegistration(
        recorded: registered,
        observed: registered,
        generation: generation + 1
      ),
      "A reloaded WebContent document must invalidate the registration."
    )
    // A fresh document restarts its epoch counter at 1, so an epoch observed
    // under the previous document must never validate a new registration.
    expect(
      NemuAidokuSandboxSessionPolicy.requiresRegistration(
        recorded: NemuAidokuSandboxWorkerIdentity(generation: 5, epoch: 1),
        observed: NemuAidokuSandboxWorkerIdentity(generation: 4, epoch: 1),
        generation: 4
      ),
      "An identity from another document cannot validate this one."
    )
    expect(
      !NemuAidokuSandboxSessionPolicy.requiresRegistration(
        recorded: registered,
        observed: NemuAidokuSandboxWorkerIdentity(generation: generation - 1, epoch: 99),
        generation: generation
      ),
      "A stale observation from an older document must not force a re-register."
    )

    // A typed source failure crosses to React Native as a bounded envelope so
    // the protocol layer can rebuild it (name, code, url, host); anything else
    // stays a native rejection.
    let cloudflare: [String: Any] = [
      "status": "error", "code": "runtime-failed",
      "detail": "Cloudflare challenge detected for https://reader.example.com/x (status 403)",
      "errorName": "CloudflareBlockedError",
      "errorUrl": "https://reader.example.com/x", "errorHost": "reader.example.com",
      "errorUserAgent": "UA", "ignored": "dropped",
    ]
    let envelope = NemuAidokuSandboxSessionPolicy.propagatedErrorEnvelope(cloudflare)
    expect(envelope != nil, "A CloudflareBlockedError envelope must be propagated.")
    expect(envelope?["errorUrl"] as? String == "https://reader.example.com/x", "The url survives.")
    expect(envelope?["errorHost"] as? String == "reader.example.com", "The host survives.")
    expect(envelope?["errorUserAgent"] as? String == "UA", "The user agent survives.")
    expect(envelope?["ignored"] == nil, "Only the closed key set crosses.")
    let sourceFailure: [String: Any] = [
      "status": "error", "errorName": "AidokuResultError", "errorCode": -2,
    ]
    let sourceEnvelope = NemuAidokuSandboxSessionPolicy.propagatedErrorEnvelope(sourceFailure)
    expect((sourceEnvelope?["errorCode"] as? NSNumber)?.intValue == -2, "The result code survives.")
    expect(
      NemuAidokuSandboxSessionPolicy.propagatedErrorEnvelope([
        "status": "error", "detail": "boom", "errorName": "MobileSourceDisabledError",
      ]) == nil,
      "An error class outside the allow-list stays a native rejection."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.propagatedErrorEnvelope([
        "status": "error", "code": "replay-rejected", "detail": "Aidoku operation expired.",
      ]) == nil,
      "A runtime failure without a typed name stays a native rejection."
    )
    expect(
      NemuAidokuSandboxSessionPolicy.propagatedErrorEnvelope([
        "status": "complete", "errorName": "CloudflareBlockedError",
      ]) == nil,
      "Only an error envelope is propagated."
    )
    let long = String(repeating: "a", count: 5_000)
    let bounded = NemuAidokuSandboxSessionPolicy.propagatedErrorEnvelope([
      "status": "error", "errorName": "AidokuResultError", "detail": long, "errorUrl": long,
    ])
    expect((bounded?["detail"] as? String)?.count == 2_048, "detail is bounded.")
    expect((bounded?["errorUrl"] as? String)?.count == 2_048, "errorUrl is bounded.")
  }
}
