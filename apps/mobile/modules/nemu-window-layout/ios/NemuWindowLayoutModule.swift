import ExpoModulesCore
import ObjectiveC.runtime
import OSLog
import SwiftUI
import UIKit

public final class NemuWindowLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NemuWindowLayout")
    // Lets JS tell a binary with these views from one built before them.
    Constant("verticalBarBehaviorViewAvailable") { true }
    Constant("glassViewAvailable") { true }
    Constant("glassViewHostsChildren") { true }
    // The observer stays the first (default) view: `requireNativeViewManager("NemuWindowLayout")`.
    View(NemuWindowLayoutView.self) {
      Events("onRegionsChange")
      Prop("enabled") { (view: NemuWindowLayoutView, enabled: Bool) in
        view.observationEnabled = enabled
      }
    }
    View(NemuVerticalBarBehaviorView.self) {
      Prop("disabled") { (view: NemuVerticalBarBehaviorView, disabled: Bool) in
        view.behaviorDisabled = disabled
      }
      Prop("appearance") { (view: NemuVerticalBarBehaviorView, appearance: String?) in
        view.forcedStyle = appearance == "dark" ? .dark : appearance == "light" ? .light : .unspecified
      }
    }
    View(NemuGlassView.self) {
      Prop("tintColor") { (view: NemuGlassView, color: UIColor?) in
        view.glassTint = color
      }
      Prop("cornerRadius") { (view: NemuGlassView, radius: Double) in
        view.cornerRadius = CGFloat(radius)
      }
      Prop("clear") { (view: NemuGlassView, clear: Bool) in
        view.clearStyle = clear
      }
      Prop("concentricMinimum") { (view: NemuGlassView, minimum: Double) in
        view.concentricMinimum = CGFloat(minimum)
      }
      Prop("interactive") { (view: NemuGlassView, interactive: Bool) in
        view.interactive = interactive
      }
      Prop("colorScheme") { (view: NemuGlassView, scheme: String?) in
        view.appearance = scheme == "dark" ? .dark : scheme == "light" ? .light : .unspecified
      }
    }
    View(NemuGlassContainerView.self) {
      Prop("spacing") { (view: NemuGlassContainerView, spacing: Double) in
        view.spacing = CGFloat(spacing)
      }
    }
  }
}

/// Off by default; `log stream --level debug --predicate 'subsystem == "pm.nemu.window-layout"'`.
private let windowLayoutLog = Logger(subsystem: "pm.nemu.window-layout", category: "observer")

/// Noninteractive observer of this view's own bounds, safe area, vertical bar
/// edge and reserved regions. Event-driven only — no timer:
///
/// - bounds / safe area / window: `layoutSubviews`, `safeAreaInsetsDidChange`,
///   `didMoveToWindow`;
/// - traits (size classes, layout direction, `systemTraitsAffectingVerticalBarEdge`):
///   `registerForTraitChanges`;
/// - fold active ↔ inactive at constant bounds: `UIHingeInteraction` (documented
///   to call its handler whenever the hinge state changes) plus a hosted SwiftUI
///   probe whose `onGeometryChange` reads `GeometryProxy.reservedRegions`, the
///   geometry-invalidated path Apple recommends for reserved regions (also covers
///   the inner camera occlusion activating, which has no hinge event);
/// - scene returning to the foreground: `UIScene.didActivateNotification`.
///
/// UIKit documents no reserved-region change callback, so both region triggers
/// coalesce into one query of the public `UIView.reservedRegions` API.
final class NemuWindowLayoutView: ExpoView {
  let onRegionsChange = EventDispatcher()
  var observationEnabled = true {
    didSet {
      guard observationEnabled != oldValue else { return }
      lastSnapshot = nil
      updateObservation()
    }
  }
  private var lastSnapshot: NSDictionary?
  private var publishScheduled = false
  private var probeController: UIViewController?
  private var hingeInteraction: UIInteraction?
  private var hingeStatus: String?
  /// Removed in `didMoveToWindow(nil)`, which UIKit always sends before a view deallocates.
  private var sceneObservers: [NSObjectProtocol] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    backgroundColor = .clear
    if #available(iOS 17.0, *) {
      var traits: [UITrait] = [
        UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self, UITraitLayoutDirection.self,
      ]
      if #available(iOS 27.1, *) {
        traits += UITraitCollection.systemTraitsAffectingVerticalBarEdge
      }
      // UIKit keeps the registration for the view's lifetime.
      _ = registerForTraitChanges(traits) { (view: NemuWindowLayoutView, _: UITraitCollection) in
        view.setNeedsPublish("trait")
      }
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // A snapshot from another window/scene must never suppress this one.
    lastSnapshot = nil
    updateObservation()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    probeController?.view.frame = bounds
    publishSnapshot()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    publishSnapshot()
  }

  private var observing: Bool { observationEnabled && window != nil }

  private func updateObservation() {
    sceneObservers.forEach(NotificationCenter.default.removeObserver)
    sceneObservers = []
    guard observing else {
      teardownRegionTriggers()
      return
    }
    for name in [UIScene.didActivateNotification, UIScene.willEnterForegroundNotification] {
      sceneObservers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
        MainActor.assumeIsolated {
          guard let self, let scene = note.object as? UIScene, scene === self.window?.windowScene else { return }
          self.setNeedsPublish("scene")
        }
      })
    }
    if #available(iOS 27.1, *) {
      installRegionTriggers()
    }
    publishSnapshot()
  }

  @available(iOS 27.1, *)
  private func installRegionTriggers() {
    if hingeInteraction == nil {
      let interaction = UIHingeInteraction { [weak self] _, update in
        self?.hingeDidUpdate(update.hinge)
      }
      addInteraction(interaction)
      hingeInteraction = interaction
    }
    (hingeInteraction as? UIHingeInteraction)?.isEnabled = true
    if probeController == nil {
      let probe = UIHostingController(rootView: NemuReservedRegionProbe { [weak self] in
        self?.setNeedsPublish("geometry")
      })
      probe.safeAreaRegions = []
      probe.view.backgroundColor = .clear
      probe.view.isUserInteractionEnabled = false
      probe.view.accessibilityElementsHidden = true
      probe.view.frame = bounds
      addSubview(probe.view)
      probeController = probe
    }
  }

  private func teardownRegionTriggers() {
    if #available(iOS 27.1, *) {
      (hingeInteraction as? UIHingeInteraction)?.isEnabled = false
    }
    probeController?.view.removeFromSuperview()
    probeController = nil
  }

  @available(iOS 27.1, *)
  private func hingeDidUpdate(_ hinge: UIHinge?) {
    let status: String? = switch hinge?.status {
    case .closed?: "closed"
    case .partiallyOpen?: "partiallyOpen"
    case .fullyOpen?: "fullyOpen"
    default: nil
    }
    // Angle-only updates stream while the user moves the hinge; only a status
    // change can toggle a division, so ignore the rest.
    guard status != hingeStatus else { return }
    hingeStatus = status
    windowLayoutLog.debug("hinge status \(status ?? "none", privacy: .public)")
    setNeedsPublish("hinge")
    // Region state may trail the hinge callback by a layout pass. Two bounded
    // one-shot re-queries per status change; identical snapshots are dropped.
    for delay in [0.25, 0.75] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        self?.publishSnapshot()
      }
    }
  }

  /// Coalesces bursts of triggers into one query on the next main-queue turn.
  fileprivate func setNeedsPublish(_ reason: String) {
    windowLayoutLog.debug("trigger \(reason, privacy: .public)")
    guard !publishScheduled else { return }
    publishScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.publishScheduled = false
      self.publishSnapshot()
    }
  }

  private func publishSnapshot() {
    // Only a backgrounded scene is skipped: pose transitions pass through
    // foregroundInactive, and dropping an update there would leave JS stale
    // now that nothing polls.
    guard observing, let scene = window?.windowScene, scene.activationState != .background,
      bounds.width > 0, bounds.height > 0 else { return }
    var divisions: [[String: Any]] = []
    var occlusions: [[String: Any]] = []
    var supported = false
    var payload: [String: Any] = [:]
    if #available(iOS 27.1, *) {
      supported = true
      divisions = reservedRegions(kind: .division, options: [.includeInactive]).enumerated()
        .map { serialize($0.element, id: "division-\($0.offset)") }
      occlusions = reservedRegions(kind: .occlusion).enumerated()
        .map { serialize($0.element, id: "occlusion-\($0.offset)") }
      switch traitCollection.verticalBarEdge {
      case .leading: payload["verticalBarEdge"] = "leading"
      case .trailing: payload["verticalBarEdge"] = "trailing"
      default: break
      }
      if let hingeStatus { payload["hinge"] = hingeStatus }
    }
    let insets = safeAreaInsets
    payload["width"] = bounds.width
    payload["height"] = bounds.height
    payload["supported"] = supported
    payload["divisions"] = divisions
    payload["occlusions"] = occlusions
    payload["safeAreaInsets"] = ["top": insets.top, "left": insets.left, "bottom": insets.bottom, "right": insets.right]
    payload["layoutDirection"] = effectiveUserInterfaceLayoutDirection == .rightToLeft ? "rtl" : "ltr"
    let snapshot = payload as NSDictionary
    guard lastSnapshot?.isEqual(snapshot) != true else { return }
    lastSnapshot = snapshot
    windowLayoutLog.debug("publish \(snapshot.description, privacy: .public)")
    onRegionsChange(payload)
  }

  @available(iOS 27.1, *)
  private func serialize(_ region: UIView.ReservedRegion, id: String) -> [String: Any] {
    // `ReservedRegion.ID` is opaque (its description is "ID()" for every
    // region), so ids are per-query ordinals. frame already includes
    // interaction margins; do not add them a second time.
    ["id": id, "active": region.isActive,
     "x": region.frame.minX - bounds.minX, "y": region.frame.minY - bounds.minY,
     "width": region.frame.width, "height": region.frame.height]
  }
}

/// Invisible SwiftUI geometry probe. SwiftUI re-evaluates `onGeometryChange`
/// when the proxy's reserved regions change, which is the invalidation path
/// UIKit lacks. Values are compared only; the payload comes from UIKit so both
/// share the observer's coordinate space.
@available(iOS 27.1, *)
private struct NemuReservedRegionProbe: View {
  let onChange: @MainActor () -> Void

  private struct Signature: Equatable, Sendable {
    var divisions: [ReservedRegion]
    var occlusions: [ReservedRegion]
  }

  var body: some View {
    Color.clear
      .allowsHitTesting(false)
      .accessibilityHidden(true)
      .onGeometryChange(for: Signature.self) { proxy in
        Signature(
          divisions: proxy.reservedRegions(kind: .division, options: .includeInactive, layoutDirectionBehavior: .fixed),
          occlusions: proxy.reservedRegions(kind: .occlusion, options: .includeInactive, layoutDirectionBehavior: .fixed))
      } action: { _ in
        onChange()
      }
  }
}

// MARK: - Vertical bar behavior

private let verticalBarLog = Logger(subsystem: "pm.nemu.window-layout", category: "vertical-bar")

/// Zero-size, noninteractive view that makes the screen it is mounted in
/// prefer `UIVerticalBarBehavior.disabled` (iOS 27.1+, iPhone Duo): the system
/// then keeps the status bar horizontal and removes the vertical bar's
/// leading/trailing safe-area inset, so an immersive screen can lay out
/// full-width with horizontal controls.
///
/// UIKit reads the preference from the window's root (or the nearest
/// presentation) down through `childViewControllerForPreferredVerticalBarBehavior`.
/// System containers forward to their active child, but custom containers
/// (the React Native root view controller, a react-native-screens `RNSScreen`
/// that hosts a nested stack) return nil and would stop the walk. So while
/// mounted this view:
/// - marks its owning view controller (responder chain → the `RNSScreen`) so
///   `preferredVerticalBarBehavior` returns `.disabled`;
/// - makes every ancestor that does not already forward return the next view
///   controller on the path from `childViewControllerForPreferredVerticalBarBehavior`
///   (only while that child is still its child, so a popped path never leaks);
/// - calls `setNeedsUpdateOfVerticalBarConfiguration()` along the path.
///
/// Both getters are swizzled once on `UIViewController` itself; subclasses
/// with their own overrides (`UINavigationController` → top view controller,
/// `UITabBarController` → selected) keep their system behaviour, which is what
/// makes the preference follow navigation: once the reader is no longer the
/// top of its stack, the stack forwards elsewhere and the bar comes back.
/// Everything is restored when the view leaves its window.
final class NemuVerticalBarBehaviorView: ExpoView {
  var behaviorDisabled = false {
    didSet {
      guard behaviorDisabled != oldValue else { return }
      reconcile(reason: "prop")
    }
  }
  /// Screen appearance override (`overrideUserInterfaceStyle` on the owning
  /// view controller): the reader is always a dark immersive surface, so the
  /// system surfaces it presents — popovers, sheets, menus, their Liquid Glass
  /// and grabbers — resolve dark too. Restored when the view leaves.
  var forcedStyle: UIUserInterfaceStyle = .unspecified {
    didSet { if forcedStyle != oldValue { reconcileAppearance() } }
  }
  private weak var styledController: UIViewController?
  private var previousStyle: UIUserInterfaceStyle = .unspecified
  /// The path currently marked: leaf (owning view controller) first, root last.
  private var appliedPath: [WeakViewController] = []
  private var retryScheduled = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    isHidden = true
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    reconcile(reason: window == nil ? "window-removed" : "window")
    // react-native-screens attaches a new screen's controller to its stack
    // after the view hierarchy mounts; re-check once the push has settled.
    if window != nil { scheduleRetry() }
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    reconcile(reason: "superview")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    reconcile(reason: "layout")
  }

  deinit {
    let path = appliedPath
    MainActor.assumeIsolated {
      if #available(iOS 27.1, *) { NemuVerticalBarOverride.release(path: path.compactMap(\.value)) }
    }
  }

  private func scheduleRetry() {
    guard !retryScheduled else { return }
    retryScheduled = true
    for delay in [0.05, 0.35, 1.0] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self else { return }
        if delay == 1.0 { self.retryScheduled = false }
        self.reconcile(reason: "retry")
      }
    }
  }

  private func reconcileAppearance() {
    let target: UIViewController? = (forcedStyle != .unspecified && window != nil) ? currentPath().first : nil
    if let styled = styledController, styled !== target {
      styled.overrideUserInterfaceStyle = previousStyle
      styledController = nil
    }
    guard let target, forcedStyle != .unspecified else { return }
    if styledController == nil {
      previousStyle = target.overrideUserInterfaceStyle
      styledController = target
    }
    target.overrideUserInterfaceStyle = forcedStyle
  }

  private func reconcile(reason: String) {
    reconcileAppearance()
    guard #available(iOS 27.1, *) else { return }
    let desired: [UIViewController] = (behaviorDisabled && window != nil) ? currentPath() : []
    let current = appliedPath.compactMap(\.value)
    if desired.count == current.count && zip(desired, current).allSatisfy({ $0 === $1 }) { return }
    NemuVerticalBarOverride.release(path: current)
    if !desired.isEmpty { NemuVerticalBarOverride.acquire(path: desired) }
    appliedPath = desired.map(WeakViewController.init)
    verticalBarLog.debug("\(reason, privacy: .public): path \(desired.map { String(describing: type(of: $0)) }.joined(separator: " → "), privacy: .public)")
  }

  /// Owning view controller, then each parent up to the root of its presentation.
  private func currentPath() -> [UIViewController] {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController {
        var path: [UIViewController] = [controller]
        var cursor = controller
        while let parent = cursor.parent {
          path.append(parent)
          cursor = parent
        }
        return path
      }
      responder = next
    }
    return []
  }
}

final class WeakViewController {
  weak var value: UIViewController?
  init(_ value: UIViewController) { self.value = value }
}

@available(iOS 27.1, *)
@MainActor
enum NemuVerticalBarOverride {
  nonisolated(unsafe) private static var disabledKey: UInt8 = 0
  nonisolated(unsafe) private static var forwardKey: UInt8 = 0
  private static var installed = false

  /// Leaf prefers `.disabled`; each ancestor forwards to the next controller on the path.
  static func acquire(path: [UIViewController]) {
    guard let leaf = path.first else { return }
    install()
    let count = (objc_getAssociatedObject(leaf, &disabledKey) as? NSNumber)?.intValue ?? 0
    objc_setAssociatedObject(leaf, &disabledKey, NSNumber(value: count + 1), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    for (child, parent) in zip(path, path.dropFirst()) {
      objc_setAssociatedObject(parent, &forwardKey, WeakViewController(child), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
    invalidate(path)
  }

  static func release(path: [UIViewController]) {
    guard let leaf = path.first else { return }
    let count = (objc_getAssociatedObject(leaf, &disabledKey) as? NSNumber)?.intValue ?? 0
    objc_setAssociatedObject(leaf, &disabledKey, count > 1 ? NSNumber(value: count - 1) : nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    for (child, parent) in zip(path, path.dropFirst()) {
      // Only clear a forward that still points at this path.
      if let box = objc_getAssociatedObject(parent, &forwardKey) as? WeakViewController, box.value === child || box.value == nil {
        objc_setAssociatedObject(parent, &forwardKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
      }
    }
    invalidate(path)
  }

  private static func invalidate(_ path: [UIViewController]) {
    for controller in path { controller.setNeedsUpdateOfVerticalBarConfiguration() }
    path.last?.view.window?.rootViewController?.setNeedsUpdateOfVerticalBarConfiguration()
  }

  static func isDisabled(_ controller: UIViewController) -> Bool {
    ((objc_getAssociatedObject(controller, &disabledKey) as? NSNumber)?.intValue ?? 0) > 0
  }

  static func forwardedChild(_ controller: UIViewController) -> UIViewController? {
    guard let child = (objc_getAssociatedObject(controller, &forwardKey) as? WeakViewController)?.value,
      child.parent === controller else { return nil }
    return child
  }

  /// One-time swizzle of the two getters on `UIViewController` itself.
  private static func install() {
    guard !installed else { return }
    installed = true
    let cls: AnyClass = UIViewController.self

    let preferredSelector = NSSelectorFromString("preferredVerticalBarBehavior")
    if let method = class_getInstanceMethod(cls, preferredSelector) {
      typealias Getter = @convention(c) (UIViewController, Selector) -> Int
      let original = unsafeBitCast(method_getImplementation(method), to: Getter.self)
      let block: @convention(block) (UIViewController) -> Int = { controller in
        MainActor.assumeIsolated {
          isDisabled(controller) ? UIVerticalBarBehavior.disabled.rawValue : original(controller, preferredSelector)
        }
      }
      replace(cls, preferredSelector, method, imp_implementationWithBlock(block))
    }

    let childSelector = NSSelectorFromString("childViewControllerForPreferredVerticalBarBehavior")
    if let method = class_getInstanceMethod(cls, childSelector) {
      typealias Getter = @convention(c) (UIViewController, Selector) -> UIViewController?
      let original = unsafeBitCast(method_getImplementation(method), to: Getter.self)
      let block: @convention(block) (UIViewController) -> UIViewController? = { controller in
        MainActor.assumeIsolated {
          original(controller, childSelector) ?? forwardedChild(controller)
        }
      }
      replace(cls, childSelector, method, imp_implementationWithBlock(block))
    }
    verticalBarLog.debug("installed vertical bar overrides")
  }

  /// Replace on `cls` itself: add when the method is inherited, else set.
  private static func replace(_ cls: AnyClass, _ selector: Selector, _ method: Method, _ imp: IMP) {
    if !class_addMethod(cls, selector, imp, method_getTypeEncoding(method)) {
      method_setImplementation(method, imp)
    }
  }
}

// MARK: - Liquid Glass

/// A real UIKit Liquid Glass surface (`UIGlassEffect`, iOS 26+) that hosts its
/// React Native children in the effect view's `contentView`, like SwiftUI's
/// `.glassEffect(.regular.interactive(), in: .capsule)`: the glass reacts to
/// touches on the buttons inside it (interactive press response) and, inside a
/// `NemuGlassContainerView`, merges and morphs with its neighbours the way
/// system toolbars do.
///
/// UIKit rather than a SwiftUI host on purpose: the view is a plain member of
/// the React Native hierarchy, so it rotates and resizes with its siblings
/// (independent SwiftUI hosts can keep a stale interface transform through a
/// rotation). `cornerRadius <= 0` means a capsule, which scales with the view.
/// iOS 16.4–25 falls back to a system material with the same shape.
private let glassLog = Logger(subsystem: "pm.nemu.window-layout", category: "glass")

final class NemuGlassView: ExpoView {
  private let effectView = UIVisualEffectView()
  var glassTint: UIColor? { didSet { if effectInstalled { applyEffect() } } }
  var cornerRadius: CGFloat = 0 { didSet { applyShape() } }
  var clearStyle = false { didSet { if effectInstalled { applyEffect() } } }
  var interactive = false { didSet { if effectInstalled { applyEffect() } } }
  /// Glass appearance: `.dark` renders the system's dark Liquid Glass (no
  /// painted tint), `.unspecified` follows the environment.
  var appearance: UIUserInterfaceStyle = .unspecified {
    didSet { effectView.overrideUserInterfaceStyle = appearance }
  }
  /// > 0: corners concentric with the container (the display's rounded
  /// corners where the view meets them), never below this radius.
  var concentricMinimum: CGFloat = 0 { didSet { applyShape() } }
  /// UIKit silently skips a glass effect assigned while the view is (nearly)
  /// transparent — reader chrome fades in from opacity 0 — and never
  /// materializes it later. So the effect is installed only once the view is
  /// visibly on screen, from a display link while it is not.
  private var effectInstalled = false
  private var visibilityLink: CADisplayLink?
  /// After an install the link keeps watching briefly: an entering animation
  /// can drop an ancestor to opacity 0 on the frame after the view mounted
  /// visible (Reanimated layout animations do), which discards the effect.
  /// Seen invisible again within the window → reinstall once visible.
  private var watchUntil: CFTimeInterval = 0
  private var sawHiddenSinceInstall = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)
    applyShape()
  }

  deinit {
    visibilityLink?.invalidate()
  }

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    effectView.contentView.insertSubview(childComponentView, at: index)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      stopWaitingForVisibility()
      // A remounted view (screen pushed back) installs afresh.
      effectInstalled = false
    } else {
      setNeedsLayout()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    if #unavailable(iOS 26.0) { applyShape() }
    guard !effectInstalled else { return }
    if isEffectRenderable {
      installEffect()
    } else {
      waitForVisibility()
    }
  }

  private static let installWatchSeconds: CFTimeInterval = 1.5

  private var isEffectRenderable: Bool {
    guard window != nil, bounds.width > 0, bounds.height > 0 else { return false }
    var opacity: CGFloat = 1
    var view: UIView? = self
    while let current = view {
      if current.isHidden { return false }
      opacity *= current.alpha
      view = current.superview
    }
    // Wait for the end of a fade-in: an effect assigned mid-fade can still be
    // dropped (observed on a docked reader panel fading in at ~5%).
    return opacity > 0.95
  }

  private func installEffect() {
    glassLog.debug("install \(Int(self.bounds.width), privacy: .public)x\(Int(self.bounds.height), privacy: .public) cr=\(self.concentricMinimum, privacy: .public)")
    effectInstalled = true
    sawHiddenSinceInstall = false
    watchUntil = CACurrentMediaTime() + Self.installWatchSeconds
    waitForVisibility()
    // Clear any stale effect so UIKit fully rebuilds the glass.
    effectView.effect = UIVisualEffect()
    applyEffect()
  }

  private func waitForVisibility() {
    guard visibilityLink == nil else { return }
    let link = CADisplayLink(target: NemuGlassDisplayLinkProxy(self), selector: #selector(NemuGlassDisplayLinkProxy.tick))
    link.add(to: .main, forMode: .common)
    visibilityLink = link
  }

  fileprivate func visibilityTick() {
    guard effectInstalled else {
      if isEffectRenderable { setNeedsLayout() }
      return
    }
    // Post-install watch.
    if !isEffectRenderable {
      if !sawHiddenSinceInstall { glassLog.debug("hidden after install \(Int(self.bounds.width), privacy: .public)") }
      sawHiddenSinceInstall = true
    } else if sawHiddenSinceInstall {
      // Hidden and visible again: rebuild the glass now that it can render.
      installEffect()
      return
    }
    if CACurrentMediaTime() > watchUntil && !sawHiddenSinceInstall {
      stopWaitingForVisibility()
    }
  }

  private func stopWaitingForVisibility() {
    visibilityLink?.invalidate()
    visibilityLink = nil
  }

  private func applyEffect() {
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect(style: clearStyle ? .clear : .regular)
      effect.tintColor = glassTint
      effect.isInteractive = interactive
      effectView.effect = effect
    } else {
      effectView.effect = UIBlurEffect(style: appearance == .light ? .systemThinMaterialLight : .systemThinMaterialDark)
      effectView.contentView.backgroundColor = glassTint
    }
  }

  private func applyShape() {
    if #available(iOS 26.0, *) {
      effectView.cornerConfiguration = concentricMinimum > 0
        ? .corners(radius: .containerConcentric(minimum: concentricMinimum))
        : cornerRadius > 0
          ? .corners(radius: .fixed(cornerRadius))
          : .capsule()
    } else {
      effectView.clipsToBounds = true
      effectView.layer.cornerCurve = .continuous
      effectView.layer.cornerRadius = concentricMinimum > 0
        ? concentricMinimum
        : cornerRadius > 0 ? cornerRadius : min(bounds.width, bounds.height) / 2
    }
  }
}

/// `UIGlassContainerEffect` (iOS 26+; SwiftUI `GlassEffectContainer`): glass
/// views mounted inside render together, blend where they come within
/// `spacing` of each other, and morph as they appear or move. The container
/// itself is transparent to touches outside its glass children.
final class NemuGlassContainerView: ExpoView {
  private let containerView = UIVisualEffectView()
  var spacing: CGFloat = 0 { didSet { applyEffect() } }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    containerView.frame = bounds
    containerView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(containerView)
    applyEffect()
  }

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    containerView.contentView.insertSubview(childComponentView, at: index)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    containerView.frame = bounds
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    // Empty container area passes through to the page below.
    return hit === self || hit === containerView || hit === containerView.contentView ? nil : hit
  }

  private func applyEffect() {
    if #available(iOS 26.0, *) {
      let effect = UIGlassContainerEffect()
      effect.spacing = spacing
      containerView.effect = effect
    }
  }
}

private final class NemuGlassDisplayLinkProxy: NSObject {
  private weak var view: NemuGlassView?
  init(_ view: NemuGlassView) { self.view = view }
  @objc func tick() {
    MainActor.assumeIsolated { view?.visibilityTick() }
  }
}
