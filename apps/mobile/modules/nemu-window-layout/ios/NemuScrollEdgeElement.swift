import ExpoModulesCore
import UIKit

/// A container of chrome overlaying a scroll view's edge, or an empty view that
/// only marks the edge. UIKit draws a scroll view's edge effect under system
/// bars and under views with a `UIScrollEdgeElementContainerInteraction`; this
/// is that interaction for a React view (iOS 26, a plain view before it).
///
/// The effect's shape comes from what the container holds, as its header says
/// (labels, images, glass, controls). An empty view forms nothing, nor does a
/// clear `UIControl` (iPhone Duo, iOS 27.2); a label does, whatever its colour.
/// So an empty element holds one with clear text, which draws nothing. Should a
/// system stop counting it, the edge is a plain cut: never a wrong drawing. On
/// the top edge that label spans at least the scroll view's safe-area top: what
/// a bar has pinned there, its search field included, however the page is laid
/// out (a bar only forms the effect itself for the scroll view it observes).
///
/// The scroll view is the one around the element, else the nearest beside it:
/// its parent's other children first, then each ancestor's in turn. A list
/// mounted later (a skeleton's content) is picked up on the next layout. The
/// edge's style is pinned to soft: `automatic` is `hard` under the iOS 27 SDK.
///
/// With `revealPastRest` the edge's effect shows only once content has scrolled
/// past its resting position on that edge, so what rests under the effect's
/// reach stays sharp. Per scroll view: the columns of a wide page each follow
/// their own offset.
final class NemuScrollEdgeElementView: ExpoView {
  private static let searchedAncestors = 4
  private static let revealDistance: CGFloat = 1

  var edge: UIRectEdge = .top {
    didSet { if edge != oldValue { attach(force: true) } }
  }
  var revealPastRest = false {
    didSet { if revealPastRest != oldValue { attach(force: true) } }
  }
  private weak var attachedScrollView: UIScrollView?
  private var interaction: UIInteraction?
  private var observations: [NSKeyValueObservation] = []
  private var marker: UILabel?
  private var sizeObservation: NSKeyValueObservation?
  private var observedSize: CGSize = .zero

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detach()
    } else {
      attach(force: true)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    attach(force: false)
    refreshMarker()
    updateReveal()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    refreshMarker()
  }

  private func detach() {
    guard #available(iOS 26.0, *) else { return }
    observations = []
    sizeObservation = nil
    if revealPastRest, let scrollView = attachedScrollView {
      effect(of: scrollView)?.isHidden = false
    }
    attachedScrollView = nil
  }

  private func attach(force: Bool) {
    guard #available(iOS 26.0, *), window != nil else { return }
    guard force || attachedScrollView?.window == nil else { return }
    guard let scrollView = findScrollView() else { return }
    observations = []
    if let interaction { removeInteraction(interaction) }
    let next = UIScrollEdgeElementContainerInteraction()
    next.scrollView = scrollView
    next.edge = edge
    addInteraction(next)
    interaction = next
    addMarkerIfEmpty()
    observeSize(of: scrollView)
    attachedScrollView = scrollView
    effect(of: scrollView)?.style = .soft
    guard revealPastRest else { return }
    observations = [
      scrollView.observe(\.contentOffset) { [weak self] _, _ in
        MainActor.assumeIsolated { self?.updateReveal() }
      },
      scrollView.observe(\.contentSize) { [weak self] _, _ in
        MainActor.assumeIsolated { self?.updateReveal() }
      },
    ]
    updateReveal()
    // A screen's `scrollEdgeEffects` re-apply as its options change.
    DispatchQueue.main.async { [weak self] in self?.updateReveal() }
  }

  private func addMarkerIfEmpty() {
    guard marker == nil, subviews.isEmpty else { return }
    let label = UILabel()
    label.text = "."
    label.textColor = .clear
    label.isAccessibilityElement = false
    addSubview(label)
    marker = label
    updateMarkerFrame()
  }

  private func updateMarkerFrame() {
    guard let marker else { return }
    var frame = bounds
    if edge == .top, let scrollView = attachedScrollView {
      frame.size.height = max(frame.height, scrollView.safeAreaInsets.top)
    }
    marker.frame = frame
  }

  /// A marker of a new size takes a new interaction: UIKit keeps the shape it
  /// read, the inner display's after a fold (a row beside the outer's title).
  private func refreshMarker() {
    guard let marker else { return }
    let previous = marker.frame
    updateMarkerFrame()
    if marker.frame != previous { attach(force: true) }
  }

  /// A fold settles the scroll view's safe area after its new size.
  private func observeSize(of scrollView: UIScrollView) {
    observedSize = scrollView.bounds.size
    sizeObservation = scrollView.observe(\.bounds) { [weak self] scrollView, _ in
      MainActor.assumeIsolated {
        guard let self, scrollView.bounds.size != self.observedSize else { return }
        self.observedSize = scrollView.bounds.size
        DispatchQueue.main.async { [weak self] in self?.refreshMarker() }
        NemuTransitionSettle.wait { [weak self] in self?.refreshMarker() }
      }
    }
  }

  private func updateReveal() {
    guard #available(iOS 26.0, *), revealPastRest, let scrollView = attachedScrollView,
      let effect = effect(of: scrollView)
    else { return }
    let hidden = pastRest(of: scrollView) < Self.revealDistance
    if effect.isHidden != hidden { effect.isHidden = hidden }
  }

  private func pastRest(of scrollView: UIScrollView) -> CGFloat {
    let offset = scrollView.contentOffset
    let inset = scrollView.adjustedContentInset
    let size = scrollView.bounds.size
    let content = scrollView.contentSize
    switch edge {
    case .left: return offset.x + inset.left
    case .right: return content.width + inset.right - size.width - offset.x
    case .bottom: return content.height + inset.bottom - size.height - offset.y
    default: return offset.y + inset.top
    }
  }

  @available(iOS 26.0, *)
  private func effect(of scrollView: UIScrollView) -> UIScrollEdgeEffect? {
    switch edge {
    case .top: return scrollView.topEdgeEffect
    case .bottom: return scrollView.bottomEdgeEffect
    case .left: return scrollView.leftEdgeEffect
    case .right: return scrollView.rightEdgeEffect
    default: return nil
    }
  }

  private func findScrollView() -> UIScrollView? {
    var child: UIView = self
    var ancestor = superview
    var level = 0
    while let current = ancestor, level < Self.searchedAncestors {
      if let scrollView = current as? UIScrollView { return scrollView }
      for sibling in current.subviews where sibling !== child {
        if let found = Self.firstScrollView(in: sibling) { return found }
      }
      child = current
      ancestor = current.superview
      level += 1
    }
    var enclosing = ancestor
    while let current = enclosing {
      if let scrollView = current as? UIScrollView { return scrollView }
      enclosing = current.superview
    }
    return nil
  }

  private static func firstScrollView(in view: UIView) -> UIScrollView? {
    if let scrollView = view as? UIScrollView { return scrollView }
    for subview in view.subviews {
      if let found = firstScrollView(in: subview) { return found }
    }
    return nil
  }

  static func edge(named name: String) -> UIRectEdge {
    switch name {
    case "bottom": return .bottom
    case "left": return .left
    case "right": return .right
    default: return .top
    }
  }
}
