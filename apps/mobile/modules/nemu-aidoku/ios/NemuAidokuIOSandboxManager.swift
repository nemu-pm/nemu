import Foundation
import ImageIO
import WebKit

// WKWebView's public API has no zero-copy native-to-Worker ArrayBuffer path.
// A 16 MiB file expands to at most ~21.4 MiB of base64 before WebKit copies the
// command, keeping the app-side transient package transfer materially below
// the shared 32 MiB runtime ceiling. Real community AIX packages are normally
// far smaller; larger packages fail closed before Data/base64 allocation.
private let nemuIOSAidokuMaxPackageBytes = 16 * 1024 * 1024
private let nemuIOSAidokuMaxImageBytes = 8 * 1024 * 1024
private let nemuIOSAidokuMaxHttpBytes = 16 * 1024 * 1024
private let nemuIOSAidokuMaxReplayBytes = 32 * 1024 * 1024
private let nemuIOSAidokuMaxReplayRounds = 32
private let nemuIOSAidokuMaxSessions = 32
private let nemuIOSAidokuMaxSettingsCharacters = 256 * 1024
private let nemuIOSAidokuMaxOperationCharacters = 2 * 1024 * 1024
private let nemuIOSAidokuMaxResultCharacters = 16 * 1024 * 1024
private let nemuIOSAidokuOperationTimeoutSeconds = 20.0
private let nemuIOSAidokuBootTimeoutSeconds = 10.0
private let nemuIOSAidokuHttpTimeoutMs = 12_000

struct NemuAidokuIOSandboxHTTPRequest {
  let sourceKey: String
  let url: String
  let method: String
  let headers: [String: String]
  let body: String?
  let timeoutMs: Int
}

struct NemuAidokuIOSandboxHTTPResponse {
  let status: Int
  let headers: [String: String]
  let data: Data
  let error: String?
}

private struct NemuAidokuIOSandboxSession {
  let id: String
  let packageUri: String
  let sourceKey: String
  let expectedSourceId: String
  let expectedVersion: Int
  var settingsJson: String
  var registeredGeneration: Int = -1
}

private struct NemuAidokuIOSandboxWorkerReply {
  let value: String
  let namedData: [String: String]
}

private struct NemuAidokuIOSandboxOperationResult {
  let json: String
  let namedData: [String: String]
}

private final class NemuAidokuIOSandboxValueBox<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Value?

  func set(_ nextValue: Value) {
    lock.lock()
    value = nextValue
    lock.unlock()
  }

  func get() -> Value? {
    lock.lock()
    defer { lock.unlock() }
    return value
  }
}

private final class NemuAidokuIOSandboxSettingsStore {
  private let defaultsKey = "nemu_aidoku_runtime_settings_v1"
  private let maxSourceCharacters = 64 * 1024
  private let maxTotalCharacters = 512 * 1024
  private let maxSources = 128
  private let defaults = UserDefaults.standard

  func load(sourceKey: String) -> String {
    guard
      let stored = defaults.dictionary(forKey: defaultsKey) as? [String: String],
      let value = stored[sourceKey],
      value.count <= maxSourceCharacters,
      (try? Self.object(from: value)) != nil
    else {
      return "{}"
    }
    return value
  }

  func commitPatch(sourceKey: String, patch: [String: Any]) throws -> String {
    guard !sourceKey.isEmpty, sourceKey.count <= 512 else {
      throw Self.error("Invalid Aidoku settings source key.")
    }
    guard patch.count <= 128 else {
      throw Self.error("Aidoku settings patch exceeds the key limit.")
    }
    var current = (try? Self.object(from: load(sourceKey: sourceKey))) ?? [:]
    for (key, value) in patch {
      guard !key.isEmpty, key.count <= 256 else {
        throw Self.error("Aidoku persisted setting key is invalid.")
      }
      current[key] = value
    }
    guard current.count <= 128 else {
      throw Self.error("Aidoku persisted settings exceed the key limit.")
    }
    let serialized = try Self.jsonString(current)
    guard serialized.count <= maxSourceCharacters else {
      throw Self.error("Aidoku persisted settings exceed the safety limit.")
    }

    var stored = defaults.dictionary(forKey: defaultsKey) as? [String: String] ?? [:]
    if stored[sourceKey] == nil && stored.count >= maxSources {
      throw Self.error("Too many Aidoku sources have persisted runtime settings.")
    }
    stored[sourceKey] = serialized
    guard stored.values.reduce(0, { $0 + $1.count }) <= maxTotalCharacters else {
      throw Self.error("Aidoku persisted settings exceed the aggregate safety limit.")
    }
    defaults.set(stored, forKey: defaultsKey)
    return serialized
  }

  func clearMatching(key: String, matchPrefix: Bool) throws -> Int {
    guard !key.isEmpty, key.count <= 512 else {
      throw Self.error("Invalid Aidoku settings key.")
    }
    var stored = defaults.dictionary(forKey: defaultsKey) as? [String: String] ?? [:]
    let matchingKeys = stored.keys.filter { matchPrefix ? $0.hasPrefix(key) : $0 == key }
    for key in matchingKeys {
      stored.removeValue(forKey: key)
    }
    if stored.isEmpty {
      defaults.removeObject(forKey: defaultsKey)
    } else {
      defaults.set(stored, forKey: defaultsKey)
    }
    return matchingKeys.count
  }

  private static func object(from json: String) throws -> [String: Any] {
    guard
      let data = json.data(using: .utf8),
      let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw error("Aidoku persisted settings are invalid.")
    }
    return value
  }

  private static func jsonString(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value)
    guard let string = String(data: data, encoding: .utf8) else {
      throw error("Aidoku settings are not serializable.")
    }
    return string
  }

  private static func error(_ detail: String) -> NSError {
    NSError(domain: "NemuAidokuIOSandbox", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
  }
}

/// Runs untrusted AIX WebAssembly outside the app process in WebKit's
/// WebContent process. A dedicated Worker is terminated by a page watchdog;
/// a second native watchdog tears down the entire nonpersistent WKWebView if
/// the page or WebContent process stops responding. This uses only public
/// WebKit APIs and keeps the existing deterministic HTTP replay protocol.
final class NemuAidokuIOSandboxManager: NSObject, WKNavigationDelegate {
  typealias HttpRequestHandler =
    (NemuAidokuIOSandboxHTTPRequest) -> NemuAidokuIOSandboxHTTPResponse

  private let executor = DispatchQueue(label: "pm.nemu.aidoku.ios-sandbox", qos: .userInitiated)
  private let closeLock = NSLock()
  private let settingsStore = NemuAidokuIOSandboxSettingsStore()
  private let httpRequest: HttpRequestHandler
  private var sessions: [String: NemuAidokuIOSandboxSession] = [:]
  private var closed = false

  // Main-thread-only WebKit state.
  private var webView: WKWebView?
  private var webViewReady = false
  private var webViewGeneration = 0
  private var bootWaiters: [(Result<Int, Error>) -> Void] = []

  init(httpRequest: @escaping HttpRequestHandler) {
    self.httpRequest = httpRequest
    super.init()
  }

  static func status() -> [String: Any] {
    let resourcesAvailable =
      resourceURL(named: "nemu_aidoku_sandbox", extension: "js") != nil &&
      resourceURL(named: "nemu_aidoku_worker_host", extension: "js") != nil
    return [
      "available": resourcesAvailable,
      "platform": "ios",
      "detail": resourcesAvailable
        ? "Isolated iOS WebAssembly runtime is available."
        : "The isolated iOS Aidoku runtime assets are missing."
    ]
  }

  func createSession(
    sessionId: String,
    packageUri: String,
    sourceKey: String,
    expectedSourceId: String,
    expectedVersion: Int,
    settingsJson: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    submit(completion: completion) {
      try Self.validateIdentifier(sessionId, label: "Aidoku session ID", maxLength: 256)
      try Self.validateIdentifier(sourceKey, label: "Aidoku source key", maxLength: 512)
      try Self.validateIdentifier(
        expectedSourceId,
        label: "Expected Aidoku source ID",
        maxLength: 256
      )
      guard expectedVersion >= 0 else {
        throw Self.error("Expected Aidoku source version is invalid.")
      }
      try Self.validateJsonObject(
        settingsJson,
        label: "Aidoku settings",
        maxCharacters: nemuIOSAidokuMaxSettingsCharacters
      )
      if self.sessions[sessionId] == nil && self.sessions.count >= nemuIOSAidokuMaxSessions {
        throw Self.error("Too many isolated Aidoku sessions are active.")
      }
      _ = try Self.validatedPackageURL(packageUri)

      let previous = self.sessions[sessionId]
      self.sessions[sessionId] = NemuAidokuIOSandboxSession(
        id: sessionId,
        packageUri: packageUri,
        sourceKey: sourceKey,
        expectedSourceId: expectedSourceId,
        expectedVersion: expectedVersion,
        settingsJson: settingsJson
      )
      do {
        try self.ensureSessionRegistered(sessionId)
        return try self.executeOperationLocked(
          sessionId: sessionId,
          operationJson: "{\"kind\":\"capabilities\"}"
        ).json
      } catch {
        if var restored = previous {
          // registerSession overwrites the same worker ID. Cleanup below then
          // removes it, so a restored native descriptor must register again.
          restored.registeredGeneration = -1
          self.sessions[sessionId] = restored
        } else {
          self.sessions.removeValue(forKey: sessionId)
        }
        _ = try? self.disposeRuntimeSession(sessionId)
        throw error
      }
    }
  }

  func executeOperation(
    sessionId: String,
    operationJson: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    submit(completion: completion) {
      try Self.validateJsonObject(
        operationJson,
        label: "Aidoku operation",
        maxCharacters: nemuIOSAidokuMaxOperationCharacters
      )
      guard self.sessions[sessionId] != nil else {
        throw Self.error("Aidoku session expired.")
      }
      try self.ensureSessionRegistered(sessionId)
      return try self.executeOperationLocked(
        sessionId: sessionId,
        operationJson: operationJson
      ).json
    }
  }

  func processImage(
    sessionId: String,
    operationJson: String,
    imageBytes: Data,
    completion: @escaping (Result<Data?, Error>) -> Void
  ) {
    submit(completion: completion) {
      try Self.validateJsonObject(
        operationJson,
        label: "Aidoku image operation",
        maxCharacters: nemuIOSAidokuMaxOperationCharacters
      )
      guard !imageBytes.isEmpty, imageBytes.count <= nemuIOSAidokuMaxImageBytes else {
        throw Self.error("Aidoku image input exceeds the safety limit.")
      }
      guard self.sessions[sessionId] != nil else {
        throw Self.error("Aidoku session expired.")
      }
      try self.ensureSessionRegistered(sessionId)

      var operation = try Self.jsonObject(operationJson)
      let inputName = "image-input-\(UUID().uuidString)"
      let outputName = "image-output-\(UUID().uuidString)"
      let dimensions = Self.imageDimensions(imageBytes)
      operation["kind"] = "process-page-image"
      operation["imageDataName"] = inputName
      operation["imageWidth"] = dimensions.width
      operation["imageHeight"] = dimensions.height
      operation["outputPortName"] = outputName
      let result = try self.executeOperationLocked(
        sessionId: sessionId,
        operationJson: try Self.jsonString(operation),
        initialNamedData: [inputName: imageBytes.base64EncodedString()]
      )
      let parsed = try Self.jsonObject(result.json)
      guard let rawValue = parsed["value"], !(rawValue is NSNull) else { return nil }
      guard
        let value = rawValue as? [String: Any],
        let kind = value["kind"] as? String
      else {
        throw Self.error("The isolated Aidoku image runtime returned an invalid result.")
      }
      // iOS currently falls back to the original bytes for declarative canvas
      // plans, matching the previous in-process implementation.
      if kind == "canvas-plan" { return nil }
      guard
        kind == "binary",
        let expectedLength = value["byteLength"] as? NSNumber,
        let encoded = result.namedData[outputName],
        let output = Data(base64Encoded: encoded),
        output.count == expectedLength.intValue,
        !output.isEmpty,
        output.count <= nemuIOSAidokuMaxImageBytes
      else {
        throw Self.error("The isolated Aidoku image runtime returned invalid bytes.")
      }
      return output
    }
  }

  func updateSettings(
    sessionId: String,
    settingsJson: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    submit(completion: completion) {
      try Self.validateJsonObject(
        settingsJson,
        label: "Aidoku settings",
        maxCharacters: nemuIOSAidokuMaxSettingsCharacters
      )
      guard var session = self.sessions[sessionId] else {
        throw Self.error("Aidoku session expired.")
      }
      session.settingsJson = settingsJson
      self.sessions[sessionId] = session
      try self.ensureSessionRegistered(sessionId)
      return try self.invoke(
        method: "updateSessionSettings",
        args: [sessionId, try Self.jsonObject(settingsJson)],
        namedData: [:],
        timeoutSeconds: nemuIOSAidokuBootTimeoutSeconds
      ).value
    }
  }

  func disposeSession(
    sessionId: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    submit(allowClosed: true, completion: completion) {
      self.sessions.removeValue(forKey: sessionId)
      return (try? self.disposeRuntimeSession(sessionId)) ?? "{\"status\":\"disposed\"}"
    }
  }

  func clearPersistedSettings(
    key: String,
    matchPrefix: Bool,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    submit(completion: completion) {
      let cleared = try self.settingsStore.clearMatching(
        key: key,
        matchPrefix: matchPrefix
      )
      let matchingSessionIds = self.sessions.values
        .filter { matchPrefix ? $0.sourceKey.hasPrefix(key) : $0.sourceKey == key }
        .map(\.id)
      for sessionId in matchingSessionIds {
        self.sessions.removeValue(forKey: sessionId)
        // Persistence deletion is authoritative even if WebContent already
        // died and cannot acknowledge removal of its transient session.
        _ = try? self.disposeRuntimeSession(sessionId)
      }
      return try Self.jsonString(["status": "cleared", "count": cleared])
    }
  }

  func close() {
    closeLock.lock()
    let wasClosed = closed
    closed = true
    closeLock.unlock()
    if wasClosed { return }
    resetRuntime()
    executor.async { [weak self] in
      self?.sessions.removeAll()
    }
  }

  private func submit<Value>(
    allowClosed: Bool = false,
    completion: @escaping (Result<Value, Error>) -> Void,
    operation: @escaping () throws -> Value
  ) {
    executor.async { [weak self] in
      guard let self else {
        completion(.failure(Self.error("The isolated Aidoku runtime is unavailable.")))
        return
      }
      self.closeLock.lock()
      let isClosed = self.closed
      self.closeLock.unlock()
      if isClosed && !allowClosed {
        completion(.failure(Self.error("The isolated Aidoku runtime is closed.")))
        return
      }
      do {
        completion(.success(try operation()))
      } catch {
        completion(.failure(error))
      }
    }
  }

  private func ensureSessionRegistered(_ sessionId: String) throws {
    guard var session = sessions[sessionId] else {
      throw Self.error("Aidoku session expired.")
    }
    let generation = try ensureRuntime()
    if session.registeredGeneration == generation { return }

    let package = try Self.readPackageBytes(session.packageUri)
    let dataName = "aix-\(UUID().uuidString)"
    let persisted = settingsStore.load(sourceKey: session.sourceKey)
    let reply = try invoke(
      method: "registerSession",
      args: [
        session.id,
        session.sourceKey,
        session.expectedSourceId,
        session.expectedVersion,
        dataName,
        try Self.jsonObject(session.settingsJson),
        try Self.jsonObject(persisted),
        true,
      ],
      namedData: [dataName: package.base64EncodedString()],
      timeoutSeconds: nemuIOSAidokuOperationTimeoutSeconds
    )
    try Self.requireStatus(reply.value, expected: "registered")
    guard let activeGeneration = currentReadyGeneration() else {
      throw Self.error("The isolated Aidoku WebContent process terminated during registration.")
    }
    // The process may have terminated between the first ensureRuntime call
    // and invoke's own readiness check. Record the generation that actually
    // accepted the package, not the stale pre-invoke snapshot.
    session.registeredGeneration = activeGeneration
    sessions[sessionId] = session
  }

  private func executeOperationLocked(
    sessionId: String,
    operationJson: String,
    initialNamedData: [String: String] = [:]
  ) throws -> NemuAidokuIOSandboxOperationResult {
    guard let session = sessions[sessionId] else {
      throw Self.error("Aidoku session expired.")
    }
    let operation = try Self.jsonObject(operationJson)
    let operationKind = operation["kind"] as? String ?? ""
    let operationId = UUID().uuidString
    let deadline = Self.monotonicDeadline(
      after: nemuIOSAidokuOperationTimeoutSeconds
    )
    _ = try ensureRuntime()
    let startedAt = Date().timeIntervalSince1970 * 1_000
    let begin = try invoke(
      method: "beginOperation",
      args: [operationId, sessionId, operation, startedAt],
      namedData: [:],
      timeoutSeconds: remainingSeconds(deadline)
    )
    try Self.requireStatus(begin.value, expected: "started")
    guard let operationGeneration = currentReadyGeneration() else {
      throw Self.error("The isolated Aidoku WebContent process terminated during operation setup.")
    }

    defer {
      if currentReadyGeneration() == operationGeneration {
        _ = try? invoke(
          method: "finishOperation",
          args: [operationId],
          namedData: [:],
          timeoutSeconds: min(0.5, max(0.05, remainingSecondsOrDefault(deadline, 0.5)))
        )
      }
    }

    var replayedBytes = 0
    for round in 0...nemuIOSAidokuMaxReplayRounds {
      let reply = try invoke(
        method: "executeOperation",
        args: [operationId],
        namedData: round == 0 ? initialNamedData : [:],
        timeoutSeconds: remainingSeconds(deadline)
      )
      var parsed = try Self.jsonObject(reply.value)
      switch parsed["status"] as? String {
      case "complete":
        try applySettingsPatch(session: session, completed: parsed, deadline: deadline)
        parsed.removeValue(forKey: "settingsPatch")
        if operationKind == "modify-image-request" {
          decorateImageRequest(&parsed, sourceKey: session.sourceKey)
        }
        return NemuAidokuIOSandboxOperationResult(
          json: try Self.jsonString(parsed),
          namedData: reply.namedData
        )
      case "http-request":
        guard round < nemuIOSAidokuMaxReplayRounds else {
          throw Self.error("Aidoku source exceeded the HTTP replay limit.")
        }
        guard
          let cursor = (parsed["cursor"] as? NSNumber)?.intValue,
          let request = parsed["request"] as? [String: Any],
          let url = request["url"] as? String,
          let method = request["method"] as? String,
          let rawHeaders = request["headers"] as? [String: Any]
        else {
          throw Self.error("The isolated Aidoku runtime returned an invalid HTTP request.")
        }
        let headers = try Self.stringDictionary(rawHeaders, label: "Aidoku HTTP headers")
        let timeoutMs = min(
          nemuIOSAidokuHttpTimeoutMs,
          max(1, Int(try remainingSeconds(deadline) * 1_000))
        )
        let response = httpRequest(NemuAidokuIOSandboxHTTPRequest(
          sourceKey: session.sourceKey,
          url: url,
          method: method,
          headers: headers,
          body: request["body"] is NSNull ? nil : request["body"] as? String,
          timeoutMs: timeoutMs
        ))
        if response.status == 0 || response.error != nil {
          throw Self.error(response.error ?? "Aidoku HTTP request failed.")
        }
        guard response.data.count <= nemuIOSAidokuMaxHttpBytes else {
          throw Self.error("Aidoku HTTP response exceeds the safety limit.")
        }
        replayedBytes += response.data.count
        guard replayedBytes <= nemuIOSAidokuMaxReplayBytes else {
          throw Self.error("Aidoku HTTP replay data exceeds the memory safety limit.")
        }
        let dataName = "http-\(UUID().uuidString)"
        let append = try invoke(
          method: "appendReplayResponse",
          args: [operationId, cursor, request, response.status, response.headers, dataName],
          namedData: [dataName: response.data.base64EncodedString()],
          timeoutSeconds: remainingSeconds(deadline)
        )
        try Self.requireStatus(append.value, expected: "appended")
      case "error":
        throw Self.error(
          (parsed["detail"] as? String)?.prefix(2_048).description ??
            "The isolated Aidoku runtime failed."
        )
      default:
        throw Self.error("The isolated Aidoku runtime returned an invalid response.")
      }
    }
    throw Self.error("Aidoku source exceeded the HTTP replay limit.")
  }

  private func applySettingsPatch(
    session: NemuAidokuIOSandboxSession,
    completed: [String: Any],
    deadline: UInt64
  ) throws {
    guard let patch = completed["settingsPatch"] as? [String: Any], !patch.isEmpty else { return }
    let persisted = try settingsStore.commitPatch(sourceKey: session.sourceKey, patch: patch)
    do {
      let output = try invoke(
        method: "applyPersistedSettings",
        args: [session.sourceKey, try Self.jsonObject(persisted)],
        namedData: [:],
        timeoutSeconds: remainingSeconds(deadline)
      )
      try Self.requireStatus(output.value, expected: "persisted")
    } catch {
      // Disk is authoritative after commit. Reset the worker so the next
      // registration imports that durable snapshot instead of rejecting an
      // otherwise completed source operation.
      resetRuntime()
    }
  }

  private func decorateImageRequest(
    _ completed: inout [String: Any],
    sourceKey: String
  ) {
    guard
      var value = completed["value"] as? [String: Any],
      let urlString = value["url"] as? String,
      URL(string: urlString) != nil
    else { return }
    let rawHeaders = value["headers"] as? [String: Any] ?? [:]
    var headers = (try? Self.stringDictionary(
      rawHeaders,
      label: "Aidoku image headers"
    )) ?? [:]
    headers = NemuAidokuModule.decorateSandboxImageHeaders(
      sourceKey: sourceKey,
      urlString: urlString,
      headers: headers
    )
    value["headers"] = headers
    completed["value"] = value
  }

  private func disposeRuntimeSession(_ sessionId: String) throws -> String {
    guard currentReadyGeneration() != nil else { return "{\"status\":\"disposed\"}" }
    return try invoke(
      method: "disposeSession",
      args: [sessionId],
      namedData: [:],
      timeoutSeconds: nemuIOSAidokuBootTimeoutSeconds
    ).value
  }

  private func invoke(
    method: String,
    args: [Any],
    namedData: [String: String],
    timeoutSeconds: TimeInterval
  ) throws -> NemuAidokuIOSandboxWorkerReply {
    _ = try ensureRuntime()
    let boundedTimeout = max(0.05, min(nemuIOSAidokuOperationTimeoutSeconds, timeoutSeconds))
    let command = try Self.jsonString([
      "method": method,
      "args": args,
      "namedData": namedData,
    ])
    guard command.utf8.count <= 48 * 1024 * 1024 else {
      throw Self.error("The isolated Aidoku command exceeds the safety limit.")
    }

    let semaphore = DispatchSemaphore(value: 0)
    let result = NemuAidokuIOSandboxValueBox<Result<String, Error>>()
    DispatchQueue.main.async { [weak self] in
      guard let self, let webView = self.webView, self.webViewReady else {
        result.set(.failure(Self.error("The isolated Aidoku WebContent process is unavailable.")))
        semaphore.signal()
        return
      }
      webView.callAsyncJavaScript(
        "return await globalThis.NemuAidokuIOSHost.invoke(commandJson, timeoutMs);",
        arguments: [
          "commandJson": command,
          "timeoutMs": Int(boundedTimeout * 1_000),
        ],
        in: nil,
        in: .page,
        completionHandler: { output in
          switch output {
          case .success(let value):
            if let string = value as? String {
              result.set(.success(string))
            } else {
              result.set(.failure(Self.error("The isolated Aidoku worker returned an invalid response.")))
            }
          case .failure(let error):
            result.set(.failure(error))
          }
          semaphore.signal()
        }
      )
    }

    if semaphore.wait(timeout: .now() + boundedTimeout + 2.0) == .timedOut {
      resetRuntime()
      throw Self.error("The isolated Aidoku WebContent process exceeded its native watchdog.")
    }
    guard let settled = result.get() else {
      resetRuntime()
      throw Self.error("The isolated Aidoku worker did not settle.")
    }
    let serialized: String
    switch settled {
    case .success(let value):
      serialized = value
    case .failure(let error):
      resetRuntime()
      throw error
    }
    guard serialized.utf8.count <= nemuIOSAidokuMaxResultCharacters else {
      resetRuntime()
      throw Self.error("The isolated Aidoku worker response exceeds the safety limit.")
    }
    let envelope = try Self.jsonObject(serialized)
    guard
      let value = envelope["value"] as? String,
      value.utf8.count <= 4 * 1024 * 1024,
      let outputData = envelope["namedData"] as? [String: String]
    else {
      throw Self.error("The isolated Aidoku worker returned an invalid response.")
    }
    return NemuAidokuIOSandboxWorkerReply(value: value, namedData: outputData)
  }

  private func ensureRuntime() throws -> Int {
    if let generation = currentReadyGeneration() { return generation }
    let html = try Self.runtimeHTML()
    let semaphore = DispatchSemaphore(value: 0)
    let result = NemuAidokuIOSandboxValueBox<Result<Int, Error>>()
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        result.set(.failure(Self.error("The isolated Aidoku runtime is unavailable.")))
        semaphore.signal()
        return
      }
      if self.webViewReady, self.webView != nil {
        result.set(.success(self.webViewGeneration))
        semaphore.signal()
        return
      }
      self.bootWaiters.append {
        result.set($0)
        semaphore.signal()
      }
      if self.webView != nil { return }

      let configuration = WKWebViewConfiguration()
      configuration.websiteDataStore = .nonPersistent()
      configuration.defaultWebpagePreferences.allowsContentJavaScript = true
      configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
      let nextWebView = WKWebView(frame: .zero, configuration: configuration)
      nextWebView.navigationDelegate = self
      self.webView = nextWebView
      nextWebView.loadHTMLString(html, baseURL: nil)
    }

    if semaphore.wait(timeout: .now() + nemuIOSAidokuBootTimeoutSeconds) == .timedOut {
      resetRuntime()
      throw Self.error("The isolated Aidoku WebContent process failed to boot in time.")
    }
    switch result.get() {
    case .success(let generation): return generation
    case .failure(let error): throw error
    case nil: throw Self.error("The isolated Aidoku WebContent process failed to boot.")
    }
  }

  private func resetRuntime() {
    let reset = { [weak self] in
      guard let self else { return }
      self.webView?.stopLoading()
      self.webView?.navigationDelegate = nil
      self.webView?.removeFromSuperview()
      self.webView = nil
      self.webViewReady = false
      self.webViewGeneration += 1
      let waiters = self.bootWaiters
      self.bootWaiters.removeAll()
      let error = Self.error("The isolated Aidoku WebContent process was reset.")
      for waiter in waiters { waiter(.failure(error)) }
    }
    if Thread.isMainThread { reset() } else { DispatchQueue.main.sync(execute: reset) }
  }

  private func currentReadyGeneration() -> Int? {
    let result = NemuAidokuIOSandboxValueBox<Int?>()
    let read = { [weak self] in
      guard let self, self.webViewReady, self.webView != nil else {
        result.set(nil)
        return
      }
      result.set(self.webViewGeneration)
    }
    if Thread.isMainThread { read() } else { DispatchQueue.main.sync(execute: read) }
    return result.get() ?? nil
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard webView === self.webView else { return }
    webViewReady = true
    webViewGeneration += 1
    let waiters = bootWaiters
    bootWaiters.removeAll()
    for waiter in waiters { waiter(.success(webViewGeneration)) }
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    failBoot(webView, error: error)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    failBoot(webView, error: error)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    guard webView === self.webView else { return }
    let error = Self.error("The isolated Aidoku WebContent process terminated.")
    let waiters = bootWaiters
    bootWaiters.removeAll()
    webViewReady = false
    self.webView = nil
    webViewGeneration += 1
    for waiter in waiters { waiter(.failure(error)) }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    let url = navigationAction.request.url
    let isInitialDocument =
      (navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true) &&
      (url == nil || url?.absoluteString == "about:blank")
    decisionHandler(isInitialDocument ? .allow : .cancel)
  }

  private func failBoot(_ webView: WKWebView, error: Error) {
    guard webView === self.webView else { return }
    let waiters = bootWaiters
    bootWaiters.removeAll()
    webViewReady = false
    self.webView = nil
    webViewGeneration += 1
    for waiter in waiters { waiter(.failure(error)) }
  }

  private func remainingSeconds(_ deadline: UInt64) throws -> TimeInterval {
    let now = DispatchTime.now().uptimeNanoseconds
    guard deadline > now else {
      resetRuntime()
      throw Self.error("The isolated Aidoku operation timed out.")
    }
    return Double(deadline - now) / 1_000_000_000
  }

  private func remainingSecondsOrDefault(
    _ deadline: UInt64,
    _ fallback: TimeInterval
  ) -> TimeInterval {
    let now = DispatchTime.now().uptimeNanoseconds
    guard deadline > now else { return 0 }
    let remaining = Double(deadline - now) / 1_000_000_000
    return remaining.isFinite ? remaining : fallback
  }

  private static func validateIdentifier(_ value: String, label: String, maxLength: Int) throws {
    guard
      !value.isEmpty,
      value.count <= maxLength,
      value.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) })
    else {
      throw error("\(label) is invalid.")
    }
  }

  private static func validateJsonObject(
    _ json: String,
    label: String,
    maxCharacters: Int
  ) throws {
    guard !json.isEmpty, json.count <= maxCharacters else {
      throw error("\(label) exceeds the safety limit.")
    }
    _ = try jsonObject(json)
  }

  private static func jsonObject(_ json: String) throws -> [String: Any] {
    guard
      let data = json.data(using: .utf8),
      let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw error("The isolated Aidoku JSON value is invalid.")
    }
    return value
  }

  private static func jsonString(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value)
    guard let string = String(data: data, encoding: .utf8) else {
      throw error("The isolated Aidoku value is not serializable.")
    }
    return string
  }

  private static func monotonicDeadline(after seconds: TimeInterval) -> UInt64 {
    let now = DispatchTime.now().uptimeNanoseconds
    let duration = UInt64(max(0, seconds) * 1_000_000_000)
    let addition = now.addingReportingOverflow(duration)
    return addition.overflow ? UInt64.max : addition.partialValue
  }

  private static func requireStatus(_ json: String, expected: String) throws {
    let parsed = try jsonObject(json)
    guard parsed["status"] as? String == expected else {
      throw error(
        (parsed["detail"] as? String)?.prefix(2_048).description ??
          "The isolated Aidoku runtime failed."
      )
    }
  }

  private static func readPackageBytes(_ packageUri: String) throws -> Data {
    let url = try validatedPackageURL(packageUri)
    let data = try Data(contentsOf: url, options: .mappedIfSafe)
    guard !data.isEmpty, data.count <= nemuIOSAidokuMaxPackageBytes else {
      throw error("AIX package exceeds the isolated runtime safety limit.")
    }
    return data
  }

  private static func validatedPackageURL(_ packageUri: String) throws -> URL {
    guard let rawUrl = URL(string: packageUri), rawUrl.isFileURL else {
      throw error("The Aidoku package URI is invalid.")
    }
    let url = rawUrl.standardizedFileURL.resolvingSymlinksInPath()
    let fileManager = FileManager.default
    let optionalRoots: [URL?] = [
      fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first,
      fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first,
      fileManager.urls(for: .documentDirectory, in: .userDomainMask).first,
      fileManager.temporaryDirectory,
    ]
    let roots = optionalRoots.compactMap {
      $0?.standardizedFileURL.resolvingSymlinksInPath()
    }
    guard roots.contains(where: { root in
      url.path == root.path || url.path.hasPrefix(root.path + "/")
    }) else {
      throw error("The Aidoku package is outside the app data container.")
    }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard
      values.isRegularFile == true,
      let size = values.fileSize,
      size > 0,
      size <= nemuIOSAidokuMaxPackageBytes
    else {
      throw error("AIX package exceeds the isolated runtime safety limit.")
    }
    return url
  }

  private static func imageDimensions(_ data: Data) -> (width: Int, height: Int) {
    guard
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
      let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
      width > 0,
      height > 0,
      width <= 8_192,
      height <= 8_192,
      Int64(width) * Int64(height) <= 12_000_000
    else {
      return (0, 0)
    }
    return (width, height)
  }

  private static func runtimeHTML() throws -> String {
    guard
      let runtimeUrl = resourceURL(named: "nemu_aidoku_sandbox", extension: "js"),
      let hostUrl = resourceURL(named: "nemu_aidoku_worker_host", extension: "js")
    else {
      throw error("The isolated iOS Aidoku runtime assets are missing.")
    }
    let runtimeData = try Data(contentsOf: runtimeUrl, options: .mappedIfSafe)
    let host = try String(contentsOf: hostUrl, encoding: .utf8)
    guard !runtimeData.isEmpty, runtimeData.count <= 2 * 1024 * 1024 else {
      throw error("The isolated iOS Aidoku runtime asset is invalid.")
    }
    guard
      !host.isEmpty,
      host.utf8.count <= 64 * 1024,
      !host.lowercased().contains("</script")
    else {
      throw error("The isolated iOS Aidoku worker host asset is invalid.")
    }
    let runtimeBase64 = runtimeData.base64EncodedString()
    return """
    <!doctype html>
    <html><head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; media-src 'none'; frame-src 'none';">
    </head><body>
    <script>\(host)</script>
    <script>globalThis.NemuAidokuIOSHost.configure("\(runtimeBase64)");</script>
    </body></html>
    """
  }

  private static func resourceURL(named name: String, extension fileExtension: String) -> URL? {
    let roots = [Bundle(for: NemuAidokuIOSandboxManager.self), Bundle.main]
    var bundles = roots
    for root in roots {
      for bundleUrl in root.urls(forResourcesWithExtension: "bundle", subdirectory: nil) ?? [] {
        if let bundle = Bundle(url: bundleUrl) { bundles.append(bundle) }
      }
    }
    for bundle in bundles {
      if let url = bundle.url(forResource: name, withExtension: fileExtension) { return url }
    }
    return nil
  }

  private static func stringDictionary(
    _ value: [String: Any],
    label: String
  ) throws -> [String: String] {
    var output: [String: String] = [:]
    for (key, rawValue) in value {
      guard let string = rawValue as? String else {
        throw error("\(label) contains an invalid value.")
      }
      output[key] = string
    }
    return output
  }

  private static func error(_ detail: String) -> NSError {
    NSError(
      domain: "NemuAidokuIOSandbox",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: detail]
    )
  }
}
