import CoreGraphics
import Foundation

/**
 * The slide turn's motion (`NemuPageSlideMotion`): which page is on top, where
 * both sheets are mid-turn, and how a release decides.
 */
@main
enum NemuPageSlideMotionTests {
  static func main() {
    theEarlierPageIsOnTop()
    theTopPageFollowsTheFinger()
    thePageBeneathOnlyDrifts()
    restingPosesShowOnePage()
    reduceMotionCrossFades()
    releasesDecideByDistanceAndVelocity()
    dragsAskForTheNeighbourOnTheirSide()
    print("NemuPageSlideMotionTests passed")
  }

  static func close(_ a: CGFloat, _ b: CGFloat) -> Bool { abs(a - b) < 0.001 }

  static func theEarlierPageIsOnTop() {
    // Left-to-right: the left frame is the earlier page; manga reverses the row.
    precondition(NemuPageSlideMotion.lowerOnTop(rtl: false))
    precondition(!NemuPageSlideMotion.lowerOnTop(rtl: true))
  }

  static func theTopPageFollowsTheFinger() {
    let width: CGFloat = 400
    // Left-to-right, turning on from frame 3 to 4: the finger moves left
    // 100 pt, the page on top (frame 3, `lower`) moves left 100 pt.
    let p = NemuPageSlideMotion.progress(from: 0, translation: -100, width: width)
    precondition(close(p, 0.25))
    var pose = NemuPageSlideMotion.pose(progress: p, width: width, rtl: false, reduceMotion: false)
    precondition(pose.lowerOnTop && close(pose.lowerX, -100))
    // Manga, turning on from frame 4 (`upper`, on top) to 3: the finger moves
    // right and the page on top moves right with it.
    let q = NemuPageSlideMotion.progress(from: 1, translation: 100, width: width)
    pose = NemuPageSlideMotion.pose(progress: q, width: width, rtl: true, reduceMotion: false)
    precondition(!pose.lowerOnTop && close(pose.upperX, 100))
    // Turning back in a left-to-right book: the previous page (frame 3, on
    // top) comes in from the left as the finger moves right.
    let back = NemuPageSlideMotion.progress(from: 1, translation: 100, width: width)
    pose = NemuPageSlideMotion.pose(progress: back, width: width, rtl: false, reduceMotion: false)
    precondition(close(pose.lowerX, -300))
  }

  static func thePageBeneathOnlyDrifts() {
    let width: CGFloat = 400
    let half = NemuPageSlideMotion.pose(progress: 0.5, width: width, rtl: false, reduceMotion: false)
    // Half uncovered: half of its 8% drift left, and half of the dim.
    precondition(close(half.upperX, NemuPageSlideMotion.parallax * 0.5 * width))
    precondition(close(half.dim, NemuPageSlideMotion.dimmest * 0.5))
    precondition(close(half.shadow, 1))
    let manga = NemuPageSlideMotion.pose(progress: 0.5, width: width, rtl: true, reduceMotion: false)
    precondition(close(manga.lowerX, -NemuPageSlideMotion.parallax * 0.5 * width))
  }

  static func restingPosesShowOnePage() {
    let width: CGFloat = 400
    // Resting on the top page: it covers the stage, no shadow inside it.
    var pose = NemuPageSlideMotion.pose(progress: 0, width: width, rtl: false, reduceMotion: false)
    precondition(close(pose.lowerX, 0) && close(pose.dim, NemuPageSlideMotion.dimmest))
    // Turned: the top page is gone and its shadow faded, the page beneath at rest.
    pose = NemuPageSlideMotion.pose(progress: 1, width: width, rtl: false, reduceMotion: false)
    precondition(close(pose.lowerX, -width) && close(pose.upperX, 0) && close(pose.shadow, 0) && close(pose.dim, 0))
    pose = NemuPageSlideMotion.pose(progress: 0, width: width, rtl: true, reduceMotion: false)
    precondition(close(pose.upperX, width) && close(pose.lowerX, 0) && close(pose.shadow, 0))
  }

  static func reduceMotionCrossFades() {
    let pose = NemuPageSlideMotion.pose(progress: 0.25, width: 400, rtl: false, reduceMotion: true)
    precondition(close(pose.lowerX, 0) && close(pose.upperX, 0))
    precondition(close(pose.lowerAlpha, 0.75) && close(pose.upperAlpha, 1))
    precondition(close(pose.shadow, 0) && close(pose.dim, 0))
    let manga = NemuPageSlideMotion.pose(progress: 0.25, width: 400, rtl: true, reduceMotion: true)
    precondition(close(manga.upperAlpha, 0.25) && close(manga.lowerAlpha, 1))
  }

  static func releasesDecideByDistanceAndVelocity() {
    let width: CGFloat = 400
    precondition(NemuPageSlideMotion.completes(moved: 0.6, velocity: 0, width: width))
    precondition(!NemuPageSlideMotion.completes(moved: 0.3, velocity: 0, width: width))
    // A flick turns from a short drag; a flick back cancels a long one.
    precondition(NemuPageSlideMotion.completes(moved: 0.05, velocity: 400, width: width))
    precondition(!NemuPageSlideMotion.completes(moved: 0.8, velocity: -400, width: width))
    // Slower momentum is projected: 300 pt/s carries about 30 pt.
    precondition(close(NemuPageSlideMotion.projectedDistance(velocity: 300), 29.7))
    precondition(NemuPageSlideMotion.completes(moved: 0.45, velocity: 300, width: width))
    precondition(!NemuPageSlideMotion.completes(moved: 0.4, velocity: 100, width: width))
    precondition(close(NemuPageSlideMotion.springVelocity(velocity: 400, remaining: 200), 2))
    precondition(close(NemuPageSlideMotion.springVelocity(velocity: 4000, remaining: 2), 30))
    precondition(close(NemuPageSlideMotion.springVelocity(velocity: 400, remaining: 0.5), 0))
  }

  static func dragsAskForTheNeighbourOnTheirSide() {
    precondition(NemuPageSlideMotion.target(current: 3, translation: -10, frameCount: 8) == 4)
    precondition(NemuPageSlideMotion.target(current: 3, translation: 10, frameCount: 8) == 2)
    precondition(NemuPageSlideMotion.target(current: 0, translation: 10, frameCount: 8) == nil)
    precondition(NemuPageSlideMotion.target(current: 7, translation: -10, frameCount: 8) == nil)
    precondition(NemuPageSlideMotion.target(current: 3, translation: 0, frameCount: 8) == nil)
  }
}
