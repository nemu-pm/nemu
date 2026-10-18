import Foundation

/// Manga reading order for text boxes: a Swift port of the cloud's
/// `services/ocr/text_order.py` (Kovanen et al., "A layered method for
/// determining manga text bubble reading order", ICIP 2015) with the
/// production defaults of `text_order_defaults.py`.
///
/// 1. Panel-edge mask: resize to height 1000, percentile contrast stretch,
///    LoG (Gaussian 15 + Laplacian 3) threshold, three probabilistic Hough
///    passes, pruning, loose-end extrapolation, thick pen + Gaussian blur.
/// 2. Layer 1: recursive projection XY-cut of the mask (columns right to left).
/// 3. Layer 2: text boxes connected inside the mask form groups, ordered by
///    weighted nearest neighbour of ray-cast panel shapes.
/// 4. Layer 3: weighted nearest neighbour inside each group.
///
/// The OpenCV primitives it depends on (`cvtColor` BGR2GRAY, `resize`
/// INTER_LINEAR, bit-exact 8-bit `GaussianBlur`, `Laplacian`, `HoughLinesP`
/// with its seeded RNG, `line`, `minAreaRect`) are reimplemented here after
/// OpenCV 4.12 so the order matches the cloud on the benchmark pages
/// (`artifacts/…/ocr-benchmark/scripts/app-parity/`).
enum NemuTextOrder {
  struct Box: Sendable {
    var x1: Double
    var y1: Double
    var x2: Double
    var y2: Double
  }

  struct Params: Sendable {
    var workHeight = 1000
    var contrastLow = 2.0
    var contrastHigh = 98.0
    var logGaussianKernel = 15
    var thresholdLambda = 20.0
    var thresholdMeanScale = 1.0
    var responseScale = 1.5
    /// (rho, threshold, maxGap) per pass; theta is 1° and the minimum
    /// length the paper's 174 px.
    var houghPasses: [(rho: Float, threshold: Int, maxGap: Int)] = [
      (1, 38, 12), (1, 47, 9), (2, 60, 6),
    ]
    var minLineLength = 174
    var longThreshold = 200.0
    var connectDistance = 45.0
    var angleEpsilonDegrees = 15.0
    var overlapRejectFraction = 0.7
    var maskThickness = 40
    var maskBlurKernel = 67
    var l1ThresholdRatio = 0.65
    var l1MinGap = 20
    var l1MinSize = 50
    var l1MaxDepth = 10
    var l1MarginRatio = 0.05
    var layer2Weight = 0.65
    var layer3Weight = 0.65
    var l2Rays = 36
    var l2RayMaxDistance = 500.0
    var l2ConnectThreshold = 100.0
    var l2RayThreshold = 100.0
  }

  typealias Line = (x1: Int, y1: Int, x2: Int, y2: Int)

  /// Intermediate stages, for the parity harness.
  struct Stages {
    var scale = 1.0
    var workWidth = 0
    var workHeight = 0
    var stretchedSum = 0
    var binaryCount = 0
    var hough: [Line] = []
    var pruned: [Line] = []
    var extrapolated: [Line] = []
    var maskSum = 0
    var panels: [(Int, Int, Int, Int)] = []
  }

  /// Reading order (indices into `boxes`) on the page whose OpenCV-style
  /// luma plane is `gray`. Boxes are in `gray`'s pixel space.
  static func order(
    boxes: [Box], gray: NemuGrayImage, params: Params = Params(), stages: UnsafeMutablePointer<Stages>? = nil
  ) -> [Int] {
    if boxes.isEmpty { return [] }
    guard gray.width > 1, gray.height > 1 else { return simpleOrder(boxes) }
    let mask = panelMask(gray: gray, params: params, stages: stages)
    return orderFromMask(boxes: boxes, mask: mask, params: params, stages: stages)
  }

  // MARK: - Panel mask

  struct Mask {
    let width: Int
    let height: Int
    var pixels: [UInt8]
    let scale: Double

    @inline(__always) func at(_ x: Int, _ y: Int) -> UInt8 { pixels[y * width + x] }
  }

  static func panelMask(gray: NemuGrayImage, params: Params, stages: UnsafeMutablePointer<Stages>?)
    -> Mask
  {
    let (stretched, scale) = resizeAndStretch(gray, params: params)
    let binary = logBinary(stretched, params: params)
    var lines = detectLines(binary, params: params)
    stages?.pointee.hough = lines
    lines = pruneLines(lines, params: params)
    stages?.pointee.pruned = lines
    lines = extrapolate(lines, width: binary.width, height: binary.height)
    stages?.pointee.extrapolated = lines
    var pixels = [UInt8](repeating: 0, count: binary.width * binary.height)
    for line in lines {
      drawThickLine(&pixels, width: binary.width, height: binary.height, line, thickness: params.maskThickness)
    }
    var kernel = params.maskBlurKernel
    if kernel % 2 == 0 { kernel += 1 }
    if kernel < 3 { kernel = 3 }
    let blurred = gaussianBlur(
      NemuGrayImage(width: binary.width, height: binary.height, pixels: pixels), kernelSize: kernel)
    if let stages {
      stages.pointee.scale = scale
      stages.pointee.workWidth = binary.width
      stages.pointee.workHeight = binary.height
      stages.pointee.stretchedSum = stretched.pixels.reduce(0) { $0 + Int($1) }
      stages.pointee.binaryCount = binary.pixels.reduce(0) { $0 + ($1 > 0 ? 1 : 0) }
      stages.pointee.maskSum = blurred.pixels.reduce(0) { $0 + Int($1) }
    }
    return Mask(width: blurred.width, height: blurred.height, pixels: blurred.pixels, scale: scale)
  }

  /// `_resize_and_contrast_stretch`: height → 1000 (INTER_LINEAR), then the
  /// 2nd–98th percentile stretch.
  static func resizeAndStretch(_ gray: NemuGrayImage, params: Params) -> (NemuGrayImage, Double) {
    let targetHeight = params.workHeight
    let scale = Double(targetHeight) / Double(gray.height)
    let newWidth = Int((Double(gray.width) * scale).rounded(.toNearestOrEven))
    let resized = resizeLinear(gray, width: max(1, newWidth), height: targetHeight)
    var histogram = [Int](repeating: 0, count: 256)
    for value in resized.pixels { histogram[Int(value)] += 1 }
    func percentile(_ q: Double) -> Double {
      // numpy "linear" (Hyndman–Fan 7): virtual index n·q + (1 − q) − 1,
      // `_lerp` switching to b − (b − a)(1 − t) for t ≥ 0.5.
      let n = resized.pixels.count
      let quantile = q / 100
      let virtual = Double(n) * quantile + (1 + quantile * -1) - 1
      let lower = max(0, min(n - 1, Int(virtual.rounded(.down))))
      let upper = max(0, min(n - 1, lower + 1))
      let t = virtual - virtual.rounded(.down)
      func valueAt(_ rank: Int) -> Double {
        var seen = 0
        for (value, count) in histogram.enumerated() {
          seen += count
          if rank < seen { return Double(value) }
        }
        return 255
      }
      let a = valueAt(lower)
      let b = valueAt(upper)
      let difference = b - a
      return t >= 0.5 ? b - difference * (1 - t) : a + difference * t
    }
    let low = percentile(params.contrastLow)
    let high = percentile(params.contrastHigh)
    let denominator = high - low + 1e-6
    let out = resized.pixels.map { value -> UInt8 in
      let stretched = (Double(value) - low) / denominator * 255
      return UInt8(min(255, max(0, stretched)))
    }
    return (NemuGrayImage(width: resized.width, height: resized.height, pixels: out), scale)
  }

  /// `cv::resize(INTER_LINEAR)` of an 8-bit single-channel image as the
  /// arm64 OpenCV build runs it: through the Carotene HAL
  /// (`hal/carotene/src/resize.cpp`, `resizeLinearOpenCV`), which
  /// downsamples up to 2× with 11-bit weights (`downsample_bilinear_8uc1`)
  /// and otherwise blends rows then columns with 7-bit weights
  /// (`resizeLinearOpenCVchan<1>`).
  static func resizeLinear(_ image: NemuGrayImage, width: Int, height: Int) -> NemuGrayImage {
    if width == image.width && height == image.height { return image }
    let wr = Float(1.0 / (Double(width) / Double(image.width)))
    let hr = Float(1.0 / (Double(height) / Double(image.height)))
    if !(wr <= 1 && hr <= 1) && wr <= 2 && hr <= 2 && image.width >= 16 {
      return caroteneDownsample(image, width: width, height: height, wr: wr, hr: hr)
    }
    return caroteneBilinear(image, width: width, height: height, wr: wr, hr: hr)
  }

  /// `downsample_bilinear_8uc1` ("ugly version matching OpenCV's SSE").
  private static func caroteneDownsample(
    _ image: NemuGrayImage, width: Int, height: Int, wr: Float, hr: Float
  ) -> NemuGrayImage {
    let shiftBits = 11
    let one = Float(1 << shiftBits)
    let xOffset = 0.5 * wr - 0.5
    let yOffset = 0.5 * hr - 0.5
    var row1 = [Int](repeating: 0, count: height)
    var row2 = [Int](repeating: 0, count: height)
    var rowWeight = [Int32](repeating: 0, count: height)
    for row in 0..<height {
      let r = yOffset.addingProduct(Float(row), hr)  // clang contracts to fmadd
      let source = Int(r.rounded(.down))
      let source2 = source + 1
      rowWeight[row] = Int32(((Float(source2) - r) * one + 0.5).rounded(.down))
      row1[row] = max(0, source)
      row2[row] = min(image.height - 1, source2)
    }
    var col1 = [Int](repeating: 0, count: width)
    var col2 = [Int](repeating: 0, count: width)
    var colWeight = [Int32](repeating: 0, count: width)
    for col in 0..<width {
      let c = xOffset.addingProduct(Float(col), wr)  // fmadd, as compiled
      var low = Int(c)  // (ptrdiff_t)c truncates
      var high = low + 1
      colWeight[col] = Int32(Int16(truncatingIfNeeded: Int(((Float(high) - c) * one + 0.5).rounded(.down))))
      if low < 0 { low = 0 }
      if high >= image.width { high = image.width - 1 }
      col1[col] = low
      col2[col] = high
    }
    @inline(__always) func qdmulh(_ a: Int16, _ b: Int16) -> Int16 {
      if a == Int16.min && b == Int16.min { return Int16.max }
      return Int16(truncatingIfNeeded: (Int32(a) * Int32(b) * 2) >> 16)
    }
    var pixels = [UInt8](repeating: 0, count: width * height)
    image.pixels.withUnsafeBufferPointer { src in
      for row in 0..<height {
        let upper = row1[row] * image.width
        let lower = row2[row] * image.width
        let wUpper = Int16(truncatingIfNeeded: rowWeight[row])
        let wLower = Int16(truncatingIfNeeded: Int32(1 << shiftBits) - rowWeight[row])
        for col in 0..<width {
          let cw = colWeight[col]
          func blend(_ base: Int) -> Int16 {
            let l = Int32(src[base + col1[col]])
            let h = Int32(src[base + col2[col]])
            let value = (h << Int32(shiftBits)) + (l - h) * cw
            return Int16(truncatingIfNeeded: value >> 4)
          }
          let v1 = qdmulh(blend(upper), wUpper)
          let v2 = qdmulh(blend(lower), wLower)
          let sum = Int32(Int16(truncatingIfNeeded: Int32(v1 >> 1) + Int32(v2 >> 1)))
          let rounded = (sum + 2) >> 2
          pixels[row * width + col] = UInt8(clamping: rounded)
        }
      }
    }
    return NemuGrayImage(width: width, height: height, pixels: pixels)
  }

  /// `resizeLinearOpenCVchan<1>` + `resize_bilinear_rows`: rows blended
  /// first, then columns, both `(a·w + b·(128 − w) + 64) >> 7`.
  private static func caroteneBilinear(
    _ image: NemuGrayImage, width: Int, height: Int, wr: Float, hr: Float
  ) -> NemuGrayImage {
    let xOffset = 0.5 * wr - 0.5
    let yOffset = 0.5 * hr - 0.5
    var low = [Int](repeating: 0, count: width)
    var high = [Int](repeating: 0, count: width)
    var colWeight = [UInt32](repeating: 0, count: width)
    for col in 0..<width {
      let w = xOffset.addingProduct(wr, Float(col))  // vmlaq_f32 → fmla
      let truncated = Int32(w)
      let ceiling = truncated + (Float(truncated) < w ? 1 : 0)
      let weight = (Float(ceiling) - w) * 128
      colWeight[col] = weight <= 0 ? 0 : UInt32(UInt8(truncatingIfNeeded: UInt32(weight)))
      high[col] = min(Int(ceiling), image.width - 1)
      low[col] = min(max(Int(ceiling) - 1, 0), image.width - 1)
    }
    var pixels = [UInt8](repeating: 0, count: width * height)
    var blended = [UInt32](repeating: 0, count: image.width)
    image.pixels.withUnsafeBufferPointer { src in
      for row in 0..<height {
        let w = yOffset.addingProduct(Float(row), hr)  // fmadd, as compiled
        var source = Int(w.rounded(.down))
        var source2 = source + 1
        let rowWeight = UInt32(UInt8(truncatingIfNeeded: Int((Float(source2) - w) * 128)))
        if source < 0 { source = 0 }
        if source2 >= image.height { source2 = image.height - 1 }
        let a = source * image.width
        let b = source2 * image.width
        for x in 0..<image.width {
          blended[x] =
            (UInt32(src[a + x]) * rowWeight + UInt32(src[b + x]) * (128 - rowWeight) + 64) >> 7
          blended[x] &= 0xFF
        }
        for col in 0..<width {
          let cw = colWeight[col]
          pixels[row * width + col] = UInt8(
            truncatingIfNeeded: (blended[low[col]] * cw + blended[high[col]] * (128 - cw) + 64) >> 7)
        }
      }
    }
    return NemuGrayImage(width: width, height: height, pixels: pixels)
  }

  /// OpenCV `BORDER_REFLECT_101` index.
  @inline(__always) static func reflect101(_ p: Int, _ length: Int) -> Int {
    if length == 1 { return 0 }
    var index = p
    while index < 0 || index >= length {
      if index < 0 { index = -index }
      if index >= length { index = 2 * length - 2 - index }
    }
    return index
  }

  /// `getGaussianKernelBitExact` + `getGaussianKernelFixedPoint_ED` with 8
  /// fraction bits (the `ufixedpoint16` kernel of 8-bit `GaussianBlur`).
  static func fixedGaussianKernel(_ n: Int) -> [Int] {
    let sigma = Double(n) * 0.15 + 0.35
    let scale2 = -0.125 / (sigma * sigma)
    let half = (n - 1) / 2
    var values = [Double](repeating: 0, count: half + 1)
    var sum = 0.0
    var x = 1 - n
    for i in 0..<half {
      let t = exp(Double(x * x) * scale2)
      values[i] = t
      sum += t
      x += 2
    }
    sum *= 2
    sum += 1
    let inverse = 1 / sum
    var kernel = [Double](repeating: 0, count: n)
    for i in 0..<half {
      kernel[i] = values[i] * inverse
      kernel[n - 1 - i] = kernel[i]
    }
    kernel[half] = inverse
    let multiplier = 256.0
    var error = 0.0
    var fixed = [Int](repeating: 0, count: n)
    var total = 0
    for i in 0..<half {
      let adjusted = kernel[i] * multiplier + error
      let rounded = Int(adjusted.rounded(.toNearestOrEven))
      error = adjusted - Double(rounded)
      fixed[i] = rounded
      fixed[n - 1 - i] = rounded
      total += rounded
    }
    fixed[half] = 256 - total * 2
    return fixed
  }

  /// Bit-exact 8-bit `cv::GaussianBlur(k×k, σ=0)`: row pass into 8.8 fixed
  /// point, column pass into 16.16, rounded to 8 bits; reflect-101 borders.
  static func gaussianBlur(_ image: NemuGrayImage, kernelSize: Int) -> NemuGrayImage {
    let kernel = fixedGaussianKernel(kernelSize)
    let radius = kernelSize / 2
    let w = image.width
    let h = image.height
    var rows = [Int32](repeating: 0, count: w * h)
    image.pixels.withUnsafeBufferPointer { source in
      rows.withUnsafeMutableBufferPointer { out in
        for y in 0..<h {
          let base = y * w
          for x in 0..<w {
            var sum: Int32 = 0
            if x >= radius && x + radius < w {
              for k in 0..<kernelSize {
                sum += Int32(source[base + x - radius + k]) * Int32(kernel[k])
              }
            } else {
              for k in 0..<kernelSize {
                sum += Int32(source[base + reflect101(x - radius + k, w)]) * Int32(kernel[k])
              }
            }
            out[base + x] = sum
          }
        }
      }
    }
    var pixels = [UInt8](repeating: 0, count: w * h)
    rows.withUnsafeBufferPointer { source in
      pixels.withUnsafeMutableBufferPointer { out in
        var accumulator = [Int64](repeating: 0, count: w)
        for y in 0..<h {
          for x in 0..<w { accumulator[x] = 0 }
          for k in 0..<kernelSize {
            let sy = reflect101(y - radius + k, h)
            let weight = Int64(kernel[k])
            if weight == 0 { continue }
            let base = sy * w
            for x in 0..<w { accumulator[x] += Int64(source[base + x]) * weight }
          }
          for x in 0..<w {
            out[y * w + x] = UInt8(clamping: (accumulator[x] + (1 << 15)) >> 16)
          }
        }
      }
    }
    return NemuGrayImage(width: w, height: h, pixels: pixels)
  }

  /// `preprocess_for_hough`: GaussianBlur(15) → Laplacian(ksize 3, CV_32F)
  /// × response scale → keep responses above λ + mean.
  static func logBinary(_ stretched: NemuGrayImage, params: Params) -> NemuGrayImage {
    let blurred = gaussianBlur(stretched, kernelSize: params.logGaussianKernel)
    let w = blurred.width
    let h = blurred.height
    var response = [Float](repeating: 0, count: w * h)
    var total = 0.0
    let scale = Float(params.responseScale)
    blurred.pixels.withUnsafeBufferPointer { p in
      for y in 0..<h {
        let ym = reflect101(y - 1, h) * w
        let yp = reflect101(y + 1, h) * w
        let yc = y * w
        for x in 0..<w {
          let xm = reflect101(x - 1, w)
          let xp = reflect101(x + 1, w)
          // Laplacian ksize=3 kernel [2 0 2; 0 −8 0; 2 0 2].
          let value =
            2 * (Int(p[ym + xm]) + Int(p[ym + xp]) + Int(p[yp + xm]) + Int(p[yp + xp])) - 8
            * Int(p[yc + x])
          let scaled = Float(value) * scale
          response[yc + x] = scaled
          total += Double(scaled)
        }
      }
    }
    let threshold = params.thresholdLambda + params.thresholdMeanScale * (total / Double(w * h))
    let pixels = response.map { value -> UInt8 in
      value > 0 && Double(value) > threshold ? 255 : 0
    }
    return NemuGrayImage(width: w, height: h, pixels: pixels)
  }

  // MARK: - Hough

  /// OpenCV's `RNG` (multiply-with-carry), seeded like HoughLinesP.
  struct OpenCVRng {
    var state: UInt64 = 0xFFFF_FFFF_FFFF_FFFF
    mutating func next() -> UInt32 {
      state = UInt64(UInt32(truncatingIfNeeded: state)) &* 4_164_903_690 &+ (state >> 32)
      return UInt32(truncatingIfNeeded: state)
    }
    mutating func uniform(_ a: Int, _ b: Int) -> Int {
      a == b ? a : Int(next() % UInt32(b - a)) + a
    }
  }

  @inline(__always) static func cvRound(_ value: Float) -> Int {
    Int(value.rounded(.toNearestOrEven))
  }

  /// `cv::HoughLinesP` (HoughLinesProbabilistic), theta = 1°.
  static func houghLinesP(
    _ image: NemuGrayImage, rho: Float, threshold: Int, lineLength: Int, lineGap: Int
  ) -> [Line] {
    let theta = Float(Double.pi / 180)
    let irho = 1 / rho
    var rng = OpenCVRng()
    let width = image.width
    let height = image.height
    var numangle = Int((Double.pi / Double(theta)).rounded(.down)) + 1
    if numangle > 1 && abs(Double.pi - Double(numangle - 1) * Double(theta)) < Double(theta) / 2 {
      numangle -= 1
    }
    let numrho = cvRound(Float((width + height) * 2 + 1) / rho)
    var accum = [Int32](repeating: 0, count: numangle * numrho)
    var trig = [Float](repeating: 0, count: numangle * 2)
    for n in 0..<numangle {
      trig[n * 2] = Float(cos(Double(n) * Double(theta)) * Double(irho))
      trig[n * 2 + 1] = Float(sin(Double(n) * Double(theta)) * Double(irho))
    }
    var mask = [UInt8](repeating: 0, count: width * height)
    var points: [(x: Int, y: Int)] = []
    for y in 0..<height {
      for x in 0..<width where image.pixels[y * width + x] != 0 {
        mask[y * width + x] = 1
        points.append((x, y))
      }
    }
    let offset = (numrho - 1) / 2
    let shift = 16
    var lines: [Line] = []
    var count = points.count
    while count > 0 {
      defer { count -= 1 }
      let index = rng.uniform(0, count)
      var maxValue = threshold - 1
      var maxN = 0
      let point = points[index]
      points[index] = points[count - 1]
      let i = point.y
      let j = point.x
      if mask[i * width + j] == 0 { continue }
      for n in 0..<numangle {
        let r = cvRound(Float(j) * trig[n * 2] + Float(i) * trig[n * 2 + 1]) + offset
        let slot = n * numrho + r
        accum[slot] += 1
        let value = Int(accum[slot])
        if maxValue < value {
          maxValue = value
          maxN = n
        }
      }
      if maxValue < threshold { continue }
      let a = -trig[maxN * 2 + 1]
      let b = trig[maxN * 2]
      var x0 = j
      var y0 = i
      let xflag: Bool
      let dx0: Int
      let dy0: Int
      if abs(a) > abs(b) {
        xflag = true
        dx0 = a > 0 ? 1 : -1
        dy0 = cvRound(b * Float(1 << shift) / abs(a))
        y0 = (y0 << shift) + (1 << (shift - 1))
      } else {
        xflag = false
        dy0 = b > 0 ? 1 : -1
        dx0 = cvRound(a * Float(1 << shift) / abs(b))
        x0 = (x0 << shift) + (1 << (shift - 1))
      }
      var ends = [(x: 0, y: 0), (x: 0, y: 0)]
      for k in 0..<2 {
        var gap = 0
        var x = x0
        var y = y0
        let dx = k > 0 ? -dx0 : dx0
        let dy = k > 0 ? -dy0 : dy0
        while true {
          let j1 = xflag ? x : x >> shift
          let i1 = xflag ? y >> shift : y
          if j1 < 0 || j1 >= width || i1 < 0 || i1 >= height { break }
          if mask[i1 * width + j1] != 0 {
            gap = 0
            ends[k] = (j1, i1)
          } else {
            gap += 1
            if gap > lineGap { break }
          }
          x += dx
          y += dy
        }
      }
      let good =
        abs(ends[1].x - ends[0].x) >= lineLength || abs(ends[1].y - ends[0].y) >= lineLength
      for k in 0..<2 {
        var x = x0
        var y = y0
        let dx = k > 0 ? -dx0 : dx0
        let dy = k > 0 ? -dy0 : dy0
        while true {
          let j1 = xflag ? x : x >> shift
          let i1 = xflag ? y >> shift : y
          if j1 < 0 || j1 >= width || i1 < 0 || i1 >= height { break }
          if mask[i1 * width + j1] != 0 {
            if good {
              for n in 0..<numangle {
                let r = cvRound(Float(j1) * trig[n * 2] + Float(i1) * trig[n * 2 + 1]) + offset
                accum[n * numrho + r] -= 1
              }
            }
            mask[i1 * width + j1] = 0
          }
          if i1 == ends[k].y && j1 == ends[k].x { break }
          x += dx
          y += dy
        }
      }
      if good {
        lines.append((ends[0].x, ends[0].y, ends[1].x, ends[1].y))
      }
    }
    return lines
  }

  static func length(_ l: Line) -> Double {
    let dx = Double(l.x2 - l.x1)
    let dy = Double(l.y2 - l.y1)
    return (dx * dx + dy * dy).squareRoot()
  }

  /// `detect_panel_lines`: three passes, exact duplicates removed.
  static func detectLines(_ binary: NemuGrayImage, params: Params) -> [Line] {
    var all: [Line] = []
    for pass in params.houghPasses {
      let found = houghLinesP(
        binary, rho: pass.rho, threshold: pass.threshold, lineLength: params.minLineLength,
        lineGap: pass.maxGap)
      for line in found where length(line) >= Double(params.minLineLength) {
        all.append(line)
      }
    }
    var seen = Set<[Int]>()
    var unique: [Line] = []
    for l in all {
      let key =
        (l.x1, l.y1) <= (l.x2, l.y2) ? [l.x1, l.y1, l.x2, l.y2] : [l.x2, l.y2, l.x1, l.y1]
      if seen.insert(key).inserted { unique.append(l) }
    }
    return unique
  }

  // MARK: - Line geometry

  static func angle(_ l: Line) -> Double {
    let value = atan2(Double(l.y2 - l.y1), Double(l.x2 - l.x1))
    return pyMod(value, Double.pi)
  }

  /// Python's float `%` (result has the divisor's sign).
  static func pyMod(_ a: Double, _ b: Double) -> Double {
    let r = fmod(a, b)
    return (r != 0 && (r < 0) != (b < 0)) ? r + b : r
  }

  static func angleDifference(_ a: Double, _ b: Double) -> Double {
    let d = pyMod(abs(a - b), Double.pi)
    return min(d, Double.pi - d)
  }

  static func isParallel(_ a: Double, _ b: Double, _ eps: Double) -> Bool {
    angleDifference(a, b) <= eps * Double.pi / 180
  }

  static func isPerpendicular(_ a: Double, _ b: Double, _ eps: Double) -> Bool {
    abs(angleDifference(a, b) - Double.pi / 2) <= eps * Double.pi / 180
  }

  static func projectParameter(
    _ px: Double, _ py: Double, _ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double
  ) -> Double {
    let dx = x2 - x1
    let dy = y2 - y1
    let denominator = dx * dx + dy * dy
    if denominator <= 1e-12 { return 0 }
    return ((px - x1) * dx + (py - y1) * dy) / denominator
  }

  static func pointToSegment(
    _ px: Double, _ py: Double, _ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double
  ) -> Double {
    let dx = x2 - x1
    let dy = y2 - y1
    if dx == 0 && dy == 0 { return ((px - x1) * (px - x1) + (py - y1) * (py - y1)).squareRoot() }
    let t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    let qx = x1 + t * dx
    let qy = y1 + t * dy
    return ((px - qx) * (px - qx) + (py - qy) * (py - qy)).squareRoot()
  }

  static func same(_ a: Line, _ b: Line) -> Bool {
    a.x1 == b.x1 && a.y1 == b.y1 && a.x2 == b.x2 && a.y2 == b.y2
  }

  /// `prune_lines` (paper §2.2), kept in input order.
  static func pruneLines(_ lines: [Line], params: Params) -> [Line] {
    let long = lines.filter { length($0) > params.longThreshold }
    var kept: [Line] = []
    for line in lines {
      if length(line) > params.longThreshold {
        kept.append(line)
        continue
      }
      let x1 = Double(line.x1)
      let y1 = Double(line.y1)
      let x2 = Double(line.x2)
      let y2 = Double(line.y2)
      let a1 = angle(line)
      for other in long {
        let lx1 = Double(other.x1)
        let ly1 = Double(other.y1)
        let lx2 = Double(other.x2)
        let ly2 = Double(other.y2)
        let a2 = angle(other)
        let distance = min(
          pointToSegment(x1, y1, lx1, ly1, lx2, ly2), pointToSegment(x2, y2, lx1, ly1, lx2, ly2))
        if distance >= params.connectDistance { continue }
        if isParallel(a1, a2, params.angleEpsilonDegrees) {
          let t1 = projectParameter(x1, y1, lx1, ly1, lx2, ly2)
          let t2 = projectParameter(x2, y2, lx1, ly1, lx2, ly2)
          let lo = min(t1, t2)
          let hi = max(t1, t2)
          let overlap = max(0, min(hi, 1) - max(lo, 0))
          let span = max(1e-6, hi - lo)
          if overlap / span >= params.overlapRejectFraction { continue }
          kept.append(line)
          break
        }
        if isPerpendicular(a1, a2, params.angleEpsilonDegrees) {
          kept.append(line)
          break
        }
      }
    }
    return kept
  }

  /// `extrapolate_line_segments` (paper §2.3) with the paper's constants.
  static func extrapolate(_ lines: [Line], width w: Int, height h: Int) -> [Line] {
    if lines.isEmpty { return [] }
    let checkDistance = 25.0
    let nearDistance = 30.0
    let perpendicularDistance = 30.0
    let perpendicularEpsilon = 10.0
    let cutThreshold = 120.0
    var looseEnds: [(line: Line, start: (Double, Double), direction: (Double, Double))] = []
    for line in lines {
      let ll = length(line)
      if ll < 1 { continue }
      let ux = Double(line.x2 - line.x1) / ll
      let uy = Double(line.y2 - line.y1) / ll
      for endpoint in 0..<2 {
        let ex = Double(endpoint == 0 ? line.x1 : line.x2)
        let ey = Double(endpoint == 0 ? line.y1 : line.y2)
        let dx = endpoint == 0 ? -ux : ux
        let dy = endpoint == 0 ? -uy : uy
        let probeX = ex + checkDistance * dx
        let probeY = ey + checkDistance * dy
        var near = false
        for other in lines where !same(other, line) {
          if pointToSegment(
            probeX, probeY, Double(other.x1), Double(other.y1), Double(other.x2), Double(other.y2))
            < nearDistance
          {
            near = true
            break
          }
        }
        if near { continue }
        let lineAngle = angle(line)
        var cornered = false
        for other in lines where !same(other, line) {
          let d = pointToSegment(
            ex, ey, Double(other.x1), Double(other.y1), Double(other.x2), Double(other.y2))
          if d < perpendicularDistance
            && isPerpendicular(lineAngle, angle(other), perpendicularEpsilon)
          {
            cornered = true
            break
          }
        }
        if cornered { continue }
        looseEnds.append((line, (ex, ey), (dx, dy)))
      }
    }
    let maxDistance = Double(max(h, w) * 2)
    var extrapolated: [(Double, Double, Double, Double)] = []
    for end in looseEnds {
      let (sx, sy) = end.start
      let (dx, dy) = end.direction
      var hit: (Double, Double, Double)?
      var best = maxDistance
      for other in lines where !same(other, end.line) {
        let lx1 = Double(other.x1)
        let ly1 = Double(other.y1)
        let ldx = Double(other.x2 - other.x1)
        let ldy = Double(other.y2 - other.y1)
        let denominator = dx * ldy - dy * ldx
        if abs(denominator) < 1e-10 { continue }
        let t = ((lx1 - sx) * ldy - (ly1 - sy) * ldx) / denominator
        let s = ((lx1 - sx) * dy - (ly1 - sy) * dx) / denominator
        if t > 0 && s >= 0 && s <= 1 {
          let ix = sx + t * dx
          let iy = sy + t * dy
          let distance = ((ix - sx) * (ix - sx) + (iy - sy) * (iy - sy)).squareRoot()
          if distance < best {
            best = distance
            hit = (ix, iy, distance)
          }
        }
      }
      if hit == nil {
        hit = rayBoundsIntersection(
          (sx, sy), (dx, dy), width: w, height: h, maxDistance: maxDistance)
      }
      guard let (hx, hy, _) = hit else { continue }
      let ix = max(0, min(Double(w - 1), hx))
      let iy = max(0, min(Double(h - 1), hy))
      if hypot(ix - sx, iy - sy) > 1 {
        extrapolated.append((sx, sy, ix, iy))
      }
    }
    if extrapolated.isEmpty { return lines }
    var endT = [Double](repeating: 1, count: extrapolated.count)
    for i in 0..<extrapolated.count {
      let (ax1, ay1, ax2, ay2) = extrapolated[i]
      let avx = ax2 - ax1
      let avy = ay2 - ay1
      if avx * avx + avy * avy < 1e-9 { continue }
      for j in (i + 1)..<max(i + 1, extrapolated.count) {
        let (bx1, by1, bx2, by2) = extrapolated[j]
        guard
          let (px, py) = segmentIntersection(
            (ax1, ay1), (ax2, ay2), (bx1, by1), (bx2, by2))
        else { continue }
        let di = hypot(px - ax1, py - ay1)
        let dj = hypot(px - bx1, py - by1)
        let ti = projectParameter(px, py, ax1, ay1, ax2, ay2)
        let tj = projectParameter(px, py, bx1, by1, bx2, by2)
        if !(ti >= 0 && ti <= 1 && tj >= 0 && tj <= 1) { continue }
        if abs(di - dj) < cutThreshold {
          endT[i] = min(endT[i], ti)
          endT[j] = min(endT[j], tj)
        } else if di > dj {
          endT[i] = min(endT[i], ti)
        } else {
          endT[j] = min(endT[j], tj)
        }
      }
    }
    var result = lines
    for (index, segment) in extrapolated.enumerated() {
      let (sx, sy, ex, ey) = segment
      let t = max(0, min(1, endT[index]))
      let cx = sx + (ex - sx) * t
      let cy = sy + (ey - sy) * t
      if hypot(cx - sx, cy - sy) > 10 {
        result.append(
          (
            Int(sx.rounded(.toNearestOrEven)), Int(sy.rounded(.toNearestOrEven)),
            Int(cx.rounded(.toNearestOrEven)), Int(cy.rounded(.toNearestOrEven))
          ))
      }
    }
    return result
  }

  static func rayBoundsIntersection(
    _ start: (Double, Double), _ direction: (Double, Double), width w: Int, height h: Int,
    maxDistance: Double
  ) -> (Double, Double, Double)? {
    let (sx, sy) = start
    let (dx, dy) = direction
    if abs(dx) < 1e-9 && abs(dy) < 1e-9 { return nil }
    var candidates: [(Double, Double, Double)] = []
    func add(_ t: Double) {
      if t <= 0 { return }
      let ix = sx + t * dx
      let iy = sy + t * dy
      if ix >= 0 && ix <= Double(w - 1) && iy >= 0 && iy <= Double(h - 1) {
        let distance = hypot(ix - sx, iy - sy)
        if distance <= maxDistance { candidates.append((ix, iy, distance)) }
      }
    }
    if abs(dx) > 1e-9 {
      add((0 - sx) / dx)
      add((Double(w - 1) - sx) / dx)
    }
    if abs(dy) > 1e-9 {
      add((0 - sy) / dy)
      add((Double(h - 1) - sy) / dy)
    }
    // Python's stable sort by distance: first minimum wins.
    var best: (Double, Double, Double)?
    for candidate in candidates where best == nil || candidate.2 < best!.2 { best = candidate }
    return best
  }

  static func segmentIntersection(
    _ a: (Double, Double), _ b: (Double, Double), _ c: (Double, Double), _ d: (Double, Double)
  ) -> (Double, Double)? {
    let rx = b.0 - a.0
    let ry = b.1 - a.1
    let sx = d.0 - c.0
    let sy = d.1 - c.1
    let denominator = rx * sy - ry * sx
    if abs(denominator) < 1e-6 { return nil }
    let qpx = c.0 - a.0
    let qpy = c.1 - a.1
    let t = (qpx * sy - qpy * sx) / denominator
    let u = (qpx * ry - qpy * rx) / denominator
    if t >= 0 && t <= 1 && u >= 0 && u <= 1 { return (a.0 + t * rx, a.1 + t * ry) }
    return nil
  }

  /// `cv::line(img, p0, p1, 255, thickness)` (LINE_8, shift 0), after
  /// OpenCV's `drawing.cpp`: `ThickLine` fills the quad around the segment
  /// with `FillConvexPoly` (edges traced by `Line2`) and adds filled
  /// `Circle` caps of radius thickness/2 at both ends.
  static func drawThickLine(
    _ pixels: inout [UInt8], width: Int, height: Int, _ line: Line, thickness: Int
  ) {
    let xyShift = 16
    let xyOne = 1 << xyShift
    var p0 = (x: line.x1 << xyShift, y: line.y1 << xyShift)
    let p1 = (x: line.x2 << xyShift, y: line.y2 << xyShift)
    let dx = Double(p0.x - p1.x) / Double(xyOne)
    let dy = Double(p1.y - p0.y) / Double(xyOne)
    var r = dx * dx + dy * dy
    let odd = thickness & 1
    let fixedThickness = thickness << (xyShift - 1)
    if abs(r) > Double.ulpOfOne {
      r = (Double(fixedThickness) + Double(odd) * Double(xyOne) * 0.5) / r.squareRoot()
      let dpx = Int((dy * r).rounded(.toNearestOrEven))
      let dpy = Int((dx * r).rounded(.toNearestOrEven))
      let quad = [
        (x: p0.x + dpx, y: p0.y + dpy), (x: p0.x - dpx, y: p0.y - dpy),
        (x: p1.x - dpx, y: p1.y - dpy), (x: p1.x + dpx, y: p1.y + dpy),
      ]
      fillConvexPoly(&pixels, width: width, height: height, quad)
    }
    let radius = (fixedThickness + (xyOne >> 1)) >> xyShift
    for _ in 0..<2 {
      let center = ((p0.x + (xyOne >> 1)) >> xyShift, (p0.y + (xyOne >> 1)) >> xyShift)
      fillCircle(&pixels, width: width, height: height, center: center, radius: radius)
      p0 = p1
    }
  }

  @inline(__always)
  private static func horizontalLine(
    _ pixels: inout [UInt8], width: Int, row: Int, _ x1: Int, _ x2: Int
  ) {
    if x2 < x1 { return }
    let base = row * width
    for x in x1...x2 { pixels[base + x] = 255 }
  }

  /// `FillConvexPoly(img, v, npts, color, LINE_8, XY_SHIFT)`.
  private static func fillConvexPoly(
    _ pixels: inout [UInt8], width: Int, height: Int, _ v: [(x: Int, y: Int)]
  ) {
    let shift = 16
    let delta = (1 << shift) >> 1
    let delta1 = delta
    let delta2 = delta
    let n = v.count
    var p0 = v[n - 1]
    var xmin = v[0].x
    var xmax = v[0].x
    var ymin = v[0].y
    var ymax = v[0].y
    var imin = 0
    for i in 0..<n {
      let p = v[i]
      if p.y < ymin {
        ymin = p.y
        imin = i
      }
      ymax = max(ymax, p.y)
      xmax = max(xmax, p.x)
      xmin = min(xmin, p.x)
      line2(&pixels, width: width, height: height, p0, p)
      p0 = p
    }
    xmin = (xmin + delta) >> shift
    xmax = (xmax + delta) >> shift
    ymin = (ymin + delta) >> shift
    ymax = (ymax + delta) >> shift
    if n < 3 || xmax < 0 || ymax < 0 || xmin >= width || ymin >= height { return }
    ymax = min(ymax, height - 1)
    var edgeIndex = [imin, imin]
    let edgeStep = [1, n - 1]
    var edgeX = [-(1 << 16), -(1 << 16)]
    var edgeDx = [0, 0]
    var edgeEnd = [ymin, ymin]
    var edges = n
    var y = ymin
    repeat {
      for i in 0..<2 where y >= edgeEnd[i] {
        var idx0 = edgeIndex[i]
        let di = edgeStep[i]
        var idx = idx0 + di
        if idx >= n { idx -= n }
        while true {
          let proceed = edges > 0
          edges -= 1
          if !proceed { break }
          let ty = (v[idx].y + delta) >> shift
          if ty > y {
            let xs = v[idx0].x
            let xe = v[idx].x
            edgeEnd[i] = ty
            edgeDx[i] = ((xe - xs) * 2 + (ty - y)) / (2 * (ty - y))
            edgeX[i] = xs
            edgeIndex[i] = idx
            break
          }
          idx0 = idx
          idx += di
          if idx >= n { idx -= n }
        }
      }
      if edges < 0 { break }
      if y >= 0 {
        let (left, right) = edgeX[0] > edgeX[1] ? (1, 0) : (0, 1)
        var xx1 = (edgeX[left] + delta1) >> 16
        var xx2 = (edgeX[right] + delta2) >> 16
        if xx2 >= 0 && xx1 < width {
          if xx1 < 0 { xx1 = 0 }
          if xx2 >= width { xx2 = width - 1 }
          horizontalLine(&pixels, width: width, row: y, xx1, xx2)
        }
      }
      edgeX[0] += edgeDx[0]
      edgeX[1] += edgeDx[1]
      y += 1
    } while y <= ymax
  }

  /// `clipLine(Size2l, …)` on fixed-point endpoints.
  private static func clipLine(
    width: Int, height: Int, _ a: inout (x: Int, y: Int), _ b: inout (x: Int, y: Int)
  ) -> Bool {
    let right = width - 1
    let bottom = height - 1
    if width <= 0 || height <= 0 { return false }
    func code(_ x: Int, _ y: Int) -> Int {
      (x < 0 ? 1 : 0) + (x > right ? 2 : 0) + (y < 0 ? 4 : 0) + (y > bottom ? 8 : 0)
    }
    var c1 = code(a.x, a.y)
    var c2 = code(b.x, b.y)
    if (c1 & c2) == 0 && (c1 | c2) != 0 {
      if c1 & 12 != 0 {
        let edge = c1 < 8 ? 0 : bottom
        a.x += Int(Double(edge - a.y) * Double(b.x - a.x) / Double(b.y - a.y))
        a.y = edge
        c1 = (a.x < 0 ? 1 : 0) + (a.x > right ? 2 : 0)
      }
      if c2 & 12 != 0 {
        let edge = c2 < 8 ? 0 : bottom
        b.x += Int(Double(edge - b.y) * Double(b.x - a.x) / Double(b.y - a.y))
        b.y = edge
        c2 = (b.x < 0 ? 1 : 0) + (b.x > right ? 2 : 0)
      }
      if (c1 & c2) == 0 && (c1 | c2) != 0 {
        if c1 != 0 {
          let edge = c1 == 1 ? 0 : right
          a.y += Int(Double(edge - a.x) * Double(b.y - a.y) / Double(b.x - a.x))
          a.x = edge
          c1 = 0
        }
        if c2 != 0 {
          let edge = c2 == 1 ? 0 : right
          b.y += Int(Double(edge - b.x) * Double(b.y - a.y) / Double(b.x - a.x))
          b.x = edge
          c2 = 0
        }
      }
    }
    return (c1 | c2) == 0
  }

  /// `Line2`: a 1-px line between fixed-point (16.16) points.
  private static func line2(
    _ pixels: inout [UInt8], width: Int, height: Int, _ start: (x: Int, y: Int),
    _ end: (x: Int, y: Int)
  ) {
    let xyShift = 16
    let xyOne = 1 << xyShift
    var pt1 = start
    var pt2 = end
    guard clipLine(width: width << xyShift, height: height << xyShift, &pt1, &pt2) else { return }
    var dx = pt2.x - pt1.x
    var dy = pt2.y - pt1.y
    let j = dx < 0 ? -1 : 0
    let ax = (dx ^ j) - j
    let i = dy < 0 ? -1 : 0
    let ay = (dy ^ i) - i
    let xStep: Int
    let yStep: Int
    var count: Int
    if ax > ay {
      dy = (dy ^ j) - j
      if j != 0 { swap(&pt1, &pt2) }
      xStep = xyOne
      yStep = dy * (1 << xyShift) / (ax | 1)
      count = (pt2.x - pt1.x) >> xyShift
    } else {
      dx = (dx ^ i) - i
      if i != 0 { swap(&pt1, &pt2) }
      xStep = dx * (1 << xyShift) / (ay | 1)
      yStep = xyOne
      count = (pt2.y - pt1.y) >> xyShift
    }
    pt1.x += xyOne >> 1
    pt1.y += xyOne >> 1
    func put(_ x: Int, _ y: Int) {
      if x >= 0 && x < width && y >= 0 && y < height { pixels[y * width + x] = 255 }
    }
    put((pt2.x + (xyOne >> 1)) >> xyShift, (pt2.y + (xyOne >> 1)) >> xyShift)
    if ax > ay {
      pt1.x >>= xyShift
      while count >= 0 {
        put(pt1.x, pt1.y >> xyShift)
        pt1.x += 1
        pt1.y += yStep
        count -= 1
      }
    } else {
      pt1.y >>= xyShift
      while count >= 0 {
        put(pt1.x >> xyShift, pt1.y)
        pt1.x += xStep
        pt1.y += 1
        count -= 1
      }
    }
  }

  /// `Circle(img, center, radius, color, fill=1)`.
  private static func fillCircle(
    _ pixels: inout [UInt8], width: Int, height: Int, center: (Int, Int), radius: Int
  ) {
    var err = 0
    var dx = radius
    var dy = 0
    var plus = 1
    var minus = (radius << 1) - 1
    let (cx, cy) = center
    let inside = cx >= radius && cx < width - radius && cy >= radius && cy < height - radius
    while dx >= dy {
      let y11 = cy - dy
      let y12 = cy + dy
      let y21 = cy - dx
      let y22 = cy + dx
      var x11 = cx - dx
      var x12 = cx + dx
      var x21 = cx - dy
      var x22 = cx + dy
      if inside {
        horizontalLine(&pixels, width: width, row: y11, x11, x12)
        horizontalLine(&pixels, width: width, row: y12, x11, x12)
        horizontalLine(&pixels, width: width, row: y21, x21, x22)
        horizontalLine(&pixels, width: width, row: y22, x21, x22)
      } else if x11 < width && x12 >= 0 && y21 < height && y22 >= 0 {
        x11 = max(x11, 0)
        x12 = min(x12, width - 1)
        if y11 >= 0 && y11 < height { horizontalLine(&pixels, width: width, row: y11, x11, x12) }
        if y12 >= 0 && y12 < height { horizontalLine(&pixels, width: width, row: y12, x11, x12) }
        if x21 < width && x22 >= 0 {
          x21 = max(x21, 0)
          x22 = min(x22, width - 1)
          if y21 >= 0 && y21 < height { horizontalLine(&pixels, width: width, row: y21, x21, x22) }
          if y22 >= 0 && y22 < height { horizontalLine(&pixels, width: width, row: y22, x21, x22) }
        }
      }
      dy += 1
      err += plus
      plus += 2
      let mask = (err <= 0 ? 1 : 0) - 1
      err -= minus & mask
      dx += mask
      minus -= mask & 2
    }
  }

  // MARK: - Layer 1: projection XY-cut

  struct Panel {
    var x1: Int
    var y1: Int
    var x2: Int
    var y2: Int
    var children: [Panel] = []

    /// `_point_in_poly` over the closed rectangle polygon, like Python.
    func contains(_ x: Double, _ y: Double) -> Bool {
      let polygon: [(Double, Double)] = [
        (Double(x1), Double(y1)), (Double(x2), Double(y1)), (Double(x2), Double(y2)),
        (Double(x1), Double(y2)), (Double(x1), Double(y1)),
      ]
      var inside = false
      var (px0, py0) = polygon[polygon.count - 1]
      for (px1, py1) in polygon {
        if (py1 > y) != (py0 > y) && x < (px0 - px1) * (y - py1) / (py0 - py1 + 1e-9) + px1 {
          inside.toggle()
        }
        px0 = px1
        py0 = py1
      }
      return inside
    }
  }

  static func projectionSplits(
    _ projection: [Double], thresholdRatio: Double, minGap: Int, margin: Int
  ) -> [Int] {
    if projection.count < 2 * margin { return [] }
    guard let low = projection.min(), let high = projection.max(), high - low >= 1e-6 else {
      return []
    }
    let normalized = projection.map { ($0 - low) / (high - low) }
    var candidates: [Int] = []
    if margin < normalized.count - margin {
      for i in margin..<(normalized.count - margin) where normalized[i] >= thresholdRatio {
        let start = max(0, i - 5)
        let end = min(normalized.count, i + 6)
        var windowMax = -Double.infinity
        for k in start..<end { windowMax = max(windowMax, normalized[k]) }
        if normalized[i] >= windowMax - 0.01 { candidates.append(i) }
      }
    }
    var merged: [Int] = []
    var i = 0
    while i < candidates.count {
      var group = [candidates[i]]
      var j = i + 1
      while j < candidates.count && candidates[j] - candidates[j - 1] < minGap {
        group.append(candidates[j])
        j += 1
      }
      // Python max(): first of the equal maxima.
      var best = group[0]
      for candidate in group where normalized[candidate] > normalized[best] { best = candidate }
      merged.append(best)
      i = j
    }
    return merged
  }

  static func xySplit(
    _ mask: Mask, _ x1: Int, _ y1: Int, _ x2: Int, _ y2: Int, depth: Int, params: Params
  ) -> Panel {
    var region = Panel(x1: x1, y1: y1, x2: x2, y2: y2)
    let w = x2 - x1
    let h = y2 - y1
    if depth >= params.l1MaxDepth || w < params.l1MinSize || h < params.l1MinSize { return region }
    let margin = max(10, Int(Double(min(w, h)) * params.l1MarginRatio))
    var rows = [Double](repeating: 0, count: h)
    var columns = [Double](repeating: 0, count: w)
    for y in y1..<y2 {
      var sum = 0
      let base = y * mask.width
      for x in x1..<x2 {
        let value = Int(mask.pixels[base + x])
        sum += value
        columns[x - x1] += Double(value)
      }
      rows[y - y1] = Double(sum)
    }
    let horizontal = projectionSplits(
      rows, thresholdRatio: params.l1ThresholdRatio, minGap: params.l1MinGap, margin: margin)
    if !horizontal.isEmpty {
      let boundaries = [y1] + horizontal.map { y1 + $0 } + [y2]
      var children: [Panel] = []
      for index in 0..<(boundaries.count - 1) where boundaries[index + 1] - boundaries[index] >= params.l1MinSize {
        children.append(
          xySplit(mask, x1, boundaries[index], x2, boundaries[index + 1], depth: depth + 1, params: params))
      }
      if children.count >= 2 {
        region.children = children
        return region
      }
    }
    let vertical = projectionSplits(
      columns, thresholdRatio: params.l1ThresholdRatio, minGap: params.l1MinGap, margin: margin)
    if !vertical.isEmpty {
      let boundaries = [x1] + vertical.map { x1 + $0 } + [x2]
      var children: [Panel] = []
      for index in stride(from: boundaries.count - 2, through: 0, by: -1)
      where boundaries[index + 1] - boundaries[index] >= params.l1MinSize {
        children.append(
          xySplit(mask, boundaries[index], y1, boundaries[index + 1], y2, depth: depth + 1, params: params))
      }
      if children.count >= 2 {
        region.children = children
        return region
      }
    }
    return region
  }

  static func leaves(_ panel: Panel) -> [Panel] {
    panel.children.isEmpty ? [panel] : panel.children.flatMap(leaves)
  }

  // MARK: - Layers 2 and 3

  struct TextBox {
    var x1: Double
    var y1: Double
    var x2: Double
    var y2: Double
    var index: Int
    var cx: Double { (x1 + x2) / 2 }
    var cy: Double { (y1 + y2) / 2 }

    func distance(to x: Double, _ y: Double) -> Double {
      ((cx - x) * (cx - x) + (cy - y) * (cy - y)).squareRoot()
    }

    func borderDistance(to other: TextBox) -> Double {
      let dx = max(0, other.x1 - x2, x1 - other.x2)
      let dy = max(0, other.y1 - y2, y1 - other.y2)
      return hypot(dx, dy)
    }
  }

  static func optimizePoint(_ mask: Mask, _ x: Double, _ y: Double) -> (Double, Double) {
    let ix = Int(x.rounded(.toNearestOrEven))
    let iy = Int(y.rounded(.toNearestOrEven))
    var best = (ix, iy)
    var bestValue = (iy >= 0 && iy < mask.height && ix >= 0 && ix < mask.width) ? Int(mask.at(ix, iy)) : 255
    var bestD2 = 0
    for dy in -30...30 {
      for dx in -30...30 {
        let ny = iy + dy
        let nx = ix + dx
        guard ny >= 0, ny < mask.height, nx >= 0, nx < mask.width else { continue }
        let value = Int(mask.at(nx, ny))
        let d2 = dx * dx + dy * dy
        if value < bestValue || (value == bestValue && d2 < bestD2) {
          bestValue = value
          bestD2 = d2
          best = (nx, ny)
        }
      }
    }
    return (Double(best.0), Double(best.1))
  }

  static func canConnect(
    _ mask: Mask, _ p1: (Double, Double), _ p2: (Double, Double), threshold: Double
  ) -> Bool {
    let x1 = Int(p1.0)
    let y1 = Int(p1.1)
    let x2 = Int(p2.0)
    let y2 = Int(p2.1)
    let samples = max(abs(x2 - x1), abs(y2 - y1), 1)
    for i in 0...samples {
      let t = Double(i) / Double(samples)
      let x = Int(Double(x1) + t * Double(x2 - x1))
      let y = Int(Double(y1) + t * Double(y2 - y1))
      if y >= 0 && y < mask.height && x >= 0 && x < mask.width && Double(mask.at(x, y)) > threshold {
        return false
      }
    }
    return true
  }

  static func rayCast(
    _ mask: Mask, _ cx: Double, _ cy: Double, rays: Int, maxDistance: Double, threshold: Double
  ) -> [(Double, Double)] {
    var endpoints: [(Double, Double)] = []
    for i in 0..<rays {
      let angle = 2 * Double.pi * Double(i) / Double(rays)
      let dx = cos(angle)
      let dy = sin(angle)
      var ended = false
      if Int(maxDistance) > 1 {
        for distance in 1..<Int(maxDistance) {
          let x = Int(cx + Double(distance) * dx)
          let y = Int(cy + Double(distance) * dy)
          if !(y >= 0 && y < mask.height && x >= 0 && x < mask.width) {
            ended = true
            break
          }
          if Double(mask.at(x, y)) > threshold {
            endpoints.append((Double(x), Double(y)))
            ended = true
            break
          }
        }
      }
      if !ended {
        let x = max(0, min(mask.width - 1, Int(cx + maxDistance * dx)))
        let y = max(0, min(mask.height - 1, Int(cy + maxDistance * dy)))
        endpoints.append((Double(x), Double(y)))
      }
    }
    return endpoints
  }

  /// Centre of `cv::minAreaRect`: convex hull + the minimum-area rectangle
  /// aligned with a hull edge.
  static func minAreaRectCenter(_ points: [(Double, Double)]) -> (Double, Double) {
    if points.isEmpty { return (0, 0) }
    let sorted = points.sorted { $0.0 < $1.0 || ($0.0 == $1.0 && $0.1 < $1.1) }
    var unique: [(Double, Double)] = []
    for p in sorted where unique.last.map({ $0.0 != p.0 || $0.1 != p.1 }) ?? true {
      unique.append(p)
    }
    if unique.count == 1 { return unique[0] }
    func cross(_ o: (Double, Double), _ a: (Double, Double), _ b: (Double, Double)) -> Double {
      (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
    }
    var lower: [(Double, Double)] = []
    for p in unique {
      while lower.count >= 2 && cross(lower[lower.count - 2], lower[lower.count - 1], p) <= 0 {
        lower.removeLast()
      }
      lower.append(p)
    }
    var upper: [(Double, Double)] = []
    for p in unique.reversed() {
      while upper.count >= 2 && cross(upper[upper.count - 2], upper[upper.count - 1], p) <= 0 {
        upper.removeLast()
      }
      upper.append(p)
    }
    let hull = Array(lower.dropLast()) + Array(upper.dropLast())
    if hull.count < 3 {
      let a = hull.first ?? unique[0]
      let b = hull.last ?? unique[unique.count - 1]
      return ((a.0 + b.0) / 2, (a.1 + b.1) / 2)
    }
    var bestArea = Double.infinity
    var bestCenter = (0.0, 0.0)
    for i in 0..<hull.count {
      let p = hull[i]
      let q = hull[(i + 1) % hull.count]
      let ex = q.0 - p.0
      let ey = q.1 - p.1
      let length = (ex * ex + ey * ey).squareRoot()
      if length == 0 { continue }
      let ux = ex / length
      let uy = ey / length
      var minU = Double.infinity
      var maxU = -Double.infinity
      var minV = Double.infinity
      var maxV = -Double.infinity
      for point in hull {
        let u = (point.0 - p.0) * ux + (point.1 - p.1) * uy
        let v = -(point.0 - p.0) * uy + (point.1 - p.1) * ux
        minU = min(minU, u)
        maxU = max(maxU, u)
        minV = min(minV, v)
        maxV = max(maxV, v)
      }
      let area = (maxU - minU) * (maxV - minV)
      if area < bestArea - 1e-9 {
        bestArea = area
        let cu = (minU + maxU) / 2
        let cv = (minV + maxV) / 2
        bestCenter = (p.0 + cu * ux - cv * uy, p.1 + cu * uy + cv * ux)
      }
    }
    return bestCenter
  }

  static func groups(
    _ boxes: [TextBox], mask: Mask, panel: Panel, params: Params
  ) -> [[TextBox]] {
    let inside = boxes.filter { panel.contains($0.cx, $0.cy) }
    if inside.isEmpty { return [] }
    if inside.count == 1 { return [inside] }
    let centers = inside.map { optimizePoint(mask, $0.cx, $0.cy) }
    let n = inside.count
    var connected = [[Bool]](repeating: [Bool](repeating: false, count: n), count: n)
    for i in 0..<n {
      for j in (i + 1)..<n
      where canConnect(mask, centers[i], centers[j], threshold: params.l2ConnectThreshold) {
        connected[i][j] = true
        connected[j][i] = true
      }
    }
    var visited = [Bool](repeating: false, count: n)
    var result: [[TextBox]] = []
    for start in 0..<n where !visited[start] {
      var group: [TextBox] = []
      var queue = [start]
      visited[start] = true
      var head = 0
      while head < queue.count {
        let current = queue[head]
        head += 1
        group.append(inside[current])
        for next in 0..<n where !visited[next] && connected[current][next] {
          visited[next] = true
          queue.append(next)
        }
      }
      result.append(group)
    }
    return result
  }

  static func orderGroups(
    _ groups: [[TextBox]], mask: Mask, cornerX: Double, cornerY: Double, params: Params
  ) -> [[TextBox]] {
    if groups.count <= 1 { return groups }
    var entries: [(x: Double, y: Double, group: [TextBox])] = groups.map { group in
      let cx = group.reduce(0) { $0 + $1.cx } / Double(group.count)
      let cy = group.reduce(0) { $0 + $1.cy } / Double(group.count)
      let endpoints = rayCast(
        mask, cx, cy, rays: params.l2Rays, maxDistance: params.l2RayMaxDistance,
        threshold: params.l2RayThreshold)
      let center = minAreaRectCenter(endpoints)
      return (center.0, center.1, group)
    }
    func corner(_ e: (x: Double, y: Double, group: [TextBox])) -> Double {
      ((e.x - cornerX) * (e.x - cornerX) + (e.y - cornerY) * (e.y - cornerY)).squareRoot()
    }
    var maxCorner = entries.map(corner).max() ?? 0
    if maxCorner == 0 { maxCorner = 1 }
    // Python list.sort is stable.
    entries = entries.enumerated().sorted {
      let a = corner($0.element)
      let b = corner($1.element)
      return a < b || (a == b && $0.offset < $1.offset)
    }.map(\.element)
    var ordered: [[TextBox]] = []
    let first = entries.removeFirst()
    ordered.append(first.group)
    var previous = (first.x, first.y)
    let weight = params.layer2Weight
    while !entries.isEmpty {
      var maxPrevious = entries.map { hypot($0.x - previous.0, $0.y - previous.1) }.max() ?? 0
      if maxPrevious == 0 { maxPrevious = 1 }
      var bestScore = Double.infinity
      var bestIndex = 0
      for (index, entry) in entries.enumerated() {
        let da = corner(entry) / maxCorner
        let db =
          ((entry.x - previous.0) * (entry.x - previous.0) + (entry.y - previous.1)
            * (entry.y - previous.1)).squareRoot() / maxPrevious
        let score = weight * da + (1 - weight) * db
        if score < bestScore {
          bestScore = score
          bestIndex = index
        }
      }
      let chosen = entries.remove(at: bestIndex)
      ordered.append(chosen.group)
      previous = (chosen.x, chosen.y)
    }
    return ordered
  }

  static func orderWeightedNearest(
    _ boxes: [TextBox], cornerX: Double, cornerY: Double, weight: Double
  ) -> [TextBox] {
    if boxes.count <= 1 { return boxes }
    var maxCorner = boxes.map { $0.distance(to: cornerX, cornerY) }.max() ?? 0
    if maxCorner == 0 { maxCorner = 1 }
    var remaining = boxes.enumerated().sorted {
      let a = $0.element.distance(to: cornerX, cornerY)
      let b = $1.element.distance(to: cornerX, cornerY)
      return a < b || (a == b && $0.offset < $1.offset)
    }.map(\.element)
    var ordered = [remaining.removeFirst()]
    while !remaining.isEmpty {
      let previous = ordered[ordered.count - 1]
      var maxPrevious = remaining.map { $0.borderDistance(to: previous) }.max() ?? 0
      if maxPrevious == 0 { maxPrevious = 1 }
      var bestScore = Double.infinity
      var bestIndex = 0
      for (index, box) in remaining.enumerated() {
        let da = box.distance(to: cornerX, cornerY) / maxCorner
        let db = box.borderDistance(to: previous) / maxPrevious
        let score = weight * da + (1 - weight) * db
        if score < bestScore {
          bestScore = score
          bestIndex = index
        }
      }
      ordered.append(remaining.remove(at: bestIndex))
    }
    return ordered
  }

  /// `estimate_text_order_from_panel_mask`.
  static func orderFromMask(
    boxes input: [Box], mask: Mask, params: Params, stages: UnsafeMutablePointer<Stages>?
  ) -> [Int] {
    let scale = mask.scale
    let boxes = input.enumerated().map { index, box in
      TextBox(
        x1: box.x1 * scale, y1: box.y1 * scale, x2: box.x2 * scale, y2: box.y2 * scale, index: index)
    }
    let root = xySplit(mask, 0, 0, mask.width, mask.height, depth: 0, params: params)
    let panels = leaves(root)
    stages?.pointee.panels = panels.map { ($0.x1, $0.y1, $0.x2, $0.y2) }
    var final: [TextBox] = []
    for panel in panels {
      let cornerX = Double(panel.x2)
      let cornerY = Double(panel.y1)
      let found = groups(boxes, mask: mask, panel: panel, params: params)
      if found.isEmpty { continue }
      for group in orderGroups(found, mask: mask, cornerX: cornerX, cornerY: cornerY, params: params) {
        final.append(
          contentsOf: orderWeightedNearest(
            group, cornerX: cornerX, cornerY: cornerY, weight: params.layer3Weight))
      }
    }
    let assigned = Set(final.map(\.index))
    let unassigned = boxes.filter { !assigned.contains($0.index) }.enumerated().sorted {
      let a = $0.element
      let b = $1.element
      if a.cy != b.cy { return a.cy < b.cy }
      if a.cx != b.cx { return -a.cx < -b.cx }
      return $0.offset < $1.offset
    }.map(\.element)
    final.append(contentsOf: unassigned)
    return final.map(\.index)
  }

  /// `estimate_text_order_simple`: weighted nearest neighbour from the
  /// top-right of the text itself (no image).
  static func simpleOrder(_ input: [Box]) -> [Int] {
    let boxes = input.enumerated().map { index, box in
      TextBox(x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, index: index)
    }
    guard let maxX = boxes.map(\.x2).max(), let minY = boxes.map(\.y1).min() else { return [] }
    return orderWeightedNearest(boxes, cornerX: maxX, cornerY: minY, weight: 0.4).map(\.index)
  }
}

extension NemuGrayImage {
  /// OpenCV `cvtColor(BGR2GRAY)` luma (the plane `text_order.py` reads):
  /// Y = (4899·R + 9617·G + 1868·B + 2^13) >> 14.
  static func openCVGray(rgba: [UInt8], width: Int, height: Int) -> NemuGrayImage {
    var gray = [UInt8](repeating: 0, count: width * height)
    for index in 0..<(width * height) {
      let r = UInt32(rgba[index * 4])
      let g = UInt32(rgba[index * 4 + 1])
      let b = UInt32(rgba[index * 4 + 2])
      gray[index] = UInt8((r * 4899 + g * 9617 + b * 1868 + 8192) >> 14)
    }
    return NemuGrayImage(width: width, height: height, pixels: gray)
  }
}
