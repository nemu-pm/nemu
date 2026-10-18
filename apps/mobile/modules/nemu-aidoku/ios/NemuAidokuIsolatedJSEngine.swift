import Foundation
import JavaScriptCore

/// Process-wide cap on evaluations that had to be abandoned.
///
/// JavaScriptCore has no public API to interrupt a running script
/// (`JSContextGroupSetExecutionTimeLimit` is private SPI in
/// JSContextRefPrivate.h, which App Review rejects). A script that outlives its
/// deadline is therefore abandoned on its own queue: the operation fails, the
/// engine is never used again, and this budget refuses every further source
/// evaluation once it is spent, so a hostile source cannot stack up spinning
/// threads. The budget resets only when the app restarts.
final class NemuAidokuJSRunawayBudget: @unchecked Sendable {
  static let shared = NemuAidokuJSRunawayBudget(limit: 2)

  private let lock = NSLock()
  private let limit: Int
  private var abandoned = 0

  init(limit: Int) {
    self.limit = limit
  }

  var exhausted: Bool {
    lock.lock()
    defer { lock.unlock() }
    return abandoned >= limit
  }

  func recordAbandoned() {
    lock.lock()
    abandoned += 1
    lock.unlock()
  }
}

/// Evaluates Aidoku source scripts (`aidoku::imports::js::JsContext`) outside
/// the WebAssembly sandbox, with Aidoku iOS semantics.
///
/// Every source context is its own `JSContext` in its own `JSVirtualMachine`,
/// exactly as Aidoku's `IsolatedJSContext`. Nothing is exposed to the script:
/// no native blocks, no `fetch`/`XMLHttpRequest`, no timers, no WebKit message
/// handlers, no storage and no inspector; a fresh JSContext only carries the
/// ECMAScript built-ins. Scripts run on a dedicated background queue under a
/// wall-clock deadline. One engine lives for one sandbox operation and holds
/// the contexts that operation opened; `close()` releases them.
final class NemuAidokuIsolatedJSEngine: @unchecked Sendable {
  enum Kind: String {
    case eval
    case evalAsync = "eval-async"
    case get
  }

  enum Failure: Error, CustomStringConvertible {
    case disabled
    case invalidRequest
    case tooManyContexts
    case scriptTooLarge
    case resultTooLarge
    case timedOut

    var description: String {
      switch self {
      case .disabled:
        return "Source JavaScript evaluation is disabled after a runaway script; restart the app."
      case .invalidRequest:
        return "The Aidoku JavaScript request is invalid."
      case .tooManyContexts:
        return "Aidoku source exceeded the JavaScript context limit."
      case .scriptTooLarge:
        return "Aidoku source script exceeds the safety limit."
      case .resultTooLarge:
        return "Aidoku JavaScript result exceeds the safety limit."
      case .timedOut:
        return "Aidoku source script exceeded its time limit."
      }
    }
  }

  struct Limits {
    var maxContexts = 16
    var maxScriptLength = 1024 * 1024
    var maxResultLength = 4 * 1024 * 1024
    var evaluationTimeout: TimeInterval = 5.0
  }

  private let limits: Limits
  private let budget: NemuAidokuJSRunawayBudget
  private let queue = DispatchQueue(
    label: "pm.nemu.aidoku.isolated-js",
    qos: .utility
  )
  // Only touched on `queue`.
  private var contexts: [Int: JSContext] = [:]
  // Only touched by the (serial) caller.
  private var poisoned = false

  init(
    limits: Limits = Limits(),
    budget: NemuAidokuJSRunawayBudget = .shared
  ) {
    self.limits = limits
    self.budget = budget
  }

  /// Evaluate one source request. Returns the stringified result, or nil for
  /// Aidoku's `MissingResult`. Throws when the request breaks a limit.
  func evaluate(
    contextId: Int,
    kind: Kind,
    script: String,
    timeout: TimeInterval
  ) throws -> String? {
    guard !poisoned, !budget.exhausted else { throw Failure.disabled }
    guard contextId >= 1, contextId <= limits.maxContexts else {
      throw contextId >= 1 ? Failure.tooManyContexts : Failure.invalidRequest
    }
    guard script.utf16.count <= limits.maxScriptLength else {
      throw Failure.scriptTooLarge
    }

    let semaphore = DispatchSemaphore(value: 0)
    let box = OutputBox()
    queue.async { [weak self] in
      defer { semaphore.signal() }
      guard let self else { return }
      box.value = autoreleasepool {
        self.run(contextId: contextId, kind: kind, script: script)
      }
    }
    let deadline = max(0.01, min(timeout, limits.evaluationTimeout))
    if semaphore.wait(timeout: .now() + deadline) == .timedOut {
      // The script keeps its queue; never touch this engine again.
      poisoned = true
      budget.recordAbandoned()
      throw Failure.timedOut
    }
    // The semaphore orders the queue's write before this read.
    let output = box.value
    if let output, output.utf16.count > limits.maxResultLength {
      throw Failure.resultTooLarge
    }
    return output
  }

  /// Release every context. Safe to call more than once. An abandoned
  /// evaluation still owns the queue, so its contexts are released only if it
  /// ever returns.
  func close() {
    queue.async { [weak self] in
      self?.contexts.removeAll()
    }
  }

  private final class OutputBox: @unchecked Sendable {
    var value: String?
  }

  // MARK: - Queue-confined evaluation

  private func context(for contextId: Int) -> JSContext? {
    if let existing = contexts[contextId] { return existing }
    guard let context = JSContext(virtualMachine: JSVirtualMachine()) else {
      return nil
    }
    context.name = "nemu Aidoku source script"
    if #available(iOS 16.4, macOS 13.3, *) {
      context.isInspectable = false
    }
    // Aidoku iOS logs and swallows exceptions; evaluateScript then yields
    // `undefined`. Keep the exception off the context so it cannot leak into
    // the next evaluation.
    context.exceptionHandler = { context, _ in
      context?.exception = nil
    }
    contexts[contextId] = context
    return context
  }

  private func run(contextId: Int, kind: Kind, script: String) -> String? {
    guard let context = context(for: contextId) else { return nil }
    switch kind {
    case .eval:
      // IsolatedJSContext.evaluateScript: `evaluateScript(script)?.toString()`.
      return context.evaluateScript(script)?.toString()
    case .get:
      // IsolatedJSContext.objectForKeyedSubscript: a missing global is
      // `undefined`, stringified.
      return context.objectForKeyedSubscript(script)?.toString()
    case .evalAsync:
      return runAsync(context: context, script: script)
    }
  }

  /// IsolatedJSContext.evaluateAsyncScript awaits `(script)` and stringifies
  /// the settled value; a rejection is a missing result. Aidoku resolves via
  /// native blocks; here the settled value is parked on a one-off global so
  /// the script never sees a native function. JavaScriptCore drains the
  /// microtask queue before `evaluateScript` returns, and a JSContext has no
  /// timers, so a promise still pending afterwards can never settle: that is a
  /// missing result instead of Aidoku's indefinite wait.
  private func runAsync(context: JSContext, script: String) -> String? {
    let slot = "__nemuAsync_\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
    let wrapped = """
    (async () => await (\(script)))().then(
      (value) => { globalThis.\(slot) = { settled: true, value: value }; },
      () => { globalThis.\(slot) = { settled: false }; }
    );
    """
    context.evaluateScript(wrapped)
    defer { context.evaluateScript("delete globalThis.\(slot);") }
    guard
      let settled = context.objectForKeyedSubscript(slot),
      settled.isObject,
      settled.forProperty("settled")?.toBool() == true
    else {
      return nil
    }
    return settled.forProperty("value")?.toString()
  }
}
