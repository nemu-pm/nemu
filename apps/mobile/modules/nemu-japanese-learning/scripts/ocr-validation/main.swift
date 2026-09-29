// Compile with the pod's NemuManga*.swift, NemuTextOrder.swift and NemuTextRecognizer.swift.
// `validate test` checks postprocessing without models.
// `validate <modelsDir> <pagesDir> <out.json>` runs the real pipeline (no supplied boxes).
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
if args.count == 2 && args[1] == "test" {
  // Highest-scoring box survives an overlapping query and a contained sub-box.
  let logits: [Double] = [0, 5, -5, 0, 4, -5, 0, 3, -5, 10, -5, -5, 0, -5, 2]
  let boxes: [Double] = [0.5,0.5,0.4,0.4, 0.51,0.5,0.4,0.4, 0.5,0.5,0.1,0.1,
    0.8,0.8,0.2,0.2, 0.1,0.1,0.1,0.1]
  let regions = NemuMangaTextDetector.regions(logits: logits, boxes: boxes, width: 100, height: 200)
  precondition(regions.count == 2)
  precondition(regions[0].box.x1 == 30 && regions[0].box.y2 == 140)
  precondition(regions[0].cropBox!.x1 == 26 && regions[0].cropBox!.y2 == 144)
  precondition(regions[1].box.x1 == 5)
  precondition(NemuMangaTextDetector.regions(logits: [0, 0, 0], boxes: [.nan, 0, 1, 1], width: 100, height: 100).isEmpty)
  precondition(NemuMangaOcrPipeline.isLatinNoise("Ｇｏｍｕｒａｗ．ｃｏｍ"))
  precondition(!NemuMangaOcrPipeline.isLatinNoise("高等部一年Ａ組八尋寧々です！"))
  precondition(!NemuMangaOcrPipeline.isLatinNoise("！？"))
  precondition(NemuMangaOcrPipeline.normalizeForDisplay("はい．．．") == "はい…")
  print("OCR native postprocessing tests passed")
} else {
  precondition(args.count == 4, "validate <modelsDir> <pagesDir> <out.json>")
  let directory = URL(fileURLWithPath: args[1])
  let recognizer = try NemuMangaOcrRecognizer(directory: directory)
  let detector = NemuMangaTextDetector(url: directory.appendingPathComponent("MangaTextDetector.mlmodelc"))
  let pagesDir = URL(fileURLWithPath: args[2])
  var pages: [[String: Any]] = []
  for name in try FileManager.default.contentsOfDirectory(atPath: pagesDir.path).filter({ $0.hasSuffix(".png") }).sorted() {
    let (source, orientation) = try NemuTextRecognizer.loadImage(at: pagesDir.appendingPathComponent(name))
    let image = try NemuTextRecognizer.upright(source, orientation)
    let page = NemuOcrPage(image: image)!
    let started = DispatchTime.now()
    let (blocks, timing) = try NemuMangaOcrPipeline.run(page: page, detector: detector, recognizer: recognizer)
    let elapsed = NemuMangaOcrRecognizer.milliseconds(since: started)
    pages.append(["file": name, "detections": blocks.map(\.dictionary), "wallMs": elapsed,
      "detectMs": timing.detectMs, "orderMs": timing.orderMs, "recognizeMs": timing.recognizeMs])
    print(name, blocks.count, Int(elapsed), "ms")
  }
  let result: [String: Any] = ["system": "app-swift-ogkalu-mangaocr", "computeUnits": recognizer.computeUnitsLabel,
    "detector": detector.identifier, "pages": pages]
  try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    .write(to: URL(fileURLWithPath: args[3]))
}
