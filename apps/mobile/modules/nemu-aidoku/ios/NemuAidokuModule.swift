import ExpoModulesCore
import Foundation
import CoreTelephony

private let nemuNativeHttpVersion = "built-in"
private let nemuAsyncHttpMaxTimeoutSeconds = 30.0
private let nemuSyncHttpMaxTimeoutSeconds = 12.0
private let nemuIOSAidokuMaxHttpResponseBytes = 16 * 1024 * 1024
private let nemuMobileUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"

private final class NemuAidokuSandboxException: Exception, @unchecked Sendable {
  private let detail: String

  init(_ error: Error) {
    let description = error.localizedDescription.trimmingCharacters(
      in: .whitespacesAndNewlines
    )
    self.detail = description.isEmpty
      ? "The isolated Aidoku runtime failed."
      : description
    super.init()
  }

  override var code: String { "E_AIDOKU_SANDBOX" }
  override var reason: String { detail }
}

/// Pure cookie-header merge rules shared by every iOS native HTTP request.
/// Explicit source headers win case-insensitively over URLSession's stored jar.
enum NemuAidokuCookieMerge {
  static func explicitCookieNames(in header: String?) -> Set<String> {
    guard let header, !header.isEmpty else { return [] }
    return Set(header.split(separator: ";", omittingEmptySubsequences: true).compactMap { part in
      guard let separator = part.firstIndex(of: "=") else { return nil }
      let name = part[..<separator].trimmingCharacters(in: .whitespacesAndNewlines)
      return name.isEmpty ? nil : name.lowercased()
    })
  }

  static func shouldIncludeStoredCookie(name: String, explicitHeader: String?) -> Bool {
    return !explicitCookieNames(in: explicitHeader).contains(name.lowercased())
  }

  static func merge(storedHeader: String?, explicitHeader: String?) -> String? {
    let stored = storedHeader?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let explicit = explicitHeader?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if stored.isEmpty { return explicit.isEmpty ? nil : explicit }
    if explicit.isEmpty { return stored }
    return "\(stored); \(explicit)"
  }

  static func mergedHeader(
    storedCookies: [HTTPCookie],
    explicitHeader: String?
  ) -> String? {
    let filteredCookies = storedCookies.filter {
      shouldIncludeStoredCookie(name: $0.name, explicitHeader: explicitHeader)
    }
    let storedHeader = filteredCookies.isEmpty
      ? nil
      : HTTPCookie.requestHeaderFields(with: filteredCookies)["Cookie"]
    return merge(storedHeader: storedHeader, explicitHeader: explicitHeader)
  }
}

struct NemuAidokuHttpRequest: Record {
  @Field
  var requestId: String?

  @Field
  var cookieScope: String?

  @Field
  var url: String = ""

  @Field
  var method: String = "GET"

  @Field
  var headers: [String: String] = [:]

  @Field
  var body: String?

  @Field
  var timeoutMs: Int?

  @Field
  var responseMode: String = "auto"

  @Field
  var maxResponseBytes: Int?

  @Field
  var requireHttps: Bool = false
}

struct NemuAidokuHttpFileRequest: Record, @unchecked Sendable {
  @Field
  var requestId: String?

  @Field
  var cookieScope: String?

  @Field
  var url: String = ""

  @Field
  var headers: [String: String] = [:]

  @Field
  var timeoutMs: Int?

  @Field
  var maxResponseBytes: Int = 0

  @Field
  var requireHttps: Bool = false

  @Field
  var maxImageDimension: Int?

  @Field
  var maxImagePixels: Int?

  // Android alone may return a segmented manifest. Keeping the defaulted
  // field explicit makes Expo Record decoding stable while iOS deliberately
  // continues its single-file fail-closed behavior.
  @Field
  var allowLongStripSegments: Bool = false
}

private struct NemuNativeHttpResult {
  var status: Int
  var headers: [String: String]
  var data: Data
  var error: String?
}

private struct NemuNativeHttpFileResult {
  var status: Int
  var headers: [String: String]
  var fileURL: URL?
  var byteLength: Int64?
  var error: String?
}

/// URLSession completion handlers are `@Sendable` in the current SDK. Keep the
/// synchronous handoff explicit and locked instead of mutating a captured local
/// variable (which becomes a compile error in Swift 6 language mode).
private final class NemuNativeHttpResultBox: @unchecked Sendable {
  private let lock = NSLock()
  private var value: NemuNativeHttpResult

  init(_ value: NemuNativeHttpResult) {
    self.value = value
  }

  func set(_ value: NemuNativeHttpResult) {
    lock.lock()
    self.value = value
    lock.unlock()
  }

  func get() -> NemuNativeHttpResult {
    lock.lock()
    defer { lock.unlock() }
    return value
  }
}

/// Completion-handler tasks are created before their task value can be safely
/// captured under Swift 6. The box lets the response gate recover that task
/// without mutating a captured local variable.
private final class NemuURLSessionTaskBox: @unchecked Sendable {
  private let lock = NSLock()
  private var task: URLSessionTask?

  func set(_ task: URLSessionTask) {
    lock.lock()
    self.task = task
    lock.unlock()
  }

  func get() -> URLSessionTask? {
    lock.lock()
    defer { lock.unlock() }
    return task
  }
}

private struct NemuExplicitCookiePolicy {
  let header: String?
  let originalHost: String?
  let originalScheme: String?
  let originalPort: Int?
  let requireHttps: Bool

  func isSameOrigin(_ redirectUrl: URL?) -> Bool {
    guard
      let redirectUrl,
      redirectUrl.host?.lowercased() == originalHost,
      redirectUrl.scheme?.lowercased() == originalScheme,
      NemuNativeHttpAddressPolicy.effectivePort(for: redirectUrl) == originalPort
    else {
      return false
    }
    return true
  }

  func header(for redirectUrl: URL?) -> String? {
    isSameOrigin(redirectUrl) ? header : nil
  }
}

private struct NemuNativeDownloadRegistration: @unchecked Sendable {
  let maxResponseBytes: Int64
  let completion: @Sendable (URL?, URLResponse?, (any Error)?) -> Void
  var preservedLocation: URL?
  var preservationError: String?
  var exceededLimit = false
}

/// A scoped session delegate rebuilds each redirect Cookie header so
/// source-authored values keep precedence. Persistent scoped contexts retain
/// response cookies; the unscoped stateless context uses the same redirect
/// policy without retaining them. Cross-origin redirects never inherit a raw
/// explicit Cookie.
private final class NemuScopedCookieSessionDelegate: NSObject, URLSessionDownloadDelegate {
  private let cookieStorage: HTTPCookieStorage
  private let persistsResponseCookies: Bool
  private let lock = NSLock()
  private var policies: [Int: NemuExplicitCookiePolicy] = [:]
  private var downloads: [Int: NemuNativeDownloadRegistration] = [:]
  private let peerValidationGate = NemuNativeHttpPeerValidationGate()

  init(cookieStorage: HTTPCookieStorage, persistsResponseCookies: Bool) {
    self.cookieStorage = cookieStorage
    self.persistsResponseCookies = persistsResponseCookies
  }

  func register(
    task: URLSessionTask,
    explicitHeader: String?,
    originalUrl: URL?,
    requireHttps: Bool
  ) {
    let policy = NemuExplicitCookiePolicy(
      header: explicitHeader,
      originalHost: originalUrl?.host?.lowercased(),
      originalScheme: originalUrl?.scheme?.lowercased(),
      originalPort: NemuNativeHttpAddressPolicy.effectivePort(for: originalUrl),
      requireHttps: requireHttps
    )
    lock.lock()
    policies[task.taskIdentifier] = policy
    lock.unlock()
  }

  func registerPeerValidation(task: URLSessionTask) {
    peerValidationGate.register(taskIdentifier: task.taskIdentifier)
  }

  func registerDownload(
    task: URLSessionDownloadTask,
    maxResponseBytes: Int,
    completion: @escaping @Sendable (URL?, URLResponse?, (any Error)?) -> Void
  ) {
    lock.lock()
    downloads[task.taskIdentifier] = NemuNativeDownloadRegistration(
      maxResponseBytes: Int64(maxResponseBytes),
      completion: completion
    )
    lock.unlock()
  }

  func afterPeerValidation(
    task: URLSessionTask,
    completion: @escaping @Sendable (Bool) -> Void
  ) {
    peerValidationGate.afterValidation(
      taskIdentifier: task.taskIdentifier,
      completion: completion
    )
  }

  /// URLSession is configured to never mutate a cookie jar automatically.
  /// Commit only the final response cookies after every transaction metric in
  /// the redirect chain has passed the protected-proxy policy. Redirect response
  /// cookies are intentionally discarded because that hop is not yet validated
  /// when `willPerformHTTPRedirection` runs.
  func persistFinalResponseCookiesIfAllowed(_ response: URLResponse?) {
    guard persistsResponseCookies, let response = response as? HTTPURLResponse,
      let responseUrl = response.url
    else { return }
    var headerFields: [String: String] = [:]
    for (key, value) in response.allHeaderFields {
      headerFields[String(describing: key)] = String(describing: value)
    }
    cookieStorage.setCookies(
      HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: responseUrl),
      for: responseUrl,
      mainDocumentURL: nil
    )
  }

  func unregister(task: URLSessionTask) {
    lock.lock()
    policies.removeValue(forKey: task.taskIdentifier)
    let abandonedDownload = downloads.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    if let location = abandonedDownload?.preservedLocation {
      try? FileManager.default.removeItem(at: location)
    }
    peerValidationGate.unregister(taskIdentifier: task.taskIdentifier)
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    var shouldCancel = false
    lock.lock()
    if var registration = downloads[downloadTask.taskIdentifier] {
      if
        totalBytesWritten > registration.maxResponseBytes ||
        (
          totalBytesExpectedToWrite >= 0 &&
          totalBytesExpectedToWrite > registration.maxResponseBytes
        )
      {
        registration.exceededLimit = true
        downloads[downloadTask.taskIdentifier] = registration
        shouldCancel = true
      }
    }
    lock.unlock()
    if shouldCancel { downloadTask.cancel() }
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    do {
      let preserved = try Self.preserveDownload(location)
      lock.lock()
      if var registration = downloads[downloadTask.taskIdentifier] {
        registration.preservedLocation = preserved
        downloads[downloadTask.taskIdentifier] = registration
        lock.unlock()
      } else {
        lock.unlock()
        try? FileManager.default.removeItem(at: preserved)
      }
    } catch {
      lock.lock()
      if var registration = downloads[downloadTask.taskIdentifier] {
        registration.preservationError = error.localizedDescription
        downloads[downloadTask.taskIdentifier] = registration
      }
      lock.unlock()
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError transportError: (any Error)?
  ) {
    lock.lock()
    let registration = downloads.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    guard let registration else { return }

    let effectiveError: (any Error)?
    if registration.exceededLimit {
      effectiveError = Self.downloadLimitError(registration.maxResponseBytes)
    } else if let detail = registration.preservationError {
      effectiveError = NSError(
        domain: "NemuAidoku.NativeHttpDownload",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: detail]
      )
    } else {
      effectiveError = transportError
    }

    let cleanup = {
      if let location = registration.preservedLocation {
        try? FileManager.default.removeItem(at: location)
      }
    }
    let deliver: @Sendable (Bool) -> Void = { isAllowed in
      defer { cleanup() }
      if isAllowed {
        self.persistFinalResponseCookiesIfAllowed(task.response)
        registration.completion(
          registration.preservedLocation,
          task.response,
          effectiveError
        )
      } else {
        registration.completion(nil, nil, Self.peerValidationError())
      }
    }

    // A transport failure without a response or file has nothing to disclose
    // and may not produce metrics. Every response-bearing path remains gated.
    if task.response == nil && registration.preservedLocation == nil {
      cleanup()
      registration.completion(
        nil,
        nil,
        effectiveError ?? Self.peerValidationError()
      )
      return
    }
    peerValidationGate.afterValidation(
      taskIdentifier: task.taskIdentifier,
      completion: deliver
    )
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didFinishCollecting metrics: URLSessionTaskMetrics
  ) {
    var isAllowed = !metrics.transactionMetrics.isEmpty
    if isAllowed {
      for transaction in metrics.transactionMetrics {
        do {
          try NemuNativeHttpAddressPolicy.validateLoopbackProxy(
            remoteAddress: transaction.remoteAddress,
            remotePort: transaction.remotePort,
            isProxyConnection: transaction.isProxyConnection,
            requestScheme: transaction.request.url?.scheme,
            expectedPort: NemuNativeHttpLoopbackProxy.shared.port
          )
        } catch {
          isAllowed = false
          break
        }
      }
    }

    peerValidationGate.resolve(
      taskIdentifier: task.taskIdentifier,
      isAllowed: isAllowed
    )
    if !isAllowed { task.cancel() }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (
      URLSession.AuthChallengeDisposition,
      URLCredential?
    ) -> Void
  ) {
    if let credential = NemuNativeHttpLoopbackProxy.shared.proxyCredential(
      for: challenge
    ) {
      completionHandler(.useCredential, credential)
    } else {
      completionHandler(.performDefaultHandling, nil)
    }
  }

  private static func peerValidationError() -> NSError {
    NSError(
      domain: "NemuAidoku.NativeHttpAddressPolicy",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey:
          "Native source networking blocked an unverified proxy transaction."
      ]
    )
  }

  private static func downloadLimitError(_ maxResponseBytes: Int64) -> NSError {
    NSError(
      domain: "NemuAidoku.NativeHttpDownload",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey:
          "HTTP response exceeds the \(maxResponseBytes) byte safety limit."
      ]
    )
  }

  private static func preserveDownload(_ source: URL) throws -> URL {
    let destination = FileManager.default.temporaryDirectory
      .appendingPathComponent("nemu-native-http-\(UUID().uuidString)")
    try FileManager.default.moveItem(at: source, to: destination)
    return destination
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    // Preserve the early policy error, while the loopback proxy independently
    // resolves and pins an exact public address before this redirect is sent.
    guard let redirectURL = request.url else {
      completionHandler(nil)
      return
    }
    do {
      try NemuNativeHttpAddressPolicy.validate(url: redirectURL)
    } catch {
      completionHandler(nil)
      return
    }

    lock.lock()
    let policy = policies[task.taskIdentifier]
    lock.unlock()
    guard NemuNativeHttpRedirectPolicy.allows(
      redirectURL,
      requireHttps: policy?.requireHttps == true
    ) else {
      completionHandler(nil)
      return
    }
    var redirectedRequest = request
    if policy?.isSameOrigin(request.url) != true {
      // Foundation normally strips Authorization across origins, but source
      // packages can supply arbitrary headers. Enforce this independently for
      // every redirect, including Nemu's session bridge header.
      redirectedRequest = NemuNativeHttpHeaderPolicy
        .strippingCrossOriginSecrets(from: redirectedRequest)
    }
    let explicitHeader = policy?.header(for: request.url)
    let mergedHeader = NemuAidokuCookieMerge.mergedHeader(
      storedCookies: request.url.flatMap(cookieStorage.cookies(for:)) ?? [],
      explicitHeader: explicitHeader
    )
    redirectedRequest.setValue(mergedHeader, forHTTPHeaderField: "Cookie")
    NemuNativeHttpLoopbackProxy.shared.authorizeLegacyPlainHttp(
      &redirectedRequest
    )
    completionHandler(redirectedRequest)
  }
}

private final class NemuHttpSessionContext: @unchecked Sendable {
  let cookieStorage: HTTPCookieStorage
  let session: URLSession
  private let redirectDelegate: NemuScopedCookieSessionDelegate?

  init(
    configuration: URLSessionConfiguration,
    isolated: Bool,
    persistsResponseCookies: Bool = true
  ) {
    guard let cookieStorage = configuration.httpCookieStorage else {
      preconditionFailure("URLSession did not provide an isolated cookie store.")
    }
    self.cookieStorage = cookieStorage
    if isolated {
      let delegate = NemuScopedCookieSessionDelegate(
        cookieStorage: cookieStorage,
        persistsResponseCookies: persistsResponseCookies
      )
      redirectDelegate = delegate
      session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    } else {
      redirectDelegate = nil
      session = URLSession(configuration: configuration)
    }
  }

  func registerRedirectPolicy(
    task: URLSessionTask,
    explicitHeader: String?,
    originalUrl: URL?,
    requireHttps: Bool = false
  ) {
    redirectDelegate?.register(
      task: task,
      explicitHeader: explicitHeader,
      originalUrl: originalUrl,
      requireHttps: requireHttps
    )
  }

  func unregisterRedirectPolicy(task: URLSessionTask) {
    redirectDelegate?.unregister(task: task)
  }

  func makeDataTask(
    with request: URLRequest,
    completionHandler: @escaping @Sendable (Data?, URLResponse?, (any Error)?) -> Void
  ) -> URLSessionDataTask {
    guard let redirectDelegate else {
      preconditionFailure("Native source sessions require protected proxy validation.")
    }
    let taskBox = NemuURLSessionTaskBox()
    let task = session.dataTask(with: request) { data, response, error in
      // A pure transport failure has no response bytes to disclose. Any
      // response or payload waits for transaction metrics before crossing the
      // native-to-source boundary.
      guard response != nil || data?.isEmpty == false else {
        completionHandler(nil, nil, error ?? Self.peerValidationError())
        return
      }
      guard let completedTask = taskBox.get() else {
        completionHandler(nil, nil, Self.peerValidationError())
        return
      }
      redirectDelegate.afterPeerValidation(task: completedTask) { isAllowed in
        if isAllowed {
          redirectDelegate.persistFinalResponseCookiesIfAllowed(response)
          completionHandler(data, response, error)
        } else {
          completionHandler(nil, nil, Self.peerValidationError())
        }
      }
    }
    taskBox.set(task)
    redirectDelegate.registerPeerValidation(task: task)
    return task
  }

  func makeDownloadTask(
    with request: URLRequest,
    maxResponseBytes: Int,
    completionHandler: @escaping @Sendable (URL?, URLResponse?, (any Error)?) -> Void
  ) -> URLSessionDownloadTask {
    guard let redirectDelegate else {
      preconditionFailure("Native source sessions require protected proxy validation.")
    }
    let task = session.downloadTask(with: request)
    redirectDelegate.registerPeerValidation(task: task)
    redirectDelegate.registerDownload(
      task: task,
      maxResponseBytes: maxResponseBytes,
      completion: completionHandler
    )
    return task
  }

  private static func peerValidationError() -> NSError {
    NSError(
      domain: "NemuAidoku.NativeHttpAddressPolicy",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey:
          "Native source networking blocked an unverified or private destination."
      ]
    )
  }

  func close() {
    session.invalidateAndCancel()
  }
}

// Tracks all native HTTP requests and marks only the synchronous JSI bridge as
// foreground-only. `sendHttpRequestSync` blocks the RN JS thread on a
// semaphore; if iOS tears down the JSC runtime while that thread is blocked,
// pending JSI work can dereference freed objects. Async requests, however, are
// also used by BGProcessingTask and must be allowed to finish while the app is
// inactive instead of surfacing an artificial "App is not active" error.
private final class NemuSyncHttpCoordinator {
  static let shared = NemuSyncHttpCoordinator()
  private static let maxCookieScopes = 128

  private let lock = NSLock()
  private var pending: [String: URLSessionTask] = [:]
  private var foregroundOnly: Set<String> = []
  private var prepared: Set<String> = []
  private var cancelled: Set<String> = []
  private var isActive = true
  // Requests without a profile/source scope share a connection pool only.
  // The context has a private, non-persisting jar, so it cannot inherit or
  // retain ambient app authentication between requests.
  private var statelessContext: NemuHttpSessionContext
  private var scopedContexts: [String: NemuHttpSessionContext] = [:]
  private var scopedContextOrder: [String] = []

  private init() {
    statelessContext = Self.makeStatelessContext()
  }

  private static func makeStatelessContext() -> NemuHttpSessionContext {
    let configuration = URLSessionConfiguration.ephemeral
    NemuNativeHttpLoopbackProxy.shared.harden(configuration)
    configuration.timeoutIntervalForRequest = nemuAsyncHttpMaxTimeoutSeconds
    configuration.timeoutIntervalForResource = nemuAsyncHttpMaxTimeoutSeconds
    configuration.httpCookieAcceptPolicy = .never
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    return NemuHttpSessionContext(
      configuration: configuration,
      isolated: true,
      persistsResponseCookies: false
    )
  }

  func setActive(_ active: Bool) {
    lock.lock()
    isActive = active
    let foregroundTaskIds = active ? [] : Array(foregroundOnly)
    let tasks = foregroundTaskIds.compactMap { pending.removeValue(forKey: $0) }
    if !active {
      cancelled.formUnion(foregroundTaskIds)
      foregroundOnly.subtract(foregroundTaskIds)
    }
    lock.unlock()

    for task in tasks {
      task.cancel()
    }
  }

  func sessionContext(cookieScope: String?, url _: URL) -> NemuHttpSessionContext {
    let normalizedScope = cookieScope?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let normalizedScope, !normalizedScope.isEmpty else {
      lock.lock()
      let context = statelessContext
      lock.unlock()
      return context
    }

    lock.lock()
    let context: NemuHttpSessionContext
    var evictedContexts: [NemuHttpSessionContext] = []
    if let existing = scopedContexts[normalizedScope] {
      context = existing
      scopedContextOrder.removeAll { $0 == normalizedScope }
      scopedContextOrder.append(normalizedScope)
    } else {
      let configuration = URLSessionConfiguration.ephemeral
      NemuNativeHttpLoopbackProxy.shared.harden(configuration)
      configuration.timeoutIntervalForRequest = nemuAsyncHttpMaxTimeoutSeconds
      configuration.timeoutIntervalForResource = nemuAsyncHttpMaxTimeoutSeconds
      configuration.httpCookieAcceptPolicy = .always
      // Never let URLSession mutate source authentication state before the
      // protected-proxy gate approves the complete redirect chain.
      configuration.httpShouldSetCookies = false
      configuration.urlCache = nil
      let created = NemuHttpSessionContext(
        configuration: configuration,
        isolated: true
      )
      scopedContexts[normalizedScope] = created
      scopedContextOrder.append(normalizedScope)
      context = created
      while scopedContextOrder.count > Self.maxCookieScopes {
        let evictedKey = scopedContextOrder.removeFirst()
        if let evicted = scopedContexts.removeValue(forKey: evictedKey) {
          evictedContexts.append(evicted)
        }
      }
    }
    lock.unlock()

    for evicted in evictedContexts { evicted.close() }
    return context
  }

  func makeDataTask(
    context: NemuHttpSessionContext,
    with request: URLRequest,
    completionHandler: @escaping @Sendable (Data?, URLResponse?, (any Error)?) -> Void
  ) -> URLSessionDataTask {
    context.makeDataTask(with: request, completionHandler: completionHandler)
  }

  func makeDownloadTask(
    context: NemuHttpSessionContext,
    with request: URLRequest,
    maxResponseBytes: Int,
    completionHandler: @escaping @Sendable (URL?, URLResponse?, (any Error)?) -> Void
  ) -> URLSessionDownloadTask {
    context.makeDownloadTask(
      with: request,
      maxResponseBytes: maxResponseBytes,
      completionHandler: completionHandler
    )
  }

  /// Registers a JS-owned request before its AsyncFunction begins executing,
  /// closing the abort-before-native-registration race. Async requests may be
  /// prepared while the app is inactive because the background task executor
  /// intentionally starts them without a foreground scene.
  func prepare(id: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if !prepared.contains(id) {
      prepared.insert(id)
      cancelled.remove(id)
    }
    return !cancelled.contains(id)
  }

  /// Atomically registers a task, rejecting foreground-only work while the app
  /// is inactive. This closes the race between the initial lifecycle check and
  /// task insertion without cancelling legitimate background fetches.
  func track(
    id: String,
    task: URLSessionTask,
    allowBackground: Bool
  ) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard
      prepared.contains(id),
      !cancelled.contains(id),
      allowBackground || isActive
    else {
      return false
    }
    pending[id] = task
    if !allowBackground {
      foregroundOnly.insert(id)
    }
    return true
  }

  func isAppActive() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return isActive
  }

  func finish(id: String) {
    lock.lock()
    pending.removeValue(forKey: id)
    foregroundOnly.remove(id)
    prepared.remove(id)
    cancelled.remove(id)
    lock.unlock()
  }

  func cancel(id: String) -> Bool {
    lock.lock()
    let wasPrepared = prepared.contains(id)
    if wasPrepared {
      cancelled.insert(id)
    }
    let task = pending.removeValue(forKey: id)
    foregroundOnly.remove(id)
    lock.unlock()
    task?.cancel()
    return wasPrepared || task != nil
  }

  func release(id: String) {
    lock.lock()
    let task = pending.removeValue(forKey: id)
    foregroundOnly.remove(id)
    prepared.remove(id)
    cancelled.remove(id)
    lock.unlock()
    task?.cancel()
  }

  func cancelAll() {
    lock.lock()
    cancelled.formUnion(prepared)
    let tasks = Array(pending.values)
    pending.removeAll()
    foregroundOnly.removeAll()
    lock.unlock()

    for task in tasks {
      task.cancel()
    }
  }

  func clearCookieScopes() {
    lock.lock()
    let contexts = Array(scopedContexts.values)
    scopedContexts.removeAll()
    scopedContextOrder.removeAll()
    lock.unlock()
    for context in contexts { context.close() }
  }

  /// Drops the unscoped connection context during a profile transition while
  /// deliberately preserving profile/source-scoped jars. JS disposes old
  /// sandbox sessions and namespaces every new scope by profile generation.
  func resetSharedCookieContext() {
    let replacement = Self.makeStatelessContext()
    lock.lock()
    let previous = statelessContext
    statelessContext = replacement
    lock.unlock()
    previous.close()
  }
}

private final class NemuNativeHttpPromiseBox: @unchecked Sendable {
  let promise: Promise

  init(_ promise: Promise) {
    self.promise = promise
  }
}

/**
 * Owns one asynchronous URLSession request from registration through timeout
 * and completion. URLSession cancellation and the deadline callback may race;
 * the lock makes settlement, redirect-policy cleanup, and coordinator release
 * exactly-once without capturing a not-yet-initialized task in Swift 6.
 */
private final class NemuNativeHttpAsyncOperation: @unchecked Sendable {
  private let lock = NSLock()
  private let coordinator: NemuSyncHttpCoordinator
  private let sessionContext: NemuHttpSessionContext
  private let requestId: String
  private let completion: @Sendable (NemuNativeHttpResult) -> Void
  private var task: URLSessionTask?
  private var timeoutWorkItem: DispatchWorkItem?
  private var settled = false

  init(
    coordinator: NemuSyncHttpCoordinator,
    sessionContext: NemuHttpSessionContext,
    requestId: String,
    completion: @escaping @Sendable (NemuNativeHttpResult) -> Void
  ) {
    self.coordinator = coordinator
    self.sessionContext = sessionContext
    self.requestId = requestId
    self.completion = completion
  }

  func start(
    task: URLSessionTask,
    timeoutSeconds: Double,
    allowBackground: Bool,
    explicitCookieHeader: String?,
    originalUrl: URL?,
    requireHttps: Bool = false
  ) {
    sessionContext.registerRedirectPolicy(
      task: task,
      explicitHeader: explicitCookieHeader,
      originalUrl: originalUrl,
      requireHttps: requireHttps
    )
    lock.lock()
    self.task = task
    lock.unlock()

    guard coordinator.track(
      id: requestId,
      task: task,
      allowBackground: allowBackground
    ) else {
      task.cancel()
      finish(NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "Request cancelled or app is not active."
      ))
      return
    }

    let timeout = DispatchWorkItem { [weak self] in
      self?.timeOut()
    }
    lock.lock()
    if settled {
      lock.unlock()
      timeout.cancel()
      return
    }
    timeoutWorkItem = timeout
    lock.unlock()
    DispatchQueue.global(qos: .utility).asyncAfter(
      deadline: .now() + timeoutSeconds,
      execute: timeout
    )
    task.resume()
  }

  func finish(_ result: NemuNativeHttpResult) {
    lock.lock()
    if settled {
      lock.unlock()
      return
    }
    settled = true
    let taskToRelease = task
    task = nil
    let timeout = timeoutWorkItem
    timeoutWorkItem = nil
    lock.unlock()

    timeout?.cancel()
    if let taskToRelease {
      sessionContext.unregisterRedirectPolicy(task: taskToRelease)
    }
    coordinator.finish(id: requestId)
    completion(result)
  }

  private func timeOut() {
    _ = coordinator.cancel(id: requestId)
    finish(NemuNativeHttpResult(
      status: 0,
      headers: [:],
      data: Data(),
      error: "Request timed out."
    ))
  }
}

/** File counterpart to NemuNativeHttpAsyncOperation. A late URLSession
 * completion after timeout must delete, rather than publish, its temp file. */
private final class NemuNativeHttpFileAsyncOperation: @unchecked Sendable {
  private let lock = NSLock()
  private let coordinator: NemuSyncHttpCoordinator
  private let sessionContext: NemuHttpSessionContext
  private let requestId: String
  private let completion: @Sendable (NemuNativeHttpFileResult) -> Void
  private var task: URLSessionTask?
  private var timeoutWorkItem: DispatchWorkItem?
  private var settled = false

  init(
    coordinator: NemuSyncHttpCoordinator,
    sessionContext: NemuHttpSessionContext,
    requestId: String,
    completion: @escaping @Sendable (NemuNativeHttpFileResult) -> Void
  ) {
    self.coordinator = coordinator
    self.sessionContext = sessionContext
    self.requestId = requestId
    self.completion = completion
  }

  func start(
    task: URLSessionTask,
    timeoutSeconds: Double,
    explicitCookieHeader: String?,
    originalUrl: URL?,
    requireHttps: Bool
  ) {
    sessionContext.registerRedirectPolicy(
      task: task,
      explicitHeader: explicitCookieHeader,
      originalUrl: originalUrl,
      requireHttps: requireHttps
    )
    lock.lock()
    self.task = task
    lock.unlock()

    guard coordinator.track(
      id: requestId,
      task: task,
      allowBackground: true
    ) else {
      task.cancel()
      finish(NemuNativeHttpFileResult(
        status: 0,
        headers: [:],
        fileURL: nil,
        byteLength: nil,
        error: "Request cancelled or app is not active."
      ))
      return
    }

    let timeout = DispatchWorkItem { [weak self] in self?.timeOut() }
    lock.lock()
    if settled {
      lock.unlock()
      timeout.cancel()
      return
    }
    timeoutWorkItem = timeout
    lock.unlock()
    DispatchQueue.global(qos: .utility).asyncAfter(
      deadline: .now() + timeoutSeconds,
      execute: timeout
    )
    task.resume()
  }

  func finish(_ result: NemuNativeHttpFileResult) {
    lock.lock()
    if settled {
      lock.unlock()
      if let fileURL = result.fileURL {
        try? FileManager.default.removeItem(at: fileURL)
      }
      return
    }
    settled = true
    let taskToRelease = task
    task = nil
    let timeout = timeoutWorkItem
    timeoutWorkItem = nil
    lock.unlock()

    timeout?.cancel()
    if let taskToRelease {
      sessionContext.unregisterRedirectPolicy(task: taskToRelease)
    }
    coordinator.finish(id: requestId)
    completion(result)
  }

  private func timeOut() {
    _ = coordinator.cancel(id: requestId)
    finish(NemuNativeHttpFileResult(
      status: 0,
      headers: [:],
      fileURL: nil,
      byteLength: nil,
      error: "Request timed out."
    ))
  }
}

public class NemuAidokuModule: Module {
  private let cellularData = CTCellularData()

  private static func networkAccessStateName(
    _ state: CTCellularDataRestrictedState
  ) -> String {
    switch state {
    case .restrictedStateUnknown:
      return "unknown"
    case .restricted:
      return "restricted"
    case .notRestricted:
      return "notRestricted"
    @unknown default:
      return "unknown"
    }
  }

  private lazy var iosSandboxManager = NemuAidokuIOSandboxManager(
    httpRequest: Self.sendAidokuSandboxHttpRequest
  )

  public func definition() -> ModuleDefinition {
    Name("NemuAidoku")

    // Emitted by the on-demand Cloudflare solver (`solveCloudflare`) so the JS
    // "Nemu Agent" sheet can render live progress without blocking the RN
    // thread. Synchronous WASM HTTP calls surface the challenge immediately;
    // these events are for the explicit, non-blocking verification + retry.
    Events(
      "nemuAidokuCfSolveStart",
      "nemuAidokuCfWaiting",
      "nemuAidokuCfCaptcha",
      "nemuAidokuCfSuccess",
      "nemuAidokuCfFailed",
      "nemuNetworkAccessChanged"
    )

    OnStartObserving("nemuNetworkAccessChanged") {
      self.cellularData.cellularDataRestrictionDidUpdateNotifier = { [weak self] state in
        guard let self else { return }
        DispatchQueue.main.async {
          self.sendEvent("nemuNetworkAccessChanged", [
            "state": Self.networkAccessStateName(state),
          ])
        }
      }
    }

    OnStopObserving("nemuNetworkAccessChanged") {
      self.cellularData.cellularDataRestrictionDidUpdateNotifier = nil
    }

    Function("isAvailable") {
      return true
    }

    Function("getNetworkAccessState") {
      return Self.networkAccessStateName(self.cellularData.restrictedState)
    }

    Function("getHttpClientStatus") {
      return [
        "available": true,
        "abiVersion": 6,
        "supportsRequestLifecycle": true,
        "supportsCloudflareSolver": false,
        "version": nemuNativeHttpVersion,
        "platform": "ios",
        "detail": "Built-in native source networking is available.",
      ]
    }

    Function("getAidokuSandboxStatus") {
      return NemuAidokuIOSandboxManager.status()
    }

    Function("prepareHttpRequest") { (requestId: String) -> Bool in
      return NemuSyncHttpCoordinator.shared.prepare(id: requestId)
    }

    Function("cancelHttpRequest") { (requestId: String) -> Bool in
      return NemuSyncHttpCoordinator.shared.cancel(id: requestId)
    }

    Function("releaseHttpRequest") { (requestId: String) in
      NemuSyncHttpCoordinator.shared.release(id: requestId)
    }

    AsyncFunction("resetMobileSourceProfileAuthState") { (promise: Promise) in
      // All source sessions use isolated jars. Clear them directly so neither
      // scoped nor stateless authentication can cross a profile transition.
      NemuSyncHttpCoordinator.shared.clearCookieScopes()
      NemuSyncHttpCoordinator.shared.resetSharedCookieContext()
      promise.resolve()
    }

    AsyncFunction("sendHttpRequest") { (request: NemuAidokuHttpRequest, promise: Promise) in
      Self.sendHttpRequestAsync(request, promise: promise)
    }

    AsyncFunction("downloadHttpFile") { (request: NemuAidokuHttpFileRequest, promise: Promise) in
      Self.downloadHttpFileAsync(request, promise: promise)
    }

    Function("sendHttpRequestSync") { (request: NemuAidokuHttpRequest) -> [String: Any?] in
      return Self.sendHttpRequest(
        request,
        maxTimeoutSeconds: nemuSyncHttpMaxTimeoutSeconds,
        allowBackground: false
      )
    }

    AsyncFunction("createAidokuSandboxSession") {
        (
          sessionId: String,
          packageUri: String,
          sourceKey: String,
          expectedSourceId: String,
          expectedVersion: Int,
          settingsJson: String,
          promise: Promise
        ) in
      self.iosSandboxManager.createSession(
        sessionId: sessionId,
        packageUri: packageUri,
        sourceKey: sourceKey,
        expectedSourceId: expectedSourceId,
        expectedVersion: expectedVersion,
        settingsJson: settingsJson
      ) { result in
        Self.settleSandboxPromise(result, promise: promise)
      }
    }

    AsyncFunction("executeAidokuSandboxOperation") {
        (sessionId: String, operationJson: String, promise: Promise) in
      self.iosSandboxManager.executeOperation(
        sessionId: sessionId,
        operationJson: operationJson
      ) { result in
        Self.settleSandboxPromise(result, promise: promise)
      }
    }

    AsyncFunction("processAidokuSandboxImage") {
        (sessionId: String, operationJson: String, imageBytes: Data, promise: Promise) in
      self.iosSandboxManager.processImage(
        sessionId: sessionId,
        operationJson: operationJson,
        imageBytes: imageBytes
      ) { result in
        Self.settleSandboxPromise(result, promise: promise)
      }
    }

    AsyncFunction("updateAidokuSandboxSettings") {
        (sessionId: String, settingsJson: String, promise: Promise) in
      self.iosSandboxManager.updateSettings(
        sessionId: sessionId,
        settingsJson: settingsJson
      ) { result in
        Self.settleSandboxPromise(result, promise: promise)
      }
    }

    AsyncFunction("clearAidokuSandboxSettings") {
        (key: String, matchPrefix: Bool, promise: Promise) in
      self.iosSandboxManager.clearPersistedSettings(
        key: key,
        matchPrefix: matchPrefix
      ) { result in
        Self.settleSandboxPromise(result, promise: promise)
      }
    }

    AsyncFunction("disposeAidokuSandboxSession") { (sessionId: String, promise: Promise) in
      self.iosSandboxManager.disposeSession(sessionId: sessionId) { result in
        Self.settleSandboxPromise(result, promise: promise)
      }
    }

    // Keep the ABI while failing closed. WKWebView cannot route every redirect,
    // subresource, or service-worker fetch through the native SSRF peer gate,
    // so source-controlled challenge pages must never be loaded here.
    AsyncFunction("solveCloudflare") { (url: String, promise: Promise) in
      Self.solveCloudflareAsync(module: self, url: url, promise: promise)
    }

    // A Metro/native app-context reload does not necessarily generate another
    // UIApplication activation notification. Reactivate the process-wide
    // connection pool when the replacement module instance is created.
    OnCreate {
      NemuSyncHttpCoordinator.shared.setActive(true)
      DispatchQueue.global(qos: .utility).async {
        Self.pruneNativeHttpTemporaryFiles()
      }
    }

    OnAppBecomesActive {
      NemuSyncHttpCoordinator.shared.setActive(true)
    }

    OnAppEntersBackground {
      NemuSyncHttpCoordinator.shared.setActive(false)
    }

    OnAppContextDestroys {
      NemuSyncHttpCoordinator.shared.cancelAll()
      NemuSyncHttpCoordinator.shared.clearCookieScopes()
      self.iosSandboxManager.close()
    }
  }

  private static func settleSandboxPromise<Value>(
    _ result: Result<Value, Error>,
    promise: Promise
  ) {
    switch result {
    case .success(let value):
      promise.resolve(value)
    case .failure(let error):
      promise.reject(NemuAidokuSandboxException(error))
    }
  }

  static func sendAidokuSandboxHttpRequest(
    _ request: NemuAidokuIOSandboxHTTPRequest
  ) -> NemuAidokuIOSandboxHTTPResponse {
    let destination = validatedRemoteHttpURL(request.url)
    guard let url = destination.url else {
      return NemuAidokuIOSandboxHTTPResponse(
        status: 0,
        headers: [:],
        data: Data(),
        error: destination.error
      )
    }
    let bridgeRequest = NemuAidokuHttpRequest()
    bridgeRequest.cookieScope = request.sourceKey
    bridgeRequest.url = request.url
    bridgeRequest.method = request.method
    bridgeRequest.headers = request.headers
    bridgeRequest.body = request.body
    bridgeRequest.timeoutMs = request.timeoutMs
    bridgeRequest.responseMode = "bytes"
    bridgeRequest.maxResponseBytes = nemuIOSAidokuMaxHttpResponseBytes

    let timeoutSeconds = max(
      1.0,
      min(Double(request.timeoutMs) / 1_000.0, nemuSyncHttpMaxTimeoutSeconds)
    )
    let coordinator = NemuSyncHttpCoordinator.shared
    let sessionContext = coordinator.sessionContext(cookieScope: request.sourceKey, url: url)
    let explicitCookieHeader = request.headers.first {
      $0.key.caseInsensitiveCompare("Cookie") == .orderedSame
    }?.value
    let urlRequest: URLRequest
    do {
      urlRequest = try buildRequest(
        url: url,
        request: bridgeRequest,
        timeoutSeconds: timeoutSeconds,
        cookieStorage: sessionContext.cookieStorage
      )
    } catch {
      return NemuAidokuIOSandboxHTTPResponse(
        status: 0,
        headers: [:],
        data: Data(),
        error: error.localizedDescription
      )
    }
    let result = performRequest(
      urlRequest,
      timeoutSeconds: timeoutSeconds,
      maxResponseBytes: nemuIOSAidokuMaxHttpResponseBytes,
      allowBackground: true,
      sessionContext: sessionContext,
      explicitCookieHeader: explicitCookieHeader
    )
    return NemuAidokuIOSandboxHTTPResponse(
      status: result.status,
      headers: result.headers,
      data: result.data,
      error: result.error
    )
  }

  static func decorateSandboxImageHeaders(
    sourceKey: String,
    urlString: String,
    headers: [String: String]
  ) -> [String: String] {
    guard let url = URL(string: urlString) else { return headers }
    var output = headers
    let explicitCookie = output.first {
      $0.key.caseInsensitiveCompare("Cookie") == .orderedSame
    }?.value
    output = output.filter {
      $0.key.caseInsensitiveCompare("Cookie") != .orderedSame
    }
    let context = NemuSyncHttpCoordinator.shared.sessionContext(
      cookieScope: sourceKey,
      url: url
    )
    let merged = NemuAidokuCookieMerge.mergedHeader(
      storedCookies: context.cookieStorage.cookies(for: url) ?? [],
      explicitHeader: explicitCookie
    )
    if let merged, merged.utf8.count <= 64 * 1024 {
      output["Cookie"] = merged
    } else if let explicitCookie, explicitCookie.utf8.count <= 64 * 1024 {
      // A pathological stored jar must not turn a valid image request into an
      // unbounded native header. Preserve the already-validated source value.
      output["Cookie"] = explicitCookie
    }
    return output
  }

  private static func solveCloudflareAsync(module: NemuAidokuModule, url: String, promise: Promise) {
    module.sendEvent("nemuAidokuCfFailed", [
      "url": url,
      "reason": "Secure Cloudflare verification is unavailable on this platform."
    ])
    promise.resolve(false)
  }

  private static func downloadHttpFileAsync(
    _ request: NemuAidokuHttpFileRequest,
    promise: Promise
  ) {
    let promiseBox = NemuNativeHttpPromiseBox(promise)
    DispatchQueue.global(qos: .utility).async {
      Self.pruneNativeHttpTemporaryFiles()
      let destination = Self.validatedRemoteHttpURL(request.url)
      guard let url = destination.url else {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: destination.error
        ))
        return
      }
      guard NemuNativeHttpRedirectPolicy.allows(
        url,
        requireHttps: request.requireHttps
      ) else {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: NemuNativeHttpRedirectPolicy.blockedMessage
        ))
        return
      }
      guard request.maxResponseBytes > 0 else {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: "Invalid native HTTP file byte limit."
        ))
        return
      }
      let imagePolicy: NemuImageDimensionPolicy?
      do {
        imagePolicy = try NemuImageMetadataPolicy.requestedPolicy(
          maxDimension: request.maxImageDimension,
          maxPixels: request.maxImagePixels
        )
      } catch {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: error.localizedDescription
        ))
        return
      }

      let trimmedCookieScope = request.cookieScope?.trimmingCharacters(
        in: .whitespacesAndNewlines
      )
      let cookieScope = trimmedCookieScope?.isEmpty == false ? trimmedCookieScope : nil
      if let cookieScope, (
        cookieScope.count > 512 ||
        cookieScope.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
      ) {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: "Invalid native HTTP cookie scope."
        ))
        return
      }

      let timeoutSeconds = max(
        1.0,
        min(
          Double(request.timeoutMs ?? Int(nemuAsyncHttpMaxTimeoutSeconds * 1000)) / 1000.0,
          nemuAsyncHttpMaxTimeoutSeconds
        )
      )
      let coordinator = NemuSyncHttpCoordinator.shared
      let sessionContext = coordinator.sessionContext(cookieScope: cookieScope, url: url)
      let bridgeRequest = NemuAidokuHttpRequest()
      bridgeRequest.requestId = request.requestId
      bridgeRequest.cookieScope = cookieScope
      bridgeRequest.url = request.url
      bridgeRequest.method = "GET"
      bridgeRequest.headers = request.headers
      bridgeRequest.timeoutMs = request.timeoutMs
      bridgeRequest.responseMode = "bytes"
      bridgeRequest.maxResponseBytes = request.maxResponseBytes
      bridgeRequest.requireHttps = request.requireHttps
      let explicitCookieHeader = request.headers.first {
        $0.key.caseInsensitiveCompare("Cookie") == .orderedSame
      }?.value
      let urlRequest: URLRequest
      do {
        urlRequest = try Self.buildRequest(
          url: url,
          request: bridgeRequest,
          timeoutSeconds: timeoutSeconds,
          cookieStorage: sessionContext.cookieStorage
        )
      } catch {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: error.localizedDescription
        ))
        return
      }
      let trimmedRequestId = request.requestId?.trimmingCharacters(
        in: .whitespacesAndNewlines
      )
      let nativeRequestId = trimmedRequestId?.isEmpty == false
        ? trimmedRequestId!
        : UUID().uuidString
      guard coordinator.prepare(id: nativeRequestId) else {
        promiseBox.promise.resolve(Self.fileResponse(
          status: 0,
          error: "Request cancelled or app is not active."
        ))
        return
      }

      let operation = NemuNativeHttpFileAsyncOperation(
        coordinator: coordinator,
        sessionContext: sessionContext,
        requestId: nativeRequestId
      ) { result in
        promiseBox.promise.resolve(Self.fileResponse(from: result))
      }
      let task = coordinator.makeDownloadTask(
        context: sessionContext,
        with: urlRequest,
        maxResponseBytes: request.maxResponseBytes
      ) { location, response, error in
        let httpResponse = response as? HTTPURLResponse
        let status = httpResponse?.statusCode ?? 0
        let headers = Self.responseHeaders(from: httpResponse)
        if let error {
          operation.finish(NemuNativeHttpFileResult(
            status: 0,
            headers: headers,
            fileURL: nil,
            byteLength: nil,
            error: error.localizedDescription
          ))
          return
        }
        guard (200..<300).contains(status) else {
          operation.finish(NemuNativeHttpFileResult(
            status: status,
            headers: headers,
            fileURL: nil,
            byteLength: nil,
            error: "HTTP file download failed with status \(status)."
          ))
          return
        }
        guard let location else {
          operation.finish(NemuNativeHttpFileResult(
            status: status,
            headers: headers,
            fileURL: nil,
            byteLength: nil,
            error: "HTTP file download did not produce a temporary file."
          ))
          return
        }

        do {
          let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
          guard let byteLength = (attributes[.size] as? NSNumber)?.int64Value,
            byteLength > 0,
            byteLength <= Int64(request.maxResponseBytes)
          else {
            throw NSError(
              domain: "NemuAidoku.NativeHttpDownload",
              code: 3,
              userInfo: [
                NSLocalizedDescriptionKey:
                  "HTTP response exceeds the \(request.maxResponseBytes) byte safety limit."
              ]
            )
          }
          if let imagePolicy {
            _ = try NemuImageMetadataPolicy.validateFile(
              location,
              policy: imagePolicy
            )
          }
          let outputDirectory = FileManager.default.urls(
            for: .cachesDirectory,
            in: .userDomainMask
          )[0].appendingPathComponent(
            "nemu-native-http-downloads",
            isDirectory: true
          )
          try FileManager.default.createDirectory(
            at: outputDirectory,
            withIntermediateDirectories: true
          )
          let output = outputDirectory.appendingPathComponent(
            "nemu-http-\(DispatchTime.now().uptimeNanoseconds).part",
            isDirectory: false
          )
          try FileManager.default.moveItem(at: location, to: output)
          operation.finish(NemuNativeHttpFileResult(
            status: status,
            headers: headers,
            fileURL: output,
            byteLength: byteLength,
            error: nil
          ))
        } catch {
          operation.finish(NemuNativeHttpFileResult(
            status: 0,
            headers: headers,
            fileURL: nil,
            byteLength: nil,
            error: error.localizedDescription
          ))
        }
      }
      operation.start(
        task: task,
        timeoutSeconds: timeoutSeconds,
        explicitCookieHeader: explicitCookieHeader,
        originalUrl: urlRequest.url,
        requireHttps: request.requireHttps
      )
    }
  }

  private static func sendHttpRequestAsync(
    _ request: NemuAidokuHttpRequest,
    promise: Promise
  ) {
    let destination = validatedRemoteHttpURL(request.url)
    guard let url = destination.url else {
      promise.resolve(response(
        status: 0,
        error: destination.error
      ))
      return
    }
    guard NemuNativeHttpRedirectPolicy.allows(
      url,
      requireHttps: request.requireHttps
    ) else {
      promise.resolve(response(
        status: 0,
        error: NemuNativeHttpRedirectPolicy.blockedMessage
      ))
      return
    }
    let trimmedCookieScope = request.cookieScope?.trimmingCharacters(
      in: .whitespacesAndNewlines
    )
    let cookieScope = trimmedCookieScope?.isEmpty == false ? trimmedCookieScope : nil
    if let cookieScope, (
      cookieScope.count > 512 ||
      cookieScope.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    ) {
      promise.resolve(response(status: 0, error: "Invalid Aidoku cookie scope."))
      return
    }

    let timeoutSeconds = max(
      1.0,
      min(
        Double(request.timeoutMs ?? Int(nemuAsyncHttpMaxTimeoutSeconds * 1000)) / 1000.0,
        nemuAsyncHttpMaxTimeoutSeconds
      )
    )
    let coordinator = NemuSyncHttpCoordinator.shared
    let sessionContext = coordinator.sessionContext(cookieScope: cookieScope, url: url)
    let explicitCookieHeader = request.headers.first {
      $0.key.caseInsensitiveCompare("Cookie") == .orderedSame
    }?.value
    let urlRequest: URLRequest
    do {
      urlRequest = try buildRequest(
        url: url,
        request: request,
        timeoutSeconds: timeoutSeconds,
        cookieStorage: sessionContext.cookieStorage
      )
    } catch {
      promise.resolve(response(status: 0, error: error.localizedDescription))
      return
    }
    let responseMode = request.responseMode
    let promiseBox = NemuNativeHttpPromiseBox(promise)
    performRequestAsync(
      urlRequest,
      timeoutSeconds: timeoutSeconds,
      maxResponseBytes: request.maxResponseBytes,
      requestId: request.requestId,
      allowBackground: true,
      sessionContext: sessionContext,
      explicitCookieHeader: explicitCookieHeader,
      requireHttps: request.requireHttps
    ) { result in
      promiseBox.promise.resolve(
        response(
          from: result,
          handledCloudflare: false,
          responseMode: responseMode
        )
      )
    }
  }

  private static func performRequestAsync(
    _ urlRequest: URLRequest,
    timeoutSeconds: Double,
    maxResponseBytes: Int?,
    requestId: String?,
    allowBackground: Bool,
    sessionContext: NemuHttpSessionContext,
    explicitCookieHeader: String?,
    requireHttps: Bool,
    completion: @escaping @Sendable (NemuNativeHttpResult) -> Void
  ) {
    let coordinator = NemuSyncHttpCoordinator.shared
    if !allowBackground && !coordinator.isAppActive() {
      completion(NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "App is not active."
      ))
      return
    }

    let nativeRequestId = requestId ?? UUID().uuidString
    guard coordinator.prepare(id: nativeRequestId) else {
      completion(NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "Request cancelled or app is not active."
      ))
      return
    }
    let operation = NemuNativeHttpAsyncOperation(
      coordinator: coordinator,
      sessionContext: sessionContext,
      requestId: nativeRequestId,
      completion: completion
    )

    if let maxResponseBytes, maxResponseBytes >= 0 {
      let task = coordinator.makeDownloadTask(
        context: sessionContext,
        with: urlRequest,
        maxResponseBytes: maxResponseBytes
      ) { location, urlResponse, error in
        let httpResponse = urlResponse as? HTTPURLResponse
        let headers = responseHeaders(from: httpResponse)
        if let error {
          operation.finish(NemuNativeHttpResult(
            status: 0,
            headers: headers,
            data: Data(),
            error: error.localizedDescription
          ))
          return
        }

        let limitError = "HTTP response exceeds the \(maxResponseBytes) byte safety limit."
        if (urlResponse?.expectedContentLength ?? -1) > Int64(maxResponseBytes) {
          operation.finish(NemuNativeHttpResult(
            status: 0,
            headers: headers,
            data: Data(),
            error: limitError
          ))
          return
        }
        guard let location else {
          operation.finish(NemuNativeHttpResult(
            status: 0,
            headers: headers,
            data: Data(),
            error: "Request did not complete."
          ))
          return
        }
        do {
          let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
          let fileSize = (attributes[.size] as? NSNumber)?.int64Value ?? -1
          guard fileSize >= 0, fileSize <= Int64(maxResponseBytes) else {
            operation.finish(NemuNativeHttpResult(
              status: 0,
              headers: headers,
              data: Data(),
              error: limitError
            ))
            return
          }
          let data = try Data(contentsOf: location, options: .mappedIfSafe)
          guard data.count <= maxResponseBytes else {
            operation.finish(NemuNativeHttpResult(
              status: 0,
              headers: headers,
              data: Data(),
              error: limitError
            ))
            return
          }
          operation.finish(NemuNativeHttpResult(
            status: httpResponse?.statusCode ?? 0,
            headers: headers,
            data: data,
            error: nil
          ))
        } catch {
          operation.finish(NemuNativeHttpResult(
            status: 0,
            headers: headers,
            data: Data(),
            error: error.localizedDescription
          ))
        }
      }
      operation.start(
        task: task,
        timeoutSeconds: timeoutSeconds,
        allowBackground: allowBackground,
        explicitCookieHeader: explicitCookieHeader,
        originalUrl: urlRequest.url,
        requireHttps: requireHttps
      )
      return
    }

    let task = coordinator.makeDataTask(
      context: sessionContext,
      with: urlRequest
    ) { data, urlResponse, error in
      let httpResponse = urlResponse as? HTTPURLResponse
      operation.finish(NemuNativeHttpResult(
        status: error == nil ? (httpResponse?.statusCode ?? 0) : 0,
        headers: responseHeaders(from: httpResponse),
        data: error == nil ? (data ?? Data()) : Data(),
        error: error?.localizedDescription
      ))
    }
    operation.start(
      task: task,
      timeoutSeconds: timeoutSeconds,
      allowBackground: allowBackground,
      explicitCookieHeader: explicitCookieHeader,
      originalUrl: urlRequest.url,
      requireHttps: requireHttps
    )
  }

  private static func responseHeaders(from response: HTTPURLResponse?) -> [String: String] {
    var headers: [String: String] = [:]
    if let allHeaders = response?.allHeaderFields {
      for (key, value) in allHeaders {
        headers[String(describing: key).lowercased()] = String(describing: value)
      }
    }
    return headers
  }

  private static func sendHttpRequest(
    _ request: NemuAidokuHttpRequest,
    maxTimeoutSeconds: Double,
    allowBackground: Bool
  ) -> [String: Any?] {
    let destination = validatedRemoteHttpURL(request.url)
    guard let url = destination.url else {
      return response(status: 0, error: destination.error)
    }
    guard NemuNativeHttpRedirectPolicy.allows(
      url,
      requireHttps: request.requireHttps
    ) else {
      return response(
        status: 0,
        error: NemuNativeHttpRedirectPolicy.blockedMessage
      )
    }
    let trimmedCookieScope = request.cookieScope?.trimmingCharacters(
      in: .whitespacesAndNewlines
    )
    let cookieScope = trimmedCookieScope?.isEmpty == false ? trimmedCookieScope : nil
    if let cookieScope, (
      cookieScope.count > 512 ||
      cookieScope.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    ) {
      return response(status: 0, error: "Invalid Aidoku cookie scope.")
    }

    let timeoutSeconds = max(
      1.0,
      min(
        Double(request.timeoutMs ?? Int(maxTimeoutSeconds * 1000)) / 1000.0,
        maxTimeoutSeconds
      )
    )
    let coordinator = NemuSyncHttpCoordinator.shared
    let sessionContext = coordinator.sessionContext(cookieScope: cookieScope, url: url)
    let explicitCookieHeader = request.headers.first {
      $0.key.caseInsensitiveCompare("Cookie") == .orderedSame
    }?.value
    let urlRequest: URLRequest
    do {
      urlRequest = try buildRequest(
        url: url,
        request: request,
        timeoutSeconds: timeoutSeconds,
        cookieStorage: sessionContext.cookieStorage
      )
    } catch {
      return response(status: 0, error: error.localizedDescription)
    }
    // Never present or wait for a Cloudflare WebView inline. Aidoku's WASM
    // host import must return synchronously; waiting here freezes the RN JS
    // thread. aidoku-runtime classifies the response and the Nemu Agent sheet
    // performs the non-blocking solveCloudflare + retry path.
    return response(
      from: performRequest(
        urlRequest,
        timeoutSeconds: timeoutSeconds,
        maxResponseBytes: request.maxResponseBytes,
        requestId: request.requestId,
        allowBackground: allowBackground,
        sessionContext: sessionContext,
        explicitCookieHeader: explicitCookieHeader,
        requireHttps: request.requireHttps
      ),
      handledCloudflare: false,
      responseMode: request.responseMode
    )
  }

  private static func buildRequest(
    url: URL,
    request: NemuAidokuHttpRequest,
    timeoutSeconds: Double,
    cookieStorage: HTTPCookieStorage
  ) throws -> URLRequest {
    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = request.method.isEmpty ? "GET" : request.method
    urlRequest.timeoutInterval = timeoutSeconds

    try NemuNativeHttpRequestHeaderPolicy.apply(
      request.headers,
      to: &urlRequest
    )
    if !hasHeader(urlRequest, "User-Agent") {
      urlRequest.setValue(nemuMobileUserAgent, forHTTPHeaderField: "User-Agent")
    }
    attachStoredCookies(
      to: &urlRequest,
      url: url,
      cookieStorage: cookieStorage
    )

    if let body = request.body, let bodyData = body.data(using: .utf8) {
      urlRequest.httpBody = bodyData
    }
    NemuNativeHttpLoopbackProxy.shared.authorizeLegacyPlainHttp(&urlRequest)

    return urlRequest
  }

  private static func performRequest(
    _ urlRequest: URLRequest,
    timeoutSeconds: Double,
    maxResponseBytes: Int? = nil,
    requestId: String? = nil,
    allowBackground: Bool,
    sessionContext: NemuHttpSessionContext,
    explicitCookieHeader: String?,
    requireHttps: Bool = false
  ) -> NemuNativeHttpResult {
    if let maxResponseBytes, maxResponseBytes >= 0 {
      return performBoundedDownloadRequest(
        urlRequest,
        timeoutSeconds: timeoutSeconds,
        maxResponseBytes: maxResponseBytes,
        requestId: requestId,
        allowBackground: allowBackground,
        sessionContext: sessionContext,
        explicitCookieHeader: explicitCookieHeader,
        requireHttps: requireHttps
      )
    }

    let coordinator = NemuSyncHttpCoordinator.shared
    if !allowBackground && !coordinator.isAppActive() {
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "App is not active."
      )
    }

    let semaphore = DispatchSemaphore(value: 0)
    let result = NemuNativeHttpResultBox(NemuNativeHttpResult(
      status: 0,
      headers: [:],
      data: Data(),
      error: "Request did not complete."
    ))

    let nativeRequestId = requestId ?? UUID().uuidString
    guard coordinator.prepare(id: nativeRequestId) else {
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "Request cancelled or app is not active."
      )
    }
    let task = coordinator.makeDataTask(context: sessionContext, with: urlRequest) { data, urlResponse, error in
      defer {
        coordinator.finish(id: nativeRequestId)
        semaphore.signal()
      }

      if let error {
        result.set(NemuNativeHttpResult(
          status: 0,
          headers: [:],
          data: Data(),
          error: error.localizedDescription
        ))
        return
      }

      let httpResponse = urlResponse as? HTTPURLResponse
      let status = httpResponse?.statusCode ?? 0
      var headers: [String: String] = [:]

      if let allHeaders = httpResponse?.allHeaderFields {
        for (key, value) in allHeaders {
          headers[String(describing: key).lowercased()] = String(describing: value)
        }
      }

      result.set(NemuNativeHttpResult(
        status: status,
        headers: headers,
        data: data ?? Data(),
        error: nil
      ))
    }
    sessionContext.registerRedirectPolicy(
      task: task,
      explicitHeader: explicitCookieHeader,
      originalUrl: urlRequest.url,
      requireHttps: requireHttps
    )
    defer { sessionContext.unregisterRedirectPolicy(task: task) }

    guard coordinator.track(
      id: nativeRequestId,
      task: task,
      allowBackground: allowBackground
    ) else {
      task.cancel()
      coordinator.finish(id: nativeRequestId)
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "App is not active."
      )
    }
    task.resume()
    let waitResult = semaphore.wait(timeout: .now() + timeoutSeconds)
    if waitResult == .timedOut {
      _ = coordinator.cancel(id: nativeRequestId)
      // Mirror the async operations: cancelling leaves the ID in `prepared` and
      // `cancelled`, and the late URLSession completion may never arrive to
      // clear it. A JS retry that prepares the same ID would then be rejected.
      coordinator.finish(id: nativeRequestId)
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "Request timed out."
      )
    }

    return result.get()
  }

  /// A data-task completion handler buffers the entire body before it runs.
  /// Package downloads instead stream to URLSession's temporary file, stat it,
  /// and only then allocate bounded Data for the JS bridge.
  private static func performBoundedDownloadRequest(
    _ urlRequest: URLRequest,
    timeoutSeconds: Double,
    maxResponseBytes: Int,
    requestId: String? = nil,
    allowBackground: Bool,
    sessionContext: NemuHttpSessionContext,
    explicitCookieHeader: String?,
    requireHttps: Bool
  ) -> NemuNativeHttpResult {
    let coordinator = NemuSyncHttpCoordinator.shared
    if !allowBackground && !coordinator.isAppActive() {
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "App is not active."
      )
    }

    let semaphore = DispatchSemaphore(value: 0)
    let result = NemuNativeHttpResultBox(NemuNativeHttpResult(
      status: 0,
      headers: [:],
      data: Data(),
      error: "Request did not complete."
    ))
    let nativeRequestId = requestId ?? UUID().uuidString
    guard coordinator.prepare(id: nativeRequestId) else {
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "Request cancelled or app is not active."
      )
    }
    let task = coordinator.makeDownloadTask(
      context: sessionContext,
      with: urlRequest,
      maxResponseBytes: maxResponseBytes
    ) { location, urlResponse, error in
      defer {
        coordinator.finish(id: nativeRequestId)
        semaphore.signal()
      }

      if let error {
        result.set(NemuNativeHttpResult(
          status: 0,
          headers: [:],
          data: Data(),
          error: error.localizedDescription
        ))
        return
      }

      let httpResponse = urlResponse as? HTTPURLResponse
      var headers: [String: String] = [:]
      if let allHeaders = httpResponse?.allHeaderFields {
        for (key, value) in allHeaders {
          headers[String(describing: key).lowercased()] = String(describing: value)
        }
      }
      let limitError = "HTTP response exceeds the \(maxResponseBytes) byte safety limit."
      if (urlResponse?.expectedContentLength ?? -1) > Int64(maxResponseBytes) {
        result.set(NemuNativeHttpResult(
          status: 0,
          headers: headers,
          data: Data(),
          error: limitError
        ))
        return
      }

      guard let location else {
        result.set(NemuNativeHttpResult(
          status: 0,
          headers: headers,
          data: Data(),
          error: "HTTP response did not include a temporary download file."
        ))
        return
      }

      do {
        let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
        guard let fileSize = (attributes[.size] as? NSNumber)?.int64Value else {
          throw NSError(
            domain: "NemuAidoku",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "HTTP response size could not be determined safely."]
          )
        }
        guard fileSize <= Int64(maxResponseBytes) else {
          result.set(NemuNativeHttpResult(
            status: 0,
            headers: headers,
            data: Data(),
            error: limitError
          ))
          return
        }

        let responseData = try Data(contentsOf: location, options: .mappedIfSafe)
        guard responseData.count <= maxResponseBytes else {
          result.set(NemuNativeHttpResult(
            status: 0,
            headers: headers,
            data: Data(),
            error: limitError
          ))
          return
        }
        result.set(NemuNativeHttpResult(
          status: httpResponse?.statusCode ?? 0,
          headers: headers,
          data: responseData,
          error: nil
        ))
      } catch {
        result.set(NemuNativeHttpResult(
          status: 0,
          headers: headers,
          data: Data(),
          error: error.localizedDescription
        ))
      }
    }
    sessionContext.registerRedirectPolicy(
      task: task,
      explicitHeader: explicitCookieHeader,
      originalUrl: urlRequest.url,
      requireHttps: requireHttps
    )
    defer { sessionContext.unregisterRedirectPolicy(task: task) }

    guard coordinator.track(
      id: nativeRequestId,
      task: task,
      allowBackground: allowBackground
    ) else {
      task.cancel()
      coordinator.finish(id: nativeRequestId)
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "App is not active."
      )
    }
    task.resume()
    let waitResult = semaphore.wait(timeout: .now() + timeoutSeconds)
    if waitResult == .timedOut {
      _ = coordinator.cancel(id: nativeRequestId)
      // Mirror the async operations: cancelling leaves the ID in `prepared` and
      // `cancelled`, and the late URLSession completion may never arrive to
      // clear it. A JS retry that prepares the same ID would then be rejected.
      coordinator.finish(id: nativeRequestId)
      return NemuNativeHttpResult(
        status: 0,
        headers: [:],
        data: Data(),
        error: "Request timed out."
      )
    }
    return result.get()
  }

  private static func attachStoredCookies(
    to request: inout URLRequest,
    url: URL,
    cookieStorage: HTTPCookieStorage = .shared
  ) {
    let explicitHeader = request.value(forHTTPHeaderField: "Cookie")
    request.setValue(
      NemuAidokuCookieMerge.mergedHeader(
        storedCookies: cookieStorage.cookies(for: url) ?? [],
        explicitHeader: explicitHeader
      ),
      forHTTPHeaderField: "Cookie"
    )
  }

  private static func hasHeader(_ request: URLRequest, _ name: String) -> Bool {
    let lowerName = name.lowercased()
    return request.allHTTPHeaderFields?.keys.contains { $0.lowercased() == lowerName } == true
  }

  private static func pruneNativeHttpTemporaryFiles() {
    let fileManager = FileManager.default
    let directory = fileManager.temporaryDirectory
    let keys: Set<URLResourceKey> = [
      .contentModificationDateKey,
      .fileSizeKey,
    ]
    guard let urls = try? fileManager.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: Array(keys),
      options: [.skipsHiddenFiles]
    ) else { return }

    let now = Date()
    var candidates: [(url: URL, modified: Date, bytes: Int)] = []
    for url in urls where
      url.lastPathComponent.hasPrefix("nemu-native-http-")
    {
      let values = try? url.resourceValues(forKeys: keys)
      candidates.append((
        url,
        values?.contentModificationDate ?? .distantPast,
        max(0, values?.fileSize ?? 0)
      ))
    }

    // Normal JS ownership moves these files immediately. Anything an hour old
    // is necessarily orphaned by a crash/reload and can be removed eagerly.
    for candidate in candidates where
      now.timeIntervalSince(candidate.modified) > 60 * 60
    {
      try? fileManager.removeItem(at: candidate.url)
    }

    var retained = candidates.filter { fileManager.fileExists(atPath: $0.url.path) }
      .sorted { $0.modified < $1.modified }
    var retainedBytes = retained.reduce(0) { $0 + $1.bytes }
    // A burst of repeated crashes must not grow the temp area without bound.
    // Never touch very recent files, which may belong to an active request.
    while retained.count > 128 || retainedBytes > 256 * 1024 * 1024 {
      guard
        let oldest = retained.first,
        now.timeIntervalSince(oldest.modified) > 5 * 60
      else { break }
      retained.removeFirst()
      retainedBytes = max(0, retainedBytes - oldest.bytes)
      try? fileManager.removeItem(at: oldest.url)
    }
  }

  /// Source packages are untrusted. Never let their HTTP bridge become an
  /// ambient file/custom-scheme, loopback, LAN, or cloud-metadata reader.
  private static func validatedRemoteHttpURL(
    _ value: String
  ) -> (url: URL?, error: String) {
    do {
      return (try NemuNativeHttpAddressPolicy.validatedURL(value), "")
    } catch {
      let detail = error.localizedDescription.trimmingCharacters(
        in: .whitespacesAndNewlines
      )
      return (
        nil,
        detail.isEmpty
          ? "Native source destination could not be validated."
          : detail
      )
    }
  }

  private static func response(
    from result: NemuNativeHttpResult,
    handledCloudflare: Bool,
    responseMode: String = "both"
  ) -> [String: Any?] {
    return response(
      status: result.status,
      headers: result.headers,
      data: result.data,
      error: result.error,
      handledCloudflare: handledCloudflare,
      responseMode: responseMode
    )
  }

  private static func fileResponse(
    from result: NemuNativeHttpFileResult
  ) -> [String: Any?] {
    return fileResponse(
      status: result.status,
      headers: result.headers,
      fileURL: result.fileURL,
      byteLength: result.byteLength,
      error: result.error
    )
  }

  private static func fileResponse(
    status: Int,
    headers: [String: String] = [:],
    fileURL: URL? = nil,
    byteLength: Int64? = nil,
    error: String?
  ) -> [String: Any?] {
    return [
      "status": status,
      "headers": headers,
      "fileUri": fileURL?.absoluteString,
      "byteLength": byteLength,
      "error": error,
    ]
  }

  private static func resolvedResponseMode(
    _ requestedMode: String,
    headers: [String: String]
  ) -> String {
    let normalized = requestedMode.lowercased()
    if normalized == "text" || normalized == "bytes" || normalized == "both" {
      return normalized
    }
    guard let contentType = headers.first(where: {
      $0.key.caseInsensitiveCompare("content-type") == .orderedSame
    })?.value.lowercased(), !contentType.isEmpty else {
      return "both"
    }
    return contentType.hasPrefix("text/") ||
      contentType.contains("json") ||
      contentType.contains("xml") ||
      contentType.contains("javascript") ||
      contentType.contains("x-www-form-urlencoded") ||
      contentType.contains("graphql")
      ? "text"
      : "bytes"
  }

  private static func response(
    status: Int,
    headers: [String: String] = [:],
    data: Data = Data(),
    error: String?,
    handledCloudflare: Bool = false,
    responseMode: String = "both"
  ) -> [String: Any?] {
    let mode = resolvedResponseMode(responseMode, headers: headers)
    return [
      "status": status,
      "headers": headers,
      // Match WHATWG/Android UTF-8 decoding: malformed sequences become
      // U+FFFD instead of discarding the entire response body.
      "body": mode == "bytes" ? nil : String(decoding: data, as: UTF8.self),
      "bytesBase64": mode == "text" ? nil : data.base64EncodedString(),
      "error": error,
      "handledCloudflare": handledCloudflare,
    ]
  }
}
