import ExpoModulesCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

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
 * page. A single page turns about its binding edge (`min` left-to-right,
 * `max` right-to-left; never the middle) and its leaf's back is that leaf's
 * own page, mirrored, under an 85% paper wash — paper seen from behind: the
 * page on screen as it lifts toward the next one, the previous page as it is
 * laid back down over the page on screen (`NemuPageCurlLeaves`).
 *
 * Nothing sets the controllers while a finger is on the curl (`touchObserver`):
 * a re-anchor, a jump or a re-set at a new frame then waits for the touch to
 * end. `setViewControllers` mid-touch fails UIKit's own pan, so the first drag
 * after the frames changed (a neighbour chapter joined, a setting rebuilt the
 * strip) never lifted a leaf.
 *
 * The backs of the leaves the next turn either way would lift are drawn as
 * soon as a turn settles (`prepareBacks`), not when a drag asks for them.
 *
 * A single page turns about a spine out of sight (`NemuPageCurlOverhang`):
 * the pager reaches past the page's bound edge inside `clipView`, a clip the
 * size of the curl frame, so the leaf's last sliver on the spine and the
 * shadow it casts as the turn lands never show, and nothing the curl draws
 * leaves the page. Each leaf's page sits in its controller's content view,
 * where it was.
 *
 * The curl frame is frozen while a leaf turns: a new `curlFrame` (the next
 * page's box, a fold, a rotation, a late image size) waits for the turn to
 * end, and the page on screen is then set again, not animated, at the new
 * frame, so the controllers never keep the old size.
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
    didSet { applyBackgrounds() }
  }
  /**
   * "Match Page": each slot's own page border colour, so the page a turn
   * uncovers (and the back of the leaf that turns) has its own background.
   */
  var slotBackgrounds: [Int: UIColor] = [:] {
    didSet { applyBackgrounds() }
  }
  var navigationIndex = 0
  var navigationAnimated = false
  var navigationToken = -1 {
    didSet { if navigationToken != oldValue { setNeedsLayout() } }
  }

  private var pageController: UIPageViewController?
  /** The curl frame: the pager turns inside it and nothing shows past it. */
  private let clipView = UIView()
  private var controllers: [Int: NemuPageCurlPageController] = [:]
  private var managedChildren: [UIView] = []
  private var appliedToken = -1
  /** The left slot on screen (the only one for a single page). */
  private var currentSlot = 0
  private var positioned = false
  private var transitioning = false
  /** The page controller's frame changed since the current page was set. */
  private var reseatPending = false
  private let edgePan = UIPanGestureRecognizer()
  private var edgePanStartSlot = 0
  private let touchObserver = NemuTouchObserver()
  /** Drawn backs, by `source:size:paper`; only the current slot's neighbours are kept. */
  private var backImages: [String: UIImage] = [:]

  private var isMid: Bool { spine == "mid" }
  /** The overhang beside each leaf's page (the pager's bounds less the page). */
  private var contentInsets: UIEdgeInsets {
    let overhang = NemuPageCurlOverhang.layout(frameSize: CGSize(width: 1, height: 1), spine: spineLocation)
    return UIEdgeInsets(
      top: 0,
      left: overhang.content.minX,
      bottom: 0,
      right: overhang.pager.width - overhang.content.maxX
    )
  }
  private var spineLocation: NemuPageCurlSpine { spine == "mid" ? .mid : spine == "max" ? .max : .min }
  private var step: Int { isMid ? 2 : 1 }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    semanticContentAttribute = .forceLeftToRight
    clipView.clipsToBounds = true
    clipView.backgroundColor = .clear
    clipView.semanticContentAttribute = .forceLeftToRight
    insertSubview(clipView, at: 0)
    edgePan.delegate = self
    edgePan.cancelsTouchesInView = false
    edgePan.delaysTouchesBegan = false
    edgePan.addTarget(self, action: #selector(handleEdgePan(_:)))
    addGestureRecognizer(edgePan)
    touchObserver.delegate = self
    touchObserver.onEnd = { [weak self] in self?.setNeedsLayout() }
    addGestureRecognizer(touchObserver)
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
    reconcileChildren()
    // A turn that arrives with its target's frame (the same commit) starts
    // first, at the frame of the page on screen.
    if positioned && appliedToken != navigationToken { applyNavigation() }
    // Never resized mid-turn: the turning leaf, its back and the page under
    // it keep the size the turn started with. `didFinishAnimating` (and a
    // requested turn's completion) lay out again and apply it.
    let overhang = NemuPageCurlOverhang.layout(frameSize: frame.size, spine: spineLocation)
    if !transitioning && (clipView.frame != frame || pageController.view.frame != overhang.pager) {
      // Only a new size re-sets the page on screen: a move (or a sub-point
      // rounding) keeps the controllers and the pages' drawn content as is.
      let resized = NemuPageCurlLeaves.needsReseat(from: pageController.view.frame.size, to: overhang.pager.size)
      clipView.frame = frame
      pageController.view.frame = overhang.pager
      if positioned && resized { reseatPending = true }
    }
    reseatAfterFrameChange()
    applyNavigation()
  }

  /**
   * After the frame changed (the next page's box, a fold, a rotation, a late
   * image size): the page on screen again, not animated, so UIKit lays its
   * controllers out at the new size.
   */
  private func reseatAfterFrameChange() {
    guard reseatPending, !transitioning, !touchObserver.touching, positioned, let pageController else { return }
    reseatPending = false
    guard let vcs = controllers(at: currentSlot) else { return }
    pageController.setViewControllers(vcs, direction: .forward, animated: false)
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

  private func background(for slot: Int) -> UIColor {
    slotBackgrounds[slot] ?? pageBackground
  }

  private func applyBackgrounds() {
    for (slot, controller) in controllers { controller.background = background(for: slot) }
    prepareBacks()
  }

  private func controller(for slot: Int) -> NemuPageCurlPageController? {
    guard slot >= 0, slot < slotCount else { return nil }
    if let existing = controllers[slot] { return existing }
    let created = NemuPageCurlPageController(slot: slot, background: background(for: slot))
    created.contentInsets = contentInsets
    controllers[slot] = created
    return created
  }

  private func normalizedSlot(_ slot: Int) -> Int {
    guard slotCount > 0 else { return 0 }
    let clamped = max(0, min(slotCount - 1, slot))
    return isMid ? clamped - clamped % 2 : clamped
  }

  /** `from`: the slot on screen as the turn starts. */
  private func controllers(at slot: Int, animated: Bool = false, from: Int? = nil) -> [UIViewController]? {
    guard let leaves = NemuPageCurlLeaves.shown(
      slot: slot, slotCount: slotCount, spine: spineLocation, animated: animated, from: from ?? currentSlot
    ) else { return nil }
    let shown = leaves.compactMap(controller(for:))
    return shown.count == leaves.count ? shown : nil
  }

  private func controller(for leaf: NemuPageCurlLeaf) -> UIViewController? {
    switch leaf {
    case .front(let slot): return controller(for: slot)
    case .back(let target, let source): return backController(target: target, showing: source)
    }
  }

  /**
   * The back of a single page's turning leaf: that leaf's page (`source`,
   * `NemuPageCurlLeaves.turningSlot`), mirrored, under the paper wash.
   * Rendered at the page controller's (frozen) size and shown unscaled.
   */
  private func backController(target: Int, showing source: Int) -> UIViewController? {
    guard let page = controller(for: source) else { return nil }
    let paper = background(for: source)
    let back = NemuPageCurlBackController(target: target, source: source, background: paper)
    back.show(backImage(source: source, page: page, paper: paper))
    return back
  }

  private func backImage(source: Int, page: NemuPageCurlPageController, paper: UIColor) -> UIImage? {
    let shownSize = page.isViewLoaded ? page.view.bounds.size : .zero
    let size = shownSize.width > 0 && shownSize.height > 0 ? shownSize : (pageController?.view.bounds.size ?? .zero)
    let key = "\(source):\(size.width)x\(size.height):\(paper.hashValue)"
    if let cached = backImages[key] { return cached }
    let image = Self.renderBack(page.view, size: size, paper: NemuPageCurlPaper.wash(over: paper))
    if let image { backImages[key] = image }
    return image
  }

  /**
   * After a turn settles: the backs the next turn either way shows, drawn on
   * the next run loop turn (the settled frame is on screen first), so a drag
   * starts without drawing one. Spreads have no drawn backs.
   */
  private func prepareBacks() {
    guard !isMid else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.transitioning, self.positioned else { return }
      let slot = self.currentSlot
      var keep = Set<String>()
      for target in [slot - 1, slot + 1] where target >= 0 && target < self.slotCount {
        let source = NemuPageCurlLeaves.turningSlot(from: slot, to: target, spine: self.spineLocation)
        guard let page = self.controller(for: source), page.hostsContent else { continue }
        _ = self.backImage(source: source, page: page, paper: self.background(for: source))
        keep.formUnion(self.backImages.keys.filter { $0.hasPrefix("\(source):") })
      }
      self.backImages = self.backImages.filter { keep.contains($0.key) }
    }
  }

  /**
   * UIKit draws a double-sided leaf's back controller as it is (readable, as
   * a book's verso), so the mirror is drawn here, once. Were the back ever
   * drawn mirrored by UIKit itself (it does that only for single-sided
   * leaves), this would read double-mirrored: flip `mirrorsBack`.
   */
  static let mirrorsBack = true

  private static func renderBack(_ view: UIView, size: CGSize, paper: UIColor) -> UIImage? {
    guard size.width > 0, size.height > 0 else { return nil }
    // An off-screen page's root view has no frame until the curl shows it.
    if view.superview == nil && view.bounds.size != size {
      view.frame = CGRect(origin: .zero, size: size)
    }
    view.layoutIfNeeded()
    let format = UIGraphicsImageRendererFormat.preferred()
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      let cg = context.cgContext
      cg.saveGState()
      if mirrorsBack {
        cg.translateBy(x: size.width, y: 0)
        cg.scaleBy(x: -1, y: 1)
      }
      view.layer.render(in: cg)
      cg.restoreGState()
      paper.setFill()
      cg.fill(CGRect(origin: .zero, size: size))
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
    // A finger is on the curl: setting the controllers now would fail its pan.
    if positioned && touchObserver.touching && appliedToken != navigationToken { return }
    let target = normalizedSlot(navigationIndex)
    if !positioned || (pageController.viewControllers ?? []).isEmpty {
      guard let vcs = controllers(at: target) else { return }
      pageController.setViewControllers(vcs, direction: .forward, animated: false)
      currentSlot = target
      positioned = true
      appliedToken = navigationToken
      prepareBacks()
      return
    }
    guard appliedToken != navigationToken else { return }
    appliedToken = navigationToken
    let frames = (target - currentSlot) / step
    let animated = navigationAnimated && abs(frames) == 1 && window != nil
    guard target != currentSlot, let vcs = controllers(at: target, animated: animated, from: currentSlot) else {
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
      onSettle(["slot": target, "token": appliedToken])
      onTurnEnd([:])
      prepareBacks()
    }
  }

  private func finishRequestedTurn(at slot: Int) {
    transitioning = false
    currentSlot = slot
    if appliedToken == navigationToken && normalizedSlot(navigationIndex) == slot {
      onSettle(["slot": slot, "token": appliedToken])
    }
    onTurnEnd([:])
    setNeedsLayout()
    prepareBacks()
  }

  // MARK: Page controller

  private func rebuildPageController() {
    if let old = pageController {
      old.willMove(toParent: nil)
      old.view.removeFromSuperview()
      old.removeFromParent()
    }
    let location: UIPageViewController.SpineLocation = spine == "mid" ? .mid : spine == "max" ? .max : .min
    let controller = NemuPageCurlController(
      transitionStyle: .pageCurl,
      navigationOrientation: .horizontal,
      options: [.spineLocation: NSNumber(value: location.rawValue)]
    )
    // Required for spreads; a single page's leaf back is its own page seen
    // through the paper (NemuPageCurlBackController).
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
    backImages.removeAll()
    positioned = false
    transitioning = false
    clipView.addSubview(controller.view)
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
          let next = NemuPageCurlLeaves.before(leaf, slotCount: slotCount, spine: spineLocation) else { return nil }
    return controller(for: next)
  }

  func pageViewController(_ pageViewController: UIPageViewController, viewControllerAfter viewController: UIViewController) -> UIViewController? {
    guard turningEnabled, let leaf = Self.leaf(of: viewController),
          let next = NemuPageCurlLeaves.after(leaf, slotCount: slotCount, spine: spineLocation) else { return nil }
    return controller(for: next)
  }

  private static func leaf(of controller: UIViewController) -> NemuPageCurlLeaf? {
    if let page = controller as? NemuPageCurlPageController { return .front(page.slot) }
    if let back = controller as? NemuPageCurlBackController { return .back(back.target, source: back.source) }
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
    prepareBacks()
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

/**
 * The curl's `UIPageViewController`. Its frame is the reader's `curlFrame`,
 * set by `NemuPageCurlView.layoutSubviews`, never the window's: a fold
 * (flat ⇄ book) or another window transition must not reach UIKit's own
 * size-transition handling. That re-laid a spread's pages through a
 * rasterized still for the system transition's length — the left (verso)
 * page of a `.mid` spread showed heavily blurred for ~0.4–0.6 s on every
 * fold, though nothing about the curl's frame had changed. A real frame
 * change is handled by the view (a non-animated re-set at the new size).
 */
final class NemuPageCurlController: UIPageViewController {
  override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
    // Deliberately not forwarded (see above). The page controllers hold
    // plain hosted views and have nothing to do for a window transition.
  }
}

/** One page of the curl: hosts the React child of its slot, if mounted. */
final class NemuPageCurlPageController: UIViewController {
  let slot: Int
  var background: UIColor {
    didSet { if isViewLoaded { view.backgroundColor = background } }
  }
  private weak var hosted: UIView?
  /** The page's place in the leaf: the leaf less the overhang past the spine. */
  var contentInsets: UIEdgeInsets = .zero {
    didSet { if contentInsets != oldValue && isViewLoaded { view.setNeedsLayout() } }
  }
  /** Holds the page, where it is on screen; the overhang beside it is only paper. */
  private let contentView = UIView()

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
    contentView.clipsToBounds = true
    view.addSubview(contentView)
    self.view = view
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    contentView.frame = view.bounds.inset(by: contentInsets)
  }

  /** A page is mounted here (its back can be drawn). */
  var hostsContent: Bool { hosted?.superview === contentView }

  func host(_ child: UIView?) {
    loadViewIfNeeded()
    if hosted === child, child?.superview === contentView { return }
    if let hosted, hosted.superview === contentView, hosted !== child { hosted.removeFromSuperview() }
    hosted = child
    if let child { contentView.addSubview(child) }
  }
}

/**
 * The back of a single page's turning leaf: a still of that leaf's page,
 * mirrored, under the paper wash (`NemuPageCurlPaper`).
 */
final class NemuPageCurlBackController: UIViewController {
  let target: Int
  /** The slot whose page the back shows (the leaf that turns). */
  let source: Int
  private let background: UIColor
  private let imageView = UIImageView()

  init(target: Int, source: Int, background: UIColor) {
    self.target = target
    self.source = source
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
    // Rendered at the leaf's own size: shown as is, never stretched.
    imageView.contentMode = .center
    view.addSubview(imageView)
    self.view = view
  }

  func show(_ image: UIImage?) {
    loadViewIfNeeded()
    imageView.image = image
  }
}

/** The wash over a single page's mirrored back: paper seen from behind. */
enum NemuPageCurlPaper {
  static let opacity: CGFloat = 0.85
  /** Light reader background: white paper; dark: #090a0d. */
  static func wash(over background: UIColor) -> UIColor {
    isLight(background)
      ? UIColor.white.withAlphaComponent(opacity)
      : UIColor(red: 9 / 255, green: 10 / 255, blue: 13 / 255, alpha: opacity)
  }

  /** WCAG relative luminance over 0.179, as `mobileReaderPageBackgroundIsLight`. */
  static func isLight(_ color: UIColor) -> Bool {
    var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
    guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return false }
    func linear(_ channel: CGFloat) -> CGFloat {
      let c = max(0, min(1, channel))
      return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue) > 0.179
  }
}

/** `slotBackgrounds` from JS: slot index (a string key) → `#rrggbb`. */
enum NemuSlotBackgrounds {
  static func parse(_ colors: [String: String]?) -> [Int: UIColor] {
    var out: [Int: UIColor] = [:]
    for (key, hex) in colors ?? [:] {
      guard let slot = Int(key), hex.count == 7, hex.hasPrefix("#"),
            let value = UInt32(hex.dropFirst(), radix: 16) else { continue }
      out[slot] = UIColor(
        red: CGFloat((value >> 16) & 0xff) / 255,
        green: CGFloat((value >> 8) & 0xff) / 255,
        blue: CGFloat(value & 0xff) / 255,
        alpha: 1
      )
    }
    return out
  }
}

/**
 * Watches for fingers on a view without ever recognizing: `touching` from the
 * first touch down to the last one up, `onEnd` once they are all up.
 */
final class NemuTouchObserver: UIGestureRecognizer {
  private(set) var touching = false
  var onEnd: (() -> Void)?

  override init(target: Any?, action: Selector?) {
    super.init(target: target, action: action)
    cancelsTouchesInView = false
    delaysTouchesBegan = false
    delaysTouchesEnded = false
  }

  convenience init() { self.init(target: nil, action: nil) }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    touching = true
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    finish(event)
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    finish(event)
  }

  private func finish(_ event: UIEvent) {
    let down = event.allTouches?.contains { $0.phase != .ended && $0.phase != .cancelled } ?? false
    guard !down else { return }
    // Never recognizes: it fails, and resets, once the fingers are up.
    state = .failed
  }

  override func reset() {
    super.reset()
    guard touching else { return }
    touching = false
    onEnd?()
  }
}
