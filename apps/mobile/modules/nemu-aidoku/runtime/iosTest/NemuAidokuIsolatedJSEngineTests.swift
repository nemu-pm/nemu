import Foundation

@main
enum NemuAidokuIsolatedJSEngineTests {
  static func main() {
    testCopymangaListLiteral()
    testAidokuStringification()
    testContextStateAndIsolation()
    testAsyncEvaluation()
    testNoHostCapabilities()
    testLimits()
    testRunawayScriptIsContained()
    print("NemuAidokuIsolatedJSEngineTests passed.")
  }

  private static func expect(
    _ condition: Bool,
    _ message: String,
    file: StaticString = #file,
    line: UInt = #line
  ) {
    precondition(condition, message, file: file, line: line)
  }

  private static func eval(
    _ engine: NemuAidokuIsolatedJSEngine,
    _ script: String,
    context: Int = 1,
    kind: NemuAidokuIsolatedJSEngine.Kind = .eval
  ) -> String? {
    do {
      return try engine.evaluate(contextId: context, kind: kind, script: script, timeout: 5)
    } catch {
      preconditionFailure("unexpected failure: \(error)")
    }
  }

  private static func failure(
    _ body: () throws -> String?
  ) -> NemuAidokuIsolatedJSEngine.Failure? {
    do {
      _ = try body()
      return nil
    } catch let failure as NemuAidokuIsolatedJSEngine.Failure {
      return failure
    } catch {
      return nil
    }
  }

  private static func testCopymangaListLiteral() {
    // zh.copymanga v21: JsContext::new().eval("JSON.stringify(<list attr>)")
    let engine = NemuAidokuIsolatedJSEngine(budget: NemuAidokuJSRunawayBudget(limit: 1))
    defer { engine.close() }
    let literal =
      "[{'name':'\\u9032\\u64ca\\u7684\\u5de8\\u4eba','path_word':'jinjidejuren','author':[{'name':'\\u8aeb\\u5c71\\u5275'}]}]"
    let json = eval(engine, "JSON.stringify(\(literal))")
    let parsed = json
      .flatMap { $0.data(using: .utf8) }
      .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [[String: Any]] }
    expect(parsed?.first?["name"] as? String == "進擊的巨人", "copymanga list literal parses")
    expect(parsed?.first?["path_word"] as? String == "jinjidejuren", "copymanga path word")
  }

  private static func testAidokuStringification() {
    let engine = NemuAidokuIsolatedJSEngine(budget: NemuAidokuJSRunawayBudget(limit: 1))
    defer { engine.close() }
    // JSValue.toString(), as Aidoku iOS returns it.
    expect(eval(engine, "1 + 2") == "3", "number")
    expect(eval(engine, "undefined") == "undefined", "undefined")
    expect(eval(engine, "null") == "null", "null")
    expect(eval(engine, "({})") == "[object Object]", "object")
    expect(eval(engine, "[1, 2]") == "1,2", "array")
    // A thrown script yields undefined, and the exception does not linger.
    expect(eval(engine, "throw new Error('boom')") == "undefined", "exception")
    expect(eval(engine, "syntax error here(") == "undefined", "syntax error")
    expect(eval(engine, "'after'") == "after", "context usable after exception")
  }

  private static func testContextStateAndIsolation() {
    let engine = NemuAidokuIsolatedJSEngine(budget: NemuAidokuJSRunawayBudget(limit: 1))
    defer { engine.close() }
    _ = eval(engine, "var token = 'abc'; function sign(x) { return token + x; }", context: 1)
    expect(eval(engine, "sign(1)", context: 1) == "abc1", "globals persist per context")
    expect(eval(engine, "token", context: 1, kind: .get) == "abc", "context_get reads a global")
    expect(eval(engine, "token", context: 2, kind: .get) == "undefined", "contexts are isolated")
    expect(eval(engine, "typeof sign", context: 2) == "undefined", "no shared functions")
  }

  private static func testAsyncEvaluation() {
    let engine = NemuAidokuIsolatedJSEngine(budget: NemuAidokuJSRunawayBudget(limit: 1))
    defer { engine.close() }
    expect(eval(engine, "Promise.resolve(41).then((x) => x + 1)", kind: .evalAsync) == "42", "awaits")
    expect(eval(engine, "7", kind: .evalAsync) == "7", "plain value")
    expect(eval(engine, "Promise.reject(new Error('x'))", kind: .evalAsync) == nil, "rejection is missing")
    expect(eval(engine, "new Promise(() => {})", kind: .evalAsync) == nil, "never-settling promise")
    expect(eval(engine, "Object.keys(globalThis).join(',')") == "", "async slot cleaned up")
  }

  private static func testNoHostCapabilities() {
    let engine = NemuAidokuIsolatedJSEngine(budget: NemuAidokuJSRunawayBudget(limit: 1))
    defer { engine.close() }
    for name in [
      "fetch", "XMLHttpRequest", "WebSocket", "webkit", "window", "document",
      "setTimeout", "setInterval", "importScripts", "localStorage", "indexedDB",
      "require", "process", "NemuAidokuSandbox", "NemuAidokuIOSHost", "postMessage",
    ] {
      expect(eval(engine, "typeof \(name)") == "undefined", "\(name) is not exposed")
    }
    expect(
      eval(engine, "try { webkit.messageHandlers.x.postMessage(1); 'reached' } catch (e) { e.name }")
        == "ReferenceError",
      "WebKit message handlers are unreachable"
    )
    expect(
      eval(engine, "try { fetch('https://example.com'); 'reached' } catch (e) { e.name }")
        == "ReferenceError",
      "fetch is unreachable"
    )
  }

  private static func testLimits() {
    let engine = NemuAidokuIsolatedJSEngine(
      limits: .init(maxContexts: 2, maxScriptLength: 64, maxResultLength: 16, evaluationTimeout: 5),
      budget: NemuAidokuJSRunawayBudget(limit: 1)
    )
    defer { engine.close() }
    expect(
      failure { try engine.evaluate(contextId: 3, kind: .eval, script: "1", timeout: 5) } == .tooManyContexts,
      "context cap"
    )
    expect(
      failure { try engine.evaluate(contextId: 0, kind: .eval, script: "1", timeout: 5) } == .invalidRequest,
      "invalid context id"
    )
    expect(
      failure {
        try engine.evaluate(contextId: 1, kind: .eval, script: String(repeating: "1", count: 65), timeout: 5)
      } == .scriptTooLarge,
      "script cap"
    )
    expect(
      failure { try engine.evaluate(contextId: 1, kind: .eval, script: "'x'.repeat(17)", timeout: 5) }
        == .resultTooLarge,
      "result cap"
    )
  }

  private static func testRunawayScriptIsContained() {
    let budget = NemuAidokuJSRunawayBudget(limit: 1)
    let engine = NemuAidokuIsolatedJSEngine(budget: budget)
    let started = Date()
    expect(
      failure { try engine.evaluate(contextId: 1, kind: .eval, script: "while (true) {}", timeout: 0.3) }
        == .timedOut,
      "infinite loop times out"
    )
    expect(Date().timeIntervalSince(started) < 2, "deadline is enforced")
    expect(
      failure { try engine.evaluate(contextId: 1, kind: .eval, script: "1", timeout: 1) } == .disabled,
      "a runaway engine is never reused"
    )
    let other = NemuAidokuIsolatedJSEngine(budget: budget)
    expect(
      failure { try other.evaluate(contextId: 1, kind: .eval, script: "1", timeout: 1) } == .disabled,
      "the spent budget disables every engine"
    )
  }
}
