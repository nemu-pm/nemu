import CoreGraphics
import Foundation

/** The push page turn's Photos-style paging: strides, resting frames and the drags past either end. */
@main
enum NemuPagePushPagingTests {
  static func main() {
    framesSitSideBySideWithAGap()
    aRestingOffsetNamesItsFrame()
    onlyAPullPastAnEndAsksForAnotherChapter()
    print("NemuPagePushPagingTests passed")
  }

  static func framesSitSideBySideWithAGap() {
    let width: CGFloat = 402
    let gap = NemuPagePushPaging.gap
    precondition(gap > 0 && gap <= 20)
    precondition(NemuPagePushPaging.stride(width: width) == width + gap)
    precondition(NemuPagePushPaging.offset(frame: 0, width: width) == 0)
    precondition(NemuPagePushPaging.offset(frame: 3, width: width) == 3 * (width + gap))
    precondition(NemuPagePushPaging.contentWidth(frameCount: 4, width: width) == 4 * (width + gap))
  }

  static func aRestingOffsetNamesItsFrame() {
    let width: CGFloat = 402
    let s = NemuPagePushPaging.stride(width: width)
    precondition(NemuPagePushPaging.frame(atOffset: 2 * s, width: width, frameCount: 5) == 2)
    precondition(NemuPagePushPaging.frame(atOffset: 2 * s + s * 0.4, width: width, frameCount: 5) == 2)
    precondition(NemuPagePushPaging.frame(atOffset: 2 * s + s * 0.6, width: width, frameCount: 5) == 3)
    // Rubber-banded past either end: the end frame.
    precondition(NemuPagePushPaging.frame(atOffset: -80, width: width, frameCount: 5) == 0)
    precondition(NemuPagePushPaging.frame(atOffset: 9 * s, width: width, frameCount: 5) == 4)
    precondition(NemuPagePushPaging.frame(atOffset: 100, width: width, frameCount: 0) == 0)
  }

  static func onlyAPullPastAnEndAsksForAnotherChapter() {
    let width: CGFloat = 402
    let last = NemuPagePushPaging.offset(frame: 4, width: width)
    precondition(NemuPagePushPaging.edgeDrag(offset: -60, width: width, frameCount: 5) == "before")
    precondition(NemuPagePushPaging.edgeDrag(offset: last + 60, width: width, frameCount: 5) == "after")
    // A small bounce, or anywhere inside the strip: nothing.
    precondition(NemuPagePushPaging.edgeDrag(offset: -20, width: width, frameCount: 5) == nil)
    precondition(NemuPagePushPaging.edgeDrag(offset: last + 20, width: width, frameCount: 5) == nil)
    precondition(NemuPagePushPaging.edgeDrag(offset: last / 2, width: width, frameCount: 5) == nil)
    // One frame: both ends are the same page.
    precondition(NemuPagePushPaging.edgeDrag(offset: 60, width: width, frameCount: 1) == "after")
  }
}
