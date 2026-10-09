import Foundation

/// Splits extreme-aspect crops into pieces manga-ocr can read.
///
/// manga-ocr squashes every crop to 224×224, so a long single-line strip
/// (a 40×640 vertical caption, a 515×49 horizontal blurb) arrives with its
/// glyphs crushed and comes back as fluent but unrelated Japanese. Crops
/// whose long side is at least `minAspect` × the short side are cut into
/// columns (vertical) or lines (horizontal) at blank gaps, and each column or
/// line into pieces about `targetAspect` × its width, cut at the emptiest
/// row/column near each ideal cut. Pieces are read in reading order
/// (columns right to left, lines top to bottom) and their texts joined.
///
/// Every crop below `minAspect` is returned whole, so ordinary bubbles are
/// untouched. Benchmark (`artifacts/mobile-review-20260926/ocr-benchmark/v3-opt`,
/// 451 text blocks): aspect ≥ 8 loose CER 62.7% → 32.3% on GT boxes; lower
/// thresholds and horizontal line splitting of ordinary bubbles made other
/// slices worse and were rejected. Reference: `v3-opt/scripts/tile.py`.
enum NemuMangaOcrTiling {
  /// A piece of a crop, in crop pixels (x2/y2 exclusive).
  struct Piece: Equatable, Sendable {
    var x1: Int
    var y1: Int
    var x2: Int
    var y2: Int
  }

  static let defaultMinAspect = 8.0
  static let defaultTargetAspect = 6.0

  /// Reading-order pieces of `image`, or one piece covering it when it is
  /// not long enough (or `minAspect` ≤ 0) to be split.
  static func pieces(
    _ image: NemuGrayImage, minAspect: Double = defaultMinAspect,
    targetAspect: Double = defaultTargetAspect
  ) -> [Piece] {
    let height = image.height
    let width = image.width
    let full = [Piece(x1: 0, y1: 0, x2: width, y2: height)]
    guard minAspect > 0, targetAspect > 0, min(width, height) >= 4,
      Double(max(width, height)) / Double(min(width, height)) >= minAspect
    else { return full }
    let mask = inkMask(image)
    var out: [Piece] = []
    if height > width {
      let columns = widen(bands(mask, width: width, height: height, alongRows: false), length: width)
      for (x1, x2) in columns.reversed() {
        let w = x2 - x1
        let cuts =
          Double(height) / Double(max(w, 1)) >= minAspect
          ? cutsAlong(
            profile(mask, width: width, height: height, alongRows: true, from: x1, to: x2),
            length: height, short: w, target: targetAspect)
          : [0, height]
        for index in 0..<(cuts.count - 1) {
          out.append(Piece(x1: x1, y1: cuts[index], x2: x2, y2: cuts[index + 1]))
        }
      }
    } else {
      let lines = widen(bands(mask, width: width, height: height, alongRows: true), length: height)
      for (y1, y2) in lines {
        let h = y2 - y1
        let cuts =
          Double(width) / Double(max(h, 1)) >= minAspect
          ? cutsAlong(
            profile(mask, width: width, height: height, alongRows: false, from: y1, to: y2),
            length: width, short: h, target: targetAspect)
          : [0, width]
        for index in 0..<(cuts.count - 1) {
          out.append(Piece(x1: cuts[index], y1: y1, x2: cuts[index + 1], y2: y2))
        }
      }
    }
    return out.count > 1 ? out : full
  }

  /// Otsu's threshold (the largest between-class variance; first maximum wins).
  static func otsuThreshold(_ image: NemuGrayImage) -> Int {
    var histogram = [Double](repeating: 0, count: 256)
    for value in image.pixels { histogram[Int(value)] += 1 }
    let total = Double(image.pixels.count)
    var sumAll = 0.0
    for level in 0..<256 { sumAll += Double(level) * histogram[level] }
    var weightBackground = 0.0
    var sumBackground = 0.0
    var best = 0.0
    var threshold = 127
    for level in 0..<256 {
      weightBackground += histogram[level]
      if weightBackground == 0 { continue }
      let weightForeground = total - weightBackground
      if weightForeground == 0 { break }
      sumBackground += Double(level) * histogram[level]
      let meanBackground = sumBackground / weightBackground
      let meanForeground = (sumAll - sumBackground) / weightForeground
      let variance =
        weightBackground * weightForeground * (meanBackground - meanForeground)
        * (meanBackground - meanForeground)
      if variance > best {
        best = variance
        threshold = level
      }
    }
    return threshold
  }

  /// Text pixels: the minority side of an Otsu split (dark ink on light
  /// paper, or light lettering on a dark caption box).
  static func inkMask(_ image: NemuGrayImage) -> [Bool] {
    let threshold = UInt8(otsuThreshold(image))
    var dark = image.pixels.map { $0 <= threshold }
    let darkCount = dark.reduce(0) { $0 + ($1 ? 1 : 0) }
    if Double(darkCount) / Double(max(1, dark.count)) > 0.5 {
      for index in dark.indices { dark[index].toggle() }
    }
    return dark
  }

  /// Ink per row (`alongRows`, restricted to columns `from..<to`) or per
  /// column (restricted to rows `from..<to`).
  static func profile(
    _ mask: [Bool], width: Int, height: Int, alongRows: Bool, from: Int, to: Int
  ) -> [Int] {
    if alongRows {
      return (0..<height).map { row in
        var count = 0
        for column in from..<to where mask[row * width + column] { count += 1 }
        return count
      }
    }
    return (0..<width).map { column in
      var count = 0
      for row in from..<to where mask[row * width + column] { count += 1 }
      return count
    }
  }

  /// Maximal runs of non-empty rows (`alongRows`: text lines) or columns,
  /// with runs thinner than 0.6 × the widest merged into their nearest
  /// neighbour (furigana, stray marks).
  static func bands(_ mask: [Bool], width: Int, height: Int, alongRows: Bool) -> [(Int, Int)] {
    let counts =
      alongRows
      ? profile(mask, width: width, height: height, alongRows: true, from: 0, to: width)
      : profile(mask, width: width, height: height, alongRows: false, from: 0, to: height)
    var runs: [(Int, Int)] = []
    var start: Int?
    for (index, value) in counts.enumerated() {
      if value > 0, start == nil {
        start = index
      } else if value <= 0, let begin = start {
        runs.append((begin, index))
        start = nil
      }
    }
    if let begin = start { runs.append((begin, counts.count)) }
    guard runs.count > 1 else { return runs }
    let widest = runs.map { $0.1 - $0.0 }.max() ?? 0
    var changed = true
    while changed && runs.count > 1 {
      changed = false
      for (index, run) in runs.enumerated() where Double(run.1 - run.0) < 0.6 * Double(widest) {
        let neighbour: Int
        if index == 0 {
          neighbour = 1
        } else if index == runs.count - 1 {
          neighbour = index - 1
        } else {
          neighbour =
            run.0 - runs[index - 1].1 <= runs[index + 1].0 - run.1 ? index - 1 : index + 1
        }
        let low = min(index, neighbour)
        let high = max(index, neighbour)
        runs.replaceSubrange(low...high, with: [(runs[low].0, runs[high].1)])
        changed = true
        break
      }
    }
    return runs
  }

  /// Grows each band halfway into the neighbouring gaps; the outer bands
  /// reach the crop edges, so no piece loses its margin.
  static func widen(_ runs: [(Int, Int)], length: Int) -> [(Int, Int)] {
    runs.enumerated().map { index, run in
      let low = index == 0 ? 0 : (runs[index - 1].1 + run.0) / 2
      let high = index == runs.count - 1 ? length : (run.1 + runs[index + 1].0 + 1) / 2
      return (low, high)
    }
  }

  /// Cut positions (including 0 and `length`) splitting a strip of the
  /// given length into pieces about `target` × `short` long, each cut at the
  /// emptiest line within ±30% of a step of its ideal position (ties: the
  /// closest, then the earlier).
  static func cutsAlong(_ profile: [Int], length: Int, short: Int, target: Double) -> [Int] {
    let count = Int((Double(length) / (target * Double(short))).rounded(.up))
    guard count > 1 else { return [0, length] }
    let step = Double(length) / Double(count)
    let window = max(1, Int(0.3 * step))
    var cuts = [0]
    for index in 1..<count {
      let ideal = Int((Double(index) * step).rounded(.toNearestOrEven))
      let low = max(cuts[cuts.count - 1] + 1, ideal - window)
      let high = min(length - 1, ideal + window)
      guard low <= high else { continue }
      var bestValue = Int.max
      var best = low
      for position in low...high {
        let value = profile[position]
        if value < bestValue || (value == bestValue && abs(position - ideal) < abs(best - ideal)) {
          bestValue = value
          best = position
        }
      }
      cuts.append(best)
    }
    cuts.append(length)
    return cuts
  }
}
