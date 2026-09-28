import Foundation

#if NEMU_ICHIRAN_KERNEL
  import IchiranKernel
#endif

/// On-device Japanese analysis with TigerHix/ichiran-node's Rust kernel.
///
/// Compiled against the vendored kernel only when `scripts/vendor-ichiran.sh`
/// has produced `ios/Vendor/` (the podspec then defines NEMU_ICHIRAN_KERNEL);
/// otherwise every entry point reports the analyzer as unavailable and the
/// app keeps its cloud path.
///
/// The analyzer returns Ichiran's *detailed legacy* JSON — the exact
/// `segments` array `ichiran-cli -f` and the cloud `/api/segment` endpoint
/// produce, which the existing mobile/web converters already consume. The
/// kernel qualifies this serialization byte-for-byte against current Lisp
/// Ichiran; it is exposed by IchiranSwift as an internal (same-module) hook,
/// which is why the sources are compiled into this pod rather than linked as
/// a separate Swift module.
enum NemuIchiranEngine {
  struct Failure: Error, LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
  }

  static var kernelLinked: Bool {
    #if NEMU_ICHIRAN_KERNEL
      return true
    #else
      return false
    #endif
  }

  static var abiVersion: Int {
    #if NEMU_ICHIRAN_KERNEL
      return Int(ichiran_kernel_abi_version())
    #else
      return 0
    #endif
  }

  /// Application Support/nemu/ichiran — not user data, never backed up.
  static func packDirectory() throws -> URL {
    let support = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    var directory = support.appendingPathComponent("nemu", isDirectory: true)
      .appendingPathComponent("ichiran", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? directory.setResourceValues(values)
    return directory
  }

  static func directoryBytes(_ directory: URL) -> Int64 {
    guard
      let enumerator = FileManager.default.enumerator(
        at: directory, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])
    else { return 0 }
    var total: Int64 = 0
    for case let url as URL in enumerator {
      let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
      if values?.isRegularFile == true { total += Int64(values?.fileSize ?? 0) }
    }
    return total
  }
}

#if NEMU_ICHIRAN_KERNEL
  /// Single owner of the pack store and the opened analyzer.
  actor NemuIchiranService {
    static let shared = NemuIchiranService()

    private var analyzer: IchiranAnalyzer?
    private var analyzerManifest: String?
    private var installing = false

    private func store() throws -> IchiranPackStore {
      IchiranPackStore(baseDirectory: try NemuIchiranEngine.packDirectory())
    }

    func status() async -> [String: Any] {
      var result: [String: Any] = [
        "kernelLinked": true,
        "abiVersion": NemuIchiranEngine.abiVersion,
        "installing": installing,
        "installed": false,
      ]
      do {
        let directory = try NemuIchiranEngine.packDirectory()
        let pack = try await IchiranPackStore(baseDirectory: directory).installedPack()
        result["installed"] = true
        result["packVersion"] = pack.packVersion
        result["sourceCommit"] = pack.sourceCommit
        result["manifestSha256"] = pack.manifestSHA256
        result["installedBytes"] = NemuIchiranEngine.directoryBytes(directory)
      } catch {
        result["reason"] = error.localizedDescription
      }
      return result
    }

    /// Installs the pinned release: the manifest is fetched and checked
    /// against the app's pin before any pack byte is downloaded; IchiranPackStore
    /// then verifies every compressed and installed byte count and SHA-256,
    /// stages, test-opens and atomically publishes the generation.
    func install(
      manifestURL: URL,
      expectedManifestSha256: String,
      progress: @escaping @Sendable (String, Int64, Int64) -> Void
    ) async throws -> [String: Any] {
      guard !installing else {
        throw NemuIchiranEngine.Failure(
          code: "E_PACK_BUSY", message: "The dictionary pack is already being installed.")
      }
      installing = true
      defer { installing = false }
      guard manifestURL.scheme == "https" else {
        throw NemuIchiranEngine.Failure(
          code: "E_PACK_MANIFEST", message: "The dictionary manifest must use HTTPS.")
      }

      let (data, response) = try await URLSession.shared.data(from: manifestURL)
      guard (response as? HTTPURLResponse)?.statusCode == 200, data.count <= 64 * 1024 else {
        throw NemuIchiranEngine.Failure(
          code: "E_PACK_MANIFEST", message: "The dictionary manifest could not be downloaded.")
      }
      let declared =
        ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["manifestSha256"]
        as? String
      guard declared == expectedManifestSha256 else {
        throw NemuIchiranEngine.Failure(
          code: "E_PACK_PIN",
          message: "The dictionary manifest does not match the version this app expects.")
      }
      try Task.checkCancellation()

      // IchiranPackStore reports bytes only while it hashes an asset that has
      // already been downloaded, so the network transfer itself (the slow
      // part) is observed on a dedicated session and reported as
      // "downloading" too; the JS side keeps the byte count monotonic.
      let observer = NemuPackDownloadObserver(
        totalBytes: NemuPackDownloadObserver.downloadBytes(manifest: data)
      ) { completed, total in
        progress("downloading", completed, total)
      }
      let session = URLSession(configuration: .default, delegate: observer, delegateQueue: nil)
      defer {
        observer.invalidate()
        session.finishTasksAndInvalidate()
      }
      let store = IchiranPackStore(
        baseDirectory: try NemuIchiranEngine.packDirectory(), session: session)
      let pack = try await store.install(from: .remote(manifestURL)) { update in
        progress(update.phase.rawValue, update.completedBytes, update.totalBytes)
      }
      guard pack.manifestSHA256 == expectedManifestSha256 else {
        throw NemuIchiranEngine.Failure(
          code: "E_PACK_PIN", message: "The installed dictionary does not match the pinned version.")
      }
      await analyzer?.dispose()
      analyzer = nil
      analyzerManifest = nil
      // Re-apply after install created new generation directories.
      _ = try NemuIchiranEngine.packDirectory()
      installing = false
      return await status()
    }

    func remove() async throws {
      await analyzer?.dispose()
      analyzer = nil
      analyzerManifest = nil
      let directory = try NemuIchiranEngine.packDirectory()
      try FileManager.default.removeItem(at: directory)
    }

    private func openAnalyzer() async throws -> (IchiranAnalyzer, String) {
      if let analyzer, let analyzerManifest { return (analyzer, analyzerManifest) }
      let store = try store()
      let pack: IchiranInstalledPack
      do {
        pack = try await store.installedPack()
      } catch {
        throw NemuIchiranEngine.Failure(
          code: "E_PACK_NOT_INSTALLED", message: "The Japanese dictionary is not installed.")
      }
      let opened = try await IchiranAnalyzer.open(pack)
      analyzer = opened
      analyzerManifest = pack.packVersion
      return (opened, pack.packVersion)
    }

    struct WireOptions: Encodable {
      let limit: Int
      let entities: [IchiranEntityHint]
      let normalizePunctuation: Bool
    }

    /// Detailed legacy (ichiran `-f` / cloud `/api/segment`) segments JSON.
    func analyze(
      text: String,
      limit: Int,
      entities: [IchiranEntityHint]
    ) async throws -> [String: Any] {
      let started = DispatchTime.now()
      let (analyzer, packVersion) = try await openAnalyzer()
      let openedMs = Double(DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1e6
      let units = Array(text.utf16)
      guard units.count <= 4_096 else {
        throw NemuIchiranEngine.Failure(
          code: "E_ANALYZE_INPUT", message: "Text is too long for one on-device analysis.")
      }
      // Punctuation is kept verbatim (full-width 「！」 stays 「！」), matching
      // the cloud endpoint's segments.
      let options = try JSONEncoder().encode(
        WireOptions(
          limit: max(1, min(10, limit)), entities: entities, normalizePunctuation: false))
      let data = try await analyzer.qualificationLegacyJSON(
        utf16Units: units, optionsJSON: options)
      try Task.checkCancellation()
      guard let json = String(data: data, encoding: .utf8) else {
        throw NemuIchiranEngine.Failure(
          code: "E_ANALYZE_OUTPUT", message: "The analyzer returned invalid text.")
      }
      let elapsed = Double(DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1e6
      return [
        "segmentsJson": json,
        "packVersion": packVersion,
        "engine": "ichiran-rust",
        "abiVersion": NemuIchiranEngine.abiVersion,
        "openMs": (openedMs * 10).rounded() / 10,
        "elapsedMs": (elapsed * 10).rounded() / 10,
      ]
    }

    func romanize(text: String) async throws -> String {
      let (analyzer, _) = try await openAnalyzer()
      return try await analyzer.romanize(text)
    }
  }

  /// Reports the pack assets' network transfer (summed across the hot and
  /// details downloads) from each task's KVO-observable byte counter.
  final class NemuPackDownloadObserver: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var observations: [NSKeyValueObservation] = []
    private var received: [Int: Int64] = [:]
    private var lastReported: Int64 = 0
    private let totalBytes: Int64
    private let report: @Sendable (Int64, Int64) -> Void

    init(totalBytes: Int64, report: @escaping @Sendable (Int64, Int64) -> Void) {
      self.totalBytes = totalBytes
      self.report = report
    }

    /// hot + details download bytes from the (already pin-checked) manifest.
    static func downloadBytes(manifest data: Data) -> Int64 {
      guard let manifest = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      else { return 0 }
      return ["hot", "details"].reduce(Int64(0)) { sum, key in
        let asset = manifest[key] as? [String: Any]
        return sum + Int64((asset?["downloadBytes"] as? NSNumber)?.int64Value ?? 0)
      }
    }

    func urlSession(_ session: URLSession, didCreateTask task: URLSessionTask) {
      // The store fetches manifest.json on this session too; only assets count.
      guard task.originalRequest?.url?.lastPathComponent != "manifest.json" else { return }
      let observation = task.observe(\.countOfBytesReceived, options: [.new]) {
        [weak self] task, _ in
        self?.update(task: task.taskIdentifier, bytes: task.countOfBytesReceived)
      }
      lock.lock()
      observations.append(observation)
      lock.unlock()
    }

    private func update(task: Int, bytes: Int64) {
      guard totalBytes > 0 else { return }
      lock.lock()
      received[task] = bytes
      let completed = min(received.values.reduce(0, +), totalBytes)
      // ~256 KB steps keep the bridge quiet on fast networks.
      let due = completed - lastReported >= 262_144 || completed == totalBytes
      if due { lastReported = completed }
      lock.unlock()
      if due { report(completed, totalBytes) }
    }

    func invalidate() {
      lock.lock()
      observations.forEach { $0.invalidate() }
      observations.removeAll()
      lock.unlock()
    }
  }
#endif
