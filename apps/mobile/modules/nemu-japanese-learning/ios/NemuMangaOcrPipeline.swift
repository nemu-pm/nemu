import CoreGraphics
import Foundation

/// One text region a detector found, in top-left page pixels.
struct NemuOcrRegion: Sendable {
  var box: NemuTextOrder.Box
  /// "ja" | "eng" | "unknown" (cloud label contract).
  var label: String
  var confidence: Double
  /// Text the detector already read (Vision), used for non-Japanese
  /// regions that manga-ocr must not re-read.
  var text: String?
  /// Detector-specific padded crop, separate from the reported text bounds.
  var cropBox: NemuTextOrder.Box?
}

/// A decoded page: the two luma planes the pipeline needs, in the upright
/// (EXIF-oriented) pixel space every box uses.
struct NemuOcrPage: Sendable {
  let width: Int
  let height: Int
  let rgba: [UInt8]
  /// PIL `convert("L")`: manga-ocr crops.
  let pilGray: NemuGrayImage
  /// OpenCV `BGR2GRAY`: reading order.
  let openCVGray: NemuGrayImage

  init?(image: CGImage) {
    guard let rgba = NemuGrayImage.rgba(of: image) else { return nil }
    self.rgba = rgba
    width = image.width
    height = image.height
    pilGray = NemuGrayImage.pilGray(rgba: rgba, width: width, height: height)
    openCVGray = NemuGrayImage.openCVGray(rgba: rgba, width: width, height: height)
  }
}

/// The detector slot. Implementations return unordered regions; the
/// pipeline dedupes, orders (`NemuTextOrder`) and reads them.
protocol NemuTextDetector: Sendable {
  /// Reported to JS as `ocr.pipeline.detector` and folded into the engine
  /// revision (and so into the OCR result cache key).
  var identifier: String { get }
  /// Whether `NemuOcrRegion.confidence` is a detection score worth keeping
  /// (a block's confidence is then min(detection, recognition)); otherwise
  /// the block reports manga-ocr's recognition confidence alone.
  var reportsDetectionConfidence: Bool { get }
  func detect(_ page: NemuOcrPage) throws -> [NemuOcrRegion]
}

/// Interim detector: regions computed by the caller from Apple Vision's
/// line observations (`recognizeImage` + the TS bubble layout in
/// `mobileJapaneseLearningOcrLayout.ts`), so the pipeline ships before a
/// bundled detector model exists and without any extra licence.
struct NemuProvidedRegionsDetector: NemuTextDetector {
  let identifier: String
  let regions: [NemuOcrRegion]
  /// Vision's confidence is about its own reading, not the region.
  var reportsDetectionConfidence: Bool { false }

  func detect(_ page: NemuOcrPage) throws -> [NemuOcrRegion] { regions }
}

/// Runs detector → dedupe → reading order → manga-ocr, bubble by bubble.
enum NemuMangaOcrPipeline {
  struct Options: Sendable {
    /// Extra pixels around each detector box before cropping. The cloud
    /// crops CTD boxes as-is; on the Vision-layout boxes 0 also scored best
    /// (benchmark `scripts/app-parity/pad_experiment.py`).
    var cropPadding = 0.0
    /// Near-duplicate boxes (CTD emits them) would read the same bubble twice.
    var dedupeIoU = 0.6
    var maxRegions = 64
    var maxTokens = NemuMangaOcrRecognizer.maxTokens
  }

  struct Block: Sendable {
    var order: Int
    var box: NemuTextOrder.Box
    var label: String
    var confidence: Double
    var text: String
    /// manga-ocr `post_process` output before the display normalisation.
    var rawText: String
    /// "manga-ocr" or "detector" (non-Japanese region kept as detected).
    var source: String
    var tokens: Int
    var milliseconds: Double

    var dictionary: [String: Any] {
      [
        "order": order,
        "x1": box.x1, "y1": box.y1, "x2": box.x2, "y2": box.y2,
        "label": label,
        "conf": confidence,
        "text": text,
        "rawText": rawText,
        "source": source,
        "tokens": tokens,
        "ms": milliseconds,
      ]
    }
  }

  struct Timings: Sendable {
    var detectMs = 0.0
    var orderMs = 0.0
    var recognizeMs = 0.0
  }

  static func iou(_ a: NemuTextOrder.Box, _ b: NemuTextOrder.Box) -> Double {
    let ix = max(0, min(a.x2, b.x2) - max(a.x1, b.x1))
    let iy = max(0, min(a.y2, b.y2) - max(a.y1, b.y1))
    let intersection = ix * iy
    let union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection
    return union > 0 ? intersection / union : 0
  }

  /// Clamps boxes to the page and drops empty ones and later near-duplicates
  /// (IoU above the threshold with an earlier, kept region).
  static func cleanRegions(
    _ regions: [NemuOcrRegion], width: Int, height: Int, options: Options
  ) -> [NemuOcrRegion] {
    var kept: [NemuOcrRegion] = []
    for var region in regions {
      region.box.x1 = max(0, min(Double(width), region.box.x1))
      region.box.y1 = max(0, min(Double(height), region.box.y1))
      region.box.x2 = max(0, min(Double(width), region.box.x2))
      region.box.y2 = max(0, min(Double(height), region.box.y2))
      guard region.box.x2 - region.box.x1 >= 2, region.box.y2 - region.box.y1 >= 2 else { continue }
      if kept.contains(where: { iou($0.box, region.box) > options.dedupeIoU }) { continue }
      kept.append(region)
      if kept.count >= options.maxRegions { break }
    }
    return kept
  }

  /// manga-ocr writes ellipses as full-width dot runs (`…` → `...` → `．．．`);
  /// the transcript, TTS and the analyzer read `…` better. Everything else
  /// of `post_process` (full-width ASCII, no spaces) is kept.
  static func normalizeForDisplay(_ text: String) -> String {
    var out = ""
    var dots = 0
    func flush() {
      if dots >= 2 {
        out += String(repeating: "…", count: max(1, Int((Double(dots) / 3).rounded())))
      } else if dots == 1 {
        out += "．"
      }
      dots = 0
    }
    for character in text {
      if character == "．" {
        dots += 1
      } else {
        flush()
        out.append(character)
      }
    }
    flush()
    return out
  }

  /// The chosen detector has no language class. Suppress Latin watermarks
  /// after recognition, matching the benchmark; keep mixed Japanese text.
  static func isLatinNoise(_ text: String) -> Bool {
    let chars = text.precomposedStringWithCompatibilityMapping.unicodeScalars.filter {
      !CharacterSet.whitespacesAndNewlines.contains($0)
    }
    let letters = chars.filter { (65...90).contains($0.value) || (97...122).contains($0.value) }.count
    let digits = chars.filter { (48...57).contains($0.value) }.count
    return letters >= 3 && (letters + digits) * 2 >= chars.count
  }

  static func run(
    page: NemuOcrPage,
    detector: NemuTextDetector,
    recognizer: NemuMangaOcrRecognizer,
    options: Options = Options(),
    onBlock: ((Block, Int) -> Void)? = nil
  ) throws -> (blocks: [Block], timings: Timings) {
    var timings = Timings()
    let detectStarted = DispatchTime.now()
    let regions = cleanRegions(
      try detector.detect(page), width: page.width, height: page.height, options: options)
    timings.detectMs = NemuMangaOcrRecognizer.milliseconds(since: detectStarted)
    try Task.checkCancellation()

    let orderStarted = DispatchTime.now()
    let order =
      regions.count > 1
      ? NemuTextOrder.order(boxes: regions.map(\.box), gray: page.openCVGray)
      : Array(regions.indices)
    timings.orderMs = NemuMangaOcrRecognizer.milliseconds(since: orderStarted)

    var blocks: [Block] = []
    blocks.reserveCapacity(order.count)
    for index in order {
      try Task.checkCancellation()
      let region = regions[index]
      let started = DispatchTime.now()
      var block = Block(
        order: blocks.count, box: region.box, label: region.label,
        confidence: region.confidence, text: "", rawText: "", source: "detector", tokens: 0,
        milliseconds: 0)
      if region.label == "eng" {
        guard let text = region.text, !text.isEmpty else { continue }
        block.text = text
        block.rawText = text
      } else {
        let pad = options.cropPadding
        let cropBox = region.cropBox ?? region.box
        guard
          let crop = page.pilGray.cropped(
            x1: Int((cropBox.x1 - pad).rounded(.down)),
            y1: Int((cropBox.y1 - pad).rounded(.down)),
            x2: Int((cropBox.x2 + pad).rounded(.up)),
            y2: Int((cropBox.y2 + pad).rounded(.up)))
        else { continue }
        let output = try recognizer.recognize(crop, maxTokens: options.maxTokens)
        timings.recognizeMs += output.encodeMs + output.decodeMs
        guard !output.text.isEmpty, !isLatinNoise(output.text) else { continue }
        block.rawText = output.text
        block.text = normalizeForDisplay(output.text)
        block.source = "manga-ocr"
        block.tokens = output.tokens
        let recognition = (output.confidence * 1000).rounded() / 1000
        block.confidence =
          detector.reportsDetectionConfidence ? min(region.confidence, recognition) : recognition
      }
      block.milliseconds = NemuMangaOcrRecognizer.milliseconds(since: started)
      blocks.append(block)
      onBlock?(block, order.count)
    }
    return (blocks, timings)
  }
}

/// Loads the bundled manga-ocr models once and keeps them while the app
/// runs; memory warnings drop them (the next page reloads, ~0.3–1 s).
actor NemuMangaOcrModelStore {
  static let shared = NemuMangaOcrModelStore()
  static let bundleName = "NemuMangaOcr"

  private var recognizer: NemuMangaOcrRecognizer?
  private(set) var lastLoadMs = 0.0

  /// The directory holding the compiled models, when the build bundled them.
  static var modelsDirectory: URL? {
    let candidates = [
      Bundle.main.url(forResource: bundleName, withExtension: "bundle"),
      Bundle(for: NemuMangaOcrBundleToken.self).url(forResource: bundleName, withExtension: "bundle"),
    ]
    for case let url? in candidates where NemuMangaOcrRecognizer.hasModels(in: url) {
      return url
    }
    return nil
  }

  static var modelsBundled: Bool { modelsDirectory != nil }

  /// Short fingerprint of the bundled models (manifest written by
  /// `scripts/fetch-ocr-models.ts`), part of the OCR cache key.
  static var modelRevision: String {
    guard let directory = modelsDirectory,
      let data = try? Data(contentsOf: directory.appendingPathComponent("manifest.json")),
      let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let revision = manifest["revision"] as? String
    else { return "manga-ocr-int8" }
    return revision
  }

  func load() throws -> NemuMangaOcrRecognizer {
    if let recognizer { return recognizer }
    guard let directory = Self.modelsDirectory else {
      throw NemuMangaOcrRecognizer.Failure(
        code: "E_OCR_MODELS_MISSING", message: "This build does not bundle the manga OCR models.")
    }
    let started = DispatchTime.now()
    let loaded = try NemuMangaOcrRecognizer(directory: directory)
    lastLoadMs = NemuMangaOcrRecognizer.milliseconds(since: started)
    recognizer = loaded
    return loaded
  }

  func unload() {
    recognizer = nil
    NemuBundledTextDetector.shared?.unload()
  }
}

/// Anchors `Bundle(for:)` to this pod's binary.
final class NemuMangaOcrBundleToken {}
