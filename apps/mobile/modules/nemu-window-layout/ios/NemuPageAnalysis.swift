import CoreGraphics
import Foundation
import ImageIO

/// Spread pairing evidence for one reader page, measured on a small
/// thumbnail of the cached file (never the full decode): the blank margin at
/// each side edge (a scanned book's binding margin is wider than its outer
/// one), the brightness profile of each side edge (artwork that runs across
/// two facing pages matches at the seam), the colour of the page's outer
/// border (the "match page" background) and how much of the page is in
/// colour (a colour page inside a black-and-white chapter stands alone).
enum NemuPageAnalysis {
  /// Rows of the analysis thumbnail; the research scans used the same height.
  static let analysisHeight = 480
  static let edgeBins = 48

  static func analyze(uri: String) -> [String: Any]? {
    let url: URL
    if let parsed = URL(string: uri), parsed.isFileURL {
      url = parsed
    } else if uri.hasPrefix("/") {
      url = URL(fileURLWithPath: uri)
    } else {
      return nil
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] else {
      return nil
    }
    var pixelWidth = (properties[kCGImagePropertyPixelWidth] as? Int) ?? 0
    var pixelHeight = (properties[kCGImagePropertyPixelHeight] as? Int) ?? 0
    if let orientation = properties[kCGImagePropertyOrientation] as? Int, (5...8).contains(orientation) {
      swap(&pixelWidth, &pixelHeight)
    }
    guard pixelWidth > 0, pixelHeight > 0 else { return nil }
    let thumbnailOptions: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceThumbnailMaxPixelSize: 1200,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: false,
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else {
      return nil
    }
    let h = analysisHeight
    let w = max(1, Int((Double(thumbnail.width) * Double(h) / Double(max(1, thumbnail.height))).rounded()))
    var rgba = [UInt8](repeating: 0, count: w * h * 4)
    let drawn: Bool = rgba.withUnsafeMutableBytes { buffer in
      guard let context = CGContext(
        data: buffer.baseAddress,
        width: w,
        height: h,
        bitsPerComponent: 8,
        bytesPerRow: w * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
      ) else { return false }
      context.interpolationQuality = .medium
      context.draw(thumbnail, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard drawn else { return nil }
    // Row 0 is the top: a bitmap context stores rows top-down in memory.
    var gray = [UInt8](repeating: 0, count: w * h)
    for index in 0..<(w * h) {
      let r = Int(rgba[index * 4]), g = Int(rgba[index * 4 + 1]), b = Int(rgba[index * 4 + 2])
      gray[index] = UInt8((r * 299 + g * 587 + b * 114) / 1000)
    }
    var histogram = [Int](repeating: 0, count: 256)
    for value in gray { histogram[Int(value)] += 1 }
    let target = Int(Double(gray.count) * 0.9)
    var accumulated = 0
    var paper = 255
    for level in 0..<256 {
      accumulated += histogram[level]
      if accumulated >= target { paper = level; break }
    }
    let threshold = UInt8(max(40, paper - 70))
    let y0 = Int(Double(h) * 0.04), y1 = Int(Double(h) * 0.96)
    var columnInk = [Double](repeating: 0, count: w)
    for x in 0..<w {
      var ink = 0
      for y in y0..<y1 where gray[y * w + x] < threshold { ink += 1 }
      columnInk[x] = Double(ink) / Double(max(1, y1 - y0))
    }
    // A margin is the run of near-empty columns from an edge, after skipping
    // a thin scanner line at the very edge.
    func margin(fromStart: Bool) -> Double {
      let n = columnInk.count
      let skip = max(1, Int(Double(n) * 0.012))
      let at: (Int) -> Int = { fromStart ? $0 : n - 1 - $0 }
      var i = skip
      while i < n / 2 {
        if columnInk[at(i)] > 0.02 && columnInk[at(min(n - 1, i + 1))] > 0.02 { break }
        i += 1
      }
      return Double(i) / Double(n)
    }
    let edgeWidth = max(2, Int(Double(w) * 0.015))
    func edgeProfile(left: Bool) -> [Double] {
      var out = [Double](repeating: 0, count: edgeBins)
      for bin in 0..<edgeBins {
        let ya = bin * h / edgeBins, yb = max(ya + 1, (bin + 1) * h / edgeBins)
        var sum = 0.0, count = 0.0
        for y in ya..<min(h, yb) {
          for k in 0..<edgeWidth {
            let x = left ? min(w - 1, k + 1) : max(0, w - 2 - k)
            sum += Double(gray[y * w + x]); count += 1
          }
        }
        out[bin] = count > 0 ? (sum / count / 255.0 * 1000).rounded() / 1000 : 1
      }
      return out
    }
    // The outer border's mean colour: the outermost 2% on every side.
    let band = max(1, Int(Double(min(w, h)) * 0.02))
    var red = 0, green = 0, blue = 0, samples = 0
    for y in 0..<h {
      for x in 0..<w where x < band || x >= w - band || y < band || y >= h - band {
        let index = (y * w + x) * 4
        red += Int(rgba[index]); green += Int(rgba[index + 1]); blue += Int(rgba[index + 2])
        samples += 1
      }
    }
    let edgeColor = samples > 0
      ? String(format: "#%02x%02x%02x", red / samples, green / samples, blue / samples)
      : "#000000"
    // Colour: the share of pixels far from the page's median tint in the
    // opponent channels (r - g, (r + g) / 2 - b), so an evenly yellowed or
    // sepia scan reads as black and white.
    var rgHistogram = [Int](repeating: 0, count: 511), ybHistogram = [Int](repeating: 0, count: 511)
    let pixels = w * h
    for index in 0..<pixels {
      let r = Int(rgba[index * 4]), g = Int(rgba[index * 4 + 1]), b = Int(rgba[index * 4 + 2])
      rgHistogram[r - g + 255] += 1
      ybHistogram[(r + g) / 2 - b + 255] += 1
    }
    func median(_ histogram: [Int]) -> Int {
      var accumulated = 0
      for (index, count) in histogram.enumerated() {
        accumulated += count
        if accumulated * 2 >= pixels { return index - 255 }
      }
      return 0
    }
    let rgMedian = median(rgHistogram), ybMedian = median(ybHistogram)
    var coloured = 0
    for index in 0..<pixels {
      let r = Int(rgba[index * 4]), g = Int(rgba[index * 4 + 1]), b = Int(rgba[index * 4 + 2])
      if abs(r - g - rgMedian) + abs((r + g) / 2 - b - ybMedian) > 24 { coloured += 1 }
    }
    let round3 = { (value: Double) in (value * 1000).rounded() / 1000 }
    return [
      "width": pixelWidth,
      "height": pixelHeight,
      "marginL": round3(margin(fromStart: true)),
      "marginR": round3(margin(fromStart: false)),
      "edgeL": edgeProfile(left: true),
      "edgeR": edgeProfile(left: false),
      "edgeColor": edgeColor,
      "chroma": round3(Double(coloured) / Double(max(1, pixels))),
    ]
  }
}
