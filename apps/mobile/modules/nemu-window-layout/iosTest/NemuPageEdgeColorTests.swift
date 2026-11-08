import Foundation

/**
 * The "Match Page" border colour (`NemuPageEdgeColor`) on synthetic pages:
 * a white-bordered manga page with ink touching the edge, a dark page, a
 * page with a scanner line on its very edge and a transparent one.
 */
@main
enum NemuPageEdgeColorTests {
  static func main() {
    whiteBorderIgnoresInkTouchingTheEdge()
    darkPagesReadDark()
    theOutermostPixelIsIgnored()
    seeThroughPixelsDoNotCount()
    aBorderWithoutPaperTakesItsMedian()
    print("NemuPageEdgeColorTests passed")
  }

  typealias Pixel = (r: UInt8, g: UInt8, b: UInt8, a: UInt8)

  static func page(width: Int, height: Int, _ pixel: (Int, Int) -> Pixel) -> [UInt8] {
    var out = [UInt8](repeating: 0, count: width * height * 4)
    for y in 0..<height {
      for x in 0..<width {
        let p = pixel(x, y)
        let alpha = Int(p.a)
        // Premultiplied, as the analysis context draws it.
        out[(y * width + x) * 4] = UInt8(Int(p.r) * alpha / 255)
        out[(y * width + x) * 4 + 1] = UInt8(Int(p.g) * alpha / 255)
        out[(y * width + x) * 4 + 2] = UInt8(Int(p.b) * alpha / 255)
        out[(y * width + x) * 4 + 3] = p.a
      }
    }
    return out
  }

  static func whiteBorderIgnoresInkTouchingTheEdge() {
    // Off-white paper with heavy black panel lines running off the page every
    // 10 px (a 40% black share of the border): the mean would be mid grey.
    let rgba = page(width: 300, height: 480) { x, y in
      let ink = (x % 10 < 4) && (y < 20 || y > 460)
      return ink ? (0, 0, 0, 255) : (250, 248, 244, 255)
    }
    precondition(NemuPageEdgeColor.hex(rgba: rgba, width: 300, height: 480) == "#faf8f4")
  }

  static func darkPagesReadDark() {
    let rgba = page(width: 300, height: 480) { x, y in
      // A white speech bubble crossing the right edge.
      (x > 280 && y > 100 && y < 160) ? (255, 255, 255, 255) : (18, 16, 20, 255)
    }
    precondition(NemuPageEdgeColor.hex(rgba: rgba, width: 300, height: 480) == "#121014")
  }

  static func theOutermostPixelIsIgnored() {
    // A black scanner line one pixel wide round a cream page.
    let rgba = page(width: 300, height: 480) { x, y in
      (x == 0 || y == 0 || x == 299 || y == 479) ? (0, 0, 0, 255) : (240, 232, 210, 255)
    }
    precondition(NemuPageEdgeColor.hex(rgba: rgba, width: 300, height: 480) == "#f0e8d2")
  }

  static func seeThroughPixelsDoNotCount() {
    // Transparent margins (drawn black by a context without alpha) round a
    // white page: mostly see-through, so no colour at all.
    let clear = page(width: 300, height: 480) { _, _ in (0, 0, 0, 0) }
    precondition(NemuPageEdgeColor.hex(rgba: clear, width: 300, height: 480) == nil)
    // A few transparent pixels on a white border change nothing.
    let mostlyWhite = page(width: 300, height: 480) { x, _ in
      x < 4 ? (0, 0, 0, 0) : (255, 255, 255, 255)
    }
    precondition(NemuPageEdgeColor.hex(rgba: mostlyWhite, width: 300, height: 480) == "#ffffff")
  }

  static func aBorderWithoutPaperTakesItsMedian() {
    // Art bleeding off every edge: a smooth gradient with no dominant bin.
    let rgba = page(width: 256, height: 256) { x, y in
      let v = UInt8((x + y) / 2)
      return (v, v, v, 255)
    }
    guard let hex = NemuPageEdgeColor.hex(rgba: rgba, width: 256, height: 256) else {
      preconditionFailure("an opaque page always has a colour")
    }
    let value = Int(hex.dropFirst().prefix(2), radix: 16) ?? -1
    precondition(value > 96 && value < 160, "median of the gradient band, got \(hex)")
  }
}
