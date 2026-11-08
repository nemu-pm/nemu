import CoreGraphics
import CoreImage
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

  /// The accurate Japanese request every pass shares.
  @available(iOS 18.0, *)
  private static func makeRequest(_ options: Options) throws -> (
    RecognizeTextRequest, [Locale.Language]
  ) {
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
    return (request, languages)
  }

  /// Bridge dictionaries for Vision observations; `map` takes a normalized
  /// Vision point to top-left page pixels.
  @available(iOS 18.0, *)
  private static func lineDictionaries(
    _ observations: [RecognizedTextObservation],
    options: Options,
    map: (NormalizedPoint) -> CGPoint
  ) -> [[String: Any]] {
    var lines: [[String: Any]] = []
    lines.reserveCapacity(min(observations.count, options.maxLines))
    for observation in observations.prefix(options.maxLines) {
      guard let candidate = observation.topCandidates(1).first else { continue }
      let text = candidate.string
      if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
      let corners = [
        observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft,
      ].map(map)
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
            let points = [rect.topLeft, rect.topRight, rect.bottomRight, rect.bottomLeft].map(map)
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
    return lines
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
    let (request, languages) = try makeRequest(options)

    let recognizeStarted = DispatchTime.now()
    let observations = try await request.perform(on: image, orientation: orientation)
    try Task.checkCancellation()
    let recognizeMs = milliseconds(since: recognizeStarted)
    let lines = lineDictionaries(observations, options: options) { pixelPoint($0, size) }

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

  /// Longest side a region crop is scaled up to before recognition. Manga
  /// dialogue on a ~900 px scan is ~20 px per glyph, below what the accurate
  /// model reads reliably; a crop scaled 2–4× reads it far better.
  static let regionTargetLongSide: CGFloat = 1_024
  static let regionMaxScale: CGFloat = 4
  static let maxRegions = 64
  static let regionConcurrency = 3

  /// Second pass: re-recognizes each text region (top-left page pixels) on
  /// its own padded crop, scaled up, with a white surround. Lines come back
  /// in page pixels, one list per region, in the order given.
  @available(iOS 18.0, *)
  static func recognizeRegions(
    fileURL: URL, regions: [CGRect], options: Options
  ) async throws -> [String: Any] {
    let started = DispatchTime.now()
    let (source, orientation) = try loadImage(at: fileURL)
    try Task.checkCancellation()
    let image = try upright(source, orientation)
    let size = CGSize(width: image.width, height: image.height)
    guard size.width > 0, size.height > 0 else {
      throw Failure(code: "E_OCR_IMAGE", message: "The page image is empty.")
    }
    let (request, _) = try makeRequest(options)
    // Crops are independent: read a few at once (Vision's accurate model is
    // heavy, so the fan-out stays small).
    let crops = regions.prefix(maxRegions).map { regionCrop(image, region: $0) }
    var slots = [[RecognizedTextObservation]](repeating: [], count: crops.count)
    var recognizeMs = 0.0
    try await withThrowingTaskGroup(of: (Int, [RecognizedTextObservation], Double).self) {
      group in
      var next = 0
      func enqueue() {
        while next < crops.count {
          let index = next
          next += 1
          guard let crop = crops[index] else { continue }
          group.addTask {
            try Task.checkCancellation()
            let started = DispatchTime.now()
            let observations = try await request.perform(on: crop.image)
            return (index, observations, milliseconds(since: started))
          }
          return
        }
      }
      for _ in 0..<min(regionConcurrency, crops.count) { enqueue() }
      while let (index, observations, elapsed) = try await group.next() {
        slots[index] = observations
        recognizeMs += elapsed
        enqueue()
      }
    }
    let results: [[String: Any]] = zip(crops, slots).map { crop, observations in
      guard let crop else { return ["lines": [[String: Any]](), "scale": 1.0] }
      let cropSize = CGSize(width: crop.image.width, height: crop.image.height)
      let lines = lineDictionaries(observations, options: options) { point in
        let local = pixelPoint(point, cropSize)
        return CGPoint(
          x: crop.origin.x + local.x / crop.scale, y: crop.origin.y + local.y / crop.scale)
      }
      return ["lines": lines, "scale": Double(crop.scale)]
    }
    return [
      "engine": engine,
      "engineRevision": engineRevision,
      "osVersion": osVersion,
      "width": Double(size.width),
      "height": Double(size.height),
      "recognizeMs": (recognizeMs * 10).rounded() / 10,
      "elapsedMs": milliseconds(since: started),
      "regions": results,
    ]
  }

  /// The image with its EXIF orientation applied, so region pixels match
  /// the oriented page space every box uses.
  static func upright(_ image: CGImage, _ orientation: CGImagePropertyOrientation) throws -> CGImage {
    if orientation == .up { return image }
    let oriented = CIImage(cgImage: image).oriented(orientation)
    guard let result = CIContext().createCGImage(oriented, from: oriented.extent) else {
      throw Failure(code: "E_OCR_IMAGE", message: "The page image could not be oriented.")
    }
    return result
  }

  struct RegionCrop: @unchecked Sendable {
    let image: CGImage
    /// Top-left page pixel of the crop.
    let origin: CGPoint
    let scale: CGFloat
  }

  /// Pads the region (bubble text sits close to its outline), clamps it to
  /// the page, and scales it up on a white canvas with a margin so glyphs
  /// never touch the edge.
  static func regionCrop(_ image: CGImage, region: CGRect) -> RegionCrop? {
    let page = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    let pad = max(6, 0.12 * min(region.width, region.height))
    let padded = region.insetBy(dx: -pad, dy: -pad).intersection(page).integral
    guard padded.width >= 4, padded.height >= 4, let cropped = image.cropping(to: padded) else {
      return nil
    }
    let scale = min(
      regionMaxScale, max(1, regionTargetLongSide / max(padded.width, padded.height)))
    let margin: CGFloat = 16
    let width = Int((padded.width * scale + 2 * margin).rounded())
    let height = Int((padded.height * scale + 2 * margin).rounded())
    guard
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.interpolationQuality = .high
    context.draw(
      cropped,
      in: CGRect(x: margin, y: margin, width: padded.width * scale, height: padded.height * scale))
    guard let scaled = context.makeImage() else { return nil }
    // Page point = origin + canvas point / scale; fold the margin into origin.
    return RegionCrop(
      image: scaled,
      origin: CGPoint(x: padded.minX - margin / scale, y: padded.minY - margin / scale),
      scale: scale)
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
