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

private struct NemuIOSLongStripError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

/**
 * iOS counterpart to Android's bounded long-strip path. Core Image keeps the
 * source lazy, and CIContext renders one explicitly cropped <=2 MiPixel tile
 * at a time. No full-strip CGImage or bitmap is ever materialized.
 */
enum NemuIOSLongStripImageTranscoder {
  static let manifestReserveBytes: Int64 = 64 * 1_024
  private static let maxEncodedBytes: Int64 = 32 * 1_024 * 1_024
  private static let maxLongSide: Int64 = 65_535
  private static let maxShortSide: Int64 = 2_048
  private static let maxInputPixels: Int64 = 64 * 1_024 * 1_024
  private static let targetTilePixels: Int64 = 2 * 1_024 * 1_024
  private static let maxSegments = 32
  private static let maxDurationNanos: UInt64 = 120 * 1_000_000_000
  private static let permit = DispatchSemaphore(value: 1)
  private static let context = CIContext(options: [
    .cacheIntermediates: false,
    .useSoftwareRenderer: true,
  ])

  static func transcodeSegments(
    source: URL,
    outputDirectory: URL,
    policy: NemuImageDimensionPolicy,
    maximumOutputBytes: Int64,
    isCancelled: () -> Bool
  ) throws -> NemuIOSLongStripSegmentResult {
    guard maximumOutputBytes > 0 else {
      throw failure("Invalid image output byte limit.")
    }
    let now = DispatchTime.now().uptimeNanoseconds
    let (deadline, overflow) = now.addingReportingOverflow(maxDurationNanos)
    guard !overflow else { throw failure("Invalid long-strip transcode deadline.") }
    while permit.wait(timeout: .now() + .milliseconds(50)) != .success {
      try ensureActive(isCancelled: isCancelled, deadline: deadline)
    }
    defer { permit.signal() }
    try ensureActive(isCancelled: isCancelled, deadline: deadline)

    let attributes = try FileManager.default.attributesOfItem(atPath: source.path)
    guard
      let encodedBytes = (attributes[.size] as? NSNumber)?.int64Value,
      encodedBytes > 0,
      encodedBytes <= min(maximumOutputBytes + manifestReserveBytes, maxEncodedBytes)
    else {
      throw failure("Long-strip image exceeds the encoded byte safety limit.")
    }

    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, sourceOptions) else {
      throw failure("Unsupported or malformed long-strip image header.")
    }
    guard CGImageSourceGetCount(imageSource) == 1 else {
      throw failure("Animated or multi-image long strips are not supported safely.")
    }
    guard
      let typeIdentifier = CGImageSourceGetType(imageSource) as String?,
      let format = format(for: typeIdentifier)
    else {
      throw failure("Long-strip transcoding supports only static PNG and JPEG images.")
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
      throw failure("Long-strip image dimensions could not be determined safely.")
    }
    let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.int32Value ?? 1
    guard (1...8).contains(orientation) else {
      throw failure("Long-strip image has an invalid EXIF orientation.")
    }
    let swapsAxes = (5...8).contains(orientation)
    let width = swapsAxes ? encodedHeight : encodedWidth
    let height = swapsAxes ? encodedWidth : encodedHeight
    let dimensions = NemuImageDimensions(width: width, height: height)
    let pixels = try checkedPixels(dimensions)
    guard
      height > width,
      height <= maxLongSide,
      width <= maxShortSide,
      pixels <= maxInputPixels,
      height >= width * 8,
      width > Int64(policy.maxDimension) ||
        height > Int64(policy.maxDimension) ||
        pixels > Int64(policy.maxPixels)
    else {
      throw failure("Image is outside the bounded portrait long-strip safety envelope.")
    }

    let maximumRows = min(targetTilePixels / width, Int64(policy.maxDimension))
    guard maximumRows > 0 else {
      throw failure("Segmented image cannot satisfy its tile target.")
    }
    let segmentCount = Int((height + maximumRows - 1) / maximumRows)
    guard (1...maxSegments).contains(segmentCount) else {
      throw failure("Segmented image exceeds the tile count safety limit.")
    }

    guard let rawImage = CIImage(
      contentsOf: source,
      options: [.applyOrientationProperty: false]
    ) else {
      throw failure("iOS could not initialize the long-strip image.")
    }
    let oriented = rawImage.oriented(forExifOrientation: orientation)
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
      try encode(cgImage, to: staged, format: format)
      let tileAttributes = try FileManager.default.attributesOfItem(atPath: staged.path)
      guard
        let tileBytes = (tileAttributes[.size] as? NSNumber)?.int64Value,
        tileBytes > 0,
        tileBytes <= maximumOutputBytes - aggregateBytes
      else {
        throw failure("Segmented image exceeds the aggregate encoded byte safety limit.")
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
    format: OutputFormat
  ) throws {
    guard let destination = CGImageDestinationCreateWithURL(
      url as CFURL,
      format.typeIdentifier,
      1,
      nil
    ) else {
      throw failure("iOS could not create a long-strip tile encoder.")
    }
    let properties: CFDictionary? = format == .jpeg
      ? [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary
      : nil
    CGImageDestinationAddImage(destination, image, properties)
    guard CGImageDestinationFinalize(destination) else {
      throw failure("iOS could not encode a long-strip tile.")
    }
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

  private static func ensureActive(
    isCancelled: () -> Bool,
    deadline: UInt64
  ) throws {
    if isCancelled() { throw failure("Request cancelled.") }
    if DispatchTime.now().uptimeNanoseconds >= deadline {
      throw failure("Long-strip image processing timed out.")
    }
  }

  private static func failure(_ message: String) -> NemuIOSLongStripError {
    NemuIOSLongStripError(message: message)
  }
}
