import Foundation

// Standalone executable (no models needed):
//   xcrun swiftc -parse-as-library ios/NemuManga*.swift ios/NemuTextOrder.swift \
//     ios/NemuTextRecognizer.swift iosTest/NemuMangaOcrPostprocessTests.swift -o /tmp/t && /tmp/t
// Covers the recognition post-processing added after the v3 OCR benchmark:
// long-crop tiling, the repetition guard and the contained-duplicate drop.

private var failures = 0

private func check(
  _ condition: @autoclosure () -> Bool, _ message: @autoclosure () -> String,
  line: Int = #line
) {
  if !condition() {
    failures += 1
    print("FAIL line \(line): \(message())")
  }
}

/// White page with black rectangles (x1, y1, x2, y2).
private func canvas(width: Int, height: Int, ink: [(Int, Int, Int, Int)], inverted: Bool = false)
  -> NemuGrayImage
{
  let paper: UInt8 = inverted ? 20 : 250
  let text: UInt8 = inverted ? 240 : 10
  var pixels = [UInt8](repeating: paper, count: width * height)
  for (x1, y1, x2, y2) in ink {
    for y in max(0, y1)..<min(height, y2) {
      for x in max(0, x1)..<min(width, x2) { pixels[y * width + x] = text }
    }
  }
  return NemuGrayImage(width: width, height: height, pixels: pixels)
}

private typealias Piece = NemuMangaOcrTiling.Piece

/// A glyph-like hollow square (4 px strokes), so ink stays a minority as on a real page.
private func glyph(_ x1: Int, _ y1: Int, _ x2: Int, _ y2: Int) -> [(Int, Int, Int, Int)] {
  [(x1, y1, x2, y1 + 4), (x1, y2 - 4, x2, y2), (x1, y1, x1 + 4, y2), (x2 - 4, y1, x2, y2)]
}

private func inkRows(_ image: NemuGrayImage, _ row: Int) -> Int {
  let mask = NemuMangaOcrTiling.inkMask(image)
  return (0..<image.width).filter { mask[row * image.width + $0] }.count
}

private func block(
  _ order: Int, _ box: (Double, Double, Double, Double), _ text: String
) -> NemuMangaOcrPipeline.Block {
  NemuMangaOcrPipeline.Block(
    order: order, box: NemuTextOrder.Box(x1: box.0, y1: box.1, x2: box.2, y2: box.3),
    label: "unknown", confidence: 0.9, text: text, rawText: text, source: "manga-ocr",
    tokens: text.count + 2, milliseconds: 1)
}

@main
struct NemuMangaOcrPostprocessTests {
  static func main() {
    tilingLeavesOrdinaryCropsWhole()
    tilingCutsASingleVerticalColumnAtBlankRows()
    tilingReadsColumnsRightToLeft()
    tilingCutsAHorizontalLineLeftToRight()
    tilingHandlesLightTextOnDarkBoxes()
    tilingMergesFuriganaIntoItsColumn()
    tilingHelpers()
    repetitionGuard()
    substringDistance()
    containedDuplicates()
    displayNormalisationAcrossPieces()
    if failures > 0 {
      print("\(failures) OCR post-processing assertion(s) failed")
      exit(1)
    }
    print("OCR post-processing tests passed")
  }

  static func tilingLeavesOrdinaryCropsWhole() {
    // Speech bubbles (aspect < 8) are never split, whatever they contain.
    for (width, height) in [(100, 150), (150, 100), (40, 300), (300, 40), (3, 200)] {
      let image = canvas(width: width, height: height, ink: [(1, 1, width - 1, height - 1)])
      check(
        NemuMangaOcrTiling.pieces(image) == [Piece(x1: 0, y1: 0, x2: width, y2: height)],
        "\(width)x\(height) should stay whole")
    }
    // A strip with no ink at all has nothing to split.
    let blank = canvas(width: 40, height: 480, ink: [])
    check(NemuMangaOcrTiling.pieces(blank).count == 1, "blank strip stays whole")
    // minAspect 0 disables tiling.
    let strip = canvas(width: 40, height: 480, ink: (0..<12).flatMap { glyph(5, 5 + 40 * $0, 35, 35 + 40 * $0) })
    check(NemuMangaOcrTiling.pieces(strip, minAspect: 0).count == 1, "minAspect 0 disables tiling")
  }

  static func tilingCutsASingleVerticalColumnAtBlankRows() {
    // 12 glyphs of 30 px in a 40 × 480 column (aspect 12): two pieces of ~6 × 40.
    let glyphs = (0..<12).flatMap { glyph(5, 5 + 40 * $0, 35, 35 + 40 * $0) }
    let image = canvas(width: 40, height: 480, ink: glyphs)
    let pieces = NemuMangaOcrTiling.pieces(image)
    check(pieces.count == 2, "expected 2 pieces, got \(pieces)")
    guard pieces.count == 2 else { return }
    check(pieces[0].y1 == 0 && pieces[1].y2 == 480, "pieces cover the strip: \(pieces)")
    check(pieces[0].y2 == pieces[1].y1, "pieces are contiguous: \(pieces)")
    check(pieces.allSatisfy { $0.x1 == 0 && $0.x2 == 40 }, "pieces keep the full width: \(pieces)")
    check(inkRows(image, pieces[0].y2) == 0, "cut row \(pieces[0].y2) must be blank")
    check(abs(pieces[0].y2 - 240) <= 72, "cut near the middle: \(pieces[0].y2)")
  }

  static func tilingReadsColumnsRightToLeft() {
    // Two 30 px columns 30 px apart, 900 px tall (aspect 10).
    var ink: [(Int, Int, Int, Int)] = []
    for index in 0..<22 {
      ink += glyph(0, 5 + 40 * index, 30, 35 + 40 * index)
      ink += glyph(60, 5 + 40 * index, 90, 35 + 40 * index)
    }
    let image = canvas(width: 90, height: 900, ink: ink)
    let pieces = NemuMangaOcrTiling.pieces(image)
    check(pieces.count >= 4, "each column is cut: \(pieces)")
    guard let first = pieces.first, let last = pieces.last else { return }
    check(first.x1 >= 45 && first.x2 == 90 && first.y1 == 0, "right column first: \(first)")
    check(last.x1 == 0 && last.x2 <= 45 && last.y2 == 900, "left column last: \(last)")
    let right = pieces.filter { $0.x2 == 90 }
    check(right.map(\.y1) == right.map(\.y1).sorted(), "top to bottom within a column: \(right)")
  }

  static func tilingCutsAHorizontalLineLeftToRight() {
    let glyphs = (0..<14).flatMap { glyph(5 + 36 * $0, 5, 35 + 36 * $0, 35) }
    let image = canvas(width: 504, height: 40, ink: glyphs)
    let pieces = NemuMangaOcrTiling.pieces(image)
    check(pieces.count == 3, "504 × 40 → 3 pieces: \(pieces)")
    check(pieces.map(\.x1) == pieces.map(\.x1).sorted(), "left to right: \(pieces)")
    check(pieces.allSatisfy { $0.y1 == 0 && $0.y2 == 40 }, "full line height: \(pieces)")
    check(pieces.first?.x1 == 0 && pieces.last?.x2 == 504, "cover the line: \(pieces)")
  }

  static func tilingHandlesLightTextOnDarkBoxes() {
    let glyphs = (0..<12).flatMap { glyph(5, 5 + 40 * $0, 35, 35 + 40 * $0) }
    let dark = NemuMangaOcrTiling.pieces(canvas(width: 40, height: 480, ink: glyphs))
    let light = NemuMangaOcrTiling.pieces(canvas(width: 40, height: 480, ink: glyphs, inverted: true))
    check(dark == light, "same cuts for inverted lettering: \(dark) vs \(light)")
  }

  static func tilingMergesFuriganaIntoItsColumn() {
    // A 30 px column with a 10 px ruby column 3 px to its right: one column, not two.
    var ink = (0..<12).flatMap { glyph(10, 5 + 40 * $0, 40, 35 + 40 * $0) }
    ink += (0..<4).map { (43, 50 + 100 * $0, 53, 70 + 100 * $0) }
    let image = canvas(width: 60, height: 480, ink: ink)
    let pieces = NemuMangaOcrTiling.pieces(image)
    check(pieces.allSatisfy { $0.x1 == 0 && $0.x2 == 60 }, "ruby stays with its column: \(pieces)")
  }

  static func tilingHelpers() {
    let twoLevel = canvas(width: 10, height: 10, ink: [(0, 0, 3, 10)])
    let threshold = NemuMangaOcrTiling.otsuThreshold(twoLevel)
    check(threshold >= 10 && threshold < 250, "Otsu between the levels: \(threshold)")
    // Equal-ink candidates: the one closest to the ideal cut, then the earlier.
    let cuts = NemuMangaOcrTiling.cutsAlong(
      [5, 5, 5, 5, 0, 5, 0, 5, 5, 5], length: 10, short: 1, target: 5)
    check(cuts == [0, 4, 10], "tie → earlier of two equidistant blanks: \(cuts)")
    let widened = NemuMangaOcrTiling.widen([(2, 5), (8, 10)], length: 12)
    check(widened.elementsEqual([(0, 7), (6, 12)], by: { $0 == $1 }), "widen grows into the gap: \(widened)")
  }

  static func repetitionGuard() {
    let cls = NemuMangaOcrRecognizer.clsTokenId
    let limit = NemuMangaOcrRecognizer.maxRepeatRun
    check(limit == 12, "benchmark-tuned run limit is 12")
    let run = [cls, 100] + [Int32](repeating: 7, count: limit)
    check(NemuMangaOcrRecognizer.repetitionCut(run) == nil, "a run of exactly \(limit) is allowed")
    let over = run + [7]
    check(NemuMangaOcrRecognizer.repetitionCut(over) == over.count - 1, "run \(limit + 1) is cut to \(limit)")
    check(NemuMangaOcrRecognizer.repetitionCut([cls] + [Int32](repeating: 9, count: limit)) == nil, "[CLS] is not part of a run")
    // Legitimate text: six dots (……), repeated words.
    let dots = [cls] + [Int32](repeating: 5, count: 6) + [300, 301]
    check(NemuMangaOcrRecognizer.repetitionCut(dots) == nil, "…… is kept")
    let words = [cls] + [Int32]([40, 41, 42, 40, 41, 42, 40, 41, 42, 40, 41, 42, 40, 41])
    check(NemuMangaOcrRecognizer.repetitionCut(words) == nil, "only single-token runs are guarded")
    check(NemuMangaOcrRecognizer.repetitionCut(over, maxRun: 0) == nil, "maxRun 0 disables the guard")
  }

  static func substringDistance() {
    func distance(_ pattern: String, _ text: String) -> Int {
      NemuMangaOcrPipeline.substringDistance(Array(pattern.unicodeScalars), Array(text.unicodeScalars))
    }
    check(distance("人生", "この先の人生のほうが") == 0, "exact substring")
    check(distance("鍛錬を含む", "この銀錬を含む高度な") == 1, "one substitution")
    check(distance("", "abc") == 0, "empty pattern")
    check(distance("abc", "") == 3, "empty text")
    check(distance("xyz", "abc") == 3, "no overlap")
  }

  static func containedDuplicates() {
    let full = "魔王を倒したからといって終わりじゃない。この先の人生のほうが長いんだ。"
    let blocks = [
      block(0, (0, 0, 100, 200), full),
      block(1, (10, 100, 60, 190), "この先の人生のほうが長いんだ。"),
      block(2, (200, 0, 260, 120), "次の吹き出し"),
    ]
    let kept = NemuMangaOcrPipeline.dropContainedDuplicates(blocks, cover: 0.9, maxDistance: 0.25)
    check(kept.map(\.text) == [full, "次の吹き出し"], "contained re-read dropped: \(kept.map(\.text))")
    check(kept.map(\.order) == [0, 1], "orders renumbered: \(kept.map(\.order))")
    // The same small box with different text is a separate block (e.g. a sign in a panel box).
    let different = [blocks[0], block(1, (10, 100, 60, 190), "ガシャン")]
    check(
      NemuMangaOcrPipeline.dropContainedDuplicates(different, cover: 0.9, maxDistance: 0.25).count == 2,
      "nested box with different text kept")
    // Same text in boxes that only overlap a little (two bubbles saying the same thing).
    let twins = [block(0, (0, 0, 100, 100), "はい"), block(1, (95, 0, 195, 100), "はい")]
    check(
      NemuMangaOcrPipeline.dropContainedDuplicates(twins, cover: 0.9, maxDistance: 0.25).count == 2,
      "repeated line in separate bubbles kept")
    // Identical boxes and text: the later one goes.
    let same = [block(0, (0, 0, 50, 50), "えっ"), block(1, (0, 0, 50, 50), "えっ")]
    let dedupedSame = NemuMangaOcrPipeline.dropContainedDuplicates(same, cover: 0.9, maxDistance: 0.25)
    check(dedupedSame.count == 1 && dedupedSame[0].order == 0, "identical duplicate → first kept")
    // A near-miss reading inside the big box (one character in five differs) still counts.
    let fuzzy = [block(0, (0, 0, 100, 200), "この銀錬を含む高度な技術"), block(1, (5, 5, 50, 100), "この鍛錬を含む")]
    check(
      NemuMangaOcrPipeline.dropContainedDuplicates(fuzzy, cover: 0.9, maxDistance: 0.25).count == 1,
      "fuzzy re-read dropped")
    check(
      NemuMangaOcrPipeline.dropContainedDuplicates(blocks, cover: 0, maxDistance: 0.25).count == 3,
      "cover 0 disables the drop")
  }

  static func displayNormalisationAcrossPieces() {
    // Pieces are joined before the display step, so a dot run split by a cut still becomes one ellipsis.
    check(NemuMangaOcrPipeline.normalizeForDisplay("はい．" + "．．") == "はい…", "joined dot runs")
  }
}
