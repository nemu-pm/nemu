import Foundation

// Standalone executable:
//   xcrun swiftc -parse-as-library ios/NemuSharedResource.swift iosTest/NemuSharedResourceTests.swift -o /tmp/t && /tmp/t
// Deterministic: every ordering the assertions depend on is forced with
// latches, never with sleeps, so a slow or differently scheduled runner
// cannot change the outcome.

/// A one-shot gate: `wait()` suspends until `open()`.
actor Latch {
  private var isOpen = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    if isOpen { return }
    await withCheckedContinuation { waiters.append($0) }
  }

  func open() {
    isOpen = true
    let resumed = waiters
    waiters.removeAll()
    resumed.forEach { $0.resume() }
  }
}

final class EventLog: @unchecked Sendable {
  private let lock = NSLock()
  private var entries: [String] = []
  var all: [String] { lock.withLock { entries } }
  func add(_ event: String) { lock.withLock { entries.append(event) } }
  func index(_ event: String) -> Int {
    guard let index = all.firstIndex(of: event) else { preconditionFailure("\(event) never happened: \(all)") }
    return index
  }
}

final class FakeAnalyzer: NemuDisposableResource, @unchecked Sendable {
  let name: String
  private let log: EventLog
  private let lock = NSLock()
  private var disposedFlag = false
  private var busy = 0
  var disposed: Bool { lock.withLock { disposedFlag } }

  init(name: String, log: EventLog) {
    self.name = name
    self.log = log
  }

  func dispose() async {
    lock.withLock {
      precondition(busy == 0, "disposed while an analysis was using it")
      precondition(!disposedFlag, "disposed twice")
      disposedFlag = true
    }
    log.add("dispose \(name)")
  }

  /// Holds the analyzer until `gate` opens (immediately without one).
  func analyze(until gate: Latch? = nil) async -> String {
    lock.withLock {
      precondition(!disposedFlag, "used after dispose")
      busy += 1
    }
    await gate?.wait()
    await Task.yield()
    lock.withLock {
      precondition(!disposedFlag, "disposed mid-analysis")
      busy -= 1
    }
    return name
  }
}

final class Opens: @unchecked Sendable {
  let log = EventLog()
  private let lock = NSLock()
  private var made: [FakeAnalyzer] = []
  var all: [FakeAnalyzer] { lock.withLock { made } }
  func make() -> FakeAnalyzer {
    lock.withLock {
      let analyzer = FakeAnalyzer(name: "a\(made.count + 1)", log: log)
      made.append(analyzer)
      return analyzer
    }
  }
}

/// `openStarted` opens once the opener runs; the opener then waits for
/// `openRelease` (when given) before producing the analyzer.
func makeShared(
  _ opens: Opens, openStarted: Latch? = nil, openRelease: Latch? = nil
) -> NemuSharedResource<FakeAnalyzer, String> {
  NemuSharedResource {
    await openStarted?.open()
    await openRelease?.wait()
    return (opens.make(), "v1")
  }
}

/// Lets every runnable task make progress. Only used before asserting that
/// something has NOT happened yet, which correct code guarantees however
/// the tasks are scheduled.
func settle() async {
  for _ in 0..<200 { await Task.yield() }
}

func runSuite() async throws {
  // Concurrent first users (analyze + romanize) share one open.
  do {
    let opens = Opens()
    let openStarted = Latch()
    let openRelease = Latch()
    let shared = makeShared(opens, openStarted: openStarted, openRelease: openRelease)
    let users = (0..<3).map { _ in
      Task { try await shared.use { analyzer, _ in await analyzer.analyze() } }
    }
    await openStarted.wait()
    await settle()
    await openRelease.open()
    for user in users { _ = try await user.value }
    precondition(opens.all.count == 1, "opened \(opens.all.count) analyzers")
  }

  // Retire (pack removal) during an analysis waits for it, then disposes;
  // uses of the next analyzer do not hold the retire up.
  do {
    let opens = Opens()
    let log = opens.log
    let shared = makeShared(opens)
    let analysisStarted = Latch()
    let analysisRelease = Latch()
    let analysis = Task {
      try await shared.use { analyzer, _ in
        await analysisStarted.open()
        let name = await analyzer.analyze(until: analysisRelease)
        log.add("analysis end")
        return name
      }
    }
    await analysisStarted.wait()
    let retire = Task {
      await shared.retire()
      log.add("retired")
    }
    await settle()
    precondition(!log.all.contains("retired"), "retire did not wait for the analysis: \(log.all)")
    precondition(!opens.all[0].disposed, "analyzer disposed during an analysis")

    // A use that starts now opens the next analyzer and holds it.
    let nextStarted = Latch()
    let nextRelease = Latch()
    let next = Task {
      try await shared.use { analyzer, _ in
        await nextStarted.open()
        return await analyzer.analyze(until: analyzer.name == "a1" ? nil : nextRelease)
      }
    }
    await nextStarted.wait()

    await analysisRelease.open()
    await retire.value
    let analyzed = try await analysis.value
    precondition(analyzed == "a1")
    precondition(
      log.index("analysis end") < log.index("dispose a1") && log.index("dispose a1") < log.index("retired"),
      "retire order: \(log.all)")
    precondition(opens.all[0].disposed, "retired analyzer not disposed")
    await nextRelease.open()
    let nextName = try await next.value
    precondition(nextName == "a2" || nextName == "a1", "unexpected analyzer \(nextName)")
    // The next use reuses the fresh analyzer.
    let reused = try await shared.use { analyzer, _ in await analyzer.analyze() }
    precondition(reused == "a2")
    precondition(opens.all.count == 2 && !opens.all[1].disposed)
  }

  // Overlapping retires both wait for the retired analyzer's disposal.
  do {
    let opens = Opens()
    let log = opens.log
    let shared = makeShared(opens)
    let analysisStarted = Latch()
    let analysisRelease = Latch()
    let analysis = Task {
      try await shared.use { analyzer, _ in
        await analysisStarted.open()
        return await analyzer.analyze(until: analysisRelease)
      }
    }
    await analysisStarted.wait()
    let first = Task { await shared.retire(); log.add("retired 1") }
    let second = Task { await shared.retire(); log.add("retired 2") }
    await settle()
    precondition(!log.all.contains("retired 1") && !log.all.contains("retired 2"), "\(log.all)")
    await analysisRelease.open()
    await first.value
    await second.value
    _ = try await analysis.value
    precondition(
      log.index("dispose a1") < log.index("retired 1") && log.index("dispose a1") < log.index("retired 2"),
      "overlapping retire returned early: \(log.all)")
  }

  // A retire during an open waits for the open and disposes it before
  // returning (the opener may read the files the caller is about to delete).
  do {
    let opens = Opens()
    let log = opens.log
    let openStarted = Latch()
    let openRelease = Latch()
    let shared = makeShared(opens, openStarted: openStarted, openRelease: openRelease)
    let user = Task { try await shared.use { analyzer, _ in await analyzer.analyze() } }
    await openStarted.wait()
    let retire = Task { await shared.retire(); log.add("retired") }
    await settle()
    precondition(!log.all.contains("retired"), "retire did not wait for the open: \(log.all)")
    await openRelease.open()
    await retire.value
    precondition(opens.all.count == 1 && opens.all[0].disposed, "stale open not disposed by retire")
    do {
      _ = try await user.value
      // Only if the open completed before the retire ran; it was still
      // disposed only after this use ended.
    } catch is NemuResourceRetiredError {}
    // The next use opens afresh.
    let fresh = try await shared.use { analyzer, _ in await analyzer.analyze() }
    precondition(fresh == "a2")
  }

  // Retire with nothing open or in use returns immediately.
  do {
    let shared = makeShared(Opens())
    await shared.retire()
  }
}

@main
enum NemuSharedResourceTests {
  static func main() async throws {
    let iterations = Int(ProcessInfo.processInfo.environment["NEMU_TEST_ITERATIONS"] ?? "") ?? 25
    for _ in 0..<iterations { try await runSuite() }
    print("NemuSharedResourceTests passed (\(iterations) iterations).")
  }
}
