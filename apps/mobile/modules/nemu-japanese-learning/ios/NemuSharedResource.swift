import Foundation

/// A resource that must be released explicitly (the Ichiran analyzer).
protocol NemuDisposableResource: AnyObject, Sendable {
  func dispose() async
}

/// Thrown to users of an open that a `retire()` overtook.
struct NemuResourceRetiredError: Error {}

/// Owns one lazily opened, shared, disposable resource (see
/// `NemuIchiranService`). Actor methods are reentrant at every `await`, so
/// the lifecycle is explicit rather than implied by call order or timing:
/// - one open at a time: concurrent users share the in-flight open, so the
///   resource is never opened (and its memory held) twice;
/// - `use` holds the resource for the whole body, counted per resource; a
///   user only ever starts on the resource that is current at that moment
///   (a retire that lands between an open finishing and its users resuming
///   fails those users rather than handing them a retired resource);
/// - `retire` detaches the resource (new users open afresh) and returns only
///   once every use of it has ended and it is disposed, so no body sees it
///   disposed underneath it and the caller may then delete what backs it.
///   Uses of a newer resource never delay it;
/// - an open still in flight when `retire` runs is discarded: `retire` waits
///   for it to finish and be disposed (the opener may be reading what the
///   caller is about to delete), and its waiters get
///   `NemuResourceRetiredError`;
/// - a retire also waits for disposals started by earlier, overlapping
///   retires, so whenever any retire returns nothing retired is left open.
actor NemuSharedResource<Resource: NemuDisposableResource, Info: Sendable> {
  typealias Opened = (resource: Resource, info: Info)

  private let opener: @Sendable () async throws -> Opened
  private var current: Opened?
  private var opening: (id: Int, task: Task<Opened, Error>)?
  private var openSequence = 0
  /// Bumped by every retire; an open from an older generation is discarded.
  private var generation = 0
  /// Uses in progress, per resource.
  private var uses: [ObjectIdentifier: Int] = [:]
  /// Retires waiting for a resource's uses to end.
  private var idleWaiters: [ObjectIdentifier: [CheckedContinuation<Void, Never>]] = [:]
  /// Retired resources (and discarded opens) not yet known to be disposed.
  private var pending: [Int: Task<Void, Never>] = [:]
  private var pendingSequence = 0

  init(open: @escaping @Sendable () async throws -> Opened) {
    opener = open
  }

  func use<T: Sendable>(_ body: @Sendable (Resource, Info) async throws -> T) async throws -> T {
    let (resource, info) = try await open()
    // No suspension between `open` confirming `resource` is current and
    // counting this use, so a retire cannot slip in between.
    let id = ObjectIdentifier(resource)
    uses[id, default: 0] += 1
    defer { endUse(id) }
    return try await body(resource, info)
  }

  /// Detaches the open resource (and any open in flight); returns once every
  /// use of it has ended and everything retired so far is disposed.
  func retire() async {
    generation += 1
    if let opening {
      self.opening = nil
      let task = opening.task
      // The open disposes its own result once it sees the newer generation.
      track(Task { _ = try? await task.value })
    }
    if let current {
      self.current = nil
      let resource = current.resource
      track(Task {
        await self.untilIdle(resource)
        await resource.dispose()
      })
    }
    while let (id, task) = pending.first {
      await task.value
      pending[id] = nil
    }
  }

  private func track(_ task: Task<Void, Never>) {
    pendingSequence += 1
    pending[pendingSequence] = task
  }

  private func endUse(_ id: ObjectIdentifier) {
    let remaining = (uses[id] ?? 1) - 1
    guard remaining == 0 else {
      uses[id] = remaining
      return
    }
    uses[id] = nil
    idleWaiters.removeValue(forKey: id)?.forEach { $0.resume() }
  }

  private func untilIdle(_ resource: Resource) async {
    let id = ObjectIdentifier(resource)
    guard uses[id, default: 0] > 0 else { return }
    await withCheckedContinuation { idleWaiters[id, default: []].append($0) }
  }

  private func open() async throws -> Opened {
    if let current { return current }
    let task: Task<Opened, Error>
    if let opening {
      task = opening.task
    } else {
      openSequence += 1
      let id = openSequence
      let openedGeneration = generation
      let opener = opener
      // Inherits this actor's isolation: the bookkeeping below runs on it.
      task = Task { () async throws -> Opened in
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
    }
    let opened = try await task.value
    // A retire may have run between the open finishing and this resume.
    guard let current, current.resource === opened.resource else {
      throw NemuResourceRetiredError()
    }
    return current
  }
}
