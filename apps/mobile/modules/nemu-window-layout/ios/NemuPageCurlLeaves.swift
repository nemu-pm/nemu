import CoreGraphics
import Foundation

/**
 * One side of a leaf in the curl's data source. Slots are the JS row (visual
 * order, left to right); the page on screen is always a front.
 */
enum NemuPageCurlLeaf: Equatable {
  case front(Int)
  /**
   * The back of the turning leaf on the way to `target`: it shows the page
   * of `source` (the leaf that turns, `NemuPageCurlLeaves.turningSlot`),
   * mirrored under the paper wash.
   */
  case back(Int, source: Int)
}

/** Where the curl's leaves are bound (`UIPageViewController.SpineLocation`). */
enum NemuPageCurlSpine: Equatable {
  /** Single pages bound on the left (left-to-right books). */
  case min
  /** Single pages bound on the right (right-to-left manga). */
  case max
  /** Spreads about a middle spine. */
  case mid
}

/**
 * The curl's page sequence (`UIPageViewController` data source).
 *
 * Spreads (`.mid`) turn real two-sided leaves: after a page comes the next
 * slot. A single page (`.min`/`.max`, the spine on its binding edge) is
 * double-sided too, so the turning leaf is opaque: its back is the turning
 * leaf's own page seen through the paper (mirrored, under an 85% wash), the
 * way a lifted leaf of thin paper looks from behind. UIKit 27.1 asks a
 * double-sided single-page curl for the back first, then the front:
 * `after(front s)` → back, `after(back)` → the next front (`before` mirrors
 * it), and an animated `setViewControllers` takes `[front, back]` (one
 * controller otherwise). The back only decorates the turn: fronts follow the
 * slots one by one, so no page is skipped, repeated or reordered.
 */
enum NemuPageCurlLeaves {
  /** `viewControllerAfter`: toward the slot on the right. */
  static func after(_ leaf: NemuPageCurlLeaf, slotCount: Int, spine: NemuPageCurlSpine) -> NemuPageCurlLeaf? {
    switch leaf {
    case .front(let slot):
      return turn(from: slot, to: slot + 1, slotCount: slotCount, spine: spine)
    case .back(let target, _):
      return valid(target, slotCount) ? .front(target) : nil
    }
  }

  /** `viewControllerBefore`: toward the slot on the left. */
  static func before(_ leaf: NemuPageCurlLeaf, slotCount: Int, spine: NemuPageCurlSpine) -> NemuPageCurlLeaf? {
    switch leaf {
    case .front(let slot):
      return turn(from: slot, to: slot - 1, slotCount: slotCount, spine: spine)
    case .back(let target, _):
      return valid(target, slotCount) ? .front(target) : nil
    }
  }

  /** The page a leaf shows (a back: the page of the leaf that turns). */
  static func slotShown(by leaf: NemuPageCurlLeaf) -> Int {
    switch leaf {
    case .front(let slot): return slot
    case .back(_, let source): return source
    }
  }

  /**
   * The leaf that moves in a single-page turn between two neighbouring slots.
   * A leaf turns about the binding and, turned, rests on the binding's side:
   * the one nearer that side is on top. Turning on (the next page) lifts the
   * page on screen off the next one; turning back lays the previous page down
   * again over the page on screen, so that leaf, and its back, is the page
   * the turn lands on.
   */
  static func turningSlot(from: Int, to: Int, spine: NemuPageCurlSpine) -> Int {
    spine == .max ? Swift.max(from, to) : Swift.min(from, to)
  }

  /**
   * What `setViewControllers` takes to show `slot` (the left slot of a
   * spread): a spread's two pages; a single page alone, or with the turning
   * leaf's back when the change animates from `from` (the page on screen).
   */
  static func shown(slot: Int, slotCount: Int, spine: NemuPageCurlSpine, animated: Bool, from: Int? = nil) -> [NemuPageCurlLeaf]? {
    guard valid(slot, slotCount) else { return nil }
    if spine == .mid {
      guard valid(slot + 1, slotCount) else { return nil }
      return [.front(slot), .front(slot + 1)]
    }
    guard animated else { return [.front(slot)] }
    return [.front(slot), .back(slot, source: turningSlot(from: from ?? slot, to: slot, spine: spine))]
  }

  private static func turn(from source: Int, to target: Int, slotCount: Int, spine: NemuPageCurlSpine) -> NemuPageCurlLeaf? {
    guard valid(target, slotCount) else { return nil }
    guard spine != .mid else { return .front(target) }
    return .back(target, source: turningSlot(from: source, to: target, spine: spine))
  }

  private static func valid(_ slot: Int, _ slotCount: Int) -> Bool {
    slot >= 0 && slot < slotCount
  }
}

extension NemuPageCurlLeaves {
  /**
   * Whether the curl frame's change needs the page on screen set again (so
   * UIKit lays its controllers out at the new size): only a new size, by half
   * a point or more. A move keeps the pages as drawn.
   */
  static func needsReseat(from old: CGSize, to new: CGSize) -> Bool {
    abs(old.width - new.width) >= 0.5 || abs(old.height - new.height) >= 0.5
  }
}

/**
 * Where a single page's curl is laid out so nothing it draws shows outside
 * the page. UIKit ends every turn by flipping the leaf over the spine: its
 * last frames are a sliver standing on the spine with the shadow it casts on
 * the page beneath, the moment before the turn settles. A single page's spine
 * is its own edge (left bound left, right in manga), so that sliver and its
 * shadow flashed along the page's edge, and a leaf swinging past the spine
 * drew into the margin beside a page narrower than the stage.
 *
 * The pager reaches `overhang` past the spine, inside a clip the size of the
 * curl frame: the spine, and the sliver and shadow on it, land outside what
 * is seen. Each leaf's page sits in the pager at `content`, the overhang
 * beside it, so it is where it was. Spreads turn about their middle, a spine
 * that must show: no overhang.
 */
struct NemuPageCurlOverhang: Equatable {
  /** The pager's frame inside the clip (the clip is the curl frame). */
  let pager: CGRect
  /** The page's place inside each leaf (the pager's bounds). */
  let content: CGRect

  /**
   * Wider than the shadow the leaf casts on the page as it lands: measured
   * reaching ~70pt in from the spine in the turn's last frames (Duo inner
   * display, portrait); 32pt left ~40pt of it in sight.
   */
  static let defaultOverhang: CGFloat = 96

  static func layout(frameSize size: CGSize, spine: NemuPageCurlSpine, overhang: CGFloat = defaultOverhang) -> NemuPageCurlOverhang {
    let extra = spine == .mid ? 0 : max(0, overhang)
    let pager = CGRect(
      x: spine == .min ? -extra : 0,
      y: 0,
      width: size.width + extra,
      height: size.height
    )
    let content = CGRect(x: spine == .min ? extra : 0, y: 0, width: size.width, height: size.height)
    return NemuPageCurlOverhang(pager: pager, content: content)
  }
}
