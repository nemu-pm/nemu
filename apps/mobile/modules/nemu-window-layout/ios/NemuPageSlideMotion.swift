// The slide's paging (Photos-style). The file keeps its name so the Pods project and CI need no change.
import CoreGraphics
import Foundation

/**
 * The slide's paging, as Photos pages: the frames (a page, or a spread) side
 * by side in a paging scroll view, a small gap between them in the page
 * background. The scroll view is one gap wider than the pager, so a page at
 * rest fills the pager and its gap sits just past the pager's edge.
 */
enum NemuPageSlidePaging {
  /** Between two frames (Photos-like). */
  static let gap: CGFloat = 10
  /** Pulled this far past the first or last frame and let go: the chapter before or after. */
  static let edgeDragDistance: CGFloat = 40

  /** One page of the scroll view: a frame and its gap. */
  static func stride(width: CGFloat) -> CGFloat { max(0, width) + gap }

  static func offset(frame: Int, width: CGFloat) -> CGFloat {
    CGFloat(max(0, frame)) * stride(width: width)
  }

  static func contentWidth(frameCount: Int, width: CGFloat) -> CGFloat {
    CGFloat(max(0, frameCount)) * stride(width: width)
  }

  /** The frame a resting (or nearly resting) offset shows. */
  static func frame(atOffset offset: CGFloat, width: CGFloat, frameCount: Int) -> Int {
    guard frameCount > 0 else { return 0 }
    let s = stride(width: width)
    guard s > 0 else { return 0 }
    return max(0, min(frameCount - 1, Int((offset / s).rounded())))
  }

  /**
   * A drag let go past either end (rubber-banding): "before" past the first
   * frame (the left end), "after" past the last (the right end), as the
   * curl's edge drag; nil inside the strip.
   */
  static func edgeDrag(offset: CGFloat, width: CGFloat, frameCount: Int) -> String? {
    guard frameCount > 0 else { return nil }
    let last = Self.offset(frame: frameCount - 1, width: width)
    if offset < -edgeDragDistance { return "before" }
    if offset > last + edgeDragDistance { return "after" }
    return nil
  }
}
