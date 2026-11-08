import ExpoModulesCore
import UIKit

/**
 * The reader's push page turn ("Push"), as Photos pages: the frames sit side by side
 * in a paging scroll view, a small gap between them in the page background
 * (`NemuPagePushPaging`), and the next frame pushes in with the current one.
 * The strip follows the finger one to one and lets go with UIScrollView's own
 * paging: deceleration, the flick's speed, and rubber-banding past either end
 * (pulled far enough there, `onEdgeDrag` asks for the chapter before or
 * after). No sheet on top, no edge shadow, no dim or parallax. Single pages
 * and spreads are the same: a spread is one frame.
 *
 * It takes the curl's props and children (`NemuPageCurlView`): a row of slots
 * in visual order, left to right, one per page or two per spread (`spine`
 * "mid"), each child tagged `nativeID="nemu-curl:<slot>"` and sized to one
 * leaf of `curlFrame`. Each frame is a sheet the size of the stage, painted
 * with its own pages' backgrounds (`slotBackgrounds`; a spread's halves each
 * their own), so the background travels with its page. The sheets reach past
 * the pager to the window's top and bottom (the status bar and home indicator
 * bands), clipped to the pager's width so they never paint over a side bar;
 * past a clipping stage they continue as bands beneath it
 * (`NemuPagePushAmbient`).
 *
 * Navigation, `onSettle`, `onEdgeDrag` and `onTurnBegin` / `onTurnEnd` are
 * the curl's. A tap or slider step scrolls to its frame (a request during
 * another goes on from where the strip is); a request while a finger is on
 * the strip waits for it to settle. Reduce Motion: the finger still moves the
 * strip, as in Photos; a requested turn cross-fades.
 */
final class NemuPagePushView: ExpoView, UIScrollViewDelegate {
  let onSettle = EventDispatcher()
  let onEdgeDrag = EventDispatcher()
  let onTurnBegin = EventDispatcher()
  let onTurnEnd = EventDispatcher()

  /** "min" / "max" (single pages; "max" is manga, the row RTL reversed) or "mid" (spreads). */
  var spine: String = "min" {
    didSet { if spine != oldValue { resetSheets() } }
  }
  /** Whether the row is reversed (manga). The row is already in visual order; kept for the props. */
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
    didSet { scrollView.isScrollEnabled = turningEnabled }
  }
  var pageBackground: UIColor = .white {
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
  private var sheets: [Int: NemuPagePushSheet] = [:]
  /** Clips the strip to the pager's width, from the window's top to its bottom. */
  private let sheetHost = UIView()
  private let scrollView = NemuPagePushScrollView()
  private let ambient = NemuPagePushAmbient()
  private var appliedToken = -1
  private var currentFrame = 0
  private var positioned = false
  /** The strip is moving (a drag, its deceleration, a requested scroll): `onTurnBegin` was sent. */
  private var moving = false
  /** The frame a requested scroll is heading for (nil: the finger's). */
  private var requestedFrame: Int?
  /** Laid out at this width: a new one puts the frame on screen back in place. */
  private var laidOutWidth: CGFloat = 0

  private var isMid: Bool { spine == "mid" }
  private var step: Int { isMid ? 2 : 1 }
  private var frameCount: Int { slotCount <= 0 ? 0 : (slotCount + step - 1) / step }
  private var pageWidth: CGFloat { bounds.width }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    semanticContentAttribute = .forceLeftToRight
    sheetHost.clipsToBounds = true
    addSubview(sheetHost)
    scrollView.delegate = self
    scrollView.isPagingEnabled = true
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.showsVerticalScrollIndicator = false
    scrollView.alwaysBounceHorizontal = true
    scrollView.alwaysBounceVertical = false
    scrollView.isDirectionalLockEnabled = true
    scrollView.scrollsToTop = false
    scrollView.delaysContentTouches = false
    scrollView.contentInsetAdjustmentBehavior = .never
    scrollView.clipsToBounds = false
    scrollView.semanticContentAttribute = .forceLeftToRight
    sheetHost.addSubview(scrollView)
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
    if window == nil { ambient.detach() }
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let band = sheetBand
    sheetHost.frame = band
    scrollView.backgroundColor = pageBackground
    // One gap wider than the pager: a frame at rest fills it, its gap just past the edge.
    let scrollFrame = CGRect(x: 0, y: 0, width: NemuPagePushPaging.stride(width: pageWidth), height: band.height)
    let resized = abs(laidOutWidth - pageWidth) > 0.5
    if scrollView.frame != scrollFrame { scrollView.frame = scrollFrame }
    let contentSize = CGSize(width: NemuPagePushPaging.contentWidth(frameCount: frameCount, width: pageWidth), height: band.height)
    if scrollView.contentSize != contentSize { scrollView.contentSize = contentSize }
    reconcileChildren()
    for (frame, sheet) in sheets { layout(sheet, frame: frame) }
    if resized {
      laidOutWidth = pageWidth
      // A new size (rotation, fold): the frame on screen stays on screen.
      if positioned && !scrollView.isTracking && !scrollView.isDecelerating {
        scrollView.setContentOffset(CGPoint(x: NemuPagePushPaging.offset(frame: currentFrame, width: pageWidth), y: 0), animated: false)
      }
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

  /** The ambient bands at the sheets on screen, where the strip has them now. */
  private func updateAmbient() {
    guard let host = ambient.host, let window else { return }
    let vertical = host.convert(window.bounds, from: window)
    let pager = convert(bounds, to: host)
    let offset = scrollView.contentOffset.x
    let shown = sheets.values
      .map { (sheet: $0, x: $0.frame.minX - offset) }
      .filter { $0.x < pager.width && $0.x + pager.width > 0 }
      .sorted { $0.x < $1.x }
    ambient.show(shown.map { entry in
      NemuPagePushAmbient.Band(
        frame: CGRect(x: pager.minX + entry.x, y: vertical.minY, width: pager.width, height: vertical.height),
        spineX: entry.sheet.spineX,
        left: entry.sheet.leftColor,
        right: entry.sheet.rightColor
      )
    })
  }

  /** The pager's width, from the window's top to its bottom (this view's coordinates). */
  private var sheetBand: CGRect {
    guard let window else { return bounds }
    let windowRect = convert(window.bounds, from: window)
    let top = min(bounds.minY, windowRect.minY)
    let bottom = max(bounds.maxY, windowRect.maxY)
    return CGRect(x: bounds.minX, y: top, width: bounds.width, height: bottom - top)
  }

  private func layout(_ sheet: NemuPagePushSheet, frame: Int) {
    let band = sheetHost.frame
    sheet.frame = CGRect(
      x: NemuPagePushPaging.offset(frame: frame, width: pageWidth),
      y: 0,
      width: band.width,
      height: band.height
    )
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
    let shown = NemuPagePushPaging.frame(atOffset: scrollView.contentOffset.x, width: pageWidth, frameCount: frameCount)
    for (frame, sheet) in sheets where byFrame[frame] == nil {
      for part in 0..<2 { sheet.host(nil, part: part) }
      if abs(frame - currentFrame) > 4 && abs(frame - shown) > 1 {
        sheet.removeFromSuperview()
        sheets.removeValue(forKey: frame)
      }
    }
  }

  private func sheet(for frame: Int) -> NemuPagePushSheet {
    if let existing = sheets[frame] { return existing }
    let sheet = NemuPagePushSheet()
    sheets[frame] = sheet
    scrollView.addSubview(sheet)
    applyBackground(to: sheet, frame: frame)
    layout(sheet, frame: frame)
    return sheet
  }

  private func resetSheets() {
    for sheet in sheets.values { sheet.removeFromSuperview() }
    sheets.removeAll()
    positioned = false
    requestedFrame = nil
    setNeedsLayout()
  }

  private func applyBackgrounds() {
    scrollView.backgroundColor = pageBackground
    for (frame, sheet) in sheets { applyBackground(to: sheet, frame: frame) }
    updateAmbient()
  }

  private func applyBackground(to sheet: NemuPagePushSheet, frame: Int) {
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
    guard frameCount > 0, pageWidth > 0 else { return }
    let target = frame(forSlot: navigationIndex)
    if !positioned {
      currentFrame = target
      positioned = true
      appliedToken = navigationToken
      laidOutWidth = pageWidth
      scrollView.setContentOffset(CGPoint(x: NemuPagePushPaging.offset(frame: target, width: pageWidth), y: 0), animated: false)
      return
    }
    guard appliedToken != navigationToken else { return }
    // A finger on the strip owns it; the request waits for it to settle.
    if scrollView.isTracking || (scrollView.isDecelerating && requestedFrame == nil) { return }
    appliedToken = navigationToken
    let destination = CGPoint(x: NemuPagePushPaging.offset(frame: target, width: pageWidth), y: 0)
    let animated = navigationAnimated && abs(target - currentFrame) == 1 && window != nil
    guard target != currentFrame || requestedFrame != nil else {
      onTurnEnd([:])
      return
    }
    beginMoving(toward: target)
    requestedFrame = target
    if animated && UIAccessibility.isReduceMotionEnabled {
      UIView.transition(with: sheetHost, duration: 0.2, options: [.transitionCrossDissolve, .allowUserInteraction]) {
        self.scrollView.setContentOffset(destination, animated: false)
      } completion: { [weak self] _ in self?.settle() }
      updateAmbient()
    } else if animated {
      // A tap during another turn goes on from where the strip is.
      scrollView.setContentOffset(destination, animated: true)
    } else {
      scrollView.setContentOffset(destination, animated: false)
      settle()
    }
  }

  private func beginMoving(toward target: Int?) {
    guard !moving else { return }
    moving = true
    onTurnBegin(["slot": (target ?? currentFrame) * step])
  }

  /** The strip has come to rest: report where, as the curl does. */
  private func settle() {
    let frame = NemuPagePushPaging.frame(atOffset: scrollView.contentOffset.x, width: pageWidth, frameCount: frameCount)
    let requested = requestedFrame
    requestedFrame = nil
    let moved = frame != currentFrame
    currentFrame = frame
    if requested == nil {
      if moved { onSettle(["slot": frame * step, "gesture": true]) }
    } else if appliedToken == navigationToken && self.frame(forSlot: navigationIndex) == frame {
      onSettle(["slot": frame * step, "token": appliedToken])
    }
    if moving {
      moving = false
      onTurnEnd([:])
    }
    updateAmbient()
    // A request that waited for the finger.
    setNeedsLayout()
  }

  // MARK: UIScrollViewDelegate

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    // Grabbing a requested scroll in flight: the finger takes it from here.
    requestedFrame = nil
    beginMoving(toward: nil)
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    updateAmbient()
  }

  func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
    // Pulled past the first or last frame: the chapter before or after.
    if let side = NemuPagePushPaging.edgeDrag(offset: scrollView.contentOffset.x, width: pageWidth, frameCount: frameCount) {
      onEdgeDrag(["side": side])
    }
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { settle() }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    settle()
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    settle()
  }
}

/**
 * The slide's paging scroll view. Recognises alongside the page's own
 * gestures, as the turn's pan always did (a zoomed page turns nothing:
 * `turningEnabled` switches scrolling off).
 */
final class NemuPagePushScrollView: UIScrollView {
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === panGestureRecognizer else { return false }
    // Never alongside another scroll view's pan (a page's own strip scrolls).
    return !(otherGestureRecognizer.view is UIScrollView)
  }
}

/**
 * One frame of the slide: a stage-sized sheet painted with its pages'
 * backgrounds (a spread's halves each their own), hosting the frame's slot
 * children at their leaves.
 */
final class NemuPagePushSheet: UIView {
  private let leftBackground = UIView()
  private let rightBackground = UIView()
  private let leaves = [UIView(), UIView()]
  private weak var hosted0: UIView?
  private weak var hosted1: UIView?
  private(set) var spineX: CGFloat = 0
  private(set) var leftColor: UIColor = .clear
  private(set) var rightColor: UIColor = .clear

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    for leaf in leaves { leaf.clipsToBounds = true }
    addSubview(leftBackground)
    addSubview(rightBackground)
    for leaf in leaves { addSubview(leaf) }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  func setBackgrounds(left: UIColor, right: UIColor) {
    leftColor = left
    rightColor = right
    leftBackground.backgroundColor = left
    rightBackground.backgroundColor = right
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
}

/**
 * The sheets' backgrounds continued past the reader stage's clip: a layer at
 * the bottom of the clipping ancestor's superview, the window's height, with
 * one band per sheet on screen at that sheet's offset and colours (a
 * spread's halves each their own). The reader paints the area round a
 * constrained stage (status bar, home indicator, a docked rail's side) with
 * the settled page's colour only once a turn lands; the bands move with the
 * pages instead, and at rest they show the page on screen, so a late commit
 * of that colour never shows either. Every view above it (the stage, the
 * chrome, a side bar) still draws over it.
 */
final class NemuPagePushAmbient {
  struct Band {
    /** In the host's coordinates. */
    var frame: CGRect
    var spineX: CGFloat
    var left: UIColor
    var right: UIColor
  }

  private let root = CALayer()
  private var bands: [(container: CALayer, left: CALayer, right: CALayer)] = []
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

  /** Bands left to right. */
  func show(_ next: [Band]) {
    guard let host else { return }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    root.frame = host.bounds
    while bands.count < next.count {
      let container = CALayer(), left = CALayer(), right = CALayer()
      container.addSublayer(left)
      container.addSublayer(right)
      root.addSublayer(container)
      bands.append((container, left, right))
    }
    for (index, layers) in bands.enumerated() {
      guard index < next.count else {
        layers.container.isHidden = true
        continue
      }
      let band = next[index]
      layers.container.isHidden = false
      layers.container.frame = band.frame
      let spine = max(0, min(band.frame.width, band.spineX))
      layers.left.frame = CGRect(x: 0, y: 0, width: spine, height: band.frame.height)
      layers.right.frame = CGRect(x: spine, y: 0, width: band.frame.width - spine, height: band.frame.height)
      layers.left.backgroundColor = band.left.cgColor
      layers.right.backgroundColor = band.right.cgColor
    }
    CATransaction.commit()
  }

  func detach() {
    root.removeFromSuperlayer()
    host = nil
    clip = nil
  }
}
