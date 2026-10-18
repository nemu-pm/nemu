import Foundation

/**
 * One side of a leaf in the curl's data source. Slots are the JS row (visual
 * order, left to right); the page on screen is always a front.
 */
enum NemuPageCurlLeaf: Equatable {
  case front(Int)
  /** The back of the turning leaf: it shows the page the turn lands on. */
  case back(Int)
}

/**
 * The curl's page sequence (`UIPageViewController` data source).
 *
 * Spreads (`.mid`) turn real two-sided leaves: after a page comes the next
 * slot. A single page (`.min`/`.max`) is double-sided too, so the turning leaf
 * is opaque and shows a real page on its back instead of its own front
 * mirrored: the page the turn lands on (the next page forward, the previous
 * one backward), the way a lifted leaf shows the page beneath it. UIKit 27.1
 * asks a double-sided single-page curl for the back first, then the front:
 * `after(front s)` → back, `after(back)` → the next front (`before` mirrors
 * it), and an animated `setViewControllers` takes `[front, back]` (one
 * controller otherwise). The back only decorates the turn: fronts follow the
 * slots one by one, so no page is skipped, repeated or reordered.
 */
enum NemuPageCurlLeaves {
  /** `viewControllerAfter`: toward the slot on the right. */
  static func after(_ leaf: NemuPageCurlLeaf, slotCount: Int, backs: Bool) -> NemuPageCurlLeaf? {
    switch leaf {
    case .front(let slot):
      return turn(to: slot + 1, slotCount: slotCount, backs: backs)
    case .back(let target):
      return valid(target, slotCount) ? .front(target) : nil
    }
  }

  /** `viewControllerBefore`: toward the slot on the left. */
  static func before(_ leaf: NemuPageCurlLeaf, slotCount: Int, backs: Bool) -> NemuPageCurlLeaf? {
    switch leaf {
    case .front(let slot):
      return turn(to: slot - 1, slotCount: slotCount, backs: backs)
    case .back(let target):
      return valid(target, slotCount) ? .front(target) : nil
    }
  }

  /**
   * What `setViewControllers` takes to show `slot` (the left slot of a
   * spread): a spread's two pages; a single page alone, or with the turning
   * leaf's back when the change animates.
   */
  static func shown(slot: Int, slotCount: Int, mid: Bool, animated: Bool) -> [NemuPageCurlLeaf]? {
    guard valid(slot, slotCount) else { return nil }
    if mid {
      guard valid(slot + 1, slotCount) else { return nil }
      return [.front(slot), .front(slot + 1)]
    }
    return animated ? [.front(slot), .back(slot)] : [.front(slot)]
  }

  private static func turn(to target: Int, slotCount: Int, backs: Bool) -> NemuPageCurlLeaf? {
    guard valid(target, slotCount) else { return nil }
    return backs ? .back(target) : .front(target)
  }

  private static func valid(_ slot: Int, _ slotCount: Int) -> Bool {
    slot >= 0 && slot < slotCount
  }
}
