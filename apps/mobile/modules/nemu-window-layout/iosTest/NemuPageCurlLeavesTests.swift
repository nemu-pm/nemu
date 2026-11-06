import Foundation

/**
 * Drives `NemuPageCurlLeaves` the way UIKit drives a double-sided curl's data
 * source (back first, then the front it lands on) and checks the fronts
 * follow the slots one by one while each back shows the leaf that turns.
 */
@main
enum NemuPageCurlLeavesTests {
  static func main() {
    singlePageTurnsShowTheTurningLeafOnTheBack()
    walksVisitEverySlotOnceInOrder()
    endsHaveNoLeafToLift()
    shownControllersMatchUIKit()
    spreadsKeepTheirSequence()
    onlyANewSizeReseatsThePage()
    print("NemuPageCurlLeavesTests passed")
  }

  /** One gesture turn as UIKit asks for it: the back, then the next front. */
  static func gestureTurn(from slot: Int, forward: Bool, slotCount: Int, spine: NemuPageCurlSpine = .min) -> (back: NemuPageCurlLeaf?, landing: NemuPageCurlLeaf?) {
    let step = forward ? NemuPageCurlLeaves.after : NemuPageCurlLeaves.before
    guard let first = step(.front(slot), slotCount, spine) else { return (nil, nil) }
    guard case .back = first else { return (nil, first) }
    return (first, step(first, slotCount, spine))
  }

  static func singlePageTurnsShowTheTurningLeafOnTheBack() {
    // Bound on the left (left-to-right): the next page is on the right. On:
    // the page on screen lifts, its back is that page. Back: the previous
    // page is laid down over the page on screen, its back is the previous
    // page, never the page on screen.
    var turn = gestureTurn(from: 3, forward: true, slotCount: 8, spine: .min)
    precondition(turn.back == .back(4, source: 3) && turn.landing == .front(4))
    turn = gestureTurn(from: 3, forward: false, slotCount: 8, spine: .min)
    precondition(turn.back == .back(2, source: 2) && turn.landing == .front(2))
    precondition(NemuPageCurlLeaves.slotShown(by: turn.back!) == 2)
    // Bound on the right (manga, the row RTL reversed): the next page is on
    // the left, so the leaf that turns is the right-hand one either way.
    turn = gestureTurn(from: 3, forward: false, slotCount: 8, spine: .max)
    precondition(turn.back == .back(2, source: 3) && turn.landing == .front(2))
    turn = gestureTurn(from: 3, forward: true, slotCount: 8, spine: .max)
    precondition(turn.back == .back(4, source: 4) && turn.landing == .front(4))
    precondition(NemuPageCurlLeaves.slotShown(by: turn.back!) == 4)
    // In reading order: turning on shows the page on screen, turning back the page landed on.
    for spine in [NemuPageCurlSpine.min, .max] {
      let next = spine == .min ? 4 : 2
      let previous = spine == .min ? 2 : 4
      precondition(NemuPageCurlLeaves.turningSlot(from: 3, to: next, spine: spine) == 3)
      precondition(NemuPageCurlLeaves.turningSlot(from: 3, to: previous, spine: spine) == previous)
    }
    // Either method on a back lands on its page, whichever way it came.
    precondition(NemuPageCurlLeaves.after(.back(5, source: 4), slotCount: 8, spine: .min) == .front(5))
    precondition(NemuPageCurlLeaves.before(.back(5, source: 5), slotCount: 8, spine: .min) == .front(5))
  }

  static func walksVisitEverySlotOnceInOrder() {
    for spine in [NemuPageCurlSpine.min, .max] {
      for slotCount in 1...12 {
        for start in 0..<slotCount {
          var slot = start
          var visited = [slot]
          while case .front(let next)? = gestureTurn(from: slot, forward: true, slotCount: slotCount, spine: spine).landing {
            precondition(next == slot + 1, "skipped or repeated a page")
            slot = next
            visited.append(slot)
          }
          precondition(visited == Array(start..<slotCount))
          while case .front(let next)? = gestureTurn(from: slot, forward: false, slotCount: slotCount, spine: spine).landing {
            precondition(next == slot - 1, "skipped or repeated a page")
            slot = next
            visited.append(slot)
          }
          precondition(visited == Array(start..<slotCount) + Array((0..<(slotCount - 1)).reversed()))
        }
      }
    }
  }

  static func endsHaveNoLeafToLift() {
    precondition(gestureTurn(from: 0, forward: false, slotCount: 5).back == nil)
    precondition(gestureTurn(from: 0, forward: false, slotCount: 5).landing == nil)
    precondition(gestureTurn(from: 4, forward: true, slotCount: 5).landing == nil)
    precondition(gestureTurn(from: 0, forward: true, slotCount: 1).landing == nil)
    precondition(NemuPageCurlLeaves.after(.back(5, source: 4), slotCount: 5, spine: .min) == nil)
    precondition(NemuPageCurlLeaves.before(.back(-1, source: -1), slotCount: 5, spine: .min) == nil)
  }

  static func shownControllersMatchUIKit() {
    // Double-sided .min/.max: one controller, or [front, back] for an animated change.
    precondition(NemuPageCurlLeaves.shown(slot: 2, slotCount: 5, spine: .min, animated: false) == [.front(2)])
    // The animated pair's back shows the leaf that turns: the page on screen
    // (`from`) turning on, the page landed on turning back (a tap or the slider).
    precondition(NemuPageCurlLeaves.shown(slot: 2, slotCount: 5, spine: .min, animated: true, from: 1) == [.front(2), .back(2, source: 1)])
    precondition(NemuPageCurlLeaves.shown(slot: 2, slotCount: 5, spine: .min, animated: true, from: 3) == [.front(2), .back(2, source: 2)])
    precondition(NemuPageCurlLeaves.shown(slot: 2, slotCount: 5, spine: .max, animated: true, from: 3) == [.front(2), .back(2, source: 3)])
    precondition(NemuPageCurlLeaves.shown(slot: 2, slotCount: 5, spine: .max, animated: true, from: 1) == [.front(2), .back(2, source: 2)])
    precondition(NemuPageCurlLeaves.shown(slot: 5, slotCount: 5, spine: .min, animated: true) == nil)
    precondition(NemuPageCurlLeaves.shown(slot: -1, slotCount: 5, spine: .max, animated: false) == nil)
    // .mid: the spread's two pages either way.
    precondition(NemuPageCurlLeaves.shown(slot: 2, slotCount: 6, spine: .mid, animated: true) == [.front(2), .front(3)])
    precondition(NemuPageCurlLeaves.shown(slot: 4, slotCount: 5, spine: .mid, animated: false) == nil)
  }

  static func spreadsKeepTheirSequence() {
    // A spread leaf's back is the next spread's facing page: plain slot order, no backs.
    precondition(NemuPageCurlLeaves.after(.front(3), slotCount: 8, spine: .mid) == .front(4))
    precondition(NemuPageCurlLeaves.before(.front(4), slotCount: 8, spine: .mid) == .front(3))
    precondition(NemuPageCurlLeaves.after(.front(7), slotCount: 8, spine: .mid) == nil)
    precondition(NemuPageCurlLeaves.before(.front(0), slotCount: 8, spine: .mid) == nil)
  }

  /** A fold moves (or rounds) the curl frame: no re-set; a real resize: re-set. */
  static func onlyANewSizeReseatsThePage() {
    let spread = CGSize(width: 951, height: 700)
    precondition(!NemuPageCurlLeaves.needsReseat(from: spread, to: spread))
    precondition(!NemuPageCurlLeaves.needsReseat(from: spread, to: CGSize(width: 951.3, height: 700)))
    precondition(NemuPageCurlLeaves.needsReseat(from: spread, to: CGSize(width: 911, height: 700)))
    precondition(NemuPageCurlLeaves.needsReseat(from: spread, to: CGSize(width: 951, height: 650)))
  }
}
