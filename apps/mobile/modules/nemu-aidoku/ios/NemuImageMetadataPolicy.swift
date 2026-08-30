import Foundation
import ImageIO

struct NemuImageDimensions: Equatable {
  let width: Int64
  let height: Int64
}

struct NemuImageDimensionPolicy: Equatable {
  let maxDimension: Int
  let maxPixels: Int
}

private struct NemuImageMetadataPolicyError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

/** Metadata-only allocation boundary for untrusted downloaded images. */
enum NemuImageMetadataPolicy {
  static let hardMaxDimension = 16_384
  static let hardMaxPixels = 8 * 1_024 * 1_024

  private static let allowedTypeIdentifiers: Set<String> = [
    "com.compuserve.gif",
    "org.webmproject.webp",
    "public.avif",
    "public.heic",
    "public.heif",
    "public.jpeg",
    "public.png",
  ]

  static func requestedPolicy(
    maxDimension: Int?,
    maxPixels: Int?
  ) throws -> NemuImageDimensionPolicy? {
    if maxDimension == nil, maxPixels == nil { return nil }
    guard
      let maxDimension,
      let maxPixels,
      (1...hardMaxDimension).contains(maxDimension),
      (1...hardMaxPixels).contains(maxPixels)
    else {
      throw failure("Invalid native image dimension safety limit.")
    }
    return NemuImageDimensionPolicy(
      maxDimension: maxDimension,
      maxPixels: maxPixels
    )
  }

  static func validateFile(
    _ url: URL,
    policy: NemuImageDimensionPolicy
  ) throws -> NemuImageDimensions {
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions) else {
      throw failure("Unsupported or malformed image header.")
    }
    guard
      let typeIdentifier = CGImageSourceGetType(source) as String?,
      allowedTypeIdentifiers.contains(typeIdentifier.lowercased())
    else {
      throw failure("Unsupported image container.")
    }

    // ImageIO parses container metadata lazily. Requiring exactly one image
    // fails closed on GIF/WebP/AVIF/HEIF animation sequences without caching
    // or decoding any native pixel surface.
    guard CGImageSourceGetCount(source) == 1 else {
      throw failure("Animated or multi-image containers are not supported safely.")
    }
    guard
      let properties = CGImageSourceCopyPropertiesAtIndex(
        source,
        0,
        sourceOptions
      ) as? [CFString: Any],
      let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.int64Value,
      let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.int64Value
    else {
      throw failure("Image dimensions could not be determined safely.")
    }
    return try validateDimensions(width: width, height: height, policy: policy)
  }

  static func validateDimensions(
    width: Int64,
    height: Int64,
    policy: NemuImageDimensionPolicy
  ) throws -> NemuImageDimensions {
    let (pixelCount, overflow) = width.multipliedReportingOverflow(by: height)
    guard
      width > 0,
      height > 0,
      width <= Int64(policy.maxDimension),
      height <= Int64(policy.maxDimension),
      !overflow,
      pixelCount > 0,
      pixelCount <= Int64(policy.maxPixels)
    else {
      throw failure(
        "Image dimensions exceed the \(policy.maxDimension)px / " +
          "\(policy.maxPixels) pixel safety limit."
      )
    }
    return NemuImageDimensions(width: width, height: height)
  }

  private static func failure(_ message: String) -> NemuImageMetadataPolicyError {
    NemuImageMetadataPolicyError(message: message)
  }
}
