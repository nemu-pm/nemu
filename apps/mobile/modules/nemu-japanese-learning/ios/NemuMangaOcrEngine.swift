import CoreGraphics
import Foundation

/// Bridge-facing glue for the manga-ocr page pipeline (`recognizePage`).
enum NemuMangaOcrEngine {
  static let engine = "manga-ocr-coreml"
  /// Detector used when the caller passes regions (Apple Vision lines
  /// grouped into bubbles by the TS layout).
  static let visionLayoutDetector = "vision-layout"

  /// The bundled detector when the build ships one, else the interim one.
  static var detectorIdentifier: String {
    NemuBundledTextDetector.shared?.identifier ?? visionLayoutDetector
  }

  /// Model + detector fingerprint; JS folds it into the OCR cache key.
  static var revision: String {
    "\(NemuMangaOcrModelStore.modelRevision)+\(detectorIdentifier)+\(NemuMangaOcrPipeline.revision)"
  }

  static func region(from value: [String: Any]) -> NemuOcrRegion? {
    guard let box = value["box"] as? [Double], box.count == 4, box.allSatisfy(\.isFinite),
      box[2] > box[0], box[3] > box[1]
    else { return nil }
    let label = (value["label"] as? String).flatMap { ["ja", "eng", "unknown"].contains($0) ? $0 : nil }
    return NemuOcrRegion(
      box: NemuTextOrder.Box(x1: box[0], y1: box[1], x2: box[2], y2: box[3]),
      label: label ?? "unknown",
      confidence: (value["conf"] as? Double) ?? 1,
      text: value["text"] as? String)
  }

  static func recognizePage(
    fileURL: URL,
    providedRegions: [NemuOcrRegion]?,
    options: NemuMangaOcrPipeline.Options,
    onBlock: @escaping (NemuMangaOcrPipeline.Block, Int) -> Void
  ) async throws -> [String: Any] {
    let started = DispatchTime.now()
    let detector: NemuTextDetector
    if let providedRegions {
      detector = NemuProvidedRegionsDetector(identifier: visionLayoutDetector, regions: providedRegions)
    } else if let bundled = NemuBundledTextDetector.shared {
      detector = bundled
    } else {
      throw NemuMangaOcrRecognizer.Failure(
        code: "E_OCR_DETECTOR_UNAVAILABLE",
        message: "This build has no text detector; pass Vision regions.")
    }
    let recognizer = try await NemuMangaOcrModelStore.shared.load()
    let modelLoadMs = await NemuMangaOcrModelStore.shared.lastLoadMs
    try Task.checkCancellation()
    let (source, orientation) = try NemuTextRecognizer.loadImage(at: fileURL)
    let image = try NemuTextRecognizer.upright(source, orientation)
    guard let page = NemuOcrPage(image: image) else {
      throw NemuMangaOcrRecognizer.Failure(code: "E_OCR_IMAGE", message: "The page image could not be read.")
    }
    try Task.checkCancellation()
    let (blocks, timings) = try NemuMangaOcrPipeline.run(
      page: page, detector: detector, recognizer: recognizer, options: options, onBlock: onBlock)
    return [
      "engine": engine,
      "engineRevision":
        "\(NemuMangaOcrModelStore.modelRevision)+\(detector.identifier)+\(NemuMangaOcrPipeline.revision)",
      "detector": detector.identifier,
      "osVersion": NemuTextRecognizer.osVersion,
      "computeUnits": recognizer.computeUnitsLabel,
      "width": Double(page.width),
      "height": Double(page.height),
      "modelLoadMs": modelLoadMs,
      "detectMs": timings.detectMs,
      "orderMs": timings.orderMs,
      "recognizeMs": (timings.recognizeMs * 10).rounded() / 10,
      "elapsedMs": NemuMangaOcrRecognizer.milliseconds(since: started),
      "blocks": blocks.map(\.dictionary),
    ]
  }
}

