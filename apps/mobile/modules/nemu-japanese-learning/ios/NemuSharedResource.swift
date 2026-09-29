import Foundation

/// A resource that must be released explicitly (the Ichiran analyzer).
protocol NemuDisposableResource: AnyObject, Sendable {
  func dispose() async
}

/// Thrown to users of an open that a `retire()` overtook.
struct NemuResourceRetiredError: Error {}

/// Owns one lazily opened, shared, disposable resource (see
/// `NemuIchiranService`). Actor methods are reentrant at every `await`, so
/// the lifecycle is explicit rather than implied by call order:
/// - one open at a time: concurrent users share the in-flight open, so the
///   resource is never opened (and its memory held) twice;
/// - `use` holds the resource for the whole body; `retire` detaches it (new
///   users open afresh) and returns only once every use has ended and the
///   retired resource is disposed, so no body sees it disposed underneath it
///   and the caller may then delete what backs it;
/// - an open still in flight when `retire` runs is discarded (disposed) and
///   its waiters get `NemuResourceRetiredError`.
actor NemuSharedResource<Resource: NemuDisposableResource, Info: Sendable> {
  typealias Opened = (resource: Resource, info: Info)

  private let opener: @Sendable () async throws -> Opened
  private var current: Opened?
  private var opening: (id: Int, task: Task<Opened, Error>)?
  private var openSequence = 0
  /// Bumped by every retire; an open from an older generation is discarded.
  private var generation = 0
  private var activeUses = 0
  private var retired: [Resource] = []
  private var drainWaiters: [CheckedContinuation<Void, Never>] = []

  init(open: @escaping @Sendable () async throws -> Opened) {
    opener = open
  }

  func use<T: Sendable>(_ body: @Sendable (Resource, Info) async throws -> T) async throws -> T {
    let (resource, info) = try await open()
    activeUses += 1
    let result: Result<T, Error>
    do {
      result = .success(try await body(resource, info))
    } catch {
      result = .failure(error)
    }
    activeUses -= 1
    if activeUses == 0 { await drained() }
    return try result.get()
  }

  /// Detaches the open resource (and any open in flight); returns once every
  /// use has ended and the detached resource is disposed.
  func retire() async {
    generation += 1
    opening = nil
    if let current { retired.append(current.resource) }
    current = nil
    if activeUses > 0 {
      await withCheckedContinuation { drainWaiters.append($0) }
    } else {
      await drained()
    }
  }

  private func drained() async {
    while !retired.isEmpty {
      let disposing = retired
      retired.removeAll()
      for resource in disposing { await resource.dispose() }
    }
    // A use may have started while disposing; its own end drains again.
    guard activeUses == 0 else { return }
    let waiters = drainWaiters
    drainWaiters.removeAll()
    waiters.forEach { $0.resume() }
  }

  private func open() async throws -> Opened {
    if let current { return current }
    if let opening { return try await opening.task.value }
    openSequence += 1
    let id = openSequence
    let openedGeneration = generation
    let opener = opener
    // Inherits this actor's isolation: the bookkeeping below runs on it.
    let task = Task { () async throws -> Opened in
      defer { if self.opening?.id == id { self.opening = nil } }
      let opened = try await opener()
      guard openedGeneration == self.generation else {
        await opened.resource.dispose()
        throw NemuResourceRetiredError()
      }
      self.current = opened
      return opened
    }
    opening = (id, task)
    return try await task.value
  }
}
