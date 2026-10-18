import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct NemuIOSLongStripSegment: Sendable {
  let fileURL: URL
  let byteLength: Int64
  let dimensions: NemuImageDimensions
  let mimeType: String
}

struct NemuIOSLongStripSegmentResult: Sendable {
  let segments: [NemuIOSLongStripSegment]
  let byteLength: Int64
  let dimensions: NemuImageDimensions
}

struct NemuIOSDownscaledImageResult: Sendable {
  let fileURL: URL
  let byteLength: Int64
  let dimensions: NemuImageDimensions
  let mimeType: String
}

struct NemuIOSLongStripError: LocalizedError {
  enum Kind {
    /// The image does not have segmentable strip geometry.
    case ineligible
    /// Every tile was rendered but the encoded strip cannot fit its budget.
    case outputLimit
    /// Corrupt, cancelled, timed out, or otherwise unsafe: never retried.
    case failure
  }

  let kind: Kind
  let message: String
  var errorDescription: String? { message }

  /// A segmented attempt that failed this way may still be shown downscaled.
  var allowsSingleImageFallback: Bool { kind != .failure }
}

/**
 * Pure byte-budget arithmetic shared by every tile of one strip. Re-encoding a
 * strip's tiles at a fixed high JPEG quality can be 2.5x the source's own
 * bytes (a 10 MB 1360 x 46,080 chapter strip encoded to 25 MB at 0.92), so
 * each tile steps down a quality ladder until it fits its pixel share of the
 * bytes that remain.
 */
enum NemuLongStripEncodeBudget {
  static let jpegQualities: [Double] = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56]

  /// Bytes one tile may use so the tiles after it still get a proportional
  /// share of what remains. The last tile may use everything left.
  static func tileShare(
    remainingBytes: Int64,
    tilePixels: Int64,
    remainingPixels: Int64
  ) -> Int64 {
    guard remainingBytes > 0, tilePixels > 0, remainingPixels >= tilePixels else {
      return 0
    }
    if tilePixels == remainingPixels { return remainingBytes }
    // remainingBytes is bounded by the 20 MiB cache entry and the pixel counts
    // by 64 MiPixel, so the product cannot overflow Int64.
    return remainingBytes * tilePixels / remainingPixels
  }

  /// The next quality to try after an encode of `bytes` missed `share`, or
  /// nil when the attempt must be accepted (it fits, or no lower rung) .
  static func nextQualityIndex(after index: Int, bytes: Int64, share: Int64) -> Int? {
    guard bytes > share, index + 1 < jpegQualities.count else { return nil }
    return index + 1
  }
}

/**
 * iOS counterpart to Android's bounded long-strip path. Core Image keeps the
 * source lazy, and CIContext renders one explicitly cropped <=2 MiPixel tile
 * at a time. No full-strip CGImage or bitmap is ever materialized.
 */
enum NemuIOSLongStripImageTranscoder {
  static let manifestReserveBytes: Int64 = 64 * 1_024
  private static let maxEncodedBytes: Int64 = 32 * 1_024 * 1_024
  static let maxLongSide: Int64 = 65_535
  static let maxShortSide: Int64 = 2_048
  static let maxInputPixels: Int64 = 64 * 1_024 * 1_024
  static let minAspectRatio: Int64 = 8
  private static let targetTilePixels: Int64 = 2 * 1_024 * 1_024
  private static let maxSegments = 32
  private static let maxDurationNanos: UInt64 = 120 * 1_000_000_000
  private static let permit = DispatchSemaphore(value: 1)
  private static let context = CIContext(options: [
    .cacheIntermediates: false,
    .useSoftwareRenderer: true,
  ])

  /// One deadline per downloaded source, shared by a segmented attempt and
  /// its downscaled fallback so a late failure cannot restart the clock.
  static func newDeadline() -> UInt64 {
    let (deadline, overflow) = DispatchTime.now().uptimeNanoseconds
      .addingReportingOverflow(maxDurationNanos)
    return overflow ? UInt64.max : deadline
  }

  /// Portrait comic-strip geometry that keeps its source width as tiles.
  static func isSegmentCandidate(_ dimensions: NemuImageDimensions) -> Bool {
    dimensions.width > 0 &&
      dimensions.height > dimensions.width &&
      dimensions.height <= maxLongSide &&
      dimensions.width <= maxShortSide &&
      dimensions.height >= dimensions.width * minAspectRatio
  }

  static func transcodeSegments(
    source: URL,
    outputDirectory: URL,
    policy: NemuImageDimensionPolicy,
    maximumOutputBytes: Int64,
    deadline: UInt64 = newDeadline(),
    isCancelled: () -> Bool
  ) throws -> NemuIOSLongStripSegmentResult {
    guard maximumOutputBytes > 0 else {
      throw failure("Invalid image output byte limit.")
    }
    try acquirePermit(isCancelled: isCancelled, deadline: deadline)
    defer { permit.signal() }
    try ensureActive(isCancelled: isCancelled, deadline: deadline)

    let inspected = try inspect(
      source,
      maximumEncodedBytes: min(maximumOutputBytes + manifestReserveBytes, maxEncodedBytes)
    )
    guard let format = inspected.format else {
      throw failure(
        "Long-strip transcoding supports only static PNG and JPEG images.",
        kind: .ineligible
      )
    }
    let dimensions = inspected.dimensions
    let width = dimensions.width
    let height = dimensions.height
    let pixels = try checkedPixels(dimensions)
    guard
      isSegmentCandidate(dimensions),
      pixels <= maxInputPixels
    else {
      if height <= width {
        throw failure("Only portrait long strips can use segmented output.", kind: .ineligible)
      }
      throw failure(
        "Image is outside the bounded portrait long-strip safety envelope.",
        kind: .ineligible
      )
    }
    guard
      width > Int64(policy.maxDimension) ||
        height > Int64(policy.maxDimension) ||
        pixels > Int64(policy.maxPixels)
    else {
      throw failure("Image does not require bounded long-strip transcoding.", kind: .ineligible)
    }

    let maximumRows = min(targetTilePixels / width, Int64(policy.maxDimension))
    guard maximumRows > 0 else {
      throw failure("Segmented image cannot satisfy its tile target.", kind: .ineligible)
    }
    let segmentCount = Int((height + maximumRows - 1) / maximumRows)
    guard (1...maxSegments).contains(segmentCount) else {
      throw failure("Segmented image exceeds the tile count safety limit.", kind: .ineligible)
    }

    guard let rawImage = CIImage(
      contentsOf: source,
      options: [.applyOrientationProperty: false]
    ) else {
      throw failure("iOS could not initialize the long-strip image.")
    }
    let oriented = rawImage.oriented(forExifOrientation: inspected.orientation)
    let normalized = oriented.transformed(
      by: CGAffineTransform(
        translationX: -oriented.extent.minX,
        y: -oriented.extent.minY
      )
    )
    guard
      Int64(normalized.extent.width.rounded()) == width,
      Int64(normalized.extent.height.rounded()) == height
    else {
      throw failure("Decoded image dimensions disagree with inspected metadata.")
    }

    var stagedURLs: [URL] = []
    var publishedURLs: [URL] = []
    var segments: [NemuIOSLongStripSegment] = []
    var aggregateBytes: Int64 = 0
    var displayedStart: Int64 = 0
    // Sticky: a strip whose early tiles needed a lower quality keeps it, so
    // tiles do not visibly alternate in sharpness.
    var qualityIndex = 0
    var succeeded = false
    defer {
      for url in stagedURLs { try? FileManager.default.removeItem(at: url) }
      if !succeeded {
        for url in publishedURLs { try? FileManager.default.removeItem(at: url) }
      }
    }

    for index in 0..<segmentCount {
      try ensureActive(isCancelled: isCancelled, deadline: deadline)
      let tileHeight = min(maximumRows, height - displayedStart)
      let tileDimensions = NemuImageDimensions(width: width, height: tileHeight)
      let tilePixels = try checkedPixels(tileDimensions)
      guard
        width <= Int64(policy.maxDimension),
        tileHeight <= Int64(policy.maxDimension),
        tilePixels <= Int64(policy.maxPixels),
        tilePixels <= targetTilePixels
      else {
        throw failure("Segmented image tile exceeds the requested image policy.")
      }

      // Core Image uses a bottom-left origin; manifests and the reader are
      // top-to-bottom, so consume source rows from the upper edge first.
      let crop = CGRect(
        x: 0,
        y: CGFloat(height - displayedStart - tileHeight),
        width: CGFloat(width),
        height: CGFloat(tileHeight)
      )
      guard let cgImage = context.createCGImage(normalized, from: crop) else {
        throw failure("iOS could not render a bounded long-strip tile.")
      }
      try ensureActive(isCancelled: isCancelled, deadline: deadline)

      let suffix = String(format: "%02d", index)
      let stamp = DispatchTime.now().uptimeNanoseconds
      let staged = outputDirectory.appendingPathComponent(
        "nemu-http-stage-segment-\(suffix)-\(stamp).part"
      )
      let published = outputDirectory.appendingPathComponent(
        "nemu-http-output-segment-\(suffix)-\(stamp).part"
      )
      stagedURLs.append(staged)
      let remainingBytes = maximumOutputBytes - aggregateBytes
      let share = NemuLongStripEncodeBudget.tileShare(
        remainingBytes: remainingBytes,
        tilePixels: tilePixels,
        remainingPixels: pixels - displayedStart * width
      )
      var tileBytes: Int64
      while true {
        try encode(
          cgImage,
          to: staged,
          format: format,
          quality: NemuLongStripEncodeBudget.jpegQualities[qualityIndex]
        )
        tileBytes = try byteLength(of: staged)
        guard
          format == .jpeg,
          let next = NemuLongStripEncodeBudget.nextQualityIndex(
            after: qualityIndex,
            bytes: tileBytes,
            share: share
          )
        else { break }
        qualityIndex = next
        try ensureActive(isCancelled: isCancelled, deadline: deadline)
      }
      guard tileBytes > 0, tileBytes <= remainingBytes else {
        throw failure(
          "Segmented image exceeds the aggregate encoded byte safety limit.",
          kind: .outputLimit
        )
      }
      _ = try NemuImageMetadataPolicy.validateFile(staged, policy: policy)
      try ensureActive(isCancelled: isCancelled, deadline: deadline)
      try FileManager.default.moveItem(at: staged, to: published)
      publishedURLs.append(published)
      aggregateBytes += tileBytes
      segments.append(NemuIOSLongStripSegment(
        fileURL: published,
        byteLength: tileBytes,
        dimensions: tileDimensions,
        mimeType: format.mimeType
      ))
      displayedStart += tileHeight
    }

    guard
      displayedStart == height,
      segments.count == segmentCount,
      aggregateBytes > 0,
      aggregateBytes <= maximumOutputBytes
    else {
      throw failure("Segmented image failed aggregate publication checks.")
    }
    succeeded = true
    return NemuIOSLongStripSegmentResult(
      segments: segments,
      byteLength: aggregateBytes,
      dimensions: dimensions
    )
  }

  /**
   * Any static image beyond the decode policy, at any aspect ratio, as one
   * image that satisfies it. ImageIO's thumbnail path decodes straight into the
   * reduced size (JPEG scales during the DCT), and the requested size keeps
   * that decode within the policy's own pixel budget, so the full-resolution
   * bitmap is never materialized (a 1360 x 46,080 strip: 74 MB peak instead
   * of 185 MB at the largest compliant size).
   */
  static func transcodeSingle(
    source: URL,
    outputDirectory: URL,
    policy: NemuImageDimensionPolicy,
    maximumOutputBytes: Int64,
    deadline: UInt64 = newDeadline(),
    isCancelled: () -> Bool
  ) throws -> NemuIOSDownscaledImageResult {
    guard maximumOutputBytes > 0 else {
      throw failure("Invalid image output byte limit.")
    }
    try acquirePermit(isCancelled: isCancelled, deadline: deadline)
    defer { permit.signal() }
    try ensureActive(isCancelled: isCancelled, deadline: deadline)

    let inspected = try inspect(
      source,
      maximumEncodedBytes: min(maximumOutputBytes, maxEncodedBytes)
    )
    let dimensions = inspected.dimensions
    let pixels = try checkedPixels(dimensions)
    guard
      max(dimensions.width, dimensions.height) <= maxLongSide,
      pixels <= maxInputPixels
    else {
      throw failure("Image is outside the bounded downscale safety envelope.")
    }
    var maxPixelSize = try decodedMaxPixelSize(for: dimensions, policy: policy)

    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, sourceOptions) else {
      throw failure("Unsupported or malformed image header.")
    }
    var thumbnail: CGImage?
    // The decoder rounds the short side; a rounding that lands one pixel
    // past the policy is retried one pixel smaller.
    for _ in 0..<4 {
      try ensureActive(isCancelled: isCancelled, deadline: deadline)
      let options = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
      ] as CFDictionary
      guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options) else {
        throw failure("iOS could not decode a downscaled image.")
      }
      let fits = (try? NemuImageMetadataPolicy.validateDimensions(
        width: Int64(image.width),
        height: Int64(image.height),
        policy: policy
      )) != nil
      if fits {
        thumbnail = image
        break
      }
      maxPixelSize -= 1
    }
    guard let thumbnail else {
      throw failure("Could not derive safe downscaled image dimensions.")
    }
    try ensureActive(isCancelled: isCancelled, deadline: deadline)

    // PNG stays PNG; anything else keeps JPEG unless it carries alpha.
    let hasAlpha: Bool
    switch thumbnail.alphaInfo {
    case .none, .noneSkipFirst, .noneSkipLast: hasAlpha = false
    default: hasAlpha = true
    }
    let format: OutputFormat =
      inspected.format == .png || (inspected.format != .jpeg && hasAlpha) ? .png : .jpeg
    let stamp = DispatchTime.now().uptimeNanoseconds
    let staged = outputDirectory.appendingPathComponent("nemu-http-stage-\(stamp).part")
    let published = outputDirectory.appendingPathComponent("nemu-http-output-\(stamp).part")
    var publishedSuccessfully = false
    defer {
      try? FileManager.default.removeItem(at: staged)
      if !publishedSuccessfully { try? FileManager.default.removeItem(at: published) }
    }
    var qualityIndex = 0
    var bytes: Int64
    while true {
      try encode(
        thumbnail,
        to: staged,
        format: format,
        quality: NemuLongStripEncodeBudget.jpegQualities[qualityIndex]
      )
      bytes = try byteLength(of: staged)
      guard
        format == .jpeg,
        let next = NemuLongStripEncodeBudget.nextQualityIndex(
          after: qualityIndex,
          bytes: bytes,
          share: maximumOutputBytes
        )
      else { break }
      qualityIndex = next
      try ensureActive(isCancelled: isCancelled, deadline: deadline)
    }
    guard bytes > 0, bytes <= maximumOutputBytes else {
      throw failure("Downscaled image exceeds the encoded byte safety limit.", kind: .outputLimit)
    }
    let outputDimensions = try NemuImageMetadataPolicy.validateFile(staged, policy: policy)
    try ensureActive(isCancelled: isCancelled, deadline: deadline)
    try FileManager.default.moveItem(at: staged, to: published)
    publishedSuccessfully = true
    return NemuIOSDownscaledImageResult(
      fileURL: published,
      byteLength: bytes,
      dimensions: outputDimensions,
      mimeType: format.mimeType
    )
  }

  /// The longest side ImageIO may produce so both the side and the pixel
  /// limit hold, never upscaling.
  static func downscaledMaxPixelSize(
    for dimensions: NemuImageDimensions,
    policy: NemuImageDimensionPolicy
  ) throws -> Int {
    let pixels = try checkedPixels(dimensions)
    let longSide = Double(max(dimensions.width, dimensions.height))
    let scale = min(
      1.0,
      Double(policy.maxDimension) / longSide,
      (Double(policy.maxPixels) / Double(pixels)).squareRoot()
    )
    let size = Int((longSide * scale).rounded(.down))
    guard size >= 1 else {
      throw failure("Could not derive safe downscaled image dimensions.")
    }
    return min(size, policy.maxDimension)
  }

  /**
   * The size to ask ImageIO for: the largest compliant size, but no larger
   * than the source scaled by the smallest power of two (the steps a JPEG
   * decoder scales in) that brings it within the policy's pixel budget. The
   * decode then never holds more than that budget at once.
   */
  static func decodedMaxPixelSize(
    for dimensions: NemuImageDimensions,
    policy: NemuImageDimensionPolicy
  ) throws -> Int {
    let target = try downscaledMaxPixelSize(for: dimensions, policy: policy)
    let pixels = try checkedPixels(dimensions)
    var factor: Int64 = 1
    while factor < 8, pixels / (factor * factor) > Int64(policy.maxPixels) {
      factor *= 2
    }
    let longSide = max(dimensions.width, dimensions.height)
    return max(1, min(target, Int(longSide / factor)))
  }

  private struct InspectedImage {
    let dimensions: NemuImageDimensions
    let orientation: Int32
    /// nil for a static container ImageIO decodes but tiles never re-encode.
    let format: OutputFormat?
  }

  private static func inspect(
    _ source: URL,
    maximumEncodedBytes: Int64
  ) throws -> InspectedImage {
    let encodedBytes = try byteLength(of: source)
    guard encodedBytes > 0, encodedBytes <= maximumEncodedBytes else {
      throw failure("Image exceeds the encoded byte safety limit.")
    }
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, sourceOptions) else {
      throw failure("Unsupported or malformed image header.")
    }
    guard CGImageSourceGetCount(imageSource) == 1 else {
      throw failure("Animated or multi-image images are not supported safely.")
    }
    guard
      let typeIdentifier = CGImageSourceGetType(imageSource) as String?,
      NemuImageMetadataPolicy.isAllowedStaticType(typeIdentifier)
    else {
      throw failure("Unsupported image container.")
    }
    guard
      let properties = CGImageSourceCopyPropertiesAtIndex(
        imageSource,
        0,
        sourceOptions
      ) as? [CFString: Any],
      let encodedWidth = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.int64Value,
      let encodedHeight = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.int64Value
    else {
      throw failure("Image dimensions could not be determined safely.")
    }
    let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.int32Value ?? 1
    guard (1...8).contains(orientation) else {
      throw failure("Image has an invalid EXIF orientation.")
    }
    let swapsAxes = (5...8).contains(orientation)
    return InspectedImage(
      dimensions: NemuImageDimensions(
        width: swapsAxes ? encodedHeight : encodedWidth,
        height: swapsAxes ? encodedWidth : encodedHeight
      ),
      orientation: orientation,
      format: format(for: typeIdentifier)
    )
  }

  private enum OutputFormat {
    case jpeg
    case png

    var typeIdentifier: CFString {
      switch self {
      case .jpeg: return UTType.jpeg.identifier as CFString
      case .png: return UTType.png.identifier as CFString
      }
    }

    var mimeType: String {
      switch self {
      case .jpeg: return "image/jpeg"
      case .png: return "image/png"
      }
    }
  }

  private static func format(for typeIdentifier: String) -> OutputFormat? {
    switch typeIdentifier.lowercased() {
    case UTType.jpeg.identifier.lowercased(), "public.jpeg": return .jpeg
    case UTType.png.identifier.lowercased(), "public.png": return .png
    default: return nil
    }
  }

  private static func encode(
    _ image: CGImage,
    to url: URL,
    format: OutputFormat,
    quality: Double
  ) throws {
    try? FileManager.default.removeItem(at: url)
    guard let destination = CGImageDestinationCreateWithURL(
      url as CFURL,
      format.typeIdentifier,
      1,
      nil
    ) else {
      throw failure("iOS could not create an image encoder.")
    }
    let properties: CFDictionary? = format == .jpeg
      ? [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
      : nil
    CGImageDestinationAddImage(destination, image, properties)
    guard CGImageDestinationFinalize(destination) else {
      throw failure("iOS could not encode a transcoded image.")
    }
  }

  private static func byteLength(of url: URL) throws -> Int64 {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard let bytes = (attributes[.size] as? NSNumber)?.int64Value else {
      throw failure("Could not measure a transcoded image.")
    }
    return bytes
  }

  private static func checkedPixels(_ dimensions: NemuImageDimensions) throws -> Int64 {
    let (pixels, overflow) = dimensions.width.multipliedReportingOverflow(
      by: dimensions.height
    )
    guard dimensions.width > 0, dimensions.height > 0, !overflow, pixels > 0 else {
      throw failure("Invalid image dimensions.")
    }
    return pixels
  }

  private static func acquirePermit(
    isCancelled: () -> Bool,
    deadline: UInt64
  ) throws {
    while permit.wait(timeout: .now() + .milliseconds(50)) != .success {
      try ensureActive(isCancelled: isCancelled, deadline: deadline)
    }
  }

  private static func ensureActive(
    isCancelled: () -> Bool,
    deadline: UInt64
  ) throws {
    if isCancelled() { throw failure("Request cancelled.") }
    if DispatchTime.now().uptimeNanoseconds >= deadline {
      throw failure("Long-strip image processing timed out.")
    }
  }

  private static func failure(
    _ message: String,
    kind: NemuIOSLongStripError.Kind = .failure
  ) -> NemuIOSLongStripError {
    NemuIOSLongStripError(kind: kind, message: message)
  }
}
