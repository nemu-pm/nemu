import CoreGraphics
import Foundation

/**
 * The slide page turn's motion (`NemuPageSlideView`), as Books turns a page:
 * the page on top slides away with the finger, one point for one point, a
 * soft shadow along its moving edge, and uncovers the page beneath, which
 * stays put but for a slight parallax under a light dim. Turning back, the
 * previous page slides in on top over the page on screen.
 *
 * A turn is always between two neighbouring frames of the row (visual order,
 * left to right): `lower` on the left, `upper` on its right. `progress` is 0
 * resting on `lower` and 1 resting on `upper`. The page earlier in reading
 * order is the one on top: `lower` in a left-to-right book, `upper` in manga
 * (the row is RTL reversed). It moves off toward its own side of the row.
 */
enum NemuPageSlideMotion {
  /** How far the page beneath travels while it is uncovered, as a share of the width. */
  static let parallax: CGFloat = 0.08
  /** The page beneath, while fully covered: a black wash this strong. */
  static let dimmest: CGFloat = 0.1
  /** The shadow fades out over the last share of the top page's travel. */
  static let shadowFade: CGFloat = 0.25
  /** A release at least this fast (pt/s) turns (or cancels) whatever the distance. */
  static let flickVelocity: CGFloat = 350
  /** Release projection, as a scroll view with fast deceleration projects its momentum. */
  static let decelerationRate: CGFloat = 0.99
  /**
   * The settling spring (unit mass, critically damped): about a third of a
   * second from a tap to rest, as Books turns; a flick leaves the finger at
   * its own speed and lands sooner.
   */
  static let stiffness: CGFloat = 700
  /** The spring's natural frequency: a release faster than this (relative) would overshoot. */
  static var naturalFrequency: CGFloat { stiffness.squareRoot() }

  struct Pose: Equatable {
    var lowerOnTop: Bool
    /** Horizontal offsets of the two sheets from their rest. */
    var lowerX: CGFloat
    var upperX: CGFloat
    var lowerAlpha: CGFloat
    var upperAlpha: CGFloat
    /** Black wash over the page beneath. */
    var dim: CGFloat
    /** The top page's edge shadow. */
    var shadow: CGFloat
  }

  static func lowerOnTop(rtl: Bool) -> Bool { !rtl }

  /**
   * Both sheets at `progress`. Reduce Motion: neither moves, the top page
   * fades out over the one beneath (a cross-fade).
   */
  static func pose(progress: CGFloat, width: CGFloat, rtl: Bool, reduceMotion: Bool) -> Pose {
    let p = Swift.max(0, Swift.min(1, progress.isFinite ? progress : 0))
    let lowerTop = lowerOnTop(rtl: rtl)
    // How much of the stage the top page still covers.
    let coverage = lowerTop ? 1 - p : p
    if reduceMotion {
      return Pose(
        lowerOnTop: lowerTop,
        lowerX: 0,
        upperX: 0,
        lowerAlpha: lowerTop ? coverage : 1,
        upperAlpha: lowerTop ? 1 : coverage,
        dim: 0,
        shadow: 0
      )
    }
    // The top page leaves toward its own side: left for `lower`, right for `upper`.
    let topSign: CGFloat = lowerTop ? -1 : 1
    let topX = topSign * (1 - coverage) * width
    // The page beneath drifts the same way, arriving at rest as it is uncovered.
    let beneathX = -topSign * parallax * coverage * width
    return Pose(
      lowerOnTop: lowerTop,
      lowerX: lowerTop ? topX : beneathX,
      upperX: lowerTop ? beneathX : topX,
      lowerAlpha: 1,
      upperAlpha: 1,
      dim: dimmest * coverage,
      shadow: Swift.min(1, coverage / shadowFade)
    )
  }

  /** The progress a finger's drag puts the turn at: the top page follows the finger exactly. */
  static func progress(from start: CGFloat, translation: CGFloat, width: CGFloat) -> CGFloat {
    guard width > 0 else { return start }
    return start - translation / width
  }

  /** How far a release's momentum carries (points), as `UIScrollView` projects it. */
  static func projectedDistance(velocity: CGFloat, rate: CGFloat = decelerationRate) -> CGFloat {
    velocity / 1000 * rate / (1 - rate)
  }

  /**
   * Whether a released drag completes the turn: `moved` is the share of the
   * way already travelled toward the target (0...1), `velocity` the finger's
   * speed toward it (pt/s, negative when heading back). A flick decides on
   * its own; otherwise the turn completes when the momentum would carry it
   * past halfway.
   */
  static func completes(moved: CGFloat, velocity: CGFloat, width: CGFloat) -> Bool {
    if velocity >= flickVelocity { return true }
    if velocity <= -flickVelocity { return false }
    guard width > 0 else { return moved >= 0.5 }
    return moved + projectedDistance(velocity: velocity) / width >= 0.5
  }

  /**
   * The settling spring's initial velocity in `UISpringTimingParameters`
   * units: the release speed relative to the distance still to travel (so the
   * page leaves the finger at the finger's speed), capped at the spring's
   * natural frequency: any faster and a critically damped spring overshoots.
   */
  static func springVelocity(velocity: CGFloat, remaining: CGFloat) -> CGFloat {
    guard abs(remaining) >= 1 else { return 0 }
    let cap = naturalFrequency
    return Swift.max(-cap, Swift.min(cap, velocity / abs(remaining)))
  }

  /**
   * The turn a finger starts: a drag toward the left asks for the frame on
   * the right of the row (`after`), toward the right for the one on its left.
   */
  static func target(current: Int, translation: CGFloat, frameCount: Int) -> Int? {
    guard translation != 0 else { return nil }
    let target = translation < 0 ? current + 1 : current - 1
    return target >= 0 && target < frameCount ? target : nil
  }
}
