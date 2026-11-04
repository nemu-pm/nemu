import Foundation

/**
 * `NemuZoomId.canonical` against the vectors `canonicalZoomId` (JS) is
 * tested with: one id, one spelling, on both sides of the bridge.
 * Build: swiftc ios/NemuZoomId.swift iosTest/NemuZoomIdTests.swift -o /tmp/zoomid && /tmp/zoomid
 */
@main
enum NemuZoomIdTests {
  struct Vector: Decodable { let raw: String; let canonical: String }

  static func main() throws {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent("zoomIdVectors.json")
    let vectors = try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
    precondition(!vectors.isEmpty)
    for vector in vectors {
      let got = NemuZoomId.canonical(vector.raw)
      precondition(got == vector.canonical, "\(vector.raw): \(got) != \(vector.canonical)")
      precondition(NemuZoomId.canonical(got) == got, "not idempotent: \(vector.raw)")
    }
    print("NemuZoomIdTests passed (\(vectors.count) vectors)")
  }
}
