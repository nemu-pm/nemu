import Foundation

// Standalone executable: xcrun swiftc ios/NemuSharedResource.swift iosTest/NemuSharedResourceTests.swift -o /tmp/t && /tmp/t

final class FakeAnalyzer: NemuDisposableResource, @unchecked Sendable {
  private let lock = NSLock()
  private var disposedFlag = false
  private var busy = 0
  var disposed: Bool { lock.withLock { disposedFlag } }

  func dispose() async {
    lock.withLock {
      precondition(busy == 0, "disposed while an analysis was using it")
      disposedFlag = true
    }
  }

  func analyze(sleepMs: UInt64) async throws -> String {
    lock.withLock {
      precondition(!disposedFlag, "used after dispose")
      busy += 1
    }
    try await Task.sleep(nanoseconds: sleepMs * 1_000_000)
    lock.withLock {
      precondition(!disposedFlag, "disposed mid-analysis")
      busy -= 1
    }
    return "ok"
  }
}

final class Opens: @unchecked Sendable {
  private let lock = NSLock()
  private var made: [FakeAnalyzer] = []
  var all: [FakeAnalyzer] { lock.withLock { made } }
  func make() -> FakeAnalyzer {
    let analyzer = FakeAnalyzer()
    lock.withLock { made.append(analyzer) }
    return analyzer
  }
}

func makeShared(_ opens: Opens, openMs: UInt64 = 50) -> NemuSharedResource<FakeAnalyzer, String> {
  NemuSharedResource {
    try await Task.sleep(nanoseconds: openMs * 1_000_000)
    return (opens.make(), "v1")
  }
}

@main
enum NemuSharedResourceTests {
  static func main() async throws {
    // Concurrent first users (analyze + romanize) share one open.
    do {
      let opens = Opens()
      let shared = makeShared(opens)
      async let a = shared.use { analyzer, _ in try await analyzer.analyze(sleepMs: 10) }
      async let b = shared.use { analyzer, _ in try await analyzer.analyze(sleepMs: 10) }
      async let c = shared.use { analyzer, _ in try await analyzer.analyze(sleepMs: 10) }
      _ = try await (a, b, c)
      precondition(opens.all.count == 1, "opened \(opens.all.count) analyzers")
    }

    // Retire (pack removal) during an analysis waits for it, then disposes.
    do {
      let opens = Opens()
      let shared = makeShared(opens, openMs: 1)
      let analysis = Task { try await shared.use { analyzer, _ in try await analyzer.analyze(sleepMs: 200) } }
      try await Task.sleep(nanoseconds: 50_000_000)
      let before = Date()
      await shared.retire()
      precondition(Date().timeIntervalSince(before) > 0.1, "retire did not wait for the analysis")
      let analyzed = try await analysis.value
      precondition(analyzed == "ok")
      precondition(opens.all.count == 1 && opens.all[0].disposed, "retired analyzer not disposed")
      // The next use opens afresh.
      _ = try await shared.use { analyzer, _ in try await analyzer.analyze(sleepMs: 1) }
      precondition(opens.all.count == 2 && !opens.all[1].disposed)
    }

    // A retire during an open discards (disposes) the stale open.
    do {
      let opens = Opens()
      let shared = makeShared(opens, openMs: 150)
      let user = Task { try await shared.use { analyzer, _ in try await analyzer.analyze(sleepMs: 1) } }
      try await Task.sleep(nanoseconds: 50_000_000)
      await shared.retire()
      var retiredError = false
      do { _ = try await user.value } catch is NemuResourceRetiredError { retiredError = true }
      precondition(retiredError, "stale open was used")
      precondition(opens.all.count == 1 && opens.all[0].disposed, "stale open not disposed")
    }

    // Retire with nothing open or in use returns immediately.
    do {
      let shared = makeShared(Opens())
      await shared.retire()
    }

    print("NemuSharedResourceTests passed.")
  }
}
