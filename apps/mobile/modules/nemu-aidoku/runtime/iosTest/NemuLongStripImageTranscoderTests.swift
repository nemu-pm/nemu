import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
enum NemuLongStripImageTranscoderTests {
  static func main() throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("nemu-ios-long-strip-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    defer { try? FileManager.default.removeItem(at: directory) }

    let source = directory.appendingPathComponent("portrait.png")
    try writePng(width: 16, height: 256, to: source)
    let policy = NemuImageDimensionPolicy(maxDimension: 64, maxPixels: 1_024)
    let result = try NemuIOSLongStripImageTranscoder.transcodeSegments(
      source: source,
      outputDirectory: directory,
      policy: policy,
      maximumOutputBytes: 2 * 1_024 * 1_024,
      isCancelled: { false }
    )
    precondition(result.dimensions == NemuImageDimensions(width: 16, height: 256))
    precondition(result.segments.count == 4)
    precondition(result.segments.reduce(0) { $0 + $1.dimensions.height } == 256)
    precondition(result.segments.allSatisfy {
      $0.dimensions == NemuImageDimensions(width: 16, height: 64) &&
        $0.byteLength > 0 &&
        $0.fileURL.lastPathComponent.hasPrefix("nemu-http-output-segment-")
    })
    precondition(result.byteLength == result.segments.reduce(0) { $0 + $1.byteLength })

    expectFailure("cancelled transcode", containing: "cancelled") {
      _ = try NemuIOSLongStripImageTranscoder.transcodeSegments(
        source: source,
        outputDirectory: directory,
        policy: policy,
        maximumOutputBytes: 2 * 1_024 * 1_024,
        isCancelled: { true }
      )
    }

    let landscape = directory.appendingPathComponent("landscape.png")
    try writePng(width: 256, height: 16, to: landscape)
    expectFailure("landscape strip", containing: "portrait") {
      _ = try NemuIOSLongStripImageTranscoder.transcodeSegments(
        source: landscape,
        outputDirectory: directory,
        policy: policy,
        maximumOutputBytes: 2 * 1_024 * 1_024,
        isCancelled: { false }
      )
    }

    try encodeBudgetTests()
    try adaptiveQualityTests(directory: directory)
    try downscaleTests(directory: directory)
  }

  private static func encodeBudgetTests() throws {
    // The pixel share of what remains; the final tile may use all of it.
    precondition(NemuLongStripEncodeBudget.tileShare(
      remainingBytes: 1_000,
      tilePixels: 25,
      remainingPixels: 100
    ) == 250)
    precondition(NemuLongStripEncodeBudget.tileShare(
      remainingBytes: 1_000,
      tilePixels: 100,
      remainingPixels: 100
    ) == 1_000)
    precondition(NemuLongStripEncodeBudget.tileShare(
      remainingBytes: 0,
      tilePixels: 1,
      remainingPixels: 2
    ) == 0)
    precondition(NemuLongStripEncodeBudget.nextQualityIndex(
      after: 0,
      bytes: 10,
      share: 10
    ) == nil)
    precondition(NemuLongStripEncodeBudget.nextQualityIndex(
      after: 0,
      bytes: 11,
      share: 10
    ) == 1)
    let last = NemuLongStripEncodeBudget.jpegQualities.count - 1
    precondition(NemuLongStripEncodeBudget.nextQualityIndex(
      after: last,
      bytes: 11,
      share: 10
    ) == nil)

    // The observed Raw FREE chapter strip and an oversized ordinary page.
    let policy = NemuImageDimensionPolicy(maxDimension: 16_384, maxPixels: 8 * 1_024 * 1_024)
    let strip = NemuImageDimensions(width: 1_360, height: 46_080)
    precondition(NemuIOSLongStripImageTranscoder.isSegmentCandidate(strip))
    let size1 = try NemuIOSLongStripImageTranscoder.downscaledMaxPixelSize(
      for: strip,
      policy: policy
    )
    precondition(size1 == 16_384)
    // 62.7 MiPixel decodes at 1/4 (3.9 MiPixel), never at full resolution.
    let size2 = try NemuIOSLongStripImageTranscoder.decodedMaxPixelSize(
      for: strip,
      policy: policy
    )
    precondition(size2 == 11_520)
    let page = NemuImageDimensions(width: 4_000, height: 6_000)
    precondition(!NemuIOSLongStripImageTranscoder.isSegmentCandidate(page))
    let size3 = try NemuIOSLongStripImageTranscoder.decodedMaxPixelSize(
      for: page,
      policy: policy
    )
    precondition(size3 == 3_000)
    // Already within the pixel budget: only the side limit applies.
    let size4 = try NemuIOSLongStripImageTranscoder.decodedMaxPixelSize(
      for: NemuImageDimensions(width: 300, height: 20_000),
      policy: policy
    )
    precondition(size4 == 16_384)
    precondition(!NemuIOSLongStripImageTranscoder.isSegmentCandidate(
      NemuImageDimensions(width: 2_049, height: 40_000)
    ))
  }

  private static func adaptiveQualityTests(directory: URL) throws {
    // Noise barely compresses, so a fixed q0.92 re-encode overruns a budget
    // the ladder can still meet.
    let source = directory.appendingPathComponent("noise.jpg")
    try writeNoise(width: 64, height: 1_024, type: .jpeg, to: source)
    let policy = NemuImageDimensionPolicy(maxDimension: 256, maxPixels: 16_384)
    let generous = try NemuIOSLongStripImageTranscoder.transcodeSegments(
      source: source,
      outputDirectory: directory,
      policy: policy,
      maximumOutputBytes: 8 * 1_024 * 1_024,
      isCancelled: { false }
    )
    precondition(generous.segments.count == 4)
    let budget = generous.byteLength * 3 / 4
    let squeezed = try NemuIOSLongStripImageTranscoder.transcodeSegments(
      source: source,
      outputDirectory: directory,
      policy: policy,
      maximumOutputBytes: budget,
      isCancelled: { false }
    )
    precondition(squeezed.byteLength <= budget)
    precondition(squeezed.segments.count == 4)
    precondition(squeezed.segments.reduce(0) { $0 + $1.dimensions.height } == 1_024)
    precondition(squeezed.segments.allSatisfy { $0.mimeType == "image/jpeg" })

    // PNG has no ladder: incompressible tiles over budget are a typed
    // budget failure the caller may answer with a downscale.
    let png = directory.appendingPathComponent("noise.png")
    try writeNoise(width: 64, height: 1_024, type: .png, to: png)
    let pngBytes = Int64(try FileManager.default.attributesOfItem(atPath: png.path)[.size] as! Int)
    do {
      _ = try NemuIOSLongStripImageTranscoder.transcodeSegments(
        source: png,
        outputDirectory: directory,
        policy: policy,
        maximumOutputBytes: pngBytes - 32 * 1_024,
        isCancelled: { false }
      )
      preconditionFailure("Expected an output-limit failure")
    } catch let error as NemuIOSLongStripError {
      precondition(
        error.kind == .outputLimit && error.allowsSingleImageFallback,
        "Unexpected failure: \(error.message)"
      )
    }
    let leftovers = try FileManager.default.contentsOfDirectory(atPath: directory.path)
      .filter { $0.hasPrefix("nemu-http-stage-") }
    precondition(leftovers.isEmpty, "Staged tiles must not outlive a failure")
  }

  private static func downscaleTests(directory: URL) throws {
    let policy = NemuImageDimensionPolicy(maxDimension: 512, maxPixels: 65_536)
    // Any aspect ratio: a tall strip, a wide spread, an oversized page.
    for (width, height) in [(300, 2_000), (2_000, 300), (600, 800)] {
      let source = directory.appendingPathComponent("big-\(width)x\(height).jpg")
      try writeNoise(width: width, height: height, type: .jpeg, to: source)
      do {
        _ = try NemuImageMetadataPolicy.validateFile(source, policy: policy)
        preconditionFailure("Fixture must exceed the policy")
      } catch is NemuImageDimensionLimitError {}
      let result = try NemuIOSLongStripImageTranscoder.transcodeSingle(
        source: source,
        outputDirectory: directory,
        policy: policy,
        maximumOutputBytes: 4 * 1_024 * 1_024,
        isCancelled: { false }
      )
      precondition(result.dimensions.width <= 512 && result.dimensions.height <= 512)
      precondition(result.dimensions.width * result.dimensions.height <= 65_536)
      // Shape is kept within a pixel of rounding.
      let sourceRatio = Double(width) / Double(height)
      let outputRatio = Double(result.dimensions.width) / Double(result.dimensions.height)
      precondition(abs(sourceRatio - outputRatio) / sourceRatio < 0.05)
      precondition(result.mimeType == "image/jpeg")
      precondition(result.fileURL.lastPathComponent.hasPrefix("nemu-http-output-"))
      _ = try NemuImageMetadataPolicy.validateFile(result.fileURL, policy: policy)
    }

    // A well-formed oversized image is a limit failure; nonsense is not.
    do {
      _ = try NemuImageMetadataPolicy.validateDimensions(width: 1_000, height: 1_000, policy: policy)
      preconditionFailure("Expected a dimension limit failure")
    } catch is NemuImageDimensionLimitError {}
    do {
      _ = try NemuImageMetadataPolicy.validateDimensions(width: 0, height: 10, policy: policy)
      preconditionFailure("Expected an invalid dimension failure")
    } catch is NemuImageDimensionLimitError {
      preconditionFailure("Invalid dimensions must not read as merely oversized")
    } catch {}
  }

  private static func writeNoise(width: Int, height: Int, type: UTType, to url: URL) throws {
    var generator = SystemRandomNumberGenerator()
    var pixels = [UInt8](repeating: 255, count: width * height * 4)
    for index in stride(from: 0, to: pixels.count, by: 4) {
      pixels[index] = UInt8.random(in: 0...255, using: &generator)
      pixels[index + 1] = UInt8.random(in: 0...255, using: &generator)
      pixels[index + 2] = UInt8.random(in: 0...255, using: &generator)
    }
    let image: CGImage? = pixels.withUnsafeMutableBytes { buffer in
      CGContext(
        data: buffer.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
      )?.makeImage()
    }
    guard
      let image,
      let destination = CGImageDestinationCreateWithURL(
        url as CFURL,
        type.identifier as CFString,
        1,
        nil
      )
    else { preconditionFailure("Could not create noise fixture") }
    // Encoded like a source page, so a re-encode at the ladder's top rung is
    // about the source's own size.
    CGImageDestinationAddImage(
      destination,
      image,
      [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary
    )
    precondition(CGImageDestinationFinalize(destination))
  }

  private static func writePng(width: Int, height: Int, to url: URL) throws {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard
      let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )
    else { preconditionFailure("Could not create fixture context") }
    context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    guard
      let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(
        url as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
      )
    else { preconditionFailure("Could not create fixture image") }
    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination))
  }

  private static func expectFailure(
    _ label: String,
    containing expectedMessage: String,
    _ operation: () throws -> Void
  ) {
    do {
      try operation()
      preconditionFailure("Expected failure: \(label)")
    } catch {
      precondition(
        error.localizedDescription.lowercased().contains(
          expectedMessage.lowercased()
        ),
        "Unexpected failure for \(label): \(error.localizedDescription)"
      )
    }
  }
}
