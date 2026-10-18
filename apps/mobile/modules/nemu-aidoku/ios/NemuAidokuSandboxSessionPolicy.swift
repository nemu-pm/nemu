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
  /// Error names the React Native protocol layer can rebuild
  /// (`RECONSTRUCTABLE_SANDBOX_ERROR_NAMES` in `mobileAidokuSandboxProtocol.ts`).
  /// Closed on purpose: a hostile source must not be able to make the host
  /// reconstruct an arbitrary error class.
  static let propagatedErrorNames: Set<String> = [
    "AidokuResultError",
    "CloudflareBlockedError",
  ]

  /// The bounded subset of a `status: "error"` envelope that may cross to
  /// React Native as the operation's *result* instead of a bare native
  /// rejection, or nil when the failure is not a typed source error.
  ///
  /// Only a typed source failure qualifies. Throwing just `detail` for it used
  /// to flatten `CloudflareBlockedError` into a plain `Error`, which left the
  /// Cloudflare sheet with no structured `url` to solve (the message text is
  /// never an operational url). Every other failure — runtime faults, replay
  /// violations, lost registrations — keeps rejecting natively so the session
  /// reset and retry paths that key on those rejections are untouched.
  static func propagatedErrorEnvelope(_ parsed: [String: Any]) -> [String: Any]? {
    guard parsed["status"] as? String == "error",
      let name = parsed["errorName"] as? String,
      propagatedErrorNames.contains(name)
    else { return nil }
    var envelope: [String: Any] = ["status": "error", "errorName": name]
    if let code = parsed["code"] as? String { envelope["code"] = String(code.prefix(64)) }
    if let detail = parsed["detail"] as? String { envelope["detail"] = String(detail.prefix(2_048)) }
    if let errorCode = parsed["errorCode"] as? NSNumber { envelope["errorCode"] = errorCode }
    let boundedFields: [(key: String, limit: Int)] = [
      ("errorUrl", 2_048), ("errorHost", 253), ("errorUserAgent", 512),
    ]
    for field in boundedFields {
      if let value = parsed[field.key] as? String, !value.isEmpty {
        envelope[field.key] = String(value.prefix(field.limit))
      }
    }
    return envelope
  }

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

// MARK: - Cancellation

// Lives beside the session policy (not in a file of its own) so adding it
// needs no `pod install`: CocoaPods lists source files at install time.
/// Cooperative cancellation of isolated Aidoku operations.
///
/// The sandbox runs one operation at a time, and most of an operation's time
/// is spent waiting on the source's HTTP requests. React Native schedules
/// operations by priority; when the user needs the runtime while a background
/// operation (a library update check, another tab's refresh, a request the
/// user already walked away from) is running, it cancels that operation by
/// the token it attached, re-queues it, and runs the user's operation next.
///
/// A cancelled operation stops at its next replay round, and the HTTP request
/// it is waiting on is cancelled at once, so the runtime is free within
/// milliseconds instead of after the source's full timeout. Only operations
/// that carry a token (read-only content fetches) can be cancelled.
final class NemuAidokuSandboxCancellation: @unchecked Sendable {
  /// Marker React Native recognises to re-queue instead of failing the caller.
  static let preemptedMessage =
    "[nemu-preempted] The Aidoku operation was paused for a user request."
  static let maxTokenLength = 128
  /// Tokens cancelled before their operation began (or after it ended) are
  /// remembered in a small FIFO, never unboundedly.
  static let maxRememberedCancellations = 64

  private let lock = NSLock()
  private var cancelled: [String] = []
  private var cancelledSet: Set<String> = []
  private var activeHttp: [String: String] = [:]
  private let cancelHttpRequest: (String) -> Void

  init(cancelHttpRequest: @escaping (String) -> Void) {
    self.cancelHttpRequest = cancelHttpRequest
  }

  /// A token from an operation's JSON, removed from it. Anything that is not
  /// a short identifier is ignored (the operation just is not cancellable).
  static func takeToken(from operation: inout [String: Any]) -> String? {
    guard let raw = operation.removeValue(forKey: "cancelToken") as? String else {
      return nil
    }
    guard
      !raw.isEmpty,
      raw.count <= maxTokenLength,
      raw.unicodeScalars.allSatisfy({
        CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_"
      })
    else { return nil }
    return raw
  }

  /// Cancels `token`'s operation: now if it is running (its in-flight HTTP
  /// request is cancelled), or as soon as it starts.
  @discardableResult
  func cancel(_ token: String) -> Bool {
    lock.lock()
    if !cancelledSet.contains(token) {
      cancelledSet.insert(token)
      cancelled.append(token)
      while cancelled.count > Self.maxRememberedCancellations {
        cancelledSet.remove(cancelled.removeFirst())
      }
    }
    let requestId = activeHttp[token]
    lock.unlock()
    if let requestId { cancelHttpRequest(requestId) }
    return true
  }

  func isCancelled(_ token: String?) -> Bool {
    guard let token else { return false }
    lock.lock()
    defer { lock.unlock() }
    return cancelledSet.contains(token)
  }

  func throwIfCancelled(_ token: String?) throws {
    if isCancelled(token) {
      throw NSError(
        domain: "NemuAidoku",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: Self.preemptedMessage]
      )
    }
  }

  /// The request id `token`'s next HTTP request must use, registered so a
  /// cancellation can reach it; nil for an untokened operation. Throws when
  /// the operation was already cancelled.
  func beginHttp(token: String?, round: Int) throws -> String? {
    guard let token else { return nil }
    let requestId = "aidoku-op-\(token)-\(round)"
    lock.lock()
    let wasCancelled = cancelledSet.contains(token)
    if !wasCancelled { activeHttp[token] = requestId }
    lock.unlock()
    if wasCancelled { try throwIfCancelled(token) }
    return requestId
  }

  func endHttp(token: String?) {
    guard let token else { return }
    lock.lock()
    activeHttp.removeValue(forKey: token)
    lock.unlock()
  }

  /// The operation is over; forget its token.
  func finish(token: String?) {
    guard let token else { return }
    lock.lock()
    activeHttp.removeValue(forKey: token)
    if cancelledSet.remove(token) != nil {
      cancelled.removeAll { $0 == token }
    }
    lock.unlock()
  }
}
