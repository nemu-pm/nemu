import Foundation

/// Identity of the page-side Web Worker a sandbox session was registered with.
///
/// `generation` tracks the WKWebView document (advanced by the navigation
/// delegate and by an explicit runtime reset). `epoch` tracks the Worker inside
/// that document: the page owns its Worker lifetime and recreates it after a
/// watchdog kill, an `onerror` teardown, or an oversized reply, none of which
/// the native side can observe when no command is in flight.
struct NemuAidokuSandboxWorkerIdentity: Equatable {
  static let unregistered = NemuAidokuSandboxWorkerIdentity(generation: -1, epoch: -1)

  let generation: Int
  let epoch: Int

  var isRegistered: Bool { generation >= 0 && epoch >= 0 }
}

/// Foundation-only registration rules for the isolated iOS Aidoku sandbox.
/// Kept free of WebKit so the behaviour can be unit tested with `swiftc`.
enum NemuAidokuSandboxSessionPolicy {
  /// Runtime status codes that mean "the thing you named no longer exists".
  private static let lostRegistrationCodes: Set<String> = [
    "session-missing",
    "operation-missing",
  ]

  /// Codes whose rejection is generic; only a session-expiry detail proves the
  /// registration itself is gone (as opposed to, say, a concurrency rejection).
  private static let ambiguousRejectionCodes: Set<String> = [
    "operation-rejected",
    "settings-rejected",
    "replay-rejected",
  ]

  /// True when a well-formed runtime rejection means our registration was lost.
  ///
  /// A recreated Worker answers every command from an empty session table, so
  /// the reply is a valid `{"status":"error"}` envelope rather than a transport
  /// failure. Without this, nothing resets the runtime and every later
  /// operation for the source keeps failing until the app process restarts.
  static func indicatesLostRegistration(status parsed: [String: Any]) -> Bool {
    guard parsed["status"] as? String == "error" else { return false }
    let code = parsed["code"] as? String ?? ""
    if lostRegistrationCodes.contains(code) { return true }
    guard ambiguousRejectionCodes.contains(code) else { return false }
    let detail = (parsed["detail"] as? String ?? "").lowercased()
    return detail.contains("session expired") || detail.contains("operation expired")
  }

  /// True when the session must be registered again before it can be used.
  static func requiresRegistration(
    recorded: NemuAidokuSandboxWorkerIdentity,
    observed: NemuAidokuSandboxWorkerIdentity,
    generation: Int
  ) -> Bool {
    guard recorded.isRegistered, recorded.generation == generation else { return true }
    // The observed identity is only meaningful for the current document. An
    // epoch from an older document says nothing about this one.
    guard observed.isRegistered, observed.generation == generation else { return false }
    return observed.epoch != recorded.epoch
  }
}
