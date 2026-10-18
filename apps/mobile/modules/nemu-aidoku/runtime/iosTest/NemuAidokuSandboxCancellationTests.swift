import Foundation

@main
enum NemuAidokuSandboxCancellationTests {
  static func main() {
    testTokenExtraction()
    testCancelBeforeStart()
    testCancelReachesInFlightHttp()
    testUntokenedOperationsAreNeverCancelled()
    testRememberedCancellationsAreBounded()
    print("NemuAidokuSandboxCancellationTests passed.")
  }

  private static func expect(
    _ condition: Bool,
    _ message: String,
    file: StaticString = #file,
    line: UInt = #line
  ) {
    precondition(condition, message, file: file, line: line)
  }

  private static func isPreempted(_ body: () throws -> Void) -> Bool {
    do {
      try body()
      return false
    } catch {
      return error.localizedDescription == NemuAidokuSandboxCancellation.preemptedMessage
    }
  }

  private static func testTokenExtraction() {
    var operation: [String: Any] = ["kind": "chapters", "cancelToken": "op-12_ab"]
    expect(
      NemuAidokuSandboxCancellation.takeToken(from: &operation) == "op-12_ab",
      "A well-formed token is taken."
    )
    expect(operation["cancelToken"] == nil, "The token never reaches the worker.")
    expect(operation["kind"] as? String == "chapters", "The operation is otherwise untouched.")

    var hostile: [String: Any] = ["kind": "details", "cancelToken": "a\"b"]
    expect(
      NemuAidokuSandboxCancellation.takeToken(from: &hostile) == nil,
      "A malformed token makes the operation uncancellable, not an error."
    )
    expect(hostile["cancelToken"] == nil, "A malformed token is still stripped.")
    var tooLong: [String: Any] = ["cancelToken": String(repeating: "a", count: 129)]
    expect(NemuAidokuSandboxCancellation.takeToken(from: &tooLong) == nil, "Tokens are short.")
  }

  private static func testCancelBeforeStart() {
    let cancellation = NemuAidokuSandboxCancellation { _ in }
    cancellation.cancel("t1")
    expect(isPreempted { try cancellation.throwIfCancelled("t1") }, "A queued cancel stops the start.")
    expect(isPreempted { _ = try cancellation.beginHttp(token: "t1", round: 1) }, "No HTTP after a cancel.")
    cancellation.finish(token: "t1")
    expect(!cancellation.isCancelled("t1"), "Finishing forgets the token.")
  }

  private static func testCancelReachesInFlightHttp() {
    var cancelledRequests: [String] = []
    let cancellation = NemuAidokuSandboxCancellation { cancelledRequests.append($0) }
    let requestId = try? cancellation.beginHttp(token: "t2", round: 3)
    expect(requestId == "aidoku-op-t2-3", "Requests carry a token-scoped id.")
    cancellation.cancel("t2")
    expect(cancelledRequests == ["aidoku-op-t2-3"], "The waiting request is cancelled at once.")
    cancellation.endHttp(token: "t2")
    expect(isPreempted { try cancellation.throwIfCancelled("t2") }, "The operation reports preemption.")
    cancellation.cancel("t2")
    expect(cancelledRequests.count == 1, "No request is in flight after endHttp.")
  }

  private static func testUntokenedOperationsAreNeverCancelled() {
    let cancellation = NemuAidokuSandboxCancellation { _ in }
    expect(!cancellation.isCancelled(nil), "No token, never cancelled.")
    expect((try? cancellation.beginHttp(token: nil, round: 1)) == .some(nil), "No token, no request id.")
  }

  private static func testRememberedCancellationsAreBounded() {
    let cancellation = NemuAidokuSandboxCancellation { _ in }
    for index in 0..<(NemuAidokuSandboxCancellation.maxRememberedCancellations + 10) {
      cancellation.cancel("never-started-\(index)")
    }
    expect(!cancellation.isCancelled("never-started-0"), "The oldest stray cancellations are forgotten.")
    expect(
      cancellation.isCancelled(
        "never-started-\(NemuAidokuSandboxCancellation.maxRememberedCancellations + 9)"
      ),
      "Recent cancellations are kept."
    )
  }
}
