import CoreML
import Foundation

/// ogkalu RT-DETRv4-S: RGB/PIL bilinear 640² → sigmoid text queries → NMS.
/// The immutable URL is cheap to discover; model loading stays off the UI thread.
final class NemuMangaTextDetector: NemuTextDetector, @unchecked Sendable {
  let identifier = "ogkalu-v4s-fp16-t040-n050-c080-pad4-v1"
  var reportsDetectionConfidence: Bool { true }
  private let url: URL
  private let lock = NSLock()
  private var model: MLModel?

  init(url: URL) { self.url = url }

  /// Drops the cached model; a detection in flight keeps its own reference,
  /// so this never waits for it (it runs on the model store's actor).
  func unload() {
    lock.lock()
    defer { lock.unlock() }
    model = nil
  }

  /// The lock guards only the cached reference: detections are already
  /// serialised by the module's recognition queue, and holding it through
  /// load + prediction made a memory-warning `unload` block a cooperative
  /// thread for the rest of the detection.
  private func loadedModel() throws -> MLModel {
    lock.lock()
    defer { lock.unlock() }
    if let model { return model }
    let configuration = MLModelConfiguration()
    #if targetEnvironment(simulator)
      configuration.computeUnits = .cpuOnly
    #else
      configuration.computeUnits = .all
    #endif
    do {
      let loaded = try MLModel(contentsOf: url, configuration: configuration)
      model = loaded
      return loaded
    } catch {
      throw NemuMangaOcrRecognizer.Failure(
        code: "E_OCR_MODEL_LOAD", message: "The text detector could not be loaded: \(error)")
    }
  }

  func detect(_ page: NemuOcrPage) throws -> [NemuOcrRegion] {
    try Task.checkCancellation()
    let model = try loadedModel()
    let input = try Self.input(page)
    let output = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["images": input]))
    guard let logits = output.featureValue(for: "logits")?.multiArrayValue,
      let boxes = output.featureValue(for: "boxes")?.multiArrayValue,
      logits.shape.map(\.intValue) == [1, 300, 3], boxes.shape.map(\.intValue) == [1, 300, 4]
    else {
      throw NemuMangaOcrRecognizer.Failure(code: "E_OCR_MODEL_OUTPUT", message: "Invalid text detector outputs.")
    }
    try Task.checkCancellation()
    return Self.regions(
      logits: (0..<logits.count).map { logits[$0].doubleValue },
      boxes: (0..<boxes.count).map { boxes[$0].doubleValue },
      width: page.width, height: page.height)
  }

  static func input(_ page: NemuOcrPage) throws -> MLMultiArray {
    let size = 640
    let input = try MLMultiArray(shape: [1, 3, NSNumber(value: size), NSNumber(value: size)], dataType: .float32)
    let target = input.dataPointer.bindMemory(to: Float.self, capacity: 3 * size * size)
    for channel in 0..<3 {
      try Task.checkCancellation()
      let plane = NemuGrayImage(width: page.width, height: page.height,
        pixels: (0..<(page.width * page.height)).map { page.rgba[$0 * 4 + channel] })
        .resizedBilinear(width: size, height: size)
      for index in plane.pixels.indices { target[channel * size * size + index] = Float(plane.pixels[index]) / 255 }
    }
    return input
  }

  /// Class 0 is the enclosing speech bubble, never a recognition crop.
  /// Stable score order matters for overlapping queries with equal scores.
  static func regions(logits: [Double], boxes: [Double], width: Int, height: Int) -> [NemuOcrRegion] {
    guard logits.count % 3 == 0, boxes.count == logits.count / 3 * 4 else { return [] }
    var candidates: [(index: Int, region: NemuOcrRegion)] = []
    for query in 0..<(logits.count / 3) {
      let logit = max(logits[query * 3 + 1], logits[query * 3 + 2])
      let score = 1 / (1 + exp(-logit))
      let b = Array(boxes[(query * 4)..<(query * 4 + 4)])
      guard score.isFinite, score >= 0.4, b.allSatisfy(\.isFinite) else { continue }
      let box = NemuTextOrder.Box(
        x1: max(0, (b[0] - b[2] / 2) * Double(width)),
        y1: max(0, (b[1] - b[3] / 2) * Double(height)),
        x2: min(Double(width), (b[0] + b[2] / 2) * Double(width)),
        y2: min(Double(height), (b[1] + b[3] / 2) * Double(height)))
      guard box.x2 - box.x1 >= 4, box.y2 - box.y1 >= 4 else { continue }
      candidates.append((query, NemuOcrRegion(box: box, label: "unknown", confidence: score)))
    }
    candidates.sort { $0.region.confidence == $1.region.confidence ? $0.index < $1.index : $0.region.confidence > $1.region.confidence }
    var kept: [NemuOcrRegion] = []
    for candidate in candidates {
      let box = candidate.region.box
      let area = (box.x2 - box.x1) * (box.y2 - box.y1)
      if kept.contains(where: {
        let intersection = max(0, min(box.x2, $0.box.x2) - max(box.x1, $0.box.x1))
          * max(0, min(box.y2, $0.box.y2) - max(box.y1, $0.box.y1))
        return NemuMangaOcrPipeline.iou(box, $0.box) > 0.5 || intersection / area >= 0.8
      }) { continue }
      kept.append(candidate.region)
    }
    return kept.map { region in
      var result = region
      let b = region.box
      // Match the Python reference's round-to-even crop bounds, before rounding the display box.
      result.cropBox = .init(
        x1: max(0, b.x1 - 4).rounded(.toNearestOrEven),
        y1: max(0, b.y1 - 4).rounded(.toNearestOrEven),
        x2: min(Double(width), b.x2 + 4).rounded(.toNearestOrEven),
        y2: min(Double(height), b.y2 + 4).rounded(.toNearestOrEven))
      result.box = .init(x1: b.x1.rounded(.toNearestOrEven), y1: b.y1.rounded(.toNearestOrEven),
        x2: b.x2.rounded(.toNearestOrEven), y2: b.y2.rounded(.toNearestOrEven))
      return result
    }
  }
}

enum NemuBundledTextDetector {
  static let shared: NemuMangaTextDetector? = {
    guard let directory = NemuMangaOcrModelStore.modelsDirectory else { return nil }
    let url = directory.appendingPathComponent("MangaTextDetector.mlmodelc")
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return NemuMangaTextDetector(url: url)
  }()
}
