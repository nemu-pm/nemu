import ExpoModulesCore
import UIKit

/**
 * The reader's curl page turn: a `UIPageViewController` with the `.pageCurl`
 * transition whose pages are the React children themselves.
 *
 * JS lays the turn out as a row of slots in visual order, left to right (one
 * page per slot; two slots per spread when the spine is in the middle) and
 * mounts the slots near the current one as children, each tagged
 * `nativeID="nemu-curl:<slot>"` and sized to one page of the curl frame. Every
 * child lives in its slot's page controller, so the settled page is the live
 * page (zoom, overlays, loading states) and the curl turns the real views.
 *
 * Navigation is declarative: `navigation.token` changes when JS asks for a
 * slot (the left slot of a spread). A one-step request animates the curl,
 * anything further jumps. `onSettle` reports the slot a turn lands on: every
 * gesture turn, and a requested turn once it reaches the latest request (an
 * interrupted chain reports only where it ends, like a scroll view's
 * momentum end). `onEdgeDrag` reports a drag past the first or last slot,
 * where there is no leaf to lift. `onTurnBegin` / `onTurnEnd` bracket every
 * curl on screen (a cancelled drag included), so page overlays can wait for
 * the settled page.
 *
 * Every leaf is double-sided. A spread's leaf carries the next spread's facing
 * page; a single page's leaf carries a render of the page the turn lands on
 * (`NemuPageCurlLeaves`), so it turns opaque with a real page on its back.
 */
final class NemuPageCurlView: ExpoView, UIPageViewControllerDataSource, UIPageViewControllerDelegate, UIGestureRecognizerDelegate {
  let onSettle = EventDispatcher()
  let onEdgeDrag = EventDispatcher()
  let onTurnBegin = EventDispatcher()
  let onTurnEnd = EventDispatcher()

  /** "min" (binding on the left), "max" (on the right) or "mid" (spreads). */
  var spine: String = "min" {
    didSet { if spine != oldValue { rebuildPageController() } }
  }
  var slotCount: Int = 0 {
    didSet { if slotCount != oldValue { setNeedsLayout() } }
  }
  var curlFrame: CGRect = .zero {
    didSet { if curlFrame != oldValue { setNeedsLayout() } }
  }
  var turningEnabled: Bool = true {
    didSet { if turningEnabled != oldValue { applyTurningEnabled() } }
  }
  var pageBackground: UIColor = .black {
    didSet {
      for controller in controllers.values { controller.view.backgroundColor = pageBackground }
    }
  }
  var navigationIndex = 0
  var navigationAnimated = false
  var navigationToken = -1 {
    didSet { if navigationToken != oldValue { setNeedsLayout() } }
  }

  private var pageController: UIPageViewController?
  private var controllers: [Int: NemuPageCurlPageController] = [:]
  private var managedChildren: [UIView] = []
  private var appliedToken = -1
  /** The left slot on screen (the only one for a single page). */
  private var currentSlot = 0
  private var positioned = false
  private var transitioning = false
  private let edgePan = UIPanGestureRecognizer()
  private var edgePanStartSlot = 0

  private var isMid: Bool { spine == "mid" }
  private var step: Int { isMid ? 2 : 1 }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    semanticContentAttribute = .forceLeftToRight
    edgePan.delegate = self
    edgePan.cancelsTouchesInView = false
    edgePan.delaysTouchesBegan = false
    edgePan.addTarget(self, action: #selector(handleEdgePan(_:)))
    addGestureRecognizer(edgePan)
    rebuildPageController()
  }

  // MARK: React children

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    managedChildren.insert(childComponentView, at: min(index, managedChildren.count))
    setNeedsLayout()
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    managedChildren.removeAll { $0 === childComponentView }
    childComponentView.removeFromSuperview()
    setNeedsLayout()
  }

  private static func slot(of child: UIView) -> Int? {
    guard child.responds(to: NSSelectorFromString("nativeId")),
          let id = child.value(forKey: "nativeId") as? String,
          id.hasPrefix("nemu-curl:") else { return nil }
    return Int(id.dropFirst("nemu-curl:".count))
  }

  // MARK: Layout

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard let pageController else { return }
    if window != nil, pageController.parent == nil, let parent = findViewController() {
      parent.addChild(pageController)
      pageController.didMove(toParent: parent)
    } else if window == nil, pageController.parent != nil {
      pageController.willMove(toParent: nil)
      pageController.removeFromParent()
    }
  }

  private func findViewController() -> UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let pageController else { return }
    let frame = curlFrame.width > 0 && curlFrame.height > 0 ? curlFrame : bounds
    if pageController.view.frame != frame { pageController.view.frame = frame }
    reconcileChildren()
    applyNavigation()
  }

  /** Every mounted child goes into its slot's controller (created on demand). */
  private func reconcileChildren() {
    var bySlot: [Int: UIView] = [:]
    for child in managedChildren {
      if let slot = Self.slot(of: child) { bySlot[slot] = child }
    }
    for (slot, child) in bySlot {
      controller(for: slot)?.host(child)
    }
    for (slot, controller) in controllers where bySlot[slot] == nil {
      controller.host(nil)
    }
    // Controllers far from the page and off screen are rebuilt when needed.
    let visible = Set((pageController?.viewControllers ?? []).compactMap { ($0 as? NemuPageCurlPageController)?.slot })
    for slot in controllers.keys where bySlot[slot] == nil && !visible.contains(slot) && abs(slot - currentSlot) > 4 * step {
      controllers.removeValue(forKey: slot)
    }
  }

  private func controller(for slot: Int) -> NemuPageCurlPageController? {
    guard slot >= 0, slot < slotCount else { return nil }
    if let existing = controllers[slot] { return existing }
    let created = NemuPageCurlPageController(slot: slot, background: pageBackground)
    controllers[slot] = created
    return created
  }

  private func normalizedSlot(_ slot: Int) -> Int {
    guard slotCount > 0 else { return 0 }
    let clamped = max(0, min(slotCount - 1, slot))
    return isMid ? clamped - clamped % 2 : clamped
  }

  private func controllers(at slot: Int, animated: Bool = false) -> [UIViewController]? {
    guard let leaves = NemuPageCurlLeaves.shown(slot: slot, slotCount: slotCount, mid: isMid, animated: animated) else { return nil }
    let shown = leaves.compactMap(controller(for:))
    return shown.count == leaves.count ? shown : nil
  }

  private func controller(for leaf: NemuPageCurlLeaf) -> UIViewController? {
    switch leaf {
    case .front(let slot): return controller(for: slot)
    case .back(let target): return backController(landingOn: target)
    }
  }

  /**
   * The back of a single page's turning leaf: a render of the page it lands
   * on, laid out as that page's own leaf (taken as the turn starts, from the
   * mounted child; a page still loading shows as it is).
   */
  private func backController(landingOn target: Int) -> UIViewController? {
    guard let front = controller(for: target) else { return nil }
    let back = NemuPageCurlBackController(target: target, background: pageBackground)
    let size = pageController?.view.bounds.size ?? .zero
    back.show(Self.render(front.view, size: size))
    return back
  }

  private static func render(_ view: UIView, size: CGSize) -> UIImage? {
    guard size.width > 0, size.height > 0 else { return nil }
    // An off-screen page's root view has no frame until the curl shows it.
    if view.superview == nil && view.bounds.size != size {
      view.frame = CGRect(origin: .zero, size: size)
    }
    view.layoutIfNeeded()
    let format = UIGraphicsImageRendererFormat.preferred()
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      view.layer.render(in: context.cgContext)
    }
  }

  // MARK: Navigation

  /** The navigation JS is about to commit as props, applied now. */
  func requestTurn(slot: Int, animated: Bool, token: Int) {
    navigationIndex = slot
    navigationAnimated = animated
    navigationToken = token
    layoutIfNeeded()
  }

  private func applyNavigation() {
    guard let pageController, slotCount > 0, !transitioning else { return }
    let target = normalizedSlot(navigationIndex)
    if !positioned || (pageController.viewControllers ?? []).isEmpty {
      guard let vcs = controllers(at: target) else { return }
      pageController.setViewControllers(vcs, direction: .forward, animated: false)
      currentSlot = target
      positioned = true
      appliedToken = navigationToken
      return
    }
    guard appliedToken != navigationToken else { return }
    appliedToken = navigationToken
    let frames = (target - currentSlot) / step
    let animated = navigationAnimated && abs(frames) == 1 && window != nil
    guard target != currentSlot, let vcs = controllers(at: target, animated: animated) else {
      onTurnEnd([:])
      return
    }
    if animated {
      transitioning = true
      onTurnBegin(["slot": target])
      pageController.setViewControllers(vcs, direction: frames > 0 ? .forward : .reverse, animated: true) { [weak self] _ in
        // UIKit calls back before the next run loop; finish there so a
        // request that arrived mid-turn starts from a settled controller.
        DispatchQueue.main.async { self?.finishRequestedTurn(at: target) }
      }
    } else {
      pageController.setViewControllers(vcs, direction: frames > 0 ? .forward : .reverse, animated: false)
      currentSlot = target
      onSettle(["slot": target])
      onTurnEnd([:])
    }
  }

  private func finishRequestedTurn(at slot: Int) {
    transitioning = false
    currentSlot = slot
    if appliedToken == navigationToken && normalizedSlot(navigationIndex) == slot {
      onSettle(["slot": slot])
    }
    onTurnEnd([:])
    setNeedsLayout()
  }

  // MARK: Page controller

  private func rebuildPageController() {
    if let old = pageController {
      old.willMove(toParent: nil)
      old.view.removeFromSuperview()
      old.removeFromParent()
    }
    let location: UIPageViewController.SpineLocation = spine == "mid" ? .mid : spine == "max" ? .max : .min
    let controller = UIPageViewController(
      transitionStyle: .pageCurl,
      navigationOrientation: .horizontal,
      options: [.spineLocation: NSNumber(value: location.rawValue)]
    )
    // Required for spreads; a single page's leaf back is the page it lands on.
    controller.isDoubleSided = true
    controller.delegate = self
    controller.view.backgroundColor = .clear
    controller.view.semanticContentAttribute = .forceLeftToRight
    // Taps turn pages through the reader's own tap zones (chrome, centre toggle).
    for recognizer in controller.gestureRecognizers where recognizer is UITapGestureRecognizer {
      recognizer.isEnabled = false
    }
    for recognizer in controller.gestureRecognizers {
      if let pan = recognizer as? UIPanGestureRecognizer { pan.maximumNumberOfTouches = 1 }
    }
    pageController = controller
    controllers.removeAll()
    positioned = false
    transitioning = false
    insertSubview(controller.view, at: 0)
    if window != nil, let parent = findViewController() {
      parent.addChild(controller)
      controller.didMove(toParent: parent)
    }
    applyTurningEnabled()
    setNeedsLayout()
  }

  private func applyTurningEnabled() {
    // A nil data source turns gesture-driven navigation off (zoomed page).
    pageController?.dataSource = turningEnabled ? self : nil
  }

  func pageViewController(_ pageViewController: UIPageViewController, viewControllerBefore viewController: UIViewController) -> UIViewController? {
    guard turningEnabled, let leaf = Self.leaf(of: viewController),
          let next = NemuPageCurlLeaves.before(leaf, slotCount: slotCount, backs: !isMid) else { return nil }
    return controller(for: next)
  }

  func pageViewController(_ pageViewController: UIPageViewController, viewControllerAfter viewController: UIViewController) -> UIViewController? {
    guard turningEnabled, let leaf = Self.leaf(of: viewController),
          let next = NemuPageCurlLeaves.after(leaf, slotCount: slotCount, backs: !isMid) else { return nil }
    return controller(for: next)
  }

  private static func leaf(of controller: UIViewController) -> NemuPageCurlLeaf? {
    if let page = controller as? NemuPageCurlPageController { return .front(page.slot) }
    if let back = controller as? NemuPageCurlBackController { return .back(back.target) }
    return nil
  }

  func pageViewController(_ pageViewController: UIPageViewController, willTransitionTo pendingViewControllers: [UIViewController]) {
    transitioning = true
    if let slot = pendingViewControllers.lazy.compactMap({ $0 as? NemuPageCurlPageController }).first?.slot {
      onTurnBegin(["slot": normalizedSlot(slot)])
    }
  }

  func pageViewController(_ pageViewController: UIPageViewController, didFinishAnimating finished: Bool, previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
    transitioning = false
    guard let slot = (pageViewController.viewControllers ?? []).lazy.compactMap({ $0 as? NemuPageCurlPageController }).first?.slot else { return }
    let settled = normalizedSlot(slot)
    let moved = settled != currentSlot
    currentSlot = settled
    if completed && moved { onSettle(["slot": settled, "gesture": true]) }
    onTurnEnd([:])
    setNeedsLayout()
  }

  // MARK: Drag past either end

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    true
  }

  @objc private func handleEdgePan(_ pan: UIPanGestureRecognizer) {
    switch pan.state {
    case .began:
      edgePanStartSlot = currentSlot
    case .ended:
      let translation = pan.translation(in: self)
      guard abs(translation.x) > 40, abs(translation.x) > abs(translation.y) * 1.5, turningEnabled else { return }
      // Finger right-to-left asks for the slot on the right ("after").
      let towardAfter = translation.x < 0
      let lastLeft = normalizedSlot(slotCount - 1)
      if towardAfter && edgePanStartSlot >= lastLeft && currentSlot == edgePanStartSlot {
        onEdgeDrag(["side": "after"])
      } else if !towardAfter && edgePanStartSlot == 0 && currentSlot == 0 {
        onEdgeDrag(["side": "before"])
      }
    default:
      break
    }
  }
}

/** One page of the curl: hosts the React child of its slot, if mounted. */
final class NemuPageCurlPageController: UIViewController {
  let slot: Int
  private let background: UIColor
  private weak var hosted: UIView?

  init(slot: Int, background: UIColor) {
    self.slot = slot
    self.background = background
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func loadView() {
    let view = UIView()
    view.backgroundColor = background
    view.clipsToBounds = true
    self.view = view
  }

  func host(_ child: UIView?) {
    if hosted === child, child?.superview === view { return }
    if let hosted, hosted.superview === view, hosted !== child { hosted.removeFromSuperview() }
    hosted = child
    if let child { view.addSubview(child) }
  }
}

/** The back of a single page's turning leaf: a still of the page it lands on. */
final class NemuPageCurlBackController: UIViewController {
  let target: Int
  private let background: UIColor
  private let imageView = UIImageView()

  init(target: Int, background: UIColor) {
    self.target = target
    self.background = background
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func loadView() {
    let view = UIView()
    view.backgroundColor = background
    view.clipsToBounds = true
    imageView.frame = view.bounds
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    imageView.contentMode = .scaleToFill
    view.addSubview(imageView)
    self.view = view
  }

  func show(_ image: UIImage?) {
    loadViewIfNeeded()
    imageView.image = image
  }
}
