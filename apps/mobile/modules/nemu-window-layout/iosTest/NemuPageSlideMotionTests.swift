import CoreGraphics
import Foundation

/** The slide's Photos-style paging: strides, resting frames and the drags past either end. */
@main
enum NemuPageSlideMotionTests {
  static func main() {
    framesSitSideBySideWithAGap()
    aRestingOffsetNamesItsFrame()
    onlyAPullPastAnEndAsksForAnotherChapter()
    print("NemuPageSlideMotionTests passed (paging)")
  }

  static func framesSitSideBySideWithAGap() {
    let width: CGFloat = 402
    let gap = NemuPageSlidePaging.gap
    precondition(gap > 0 && gap <= 20)
    precondition(NemuPageSlidePaging.stride(width: width) == width + gap)
    precondition(NemuPageSlidePaging.offset(frame: 0, width: width) == 0)
    precondition(NemuPageSlidePaging.offset(frame: 3, width: width) == 3 * (width + gap))
    precondition(NemuPageSlidePaging.contentWidth(frameCount: 4, width: width) == 4 * (width + gap))
  }

  static func aRestingOffsetNamesItsFrame() {
    let width: CGFloat = 402
    let s = NemuPageSlidePaging.stride(width: width)
    precondition(NemuPageSlidePaging.frame(atOffset: 2 * s, width: width, frameCount: 5) == 2)
    precondition(NemuPageSlidePaging.frame(atOffset: 2 * s + s * 0.4, width: width, frameCount: 5) == 2)
    precondition(NemuPageSlidePaging.frame(atOffset: 2 * s + s * 0.6, width: width, frameCount: 5) == 3)
    // Rubber-banded past either end: the end frame.
    precondition(NemuPageSlidePaging.frame(atOffset: -80, width: width, frameCount: 5) == 0)
    precondition(NemuPageSlidePaging.frame(atOffset: 9 * s, width: width, frameCount: 5) == 4)
    precondition(NemuPageSlidePaging.frame(atOffset: 100, width: width, frameCount: 0) == 0)
  }

  static func onlyAPullPastAnEndAsksForAnotherChapter() {
    let width: CGFloat = 402
    let last = NemuPageSlidePaging.offset(frame: 4, width: width)
    precondition(NemuPageSlidePaging.edgeDrag(offset: -60, width: width, frameCount: 5) == "before")
    precondition(NemuPageSlidePaging.edgeDrag(offset: last + 60, width: width, frameCount: 5) == "after")
    // A small bounce, or anywhere inside the strip: nothing.
    precondition(NemuPageSlidePaging.edgeDrag(offset: -20, width: width, frameCount: 5) == nil)
    precondition(NemuPageSlidePaging.edgeDrag(offset: last + 20, width: width, frameCount: 5) == nil)
    precondition(NemuPageSlidePaging.edgeDrag(offset: last / 2, width: width, frameCount: 5) == nil)
    // One frame: both ends are the same page.
    precondition(NemuPageSlidePaging.edgeDrag(offset: 60, width: width, frameCount: 1) == "after")
  }
}
