// Compile with the pod's NemuManga*.swift, NemuTextOrder.swift and NemuTextRecognizer.swift.
// `validate test` checks postprocessing without models.
// `validate <modelsDir> <pagesDir> <out.json>` runs the real pipeline (no supplied boxes).
// `validate crops <modelsDir> <pagesDirs> <index.json> <out.json>` runs recognition on given crops.
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
// Benchmark ablations: NEMU_OCR_TILE_MIN_ASPECT, NEMU_OCR_MAX_REPEAT_RUN and
// NEMU_OCR_DUPLICATE_COVER override the pipeline defaults (0 disables each).
var pipelineOptions = NemuMangaOcrPipeline.Options()
let environment = ProcessInfo.processInfo.environment
if let value = environment["NEMU_OCR_TILE_MIN_ASPECT"].flatMap(Double.init) { pipelineOptions.tileMinAspect = value }
if let value = environment["NEMU_OCR_MAX_REPEAT_RUN"].flatMap(Int.init) { pipelineOptions.maxRepeatRun = value }
if let value = environment["NEMU_OCR_DUPLICATE_COVER"].flatMap(Double.init) { pipelineOptions.duplicateCover = value }
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
} else if args.count >= 6 && args[1] == "crops" {
  // `validate crops <modelsDir> <pagesDir[:pagesDir...]> <index.json> <out.json>`: the recogniser alone
  // (with the pipeline's tiling) on a shared crop index ([{"id","page","crop":[x1,y1,x2,y2]}]).
  let recognizer = try NemuMangaOcrRecognizer(directory: URL(fileURLWithPath: args[2]))
  let pageDirs = args[3].split(separator: ":").map { URL(fileURLWithPath: String($0)) }
  let index = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[4]))) as! [[String: Any]]
  var cache: (name: String, page: NemuOcrPage)?
  var crops: [[String: Any]] = []
  for item in index {
    let name = item["page"] as! String
    if cache?.name != name {
      let url = pageDirs.map { $0.appendingPathComponent(name) }.first { FileManager.default.fileExists(atPath: $0.path) }!
      let (source, orientation) = try NemuTextRecognizer.loadImage(at: url)
      cache = (name, NemuOcrPage(image: try NemuTextRecognizer.upright(source, orientation))!)
    }
    let box = (item["crop"] as! [NSNumber]).map(\.intValue)
    let crop = cache!.page.pilGray.cropped(x1: box[0], y1: box[1], x2: box[2], y2: box[3])!
    let started = DispatchTime.now()
    let output = try NemuMangaOcrPipeline.recognize(crop, recognizer: recognizer, options: pipelineOptions)
    var row = item
    row["text"] = output.text
    row["display"] = NemuMangaOcrPipeline.normalizeForDisplay(output.text)
    row["confidence"] = output.confidence
    row["tokens"] = output.tokens
    row["pieces"] = output.pieces
    row["ms"] = NemuMangaOcrRecognizer.milliseconds(since: started)
    crops.append(row)
  }
  try JSONSerialization.data(withJSONObject: ["system": "app-swift-crops", "crops": crops], options: [.prettyPrinted, .sortedKeys])
    .write(to: URL(fileURLWithPath: args[5]))
  print("crops", crops.count)
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
    let (blocks, timing) = try NemuMangaOcrPipeline.run(
      page: page, detector: detector, recognizer: recognizer, options: pipelineOptions)
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
