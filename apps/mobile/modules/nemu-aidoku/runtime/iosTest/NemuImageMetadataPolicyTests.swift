import Foundation

@main
enum NemuImageMetadataPolicyTests {
  static func main() throws {
    let policy = NemuImageDimensionPolicy(
      maxDimension: NemuImageMetadataPolicy.hardMaxDimension,
      maxPixels: NemuImageMetadataPolicy.hardMaxPixels
    )
    let requestedPolicy = try NemuImageMetadataPolicy.requestedPolicy(
      maxDimension: 16_384,
      maxPixels: 8 * 1_024 * 1_024
    )
    precondition(requestedPolicy == policy)
    let boundaryDimensions = try NemuImageMetadataPolicy.validateDimensions(
      width: 16_384,
      height: 512,
      policy: policy
    )
    precondition(boundaryDimensions == NemuImageDimensions(width: 16_384, height: 512))
    expectFailure("oversized side") {
      _ = try NemuImageMetadataPolicy.validateDimensions(
        width: 16_385,
        height: 1,
        policy: policy
      )
    }
    expectFailure("oversized pixel count") {
      _ = try NemuImageMetadataPolicy.validateDimensions(
        width: 4_096,
        height: 4_096,
        policy: policy
      )
    }
    expectFailure("incomplete policy") {
      _ = try NemuImageMetadataPolicy.requestedPolicy(
        maxDimension: 16_384,
        maxPixels: nil
      )
    }

    let temporaryDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("nemu-image-policy-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(
      at: temporaryDirectory,
      withIntermediateDirectories: true
    )
    defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

    let safePng = temporaryDirectory.appendingPathComponent("safe.png")
    try png(width: 1, height: 1).write(to: safePng)
    let safeDimensions = try NemuImageMetadataPolicy.validateFile(
      safePng,
      policy: policy
    )
    precondition(safeDimensions == NemuImageDimensions(width: 1, height: 1))

    let oversizedPng = temporaryDirectory.appendingPathComponent("oversized.png")
    try png(width: 16_385, height: 1).write(to: oversizedPng)
    expectFailure("crafted oversized PNG header", containing: "safety limit") {
      _ = try NemuImageMetadataPolicy.validateFile(oversizedPng, policy: policy)
    }

    let animatedGif = temporaryDirectory.appendingPathComponent("animated.gif")
    try gif(frameCount: 2).write(to: animatedGif)
    expectFailure("animated GIF", containing: "Animated") {
      _ = try NemuImageMetadataPolicy.validateFile(animatedGif, policy: policy)
    }
  }

  private static func expectFailure(
    _ label: String,
    containing expectedMessage: String? = nil,
    _ operation: () throws -> Void
  ) {
    do {
      try operation()
      preconditionFailure("Expected failure: \(label)")
    } catch {
      if let expectedMessage {
        precondition(
          error.localizedDescription.contains(expectedMessage),
          "Unexpected failure for \(label): \(error.localizedDescription)"
        )
      }
    }
  }

  private static func png(width: UInt32, height: UInt32) -> Data {
    // A complete 1x1 PNG is used only as a container skeleton. ImageIO reads
    // IHDR metadata with caching disabled, so mutating the declared dimensions
    // exercises the pre-decode boundary without allocating that pixel surface.
    var bytes = Array(
      Data(base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      )!
    )
    writeBe32(width, to: &bytes, at: 16)
    writeBe32(height, to: &bytes, at: 20)
    writeBe32(crc32(bytes[12..<29]), to: &bytes, at: 29)
    return Data(bytes)
  }

  private static func gif(frameCount: Int) -> Data {
    var bytes: [UInt8] = [
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
      0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
      0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
    ]
    for _ in 0..<frameCount {
      bytes += [
        0x2c,
        0x00, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00,
        0x00,
        0x02, 0x02, 0x44, 0x01, 0x00,
      ]
    }
    bytes.append(0x3b)
    return Data(bytes)
  }

  private static func writeBe32(
    _ value: UInt32,
    to bytes: inout [UInt8],
    at offset: Int
  ) {
    bytes[offset] = UInt8((value >> 24) & 0xff)
    bytes[offset + 1] = UInt8((value >> 16) & 0xff)
    bytes[offset + 2] = UInt8((value >> 8) & 0xff)
    bytes[offset + 3] = UInt8(value & 0xff)
  }

  private static func crc32(_ bytes: ArraySlice<UInt8>) -> UInt32 {
    var crc = UInt32.max
    for byte in bytes {
      crc ^= UInt32(byte)
      for _ in 0..<8 {
        crc = (crc & 1) == 1
          ? (crc >> 1) ^ 0xedb8_8320
          : crc >> 1
      }
    }
    return crc ^ UInt32.max
  }
}
