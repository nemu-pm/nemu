import Foundation

/**
 * One spelling per cover-zoom id: the native side of `canonicalZoomId`
 * (src/zoomId.ts), the same rule, checked against the same
 * `zoomIdVectors.json`. Every id the zoom registry stores or looks up goes
 * through it, so a source and a target that spell one id differently
 * (`%2F` against `/`) still meet.
 *
 * Percent-decode while the id still holds a `%XX` escape and decodes cleanly
 * (each round shortens it, so this ends); an id that does not decode is kept
 * as it is. Idempotent.
 */
enum NemuZoomId {
  static func canonical(_ id: String) -> String {
    var value = id
    while value.range(of: "%[0-9a-fA-F]{2}", options: .regularExpression) != nil {
      guard let next = value.removingPercentEncoding, next != value else { break }
      value = next
    }
    return value
  }
}
