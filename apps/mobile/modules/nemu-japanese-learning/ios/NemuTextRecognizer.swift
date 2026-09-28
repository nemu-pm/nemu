import CoreGraphics
import Foundation
import ImageIO
import Vision

/// On-device manga OCR with Apple Vision (`RecognizeTextRequest`, iOS 18+).
///
/// Returns recognized *lines* in the top-left pixel coordinate space of the
/// upright (EXIF-oriented) source image. Grouping into bubbles and manga
/// reading order happen in TypeScript (`mobileJapaneseLearningOcrLayout.ts`)
/// so the cloud and on-device engines share one tested implementation.
enum NemuTextRecognizer {
  static let engine = "apple-vision"

  struct Options {
    var languages: [String] = ["ja-JP", "en-US"]
    var usesLanguageCorrection = true
    var includeCharacterBoxes = true
    var minimumTextHeightFraction: Float?
    /// Bounds the bridge payload for pathological pages.
    var maxLines = 1_024
    var maxCharacterBoxesPerLine = 512
  }

  struct Failure: Error, LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
  }

  static var isSupported: Bool {
    if #available(iOS 18.0, *) {
      return !japaneseLanguages(RecognizeTextRequest().supportedRecognitionLanguages).isEmpty
    }
    return false
  }

  static var supportsTextDirection: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
  }

  static var engineRevision: String {
    if #available(iOS 18.0, *) {
      return "RecognizeTextRequest.\(RecognizeTextRequest().revision)"
    }
    return "unavailable"
  }

  static var osVersion: String {
    let version = ProcessInfo.processInfo.operatingSystemVersion
    return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
  }

  @available(iOS 18.0, *)
  private static func japaneseLanguages(_ languages: [Locale.Language]) -> [Locale.Language] {
    languages.filter { $0.languageCode?.identifier == "ja" }
  }

  static func loadImage(at url: URL) throws -> (CGImage, CGImagePropertyOrientation) {
    guard url.isFileURL else {
      throw Failure(code: "E_OCR_IMAGE", message: "OCR needs a local image file.")
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      CGImageSourceGetCount(source) > 0
    else {
      throw Failure(code: "E_OCR_IMAGE", message: "The page image could not be read.")
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawOrientation = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: rawOrientation) ?? .up
    let options = [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
    guard let image = CGImageSourceCreateImageAtIndex(source, 0, options) else {
      throw Failure(code: "E_OCR_IMAGE", message: "The page image could not be decoded.")
    }
    return (image, orientation)
  }

  /// Pixel size of the image after applying its EXIF orientation, i.e. the
  /// size React Native lays out and the coordinate space of every box here.
  static func orientedSize(_ image: CGImage, _ orientation: CGImagePropertyOrientation) -> CGSize {
    switch orientation {
    case .left, .leftMirrored, .right, .rightMirrored:
      return CGSize(width: image.height, height: image.width)
    default:
      return CGSize(width: image.width, height: image.height)
    }
  }

  @available(iOS 18.0, *)
  static func recognize(fileURL: URL, options: Options) async throws -> [String: Any] {
    let started = DispatchTime.now()
    let (image, orientation) = try loadImage(at: fileURL)
    try Task.checkCancellation()
    let size = orientedSize(image, orientation)
    guard size.width > 0, size.height > 0 else {
      throw Failure(code: "E_OCR_IMAGE", message: "The page image is empty.")
    }

    var request = RecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = options.usesLanguageCorrection
    request.automaticallyDetectsLanguage = false
    let supported = request.supportedRecognitionLanguages
    let requested = options.languages.map { Locale.Language(identifier: $0) }
    let languages = requested.filter { wanted in
      supported.contains { $0.languageCode == wanted.languageCode }
    }
    guard languages.contains(where: { $0.languageCode?.identifier == "ja" }) else {
      throw Failure(
        code: "E_OCR_UNSUPPORTED",
        message: "Japanese text recognition is not available on this device.")
    }
    request.recognitionLanguages = languages
    if let fraction = options.minimumTextHeightFraction, fraction > 0, fraction < 1 {
      request.minimumTextHeightFraction = fraction
    }

    let recognizeStarted = DispatchTime.now()
    let observations = try await request.perform(on: image, orientation: orientation)
    try Task.checkCancellation()
    let recognizeMs = milliseconds(since: recognizeStarted)

    var lines: [[String: Any]] = []
    lines.reserveCapacity(min(observations.count, options.maxLines))
    for observation in observations.prefix(options.maxLines) {
      guard let candidate = observation.topCandidates(1).first else { continue }
      let text = candidate.string
      if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
      let corners = [
        observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft,
      ].map { pixelPoint($0, size) }
      var line: [String: Any] = [
        "text": text,
        "confidence": Double(candidate.confidence),
        "box": box(of: corners),
        "quad": corners.flatMap { [round2($0.x), round2($0.y)] },
        "direction": direction(of: observation) ?? NSNull(),
      ]
      if options.includeCharacterBoxes {
        // Full text is kept above even when some characters cannot be placed;
        // their slots are null so indices stay aligned with the characters.
        var boxes: [Any] = []
        var index = text.startIndex
        var count = 0
        while index < text.endIndex, count < options.maxCharacterBoxesPerLine {
          let next = text.index(after: index)
          if let rect = candidate.boundingBox(for: index..<next) {
            let points = [rect.topLeft, rect.topRight, rect.bottomRight, rect.bottomLeft]
              .map { pixelPoint($0, size) }
            let value = box(of: points)
            boxes.append([value["x1"]!, value["y1"]!, value["x2"]!, value["y2"]!])
          } else {
            boxes.append(NSNull())
          }
          index = next
          count += 1
        }
        line["characterBoxes"] = boxes
      }
      lines.append(line)
    }

    return [
      "engine": engine,
      "engineRevision": engineRevision,
      "osVersion": osVersion,
      "width": Double(size.width),
      "height": Double(size.height),
      "orientation": Int(orientation.rawValue),
      "languages": languages.map { $0.maximalIdentifier },
      "textDirectionSupported": supportsTextDirection,
      "recognizeMs": recognizeMs,
      "elapsedMs": milliseconds(since: started),
      "lines": lines,
    ]
  }

  @available(iOS 18.0, *)
  private static func direction(of observation: RecognizedTextObservation) -> String? {
    if #available(iOS 26.0, *) {
      switch observation.textDirection {
      case .some(.topToBottom): return "topToBottom"
      case .some(.leftToRight): return "leftToRight"
      case .some(.rightToLeft): return "rightToLeft"
      default: return nil
      }
    }
    return nil
  }

  /// Vision points are normalized with a lower-left origin; Nemu's OCR
  /// contract is top-left pixels: x' = x·W, y' = (1 − y)·H.
  @available(iOS 18.0, *)
  private static func pixelPoint(_ point: NormalizedPoint, _ size: CGSize) -> CGPoint {
    CGPoint(
      x: min(max(point.x, 0), 1) * size.width,
      y: (1 - min(max(point.y, 0), 1)) * size.height)
  }

  private static func box(of points: [CGPoint]) -> [String: Double] {
    let xs = points.map(\.x)
    let ys = points.map(\.y)
    return [
      "x1": round2(xs.min() ?? 0),
      "y1": round2(ys.min() ?? 0),
      "x2": round2(xs.max() ?? 0),
      "y2": round2(ys.max() ?? 0),
    ]
  }

  private static func round2(_ value: CGFloat) -> Double {
    (Double(value) * 100).rounded() / 100
  }

  private static func milliseconds(since start: DispatchTime) -> Double {
    let nanos = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds
    return (Double(nanos) / 1_000_000 * 10).rounded() / 10
  }
}

/// Runs at most one job at a time (Vision's accurate model is memory heavy,
/// and the Ichiran kernel is single-owner) and lets JS cancel a queued or
/// running job by request id.
actor NemuSerialWorkQueue {
  private var tail: Task<Void, Never>?
  private var running: [String: @Sendable () -> Void] = [:]
  private var cancelledEarly: [String] = []

  func run<T: Sendable>(
    requestId: String,
    _ operation: @escaping @Sendable () async throws -> T
  ) async throws -> T {
    let previous = tail
    let work = Task<T, Error> {
      await previous?.value
      try Task.checkCancellation()
      return try await operation()
    }
    tail = Task { _ = await work.result }
    running[requestId] = { work.cancel() }
    if let index = cancelledEarly.firstIndex(of: requestId) {
      cancelledEarly.remove(at: index)
      work.cancel()
    }
    defer { running[requestId] = nil }
    return try await withTaskCancellationHandler {
      try await work.value
    } onCancel: {
      work.cancel()
    }
  }

  /// Returns true when a queued or running job was found.
  func cancel(requestId: String) -> Bool {
    if let cancel = running[requestId] {
      cancel()
      return true
    }
    // The cancel raced ahead of `run`; remember it briefly.
    cancelledEarly.append(requestId)
    if cancelledEarly.count > 64 { cancelledEarly.removeFirst() }
    return false
  }
}
