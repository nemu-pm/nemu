import CoreGraphics
import Foundation

/// An 8-bit luminance plane of a page, in the upright (EXIF-oriented) pixel
/// space every OCR box uses.
///
/// manga-ocr was trained on crops preprocessed by PIL
/// (`Image.convert("L").convert("RGB")` then `ViTImageProcessor`: a 224×224
/// antialiased bilinear resize and `(x/255 − 0.5)/0.5`). Core Graphics
/// resampling is not the same filter (a naive `CGContext` resize changed 15
/// of 166 benchmark outputs), so this file reimplements PIL bit for bit:
/// the ITU-R 601 `L24` luma conversion from `Convert.c` and the two-pass
/// fixed-point convolution from `Resample.c`.
struct NemuGrayImage: Sendable {
  let width: Int
  let height: Int
  /// Row-major, `width * height` bytes.
  let pixels: [UInt8]

  init(width: Int, height: Int, pixels: [UInt8]) {
    precondition(pixels.count == width * height)
    self.width = width
    self.height = height
    self.pixels = pixels
  }

  /// PIL `convert("L")` of `image` (see `rgba(of:)`).
  init?(cgImage image: CGImage) {
    guard let rgba = Self.rgba(of: image) else { return nil }
    self = Self.pilGray(rgba: rgba, width: image.width, height: image.height)
  }

  /// Draws `image` into an RGBA buffer without colour conversion (the
  /// context uses the image's own RGB colour space when it has one, as PIL
  /// and OpenCV ignore embedded profiles). Transparent areas are composited
  /// on white.
  static func rgba(of image: CGImage) -> [UInt8]? {
    let width = image.width
    let height = image.height
    guard width > 0, height > 0 else { return nil }
    let space: CGColorSpace
    if let own = image.colorSpace, own.model == .rgb {
      space = own
    } else {
      space = CGColorSpaceCreateDeviceRGB()
    }
    let bytesPerRow = width * 4
    var rgba = [UInt8](repeating: 255, count: bytesPerRow * height)
    let drawn: Bool = rgba.withUnsafeMutableBytes { buffer in
      guard
        let context = CGContext(
          data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
          bytesPerRow: bytesPerRow, space: space,
          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
      else { return false }
      context.interpolationQuality = .none
      context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    return drawn ? rgba : nil
  }

  /// Pillow `Convert.c` rgb2l: L24(rgb) = r·19595 + g·38470 + b·7471 + 0x8000, >> 16.
  static func pilGray(rgba: [UInt8], width: Int, height: Int) -> NemuGrayImage {
    var gray = [UInt8](repeating: 0, count: width * height)
    rgba.withUnsafeBufferPointer { source in
      gray.withUnsafeMutableBufferPointer { out in
        for index in 0..<(width * height) {
          let r = UInt32(source[index * 4])
          let g = UInt32(source[index * 4 + 1])
          let b = UInt32(source[index * 4 + 2])
          out[index] = UInt8((r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16)
        }
      }
    }
    return NemuGrayImage(width: width, height: height, pixels: gray)
  }

  /// PIL `Image.crop` with integer bounds clamped to the image (the cloud's
  /// `crop_region`). Nil when the clamped box is empty.
  func cropped(x1: Int, y1: Int, x2: Int, y2: Int) -> NemuGrayImage? {
    let left = max(0, x1)
    let top = max(0, y1)
    let right = min(width, x2)
    let bottom = min(height, y2)
    guard right > left, bottom > top else { return nil }
    let cropWidth = right - left
    var out = [UInt8](repeating: 0, count: cropWidth * (bottom - top))
    pixels.withUnsafeBufferPointer { source in
      out.withUnsafeMutableBufferPointer { target in
        for row in top..<bottom {
          let from = row * width + left
          let to = (row - top) * cropWidth
          for column in 0..<cropWidth { target[to + column] = source[from + column] }
        }
      }
    }
    return NemuGrayImage(width: cropWidth, height: bottom - top, pixels: out)
  }

  /// Pillow `Image.resize(size, Image.BILINEAR)` (reducing_gap=None) on an
  /// 8-bit single-channel image: `ImagingResampleInner` with the bilinear
  /// (triangle) filter, antialiased when downscaling.
  func resizedBilinear(width outWidth: Int, height outHeight: Int) -> NemuGrayImage {
    if outWidth == width && outHeight == height { return self }
    let horizontal = NemuPillowResample.coefficients(
      inSize: width, in0: 0, in1: Double(width), outSize: outWidth)
    var vertical = NemuPillowResample.coefficients(
      inSize: height, in0: 0, in1: Double(height), outSize: outHeight)
    let needHorizontal = outWidth != width
    let needVertical = outHeight != height
    var current = self
    if needHorizontal {
      // First and last source rows the vertical pass reads.
      let firstRow = vertical.bounds[0]
      let lastRow = vertical.bounds[(outHeight - 1) * 2] + vertical.bounds[(outHeight - 1) * 2 + 1]
      for index in 0..<outHeight { vertical.bounds[index * 2] -= firstRow }
      current = NemuPillowResample.horizontal(
        self, rowOffset: firstRow, rows: lastRow - firstRow, outWidth: outWidth,
        coefficients: horizontal)
    }
    if needVertical {
      current = NemuPillowResample.vertical(
        current, outHeight: outHeight, coefficients: vertical)
    }
    return current
  }
}

/// Fixed-point port of Pillow's `libImaging/Resample.c` for the bilinear
/// filter and 8-bit channels.
enum NemuPillowResample {
  /// `PRECISION_BITS = 32 - 8 - 2`.
  static let precisionBits = 22

  struct Coefficients {
    var bounds: [Int]
    /// `outSize * kernelSize` normalized fixed-point weights.
    let weights: [Int32]
    let kernelSize: Int
  }

  private static func bilinear(_ value: Double) -> Double {
    let x = value < 0 ? -value : value
    return x < 1 ? 1 - x : 0
  }

  /// `precompute_coeffs` followed by `normalize_coeffs_8bpc`.
  static func coefficients(inSize: Int, in0: Double, in1: Double, outSize: Int) -> Coefficients {
    // Pillow passes the box as C floats; the subtraction happens in float.
    let span = Double(Float(in1) - Float(in0))
    let scale = span / Double(outSize)
    let filterScale = max(scale, 1.0)
    let support = 1.0 * filterScale
    let kernelSize = Int(support.rounded(.up)) * 2 + 1
    var bounds = [Int](repeating: 0, count: outSize * 2)
    var weights = [Int32](repeating: 0, count: outSize * kernelSize)
    var row = [Double](repeating: 0, count: kernelSize)
    let precision = Double(1 << precisionBits)
    for xx in 0..<outSize {
      let center = Double(Float(in0)) + (Double(xx) + 0.5) * scale
      var total = 0.0
      let inverse = 1.0 / filterScale
      // C `(int)` truncates toward zero.
      var xmin = Int(center - support + 0.5)
      if xmin < 0 { xmin = 0 }
      var xmax = Int(center + support + 0.5)
      if xmax > inSize { xmax = inSize }
      xmax -= xmin
      for x in 0..<kernelSize { row[x] = 0 }
      if xmax > 0 {
        for x in 0..<xmax {
          let weight = bilinear((Double(x + xmin) - center + 0.5) * inverse)
          row[x] = weight
          total += weight
        }
        if total != 0 {
          for x in 0..<xmax { row[x] /= total }
        }
      }
      for x in 0..<kernelSize {
        let value = row[x]
        let fixed = value < 0 ? (-0.5 + value * precision) : (0.5 + value * precision)
        weights[xx * kernelSize + x] = Int32(fixed)
      }
      bounds[xx * 2] = xmin
      bounds[xx * 2 + 1] = max(0, xmax)
    }
    return Coefficients(bounds: bounds, weights: weights, kernelSize: kernelSize)
  }

  @inline(__always)
  private static func clip8(_ value: Int) -> UInt8 {
    let shifted = value >> precisionBits
    if shifted <= 0 { return 0 }
    if shifted >= 255 { return 255 }
    return UInt8(shifted)
  }

  static func horizontal(
    _ image: NemuGrayImage, rowOffset: Int, rows: Int, outWidth: Int, coefficients: Coefficients
  ) -> NemuGrayImage {
    var out = [UInt8](repeating: 0, count: outWidth * rows)
    let kernel = coefficients.kernelSize
    image.pixels.withUnsafeBufferPointer { source in
      coefficients.weights.withUnsafeBufferPointer { weights in
        out.withUnsafeMutableBufferPointer { target in
          for yy in 0..<rows {
            let rowStart = (yy + rowOffset) * image.width
            for xx in 0..<outWidth {
              let xmin = coefficients.bounds[xx * 2]
              let xmax = coefficients.bounds[xx * 2 + 1]
              var sum = 1 << (precisionBits - 1)
              for x in 0..<xmax {
                sum += Int(source[rowStart + x + xmin]) * Int(weights[xx * kernel + x])
              }
              target[yy * outWidth + xx] = clip8(sum)
            }
          }
        }
      }
    }
    return NemuGrayImage(width: outWidth, height: rows, pixels: out)
  }

  static func vertical(
    _ image: NemuGrayImage, outHeight: Int, coefficients: Coefficients
  ) -> NemuGrayImage {
    var out = [UInt8](repeating: 0, count: image.width * outHeight)
    let kernel = coefficients.kernelSize
    image.pixels.withUnsafeBufferPointer { source in
      coefficients.weights.withUnsafeBufferPointer { weights in
        out.withUnsafeMutableBufferPointer { target in
          for yy in 0..<outHeight {
            let ymin = coefficients.bounds[yy * 2]
            let ymax = coefficients.bounds[yy * 2 + 1]
            for xx in 0..<image.width {
              var sum = 1 << (precisionBits - 1)
              for y in 0..<ymax {
                sum += Int(source[(y + ymin) * image.width + xx]) * Int(weights[yy * kernel + y])
              }
              target[yy * image.width + xx] = clip8(sum)
            }
          }
        }
      }
    }
    return NemuGrayImage(width: image.width, height: outHeight, pixels: out)
  }
}
