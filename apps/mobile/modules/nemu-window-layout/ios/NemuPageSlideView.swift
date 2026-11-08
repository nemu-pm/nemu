import ExpoModulesCore
import UIKit

/**
 * The reader's slide page turn, as Books slides a page (`NemuPageSlideMotion`):
 * the page on top slides away with the finger and uncovers the next one,
 * which waits beneath; turning back, the previous page slides in on top.
 * Single pages and spreads are the same turn: a spread moves as one sheet.
 *
 * It takes the curl's props and children (`NemuPageCurlView`): a row of slots
 * in visual order, left to right, one per page or two per spread (`spine`
 * "mid"), each child tagged `nativeID="nemu-curl:<slot>"` and sized to one
 * leaf of `curlFrame`. Each frame (a page, or a spread's two slots) is a
 * sheet the size of the stage, painted with its own pages' backgrounds
 * (`slotBackgrounds`; a spread's halves each their own), so the background
 * travels with its page and the reader's own background never shows
 * mid-turn. The sheets reach past the pager to the window's top and bottom
 * (the status bar and home indicator bands, which the reader paints with
 * the settled page's colour only once a turn lands), clipped to the pager's
 * width so they never paint over a side bar; past a clipping stage they
 * continue as bands beneath it (`NemuPageSlideAmbient`).
 *
 * Navigation, `onSettle`, `onEdgeDrag` and `onTurnBegin` / `onTurnEnd` are
 * the curl's. A request that arrives while a turn animates finishes that
 * turn at once and starts from there, so quick taps keep up. Reduce Motion
 * cross-fades instead of sliding.
 */
final class NemuPageSlideView: ExpoView, UIGestureRecognizerDelegate {
  let onSettle = EventDispatcher()
  let onEdgeDrag = EventDispatcher()
  let onTurnBegin = EventDispatcher()
  let onTurnEnd = EventDispatcher()

  /** "min" / "max" (single pages; "max" is manga, the row RTL reversed) or "mid" (spreads). */
  var spine: String = "min" {
    didSet { if spine != oldValue { resetSheets() } }
  }
  /** Whether the row is reversed (manga): the earlier page is the one on the right. */
  var rtl = false {
    didSet { if rtl != oldValue { setNeedsLayout() } }
  }
  var slotCount: Int = 0 {
    didSet { if slotCount != oldValue { setNeedsLayout() } }
  }
  var curlFrame: CGRect = .zero {
    didSet { if curlFrame != oldValue { setNeedsLayout() } }
  }
  var turningEnabled: Bool = true {
    didSet {
      pan.isEnabled = turningEnabled
    }
  }
  var pageBackground: UIColor = .black {
    didSet { applyBackgrounds() }
  }
  var slotBackgrounds: [Int: UIColor] = [:] {
    didSet { applyBackgrounds() }
  }
  var navigationIndex = 0
  var navigationAnimated = false
  var navigationToken = -1 {
    didSet { if navigationToken != oldValue { setNeedsLayout() } }
  }

  private var managedChildren: [UIView] = []
  private var sheets: [Int: NemuPageSlideSheet] = [:]
  /** Holds the sheets: the pager's width, the window's height. */
  private let sheetHost = UIView()
  private let ambient = NemuPageSlideAmbient()
  /** Follows a settling turn's sheets with the ambient bands. */
  private var ambientLink: CADisplayLink?
  private var appliedToken = -1
  private var currentFrame = 0
  private var positioned = false
  private let pan = UIPanGestureRecognizer()

  /** The turn on screen: between `lower` and `lower + 1`, heading for `target`. */
  private struct Turn {
    var lower: Int
    var target: Int
    var start: Int
    var reduceMotion: Bool
    var gesture: Bool
  }
  private var turn: Turn?
  private var animator: UIViewPropertyAnimator?
  private var dragStartProgress: CGFloat = 0
  /** The drag that found no frame to turn to (past the first or last). */
  private var edgeDragStart: Int?

  private var isMid: Bool { spine == "mid" }
  private var step: Int { isMid ? 2 : 1 }
  private var frameCount: Int { slotCount <= 0 ? 0 : (slotCount + step - 1) / step }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    semanticContentAttribute = .forceLeftToRight
    sheetHost.clipsToBounds = true
    addSubview(sheetHost)
    pan.delegate = self
    pan.maximumNumberOfTouches = 1
    pan.addTarget(self, action: #selector(handlePan(_:)))
    addGestureRecognizer(pan)
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
    if window == nil {
      stopAmbientLink()
      ambient.detach()
    }
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sheetHost.frame = sheetBand
    reconcileChildren()
    for (frame, sheet) in sheets {
      // Mid-turn sheets keep their transforms; only their size follows.
      layout(sheet)
      if turn == nil { sheet.isHidden = frame != currentFrame }
    }
    applyNavigation()
    ambient.attach(below: clippingAncestor())
    updateAmbient()
  }

  /** The nearest ancestor that clips this view short of the window (the reader's constrained stage). */
  private func clippingAncestor() -> UIView? {
    guard let window else { return nil }
    var view = superview
    while let current = view, current !== window {
      if current.clipsToBounds {
        let rect = current.convert(current.bounds, to: window)
        let short = rect.minY > window.bounds.minY + 0.5 || rect.maxY < window.bounds.maxY - 0.5
          || rect.minX > window.bounds.minX + 0.5 || rect.maxX < window.bounds.maxX - 0.5
        return short ? current : nil
      }
      view = current.superview
    }
    return nil
  }

  /** The ambient bands at the sheets on screen (`presentation`: as drawn mid-animation). */
  private func updateAmbient(presentation: Bool = false) {
    guard let host = ambient.host, let window else { return }
    let vertical = host.convert(window.bounds, from: window)
    let pager = convert(bounds, to: host)
    let order = sheetHost.subviews
    let shown = sheets.values
      .filter { !$0.isHidden }
      .sorted { (order.firstIndex(of: $0) ?? 0) < (order.firstIndex(of: $1) ?? 0) }
    ambient.show(shown.map { sheet in
      let layer = presentation ? (sheet.layer.presentation() ?? sheet.layer) : sheet.layer
      return NemuPageSlideAmbient.Band(
        frame: CGRect(x: pager.minX + layer.affineTransform().tx, y: vertical.minY, width: pager.width, height: vertical.height),
        spineX: sheet.spineX,
        left: sheet.leftColor,
        right: sheet.rightColor,
        alpha: CGFloat(layer.opacity),
        dim: sheet.dimAlpha(presentation: presentation)
      )
    })
  }

  private func startAmbientLink() {
    guard ambient.host != nil, ambientLink == nil else { return }
    let link = CADisplayLink(target: self, selector: #selector(ambientTick))
    link.add(to: .main, forMode: .common)
    ambientLink = link
  }

  private func stopAmbientLink() {
    ambientLink?.invalidate()
    ambientLink = nil
  }

  @objc private func ambientTick() {
    updateAmbient(presentation: true)
  }

  /** The pager's width, from the window's top to its bottom (this view's coordinates). */
  private var sheetBand: CGRect {
    guard let window else { return bounds }
    let windowRect = convert(window.bounds, from: window)
    let top = min(bounds.minY, windowRect.minY)
    let bottom = max(bounds.maxY, windowRect.maxY)
    return CGRect(x: bounds.minX, y: top, width: bounds.width, height: bottom - top)
  }

  private func layout(_ sheet: NemuPageSlideSheet) {
    let band = sheetHost.frame
    sheet.bounds = CGRect(origin: .zero, size: band.size)
    sheet.center = CGPoint(x: band.width / 2, y: band.height / 2)
    // The leaves sit where the pager lays them out, inside the taller band.
    let curl = curlFrame.width > 0 && curlFrame.height > 0 ? curlFrame : bounds
    sheet.layoutLeaves(curlFrame: curl.offsetBy(dx: -band.minX, dy: -band.minY), mid: isMid)
  }

  private func reconcileChildren() {
    var byFrame: [Int: [Int: UIView]] = [:]
    for child in managedChildren {
      guard let slot = Self.slot(of: child), slot >= 0, slot < slotCount else { continue }
      byFrame[slot / step, default: [:]][slot % step] = child
    }
    for (frame, parts) in byFrame {
      let sheet = sheet(for: frame)
      for part in 0..<step { sheet.host(parts[part], part: part) }
    }
    let busy = Set([turn?.lower, turn.map { $0.lower + 1 }, currentFrame].compactMap { $0 })
    for (frame, sheet) in sheets where byFrame[frame] == nil {
      for part in 0..<2 { sheet.host(nil, part: part) }
      if !busy.contains(frame) && abs(frame - currentFrame) > 4 {
        sheet.removeFromSuperview()
        sheets.removeValue(forKey: frame)
      }
    }
  }

  private func sheet(for frame: Int) -> NemuPageSlideSheet {
    if let existing = sheets[frame] { return existing }
    let sheet = NemuPageSlideSheet()
    sheet.isHidden = true
    sheets[frame] = sheet
    sheetHost.insertSubview(sheet, at: 0)
    applyBackground(to: sheet, frame: frame)
    layout(sheet)
    return sheet
  }

  private func resetSheets() {
    stopAmbientLink()
    animator?.stopAnimation(true)
    animator = nil
    turn = nil
    for sheet in sheets.values { sheet.removeFromSuperview() }
    sheets.removeAll()
    positioned = false
    setNeedsLayout()
  }

  private func applyBackgrounds() {
    for (frame, sheet) in sheets { applyBackground(to: sheet, frame: frame) }
    updateAmbient()
  }

  private func applyBackground(to sheet: NemuPageSlideSheet, frame: Int) {
    let first = slotBackgrounds[frame * step] ?? pageBackground
    let second = isMid ? (slotBackgrounds[frame * step + 1] ?? first) : first
    sheet.setBackgrounds(left: first, right: second)
  }

  // MARK: Navigation

  /** The navigation JS is about to commit as props, applied now. */
  func requestTurn(slot: Int, animated: Bool, token: Int) {
    navigationIndex = slot
    navigationAnimated = animated
    navigationToken = token
    layoutIfNeeded()
  }

  private func frame(forSlot slot: Int) -> Int {
    guard frameCount > 0 else { return 0 }
    return max(0, min(frameCount - 1, slot / step))
  }

  private func applyNavigation() {
    guard frameCount > 0 else { return }
    let target = frame(forSlot: navigationIndex)
    if !positioned {
      currentFrame = target
      positioned = true
      appliedToken = navigationToken
      showResting()
      return
    }
    guard appliedToken != navigationToken else { return }
    // A finger on the page owns it; the request waits for the release.
    if let turn, turn.gesture, animator == nil { return }
    // Quick taps: the turn in flight lands now and the next starts from there.
    finishAnimationNow()
    appliedToken = navigationToken
    let animated = navigationAnimated && abs(target - currentFrame) == 1 && window != nil && bounds.width > 0
    guard target != currentFrame else {
      onTurnEnd([:])
      return
    }
    guard animated else {
      currentFrame = target
      showResting()
      onSettle(["slot": target * step, "token": appliedToken])
      onTurnEnd([:])
      return
    }
    beginTurn(to: target, gesture: false)
    animateTurn(toTarget: true, velocity: 0)
  }

  private func showResting() {
    for (frame, sheet) in sheets {
      sheet.transform = .identity
      sheet.alpha = 1
      sheet.setDim(0)
      sheet.setShadow(0, edge: .none)
      sheet.isHidden = frame != currentFrame
    }
    updateAmbient()
  }

  // MARK: Turning

  private func progress(of frame: Int, lower: Int) -> CGFloat { frame == lower ? 0 : 1 }

  private func beginTurn(to target: Int, gesture: Bool) {
    let lower = min(currentFrame, target)
    turn = Turn(
      lower: lower,
      target: target,
      start: currentFrame,
      reduceMotion: UIAccessibility.isReduceMotionEnabled,
      gesture: gesture
    )
    let lowerSheet = sheet(for: lower)
    let upperSheet = sheet(for: lower + 1)
    for (frame, sheet) in sheets { sheet.isHidden = frame != lower && frame != lower + 1 }
    // The earlier page in reading order on top.
    sheetHost.bringSubviewToFront(NemuPageSlideMotion.lowerOnTop(rtl: rtl) ? lowerSheet : upperSheet)
    apply(progress: progress(of: currentFrame, lower: lower))
    onTurnBegin(["slot": target * step])
  }

  /** `ambient`: false inside an animation block (the display link follows it instead). */
  private func apply(progress: CGFloat, ambient updatesAmbient: Bool = true) {
    guard let turn, let lowerSheet = sheets[turn.lower], let upperSheet = sheets[turn.lower + 1] else { return }
    let pose = NemuPageSlideMotion.pose(progress: progress, width: bounds.width, rtl: rtl, reduceMotion: turn.reduceMotion)
    lowerSheet.transform = CGAffineTransform(translationX: pose.lowerX, y: 0)
    upperSheet.transform = CGAffineTransform(translationX: pose.upperX, y: 0)
    lowerSheet.alpha = pose.lowerAlpha
    upperSheet.alpha = pose.upperAlpha
    let (top, beneath) = pose.lowerOnTop ? (lowerSheet, upperSheet) : (upperSheet, lowerSheet)
    top.setDim(0)
    beneath.setDim(pose.dim)
    // The shadow falls on the page beneath, past the top page's moving edge.
    top.setShadow(pose.shadow, edge: pose.lowerOnTop ? .right : .left)
    beneath.setShadow(0, edge: .none)
    if updatesAmbient { updateAmbient() }
  }

  /**
   * Settles the turn on a critically damped spring (no bounce): on to the
   * target, or back to where it started.
   */
  private func animateTurn(toTarget: Bool, velocity: CGFloat) {
    guard let turn else { return }
    let end = toTarget ? turn.target : turn.start
    let endProgress = progress(of: end, lower: turn.lower)
    let remaining = (endProgress - currentProgress()) * bounds.width
    let relative = NemuPageSlideMotion.springVelocity(velocity: velocity, remaining: remaining)
    // Critically damped, settling in about a third of a second (Books' pace).
    let stiffness = NemuPageSlideMotion.stiffness
    let timing = UISpringTimingParameters(
      mass: 1,
      stiffness: stiffness,
      damping: 2 * sqrt(stiffness),
      initialVelocity: CGVector(dx: relative, dy: 0)
    )
    let animator = UIViewPropertyAnimator(duration: 0.35, timingParameters: timing)
    animator.isUserInteractionEnabled = true
    animator.addAnimations { [weak self] in self?.apply(progress: endProgress, ambient: false) }
    animator.addCompletion { [weak self] _ in self?.finishTurn(at: end) }
    self.animator = animator
    animator.startAnimation()
    startAmbientLink()
  }

  /** The progress the sheets are posed at (read with no animation running). */
  private func currentProgress() -> CGFloat {
    guard let turn, let lowerSheet = sheets[turn.lower], let upperSheet = sheets[turn.lower + 1], bounds.width > 0 else { return 0 }
    let lowerTop = NemuPageSlideMotion.lowerOnTop(rtl: rtl)
    let top = lowerTop ? lowerSheet : upperSheet
    if turn.reduceMotion { return lowerTop ? 1 - top.alpha : top.alpha }
    let x = top.transform.tx
    return lowerTop ? -x / bounds.width : 1 - x / bounds.width
  }

  private func finishAnimationNow() {
    guard let animator else { return }
    self.animator = nil
    animator.stopAnimation(false)
    animator.finishAnimation(at: .end)
  }

  private func finishTurn(at frame: Int) {
    guard let turn else { return }
    animator = nil
    stopAmbientLink()
    self.turn = nil
    let moved = frame != currentFrame
    currentFrame = frame
    showResting()
    if moved && (turn.gesture || (appliedToken == navigationToken && self.frame(forSlot: navigationIndex) == frame)) {
      var event: [String: Any] = ["slot": frame * step]
      if turn.gesture { event["gesture"] = true } else { event["token"] = appliedToken }
      onSettle(event)
    }
    onTurnEnd([:])
    setNeedsLayout()
  }

  // MARK: Gesture

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === pan else { return super.gestureRecognizerShouldBegin(gestureRecognizer) }
    // Mostly sideways. A drag can arrive with no velocity yet (its first
    // move), so the distance already moved counts too.
    let velocity = pan.velocity(in: self)
    let moved = pan.translation(in: self)
    return turningEnabled && abs(velocity.x) + abs(moved.x) > abs(velocity.y) + abs(moved.y)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    // As the curl's edge pan: the page's own gestures keep working (a zoomed
    // page turns nothing, `turningEnabled`).
    true
  }

  @objc private func handlePan(_ pan: UIPanGestureRecognizer) {
    let translation = pan.translation(in: self).x
    let width = max(1, bounds.width)
    switch pan.state {
    case .began, .changed:
      if turn == nil || animator != nil {
        // Grabbing a page that is still settling lands it first.
        if animator != nil { finishAnimationNow() }
        guard translation != 0, edgeDragStart == nil else { return }
        guard let target = NemuPageSlideMotion.target(current: currentFrame, translation: translation, frameCount: frameCount) else {
          edgeDragStart = currentFrame
          return
        }
        beginTurn(to: target, gesture: true)
        // The whole drag counts (the slop included): the page sits under the finger.
        dragStartProgress = progress(of: currentFrame, lower: min(currentFrame, target))
        apply(progress: NemuPageSlideMotion.progress(from: dragStartProgress, translation: translation, width: width))
        return
      }
      apply(progress: NemuPageSlideMotion.progress(from: dragStartProgress, translation: translation, width: width))
    case .ended, .cancelled, .failed:
      if let start = edgeDragStart {
        edgeDragStart = nil
        let total = pan.translation(in: self)
        if pan.state == .ended, start == currentFrame, abs(total.x) > 40, abs(total.x) > abs(total.y) * 1.5 {
          // Finger right-to-left asks for the frame on the right ("after").
          onEdgeDrag(["side": total.x < 0 ? "after" : "before"])
        }
        return
      }
      guard let turn, turn.gesture, animator == nil else { return }
      let p = NemuPageSlideMotion.progress(from: dragStartProgress, translation: translation, width: width)
      let targetProgress = progress(of: turn.target, lower: turn.lower)
      // Toward the target: progress rising for `upper`, falling for `lower`.
      let sign: CGFloat = targetProgress > dragStartProgress ? 1 : -1
      let moved = max(0, min(1, (p - dragStartProgress) * sign))
      // The finger heading left raises progress.
      let velocity = -pan.velocity(in: self).x * sign
      let completes = pan.state == .ended && NemuPageSlideMotion.completes(moved: moved, velocity: velocity, width: width)
      animateTurn(toTarget: completes, velocity: completes ? velocity : -velocity)
    default:
      break
    }
  }
}

/**
 * One frame of the slide: a stage-sized sheet painted with its pages'
 * backgrounds (a spread's halves each their own), hosting the frame's slot
 * children at their leaves, with the dim it takes beneath a turning page and
 * the shadow it casts past its moving edge.
 */
final class NemuPageSlideSheet: UIView {
  enum ShadowEdge { case none, left, right }

  private let leftBackground = UIView()
  private let rightBackground = UIView()
  private let leaves = [UIView(), UIView()]
  private weak var hosted0: UIView?
  private weak var hosted1: UIView?
  private let dimView = UIView()
  private let shadowView = NemuPageSlideShadowView()
  private(set) var spineX: CGFloat = 0
  private(set) var leftColor: UIColor = .clear
  private(set) var rightColor: UIColor = .clear
  private var shadowEdge: ShadowEdge = .none

  static let shadowWidth: CGFloat = 28

  override init(frame: CGRect) {
    super.init(frame: frame)
    // The shadow hangs past the sheet's edge.
    clipsToBounds = false
    for leaf in leaves { leaf.clipsToBounds = true }
    addSubview(leftBackground)
    addSubview(rightBackground)
    for leaf in leaves { addSubview(leaf) }
    dimView.backgroundColor = .black
    dimView.alpha = 0
    dimView.isUserInteractionEnabled = false
    addSubview(dimView)
    shadowView.alpha = 0
    shadowView.isUserInteractionEnabled = false
    addSubview(shadowView)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  func setBackgrounds(left: UIColor, right: UIColor) {
    leftColor = left
    rightColor = right
    leftBackground.backgroundColor = left
    rightBackground.backgroundColor = right
  }

  func dimAlpha(presentation: Bool) -> CGFloat {
    let layer = presentation ? (dimView.layer.presentation() ?? dimView.layer) : dimView.layer
    return CGFloat(layer.opacity)
  }

  func layoutLeaves(curlFrame: CGRect, mid: Bool) {
    let size = bounds.size
    if mid {
      spineX = curlFrame.midX
      leaves[0].frame = CGRect(x: curlFrame.minX, y: curlFrame.minY, width: curlFrame.width / 2, height: curlFrame.height)
      leaves[1].frame = CGRect(x: curlFrame.midX, y: curlFrame.minY, width: curlFrame.width / 2, height: curlFrame.height)
    } else {
      spineX = size.width
      leaves[0].frame = curlFrame
      leaves[1].frame = .zero
    }
    leftBackground.frame = CGRect(x: 0, y: 0, width: spineX, height: size.height)
    rightBackground.frame = CGRect(x: spineX, y: 0, width: max(0, size.width - spineX), height: size.height)
    dimView.frame = bounds
    layoutShadow()
  }

  func host(_ child: UIView?, part: Int) {
    guard part >= 0, part < leaves.count else { return }
    let leaf = leaves[part]
    let current = part == 0 ? hosted0 : hosted1
    if current === child, child?.superview === leaf { return }
    if let current, current.superview === leaf, current !== child { current.removeFromSuperview() }
    if part == 0 { hosted0 = child } else { hosted1 = child }
    if let child { leaf.addSubview(child) }
  }

  func setDim(_ alpha: CGFloat) {
    dimView.alpha = alpha
  }

  func setShadow(_ alpha: CGFloat, edge: ShadowEdge) {
    if edge != .none && edge != shadowEdge {
      shadowEdge = edge
      layoutShadow()
    }
    shadowView.alpha = alpha
  }

  private func layoutShadow() {
    let width = Self.shadowWidth
    switch shadowEdge {
    case .right:
      shadowView.frame = CGRect(x: bounds.width, y: 0, width: width, height: bounds.height)
      shadowView.fadesTowardRight = true
    case .left, .none:
      shadowView.frame = CGRect(x: -width, y: 0, width: width, height: bounds.height)
      shadowView.fadesTowardRight = false
    }
  }
}

/** The soft shadow a sliding page casts: black fading out away from its edge. */
final class NemuPageSlideShadowView: UIView {
  override class var layerClass: AnyClass { CAGradientLayer.self }

  var fadesTowardRight = true {
    didSet { applyDirection() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    guard let gradient = layer as? CAGradientLayer else { return }
    // Eased falloff: strongest at the edge, gone well before the far side.
    gradient.colors = [
      UIColor.black.withAlphaComponent(0.28).cgColor,
      UIColor.black.withAlphaComponent(0.12).cgColor,
      UIColor.black.withAlphaComponent(0.04).cgColor,
      UIColor.black.withAlphaComponent(0).cgColor,
    ]
    gradient.locations = [0, 0.3, 0.65, 1]
    applyDirection()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  private func applyDirection() {
    guard let gradient = layer as? CAGradientLayer else { return }
    gradient.startPoint = CGPoint(x: fadesTowardRight ? 0 : 1, y: 0.5)
    gradient.endPoint = CGPoint(x: fadesTowardRight ? 1 : 0, y: 0.5)
  }
}

/**
 * The sheets' backgrounds continued past the reader stage's clip: a layer at
 * the bottom of the clipping ancestor's superview, the window's height, with
 * one band per sheet on screen at that sheet's offset and colours (a
 * spread's halves each their own). The reader paints the area round a
 * constrained stage (status bar, home indicator, a docked rail's side) with
 * the settled page's colour only once a turn lands; the bands turn with the
 * pages instead, and at rest they show the page on screen, so a late commit
 * of that colour never shows either. Every view above it (the stage, the
 * chrome, a side bar) still draws over it.
 */
final class NemuPageSlideAmbient {
  struct Band {
    /** In the host's coordinates. */
    var frame: CGRect
    var spineX: CGFloat
    var left: UIColor
    var right: UIColor
    var alpha: CGFloat
    /** The black wash over a page beneath a turning one. */
    var dim: CGFloat
  }

  private let root = CALayer()
  private var bands: [(container: CALayer, left: CALayer, right: CALayer, dim: CALayer)] = []
  private(set) weak var host: UIView?

  init() {
    root.masksToBounds = false
  }

  private weak var clip: UIView?

  /**
   * Installs the layer just beneath `clip` (the clipping stage) in its
   * superview: above whatever that superview paints behind the stage, below
   * the stage and everything after it. Nil removes it.
   */
  func attach(below clip: UIView?) {
    let host = clip?.superview
    guard clip !== self.clip || host !== self.host || root.superlayer !== host?.layer else { return }
    root.removeFromSuperlayer()
    self.clip = clip
    self.host = host
    guard let clip, let host else { return }
    host.layer.insertSublayer(root, below: clip.layer)
  }

  /** Bands bottom to top. */
  func show(_ next: [Band]) {
    guard let host else { return }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    root.frame = host.bounds
    while bands.count < next.count {
      let container = CALayer(), left = CALayer(), right = CALayer(), dim = CALayer()
      dim.backgroundColor = UIColor.black.cgColor
      container.addSublayer(left)
      container.addSublayer(right)
      container.addSublayer(dim)
      root.addSublayer(container)
      bands.append((container, left, right, dim))
    }
    for (index, layers) in bands.enumerated() {
      guard index < next.count else {
        layers.container.isHidden = true
        continue
      }
      let band = next[index]
      layers.container.isHidden = false
      layers.container.frame = band.frame
      layers.container.opacity = Float(band.alpha)
      let spine = max(0, min(band.frame.width, band.spineX))
      layers.left.frame = CGRect(x: 0, y: 0, width: spine, height: band.frame.height)
      layers.right.frame = CGRect(x: spine, y: 0, width: band.frame.width - spine, height: band.frame.height)
      layers.left.backgroundColor = band.left.cgColor
      layers.right.backgroundColor = band.right.cgColor
      layers.dim.frame = CGRect(origin: .zero, size: band.frame.size)
      layers.dim.opacity = Float(band.dim)
      layers.container.zPosition = CGFloat(index)
    }
    CATransaction.commit()
  }

  func detach() {
    root.removeFromSuperlayer()
    host = nil
    clip = nil
  }
}
