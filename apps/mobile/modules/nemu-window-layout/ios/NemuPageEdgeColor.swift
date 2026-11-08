import Foundation

/**
 * The "Match Page" background: the colour of a page's outer border, measured
 * on the analysis thumbnail (premultiplied RGBA, rows top-down).
 *
 * Only the outer band counts (the outermost pixel skipped: scanner lines and
 * resampling fringes live there), and transparent pixels do not count at all.
 * The border's dominant colour wins, not its mean: panel lines, a page
 * number or art that touches the edge must not tint a white border grey. The
 * band is binned coarsely (16 levels per channel), the fullest bin and its
 * neighbours are taken as the paper, and the value is their per-channel
 * median. A border with no dominant colour (art bleeding off every edge)
 * takes the median of the whole band. Mostly transparent: no colour (the
 * reader keeps the one it shows).
 */
enum NemuPageEdgeColor {
  /** The band: this share of the shorter side, at least two pixels. */
  static let bandShare = 0.025
  /** Below this alpha (of 255) a pixel is see-through and does not count. */
  static let opaqueAlpha = 128
  /** The fullest bin and its neighbours must hold this share of the band to be its paper. */
  static let dominantShare = 0.3

  static func hex(rgba: [UInt8], width w: Int, height h: Int) -> String? {
    guard w > 2, h > 2, rgba.count >= w * h * 4 else { return nil }
    let band = max(2, Int((Double(min(w, h)) * bandShare).rounded()))
    let inner = min(band + 1, min(w, h) / 2)
    var reds: [UInt8] = [], greens: [UInt8] = [], blues: [UInt8] = []
    var bins = [Int](repeating: 0, count: 4096)
    var total = 0
    for y in 1..<(h - 1) {
      let rowInBand = y < inner || y >= h - inner
      for x in 1..<(w - 1) where rowInBand || x < inner || x >= w - inner {
        total += 1
        let index = (y * w + x) * 4
        let alpha = Int(rgba[index + 3])
        guard alpha >= opaqueAlpha else { continue }
        // Un-premultiply: a half-transparent edge pixel keeps its own colour.
        let r = UInt8(min(255, Int(rgba[index]) * 255 / alpha))
        let g = UInt8(min(255, Int(rgba[index + 1]) * 255 / alpha))
        let b = UInt8(min(255, Int(rgba[index + 2]) * 255 / alpha))
        reds.append(r); greens.append(g); blues.append(b)
        bins[bin(r, g, b)] += 1
      }
    }
    guard total > 0, reds.count * 2 >= total else { return nil }
    let fullest = bins.indices.max { bins[$0] < bins[$1] } ?? 0
    let (fr, fg, fb) = (fullest >> 8, (fullest >> 4) & 15, fullest & 15)
    var r: [UInt8] = [], g: [UInt8] = [], b: [UInt8] = []
    for index in reds.indices {
      let k = bin(reds[index], greens[index], blues[index])
      if abs((k >> 8) - fr) <= 1 && abs(((k >> 4) & 15) - fg) <= 1 && abs((k & 15) - fb) <= 1 {
        r.append(reds[index]); g.append(greens[index]); b.append(blues[index])
      }
    }
    if Double(r.count) < Double(reds.count) * dominantShare {
      (r, g, b) = (reds, greens, blues)
    }
    return String(format: "#%02x%02x%02x", median(r), median(g), median(b))
  }

  private static func bin(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> Int {
    (Int(r) >> 4) << 8 | (Int(g) >> 4) << 4 | Int(b) >> 4
  }

  private static func median(_ values: [UInt8]) -> Int {
    guard !values.isEmpty else { return 0 }
    var counts = [Int](repeating: 0, count: 256)
    for value in values { counts[Int(value)] += 1 }
    var seen = 0
    for (level, count) in counts.enumerated() {
      seen += count
      if seen * 2 >= values.count { return level }
    }
    return 255
  }
}
