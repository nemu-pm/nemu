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
