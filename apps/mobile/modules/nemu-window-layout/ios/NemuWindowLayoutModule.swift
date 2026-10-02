import ExpoModulesCore
import ExpoUI
import ObjectiveC.runtime
import OSLog
import SwiftUI
import UIKit

public final class NemuWindowLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NemuWindowLayout")
    OnCreate {
      // `@expo/ui` modifier: the appearance of the presentation (popover,
      // sheet) that encloses the view, see `NemuPresentationColorSchemeModifier`.
      ViewModifierRegistry.register(NemuPresentationColorSchemeModifier.type) { params, _, _ in
        NemuPresentationColorSchemeModifier(params: params)
      }
      ViewModifierRegistry.register(NemuInlineToolbarTitleModifier.type) { _, _, _ in
        NemuInlineToolbarTitleModifier()
      }
      ViewModifierRegistry.register(NemuZeroTopScrollContentMarginModifier.type) { _, _, _ in
        NemuZeroTopScrollContentMarginModifier()
      }
      // A sheet as tall as its page, measured before it presents: see
      // `NemuFitSheetDetentModifier`, `NemuReportSheetContentHeightModifier`
      // and `NemuMeasureSheetPageModifier`.
      ViewModifierRegistry.register(NemuFitSheetDetentModifier.type) { params, _, _ in
        NemuFitSheetDetentModifier(params: params)
      }
      ViewModifierRegistry.register(NemuReportSheetContentHeightModifier.type) { params, _, _ in
        NemuReportSheetContentHeightModifier(params: params)
      }
      ViewModifierRegistry.register(NemuMeasureSheetPageModifier.type) { params, _, _ in
        NemuMeasureSheetPageModifier(params: params)
      }
      // The in-app theme from the last run, before any JS (see `NemuAppAppearance`).
      DispatchQueue.main.async {
        MainActor.assumeIsolated { NemuAppAppearance.restore() }
      }
    }
    OnDestroy {
      ViewModifierRegistry.unregister(NemuPresentationColorSchemeModifier.type)
      ViewModifierRegistry.unregister(NemuInlineToolbarTitleModifier.type)
      ViewModifierRegistry.unregister(NemuZeroTopScrollContentMarginModifier.type)
      ViewModifierRegistry.unregister(NemuFitSheetDetentModifier.type)
      ViewModifierRegistry.unregister(NemuReportSheetContentHeightModifier.type)
      ViewModifierRegistry.unregister(NemuMeasureSheetPageModifier.type)
    }
    // Lets JS tell a binary with these views from one built before them.
    Constant("verticalBarBehaviorViewAvailable") { true }
    Constant("glassViewAvailable") { true }
    Constant("glassViewHostsChildren") { true }
    AsyncFunction("setAppAppearance") { (appearance: String) in
      MainActor.assumeIsolated { NemuAppAppearance.set(appearance) }
    }.runOnQueue(.main)
    // The observer stays the first (default) view: `requireNativeViewManager("NemuWindowLayout")`.
    View(NemuWindowLayoutView.self) {
      Events("onRegionsChange")
      Prop("enabled") { (view: NemuWindowLayoutView, enabled: Bool) in
        view.observationEnabled = enabled
      }
    }
    View(NemuSheetProgressView.self) {
      Events("onProgress")
      Prop("visible") { (view: NemuSheetProgressView, visible: Bool) in
        view.visible = visible
      }
    }
    View(NemuVerticalBarBehaviorView.self) {
      Prop("disabled") { (view: NemuVerticalBarBehaviorView, disabled: Bool) in
        view.behaviorDisabled = disabled
      }
      Prop("appearance") { (view: NemuVerticalBarBehaviorView, appearance: String?) in
        view.forcedStyle = appearance == "dark" ? .dark : appearance == "light" ? .light : .unspecified
      }
      Prop("appearanceCoversBars") { (view: NemuVerticalBarBehaviorView, covers: Bool) in
        view.coversBars = covers
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
      Prop("materialized") { (view: NemuGlassView, materialized: Bool) in
        view.materialized = materialized
      }
      Prop("animateAppearance") { (view: NemuGlassView, animate: Bool) in
        view.animateAppearance = animate
      }
      Prop("materializeDurationMs") { (view: NemuGlassView, ms: Double) in
        view.materializeDuration = max(0, ms) / 1000
      }
    }
    View(NemuGlassContainerView.self) {
      Prop("spacing") { (view: NemuGlassContainerView, spacing: Double) in
        view.spacing = CGFloat(spacing)
      }
    }
  }
}

/// SwiftUI `preferredColorScheme` for `@expo/ui` content: "the color scheme
/// applies to the nearest enclosing presentation, such as a popover, sheet,
/// or window". Unlike `environment(\.colorScheme)` (which only restyles the
/// content), it sets the presented controller's interface style, so the
/// system container — popover / sheet material, Liquid Glass, grabber,
/// dimming — and the rows' text resolve from the same appearance. A
/// presentation's container takes its traits from the controller UIKit
/// presents it from (the window's root), never from the screen that asked,
/// so a screen-level `overrideUserInterfaceStyle` cannot reach it.
struct NemuPresentationColorSchemeModifier: ViewModifier {
  static let type = "nemuPresentationColorScheme"
  let colorScheme: ColorScheme?

  init(params: [String: Any]) {
    switch params["colorScheme"] as? String {
    case "dark": colorScheme = .dark
    case "light": colorScheme = .light
    default: colorScheme = nil
    }
  }

  func body(content: Content) -> some View {
    content.preferredColorScheme(colorScheme)
  }
}

/// `toolbarTitleDisplayMode(.inline)`: a sheet's root in a NavigationStack
/// otherwise reserves an (empty) large-title row between its bar and the Form.
struct NemuInlineToolbarTitleModifier: ViewModifier {
  static let type = "nemuInlineToolbarTitle"

  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.toolbarTitleDisplayMode(.inline)
    } else {
      content.navigationBarTitleDisplayMode(.inline)
    }
  }
}

struct NemuZeroTopScrollContentMarginModifier: ViewModifier {
  static let type = "nemuZeroTopScrollContentMargin"

  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.contentMargins(.top, 0, for: .scrollContent)
    } else {
      content
    }
  }
}

/// Measured heights of the pages of one content-sized sheet (`group`), fed by
/// an off-screen copy of each page (`NemuMeasureSheetPageModifier`) that stays
/// laid out while the sheet is closed. The sheet reads them when it presents,
/// so its first frame already has the final detent: UIKit runs one native
/// presentation to that height, never a second resize once the Form inside
/// has measured itself (a sheet's content only lays out after the
/// presentation has started, so a self-measured sheet always jumps).
final class NemuSheetFitStore: ObservableObject {
  private static var stores: [String: NemuSheetFitStore] = [:]

  static func named(_ group: String) -> NemuSheetFitStore {
    if let store = stores[group] { return store }
    let store = NemuSheetFitStore()
    stores[group] = store
    return store
  }

  /// Page → height of its Form's content, margins included, without any
  /// safe area (the bar above it, the home indicator below it).
  @Published private(set) var contentHeights: [String: CGFloat] = [:]
  /// The sheet's navigation bar above the Form (title, close button, the
  /// grabber's clearance), measured in the sheet itself. Until the first
  /// presentation reports it: the iOS 26 compact sheet's inline bar.
  @Published private(set) var barHeight: CGFloat = NemuSheetFitStore.defaultBarHeight
  static let defaultBarHeight: CGFloat = 74

  func setContentHeight(_ height: CGFloat, page: String) {
    guard height > 0 else { return }
    let rounded = height.rounded(.up)
    if contentHeights[page] != rounded { contentHeights[page] = rounded }
  }

  func setBarHeight(_ height: CGFloat) {
    guard height > 0 else { return }
    let rounded = height.rounded(.up)
    if barHeight != rounded { barHeight = rounded }
  }

  /// The detent that shows all of `page` (the system caps it at the large
  /// detent; the Form scrolls past that). Nil until the page was measured.
  func detentHeight(page: String) -> CGFloat? {
    contentHeights[page].map { NemuSheetFitStore.detentHeight(content: $0, bar: barHeight) }
  }

  /// A `.height` detent excludes the bottom safe area (the sheet adds the
  /// home indicator's inset below it), so the content needs only the bar.
  static func detentHeight(content: CGFloat, bar: CGFloat) -> CGFloat {
    (content + bar).rounded(.up)
  }
}

/// One presentation of a content-sized sheet: the page on screen and the
/// detent in effect.
final class NemuSheetFitState: ObservableObject {
  /// The page on top of the sheet's NavigationStack (`NemuReportSheetContentHeightModifier`).
  @Published var activePage: String?
  /// The measured detent height in effect since the sheet appeared; nil
  /// before it appeared (the body then follows the measurement directly) or
  /// while no page was measured (the fallback detent).
  @Published private(set) var height: CGFloat?
  /// The previous detent, kept in the set while the sheet moves away from it:
  /// SwiftUI animates a sheet between detents it has (a selection change, a
  /// native `animateChanges` resize), while replacing a lone detent snaps.
  @Published private(set) var outgoing: PresentationDetent?
  /// The sheet has appeared: its detent is `height` (nil: the fallback).
  @Published private(set) var presented = false
  /// The presentation transition is over: height changes animate from here.
  private var settled = false
  private var pending: CGFloat?
  private var generation = 0

  /// The sheet appeared at `initial` (its presentation has started).
  func appeared(at initial: CGFloat?, fallback: PresentationDetent) {
    guard !presented else { return }
    presented = true
    height = initial
    // Hold any change until UIKit's presentation has finished: retargeting
    // a sheet mid-presentation is the jump this whole mechanism avoids.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
      guard let self else { return }
      self.settled = true
      if let pending = self.pending {
        self.pending = nil
        self.move(to: pending, fallback: fallback)
      }
    }
  }

  /// The content's height changed (a pushed / popped page, a row shown or hidden).
  func contentChanged(to target: CGFloat?, fallback: PresentationDetent) {
    guard let target, presented else { return }
    if settled { move(to: target, fallback: fallback) } else { pending = target }
  }

  private func move(to target: CGFloat, fallback: PresentationDetent) {
    if let height, abs(target - height) < 0.5 { return }
    outgoing = height.map { .height($0) } ?? fallback
    withAnimation(.smooth(duration: 0.35)) { height = target }
    generation += 1
    let token = generation
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      guard let self, self.generation == token else { return }
      self.outgoing = nil
    }
  }
}

private struct NemuSheetFitStateKey: EnvironmentKey {
  static let defaultValue: NemuSheetFitState? = nil
}

private struct NemuSheetFitStoreKey: EnvironmentKey {
  static let defaultValue: NemuSheetFitStore? = nil
}

extension EnvironmentValues {
  var nemuSheetFit: NemuSheetFitState? {
    get { self[NemuSheetFitStateKey.self] }
    set { self[NemuSheetFitStateKey.self] = newValue }
  }

  var nemuSheetFitStore: NemuSheetFitStore? {
    get { self[NemuSheetFitStoreKey.self] }
    set { self[NemuSheetFitStoreKey.self] = newValue }
  }
}

private func nemuDetent(_ height: CGFloat?, fallback: CGFloat) -> PresentationDetent {
  if let height { return .height(height) }
  return fallback > 0 ? .height(fallback.rounded(.up)) : .medium
}

/// On a sheet's root: one presentation detent as tall as the page on screen
/// (`page`, or the page a `NemuReportSheetContentHeightModifier` reports on
/// appearing), from the heights its off-screen copies measured
/// (`NemuMeasureSheetPageModifier`, same `group`). The sheet presents once,
/// natively, at that height; pushing / popping a page or a content change
/// resizes it with the system's sheet animation. Taller than the screen, the
/// system caps the detent and the Form scrolls. Unmeasured (before iOS 18,
/// which has no scroll geometry), the detent is `initialHeight` when given,
/// else `.medium`.
///
/// `height` > 0 replaces the store: the caller measured its page itself (a
/// React Native page laid out off screen before the sheet presents) and
/// passes the detent directly; a new value resizes the presented sheet the
/// same way a pushed page does.
struct NemuFitSheetDetentModifier: ViewModifier {
  static let type = "nemuFitSheetDetent"
  let page: String
  let initialHeight: CGFloat
  let explicitHeight: CGFloat?
  @ObservedObject private var store: NemuSheetFitStore
  @StateObject private var state = NemuSheetFitState()

  init(params: [String: Any]) {
    page = (params["page"] as? String) ?? "root"
    initialHeight = CGFloat((params["initialHeight"] as? Double) ?? 0)
    let height = CGFloat((params["height"] as? Double) ?? 0)
    explicitHeight = height > 0 ? height.rounded(.up) : nil
    store = NemuSheetFitStore.named((params["group"] as? String) ?? "default")
  }

  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      let target = explicitHeight ?? store.detentHeight(page: state.activePage ?? page)
      let fallback = nemuDetent(nil, fallback: initialHeight)
      let current = nemuDetent(state.presented ? state.height : target, fallback: initialHeight)
      let detents: Set<PresentationDetent> = state.outgoing.map { [current, $0] } ?? [current]
      content
        .environment(\.nemuSheetFit, state)
        .environment(\.nemuSheetFitStore, store)
        // The selection always follows the content; a drag toward the
        // outgoing detent during a resize is not kept.
        .presentationDetents(detents, selection: Binding(get: { current }, set: { _ in }))
        .onAppear { state.appeared(at: target, fallback: fallback) }
        .onChange(of: target) { _, next in state.contentChanged(to: next, fallback: fallback) }
        // The page JS has on top (a presentation that opens on a pushed page).
        .onChange(of: page) { _, next in state.activePage = next }
    } else {
      content.presentationDetents([nemuDetent(explicitHeight, fallback: initialHeight)])
    }
  }
}

/// On each Form inside a `NemuFitSheetDetentModifier` sheet: the page it is
/// (`page`, as measured by its off-screen copy). Appearing — pushed, popped
/// back to — it becomes the page the sheet is sized to, so the sheet resizes
/// alongside the navigation transition. It also reports the sheet's bar
/// height (the safe area above the Form) for the next presentations.
struct NemuReportSheetContentHeightModifier: ViewModifier {
  static let type = "nemuReportSheetContentHeight"
  let page: String?
  @Environment(\.nemuSheetFit) private var fit
  @Environment(\.nemuSheetFitStore) private var store

  init(params: [String: Any]) {
    page = params["page"] as? String
  }

  func body(content: Content) -> some View {
    content
      .onAppear {
        if let page, fit?.activePage != page { fit?.activePage = page }
      }
      .onGeometryChange(for: CGFloat.self) { proxy in proxy.safeAreaInsets.top } action: { top in
        store?.setBarHeight(top)
      }
  }
}

/// On the off-screen copy of a content-sized sheet's page: lays the Form out
/// at the sheet's width (invisible, untouchable, hidden from accessibility)
/// and records its content height in `group`'s store under `page`, so the
/// sheet knows it before it presents.
struct NemuMeasureSheetPageModifier: ViewModifier {
  static let type = "nemuMeasureSheetPage"
  let group: String
  let page: String
  let width: CGFloat
  let height: CGFloat
  @State private var safeArea = EdgeInsets()

  init(params: [String: Any]) {
    group = (params["group"] as? String) ?? "default"
    page = (params["page"] as? String) ?? "root"
    width = CGFloat((params["width"] as? Double) ?? 0)
    height = CGFloat((params["height"] as? Double) ?? 0)
  }

  private struct Metrics: Equatable {
    var content: CGFloat
    var insets: CGFloat
  }

  func body(content: Content) -> some View {
    if #available(iOS 18.0, *) {
      content
        .onScrollGeometryChange(for: Metrics.self) { geometry in
          Metrics(
            content: geometry.contentSize.height,
            insets: geometry.contentInsets.top + geometry.contentInsets.bottom
          )
        } action: { _, metrics in
          record(metrics)
        }
        .onGeometryChange(for: EdgeInsets.self) { proxy in proxy.safeAreaInsets } action: { insets in
          safeArea = insets
        }
        .frame(width: width > 0 ? width : nil, height: height > 0 ? height : nil)
        .opacity(0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    } else {
      content.hidden().frame(width: 0, height: 0)
    }
  }

  private func record(_ metrics: Metrics) {
    // Before the rows lay out the content is empty (and the insets are a
    // provisional large-title bar's): only real content counts.
    guard metrics.content > 0 else { return }
    // The Form's margins stay; the safe area of wherever the copy sits does not.
    let margins = max(0, metrics.insets - safeArea.top - safeArea.bottom)
    NemuSheetFitStore.named(group).setContentHeight(metrics.content + margins, page: page)
    sheetFitLog.debug("measured \(group, privacy: .public)/\(page, privacy: .public) content=\(metrics.content) insets=\(metrics.insets) safe=\(safeArea.top)+\(safeArea.bottom)")
  }
}

private let sheetFitLog = Logger(subsystem: "pm.nemu.window-layout", category: "sheet-fit")

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
      #if NEMU_SDK_27_1
      if #available(iOS 27.1, *) {
        traits += UITraitCollection.systemTraitsAffectingVerticalBarEdge
      }
      #endif
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

  override func layoutMarginsDidChange() {
    super.layoutMarginsDidChange()
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
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      installRegionTriggers()
    }
    #endif
    publishSnapshot()
  }

  #if NEMU_SDK_27_1
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
  #endif

  private func teardownRegionTriggers() {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      (hingeInteraction as? UIHingeInteraction)?.isEnabled = false
    }
    #endif
    probeController?.view.removeFromSuperview()
    probeController = nil
  }

  #if NEMU_SDK_27_1
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
  #endif

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
    #if NEMU_SDK_27_1
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
    #endif
    // Whether this window covers its whole screen (false in Split View, a
    // resizable window or iPhone Mirroring). The scene's own screen, never a
    // global one; compared in either orientation.
    let windowSize = window?.bounds.size ?? scene.coordinateSpace.bounds.size
    let screenSize = scene.screen.bounds.size
    let near = { (a: CGFloat, b: CGFloat) in abs(a - b) < 1 }
    payload["fillsScreen"] = (near(windowSize.width, screenSize.width) && near(windowSize.height, screenSize.height))
      || (near(windowSize.width, screenSize.height) && near(windowSize.height, screenSize.width))
    let insets = safeAreaInsets
    payload["width"] = bounds.width
    payload["height"] = bounds.height
    payload["supported"] = supported
    payload["divisions"] = divisions
    payload["occlusions"] = occlusions
    // Match the native navigation title's system content margins. Query the
    // owning controller rather than guessing from device names or size classes.
    var owner: UIResponder? = self
    while let next = owner?.next {
      if let controller = next as? UIViewController {
        let margins = controller.systemMinimumLayoutMargins
        let rtl = effectiveUserInterfaceLayoutDirection == .rightToLeft
        payload["minimumLayoutMargins"] = [
          "left": rtl ? margins.trailing : margins.leading,
          "right": rtl ? margins.leading : margins.trailing,
        ]
        break
      }
      owner = next
    }
    payload["safeAreaInsets"] = ["top": insets.top, "left": insets.left, "bottom": insets.bottom, "right": insets.right]
    payload["layoutDirection"] = effectiveUserInterfaceLayoutDirection == .rightToLeft ? "rtl" : "ltr"
    let snapshot = payload as NSDictionary
    guard lastSnapshot?.isEqual(snapshot) != true else { return }
    lastSnapshot = snapshot
    windowLayoutLog.debug("publish \(snapshot.description, privacy: .public)")
    onRegionsChange(payload)
  }

  #if NEMU_SDK_27_1
  @available(iOS 27.1, *)
  private func serialize(_ region: UIView.ReservedRegion, id: String) -> [String: Any] {
    // `ReservedRegion.ID` is opaque (its description is "ID()" for every
    // region), so ids are per-query ordinals. frame already includes
    // interaction margins; do not add them a second time.
    ["id": id, "active": region.isActive,
     "x": region.frame.minX - bounds.minX, "y": region.frame.minY - bounds.minY,
     "width": region.frame.width, "height": region.frame.height]
  }
  #endif
}

/// Invisible SwiftUI geometry probe. SwiftUI re-evaluates `onGeometryChange`
/// when the proxy's reserved regions change, which is the invalidation path
/// UIKit lacks. Values are compared only; the payload comes from UIKit so both
/// share the observer's coordinate space.
#if NEMU_SDK_27_1
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
#endif

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
  /// Appearance forced on the screen's containers while `coversBars` (see
  /// `reconcileAppearance`): the reader is always a dark immersive surface,
  /// so its system bars and the system surfaces it presents — popovers,
  /// sheets, menus, their Liquid Glass and grabbers — resolve dark too.
  /// Restored when the view leaves or `coversBars` turns off.
  var forcedStyle: UIUserInterfaceStyle = .unspecified {
    didSet { if forcedStyle != oldValue { reconcileAppearance() } }
  }
  /// Apply `forcedStyle` while true. UIKit hosts the system vertical bar —
  /// its `_UIFloatingBarContainerView`, beside the navigation transition view
  /// — and the navigation bar in the navigation controller's view, which
  /// inherits its traits from the navigation controller, not from the screen
  /// inside it; so the style goes on the containers. JS sets this only while
  /// the screen is focused, since the containers are shared by the stack.
  var coversBars = false {
    didSet { if coversBars != oldValue { reconcileAppearance() } }
  }
  /// Controllers this view styled, with the style each had before.
  private var styled: [(controller: WeakViewController, previous: UIUserInterfaceStyle)] = []
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
      #if NEMU_SDK_27_1
      if #available(iOS 27.1, *) { NemuVerticalBarOverride.release(path: path.compactMap(\.value)) }
      #else
      _ = path
      #endif
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
    // Only while `coversBars`, and on the containers (navigation controller
    // → root of the presentation), never on the screen alone: the screen
    // inherits the style from them. iOS 27.1 keeps a screen's bar items in
    // the horizontal navigation bar whenever the screen's appearance differs
    // from its navigation controller's (the vertical bar is the navigation
    // controller's, so it cannot take a child's style) — a screen-only
    // override put the reader's items in a horizontal bar, or left the
    // vertical bar light.
    let path = (forcedStyle != .unspecified && window != nil && coversBars) ? currentPath() : []
    let targets = path.count > 1 ? Array(path.dropFirst()) : path
    // Restore what is no longer a target (popped, covered, prop cleared) —
    // unless someone else changed it since.
    styled.removeAll { entry in
      guard let controller = entry.controller.value else { return true }
      if targets.contains(where: { $0 === controller }) { return false }
      if controller.overrideUserInterfaceStyle == appliedStyle {
        controller.overrideUserInterfaceStyle = entry.previous
      }
      return true
    }
    for target in targets {
      if !styled.contains(where: { $0.controller.value === target }) {
        styled.append((WeakViewController(target), target.overrideUserInterfaceStyle))
      }
      if target.overrideUserInterfaceStyle != forcedStyle {
        target.overrideUserInterfaceStyle = forcedStyle
      }
    }
    appliedStyle = forcedStyle
  }
  /// The style last applied to `styled` (a prop change restores the old one).
  private var appliedStyle: UIUserInterfaceStyle = .unspecified

  private func reconcile(reason: String) {
    reconcileAppearance()
    // Built with an SDK before iOS 27.1 (no vertical bar API): appearance only.
    #if NEMU_SDK_27_1
    guard #available(iOS 27.1, *) else { return }
    let desired: [UIViewController] = (behaviorDisabled && window != nil) ? currentPath() : []
    let current = appliedPath.compactMap(\.value)
    if desired.count == current.count && zip(desired, current).allSatisfy({ $0 === $1 }) { return }
    NemuVerticalBarOverride.release(path: current)
    if !desired.isEmpty { NemuVerticalBarOverride.acquire(path: desired) }
    appliedPath = desired.map(WeakViewController.init)
    verticalBarLog.debug("\(reason, privacy: .public): path \(desired.map { String(describing: type(of: $0)) }.joined(separator: " → "), privacy: .public)")
    #endif
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

#if NEMU_SDK_27_1
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
#endif

// MARK: - App appearance

/// The app's in-app theme for UIKit: `overrideUserInterfaceStyle` on every
/// window of every connected scene. The theme otherwise only reaches React
/// Native colours; every native surface — navigation / tab / vertical bars,
/// toolbar items, sheets, popovers, menus and all Liquid Glass (UIKit glass,
/// and SwiftUI glass, which resolves from the hosting view's traits rather
/// than an `environment(\.colorScheme)`) — resolves from the window's traits,
/// i.e. the system appearance. So whenever the in-app theme differed from
/// the system one, those surfaces kept the system appearance.
///
/// Windows created later (a new scene, the Duo moving the app between
/// displays, alert / keyboard windows) are styled as they become visible, and
/// the choice is persisted so the next launch applies it before JS runs.
@MainActor
enum NemuAppAppearance {
  private static let defaultsKey = "pm.nemu.window-layout.appAppearance"
  private static var style: UIUserInterfaceStyle = .unspecified
  private static var observers: [NSObjectProtocol] = []

  static func set(_ value: String) {
    UserDefaults.standard.set(value, forKey: defaultsKey)
    apply(parse(value))
  }

  static func restore() {
    guard let value = UserDefaults.standard.string(forKey: defaultsKey) else { return }
    apply(parse(value))
  }

  private static func parse(_ value: String) -> UIUserInterfaceStyle {
    value == "dark" ? .dark : value == "light" ? .light : .unspecified
  }

  private static func apply(_ next: UIUserInterfaceStyle) {
    style = next
    observe()
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows { style(window) }
    }
  }

  private static func style(_ window: UIWindow) {
    if window.overrideUserInterfaceStyle != style {
      window.overrideUserInterfaceStyle = style
    }
  }

  private static func observe() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    for name in [UIWindow.didBecomeVisibleNotification, UIWindow.didBecomeKeyNotification] {
      observers.append(center.addObserver(forName: name, object: nil, queue: .main) { note in
        guard let window = note.object as? UIWindow else { return }
        MainActor.assumeIsolated { style(window) }
      })
    }
    observers.append(center.addObserver(forName: UIScene.willEnterForegroundNotification, object: nil, queue: .main) { note in
      guard let scene = note.object as? UIWindowScene else { return }
      MainActor.assumeIsolated { for window in scene.windows { style(window) } }
    })
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
  var glassTint: UIColor? { didSet { if effectInstalled && materialized { applyEffect() } } }
  var cornerRadius: CGFloat = 0 { didSet { applyShape() } }
  var clearStyle = false { didSet { if effectInstalled && materialized { applyEffect() } } }
  var interactive = false { didSet { if effectInstalled && materialized { applyEffect() } } }
  /// Glass appearance: `.dark` renders the system's dark Liquid Glass (no
  /// painted tint), `.unspecified` follows the environment.
  var appearance: UIUserInterfaceStyle = .unspecified {
    didSet {
      guard appearance != oldValue else { return }
      effectView.overrideUserInterfaceStyle = appearance
      refreshEffectForAppearance()
    }
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
  /// Apple's pattern for showing/hiding glass: never alpha-fade the glass
  /// view; animate its `effect` (nil ⇄ glass) inside `UIView.animate`, and
  /// the content's alpha in the same block, so both appear/disappear together.
  var materialized = true {
    didSet {
      guard materialized != oldValue, effectInstalled else { return }
      animateMaterial(to: materialized, duration: materializeDuration)
    }
  }
  /// First install animates from no effect (materializes) instead of popping in.
  var animateAppearance = false
  var materializeDuration: TimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)
    applyShape()
    if #available(iOS 17.0, *) {
      appearanceRegistration = registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: NemuGlassView, previous: UITraitCollection) in
        if view.traitCollection.userInterfaceStyle != previous.userInterfaceStyle {
          view.refreshEffectForAppearance()
        }
      }
    }
  }

  deinit {
    visibilityLink?.invalidate()
  }

  /// An installed `UIGlassEffect` does not reliably re-resolve when the
  /// appearance it renders in changes (in-app theme switch, `colorScheme`
  /// prop): it can keep the old light / dark glass. Reassign the effect so
  /// UIKit rebuilds it for the new appearance.
  private func refreshEffectForAppearance() {
    guard effectInstalled, materialized else { return }
    effectView.effect = UIVisualEffect()
    applyEffect()
  }

  private var appearanceRegistration: Any?

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
    if !materialized {
      effectView.effect = nil
      effectView.contentView.alpha = 0
    } else if animateAppearance && materializeDuration > 0 {
      effectView.effect = nil
      effectView.contentView.alpha = 0
      animateMaterial(to: true, duration: materializeDuration)
    } else {
      effectView.contentView.alpha = 1
      applyEffect()
    }
  }

  private func animateMaterial(to visible: Bool, duration: TimeInterval) {
    let changes = { [self] in
      if visible {
        applyEffect()
      } else {
        effectView.effect = nil
      }
      effectView.contentView.alpha = visible ? 1 : 0
    }
    if duration <= 0 {
      changes()
      return
    }
    UIView.animate(withDuration: duration, delay: 0, options: [.beginFromCurrentState, .curveEaseOut, .allowUserInteraction], animations: changes)
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

/// Sample the UIKit sheet's presentation layer, not a second independently timed animation.
///
/// Full-rate sampling only while the sheet moves. A display link at the
/// display's maximum rate keeps ProMotion at 120 Hz, so the link runs at the
/// full rate only after a wake — the view joining a window (presentation),
/// the `visible` prop changing (a programmatic dismiss), the sheet's own pan
/// gesture (an interactive drag), or an idle sample seeing the sheet move — and
/// drops to a ~10 Hz watch once no animation is in flight on the presented
/// view's layers, the sheet is not mid-transition and the progress has held
/// for a few frames. The watch is what catches movement nothing announces
/// (a detent change from the keyboard or from scrolling content, a
/// programmatic detent change): UIKit exposes no callback for those, and
/// layer KVO does not fire for its sheet animations.
final class NemuSheetProgressView: ExpoView {
  let onProgress = EventDispatcher()
  var visible = true {
    didSet { if visible != oldValue { wake("visible") } }
  }
  private var displayLink: CADisplayLink?
  private var fullRate = false
  private var lastProgress: CGFloat = -1
  private var observedPresentationMovement = false
  private weak var observedSheet: UIViewController?
  private var observedLayers: [CALayer] = []
  private var observedGestures: [UIGestureRecognizer] = []
  private lazy var proxy = NemuSheetProgressDisplayLinkProxy(self)
  /// Keep sampling at the full rate at least until then after a wake (an
  /// animation is added just after whatever woke us).
  private var awakeUntil: CFTimeInterval = 0
  private var lastSample: CGFloat = -1
  private var stableFrames = 0
  /// A completion is registered on the current dismissal transition.
  private var dismissalHooked = false

  override func didMoveToWindow() {
    super.didMoveToWindow()
    displayLink?.invalidate()
    displayLink = nil
    fullRate = false
    dismissalHooked = false
    stopObservingSheet()
    observedPresentationMovement = false
    publish(0)
    guard window != nil else { return }
    wake("window")
    sample()
  }

  deinit {
    displayLink?.invalidate()
    let gestures = observedGestures
    let proxy = proxy
    MainActor.assumeIsolated {
      gestures.forEach { $0.removeTarget(proxy, action: #selector(NemuSheetProgressDisplayLinkProxy.gesture(_:))) }
    }
  }

  fileprivate func wake(_ reason: String) {
    awakeUntil = max(awakeUntil, CACurrentMediaTime() + 0.3)
    stableFrames = 0
    guard window != nil else { return }
    if displayLink == nil {
      let link = CADisplayLink(target: proxy, selector: #selector(NemuSheetProgressDisplayLinkProxy.tick))
      link.add(to: .main, forMode: .common)
      displayLink = link
    }
    if !fullRate {
      sheetProgressLog.debug("full rate: \(reason, privacy: .public)")
      fullRate = true
      displayLink?.preferredFrameRateRange = .default
    }
  }

  private func idle(at progress: CGFloat?) {
    guard fullRate else { return }
    fullRate = false
    // Always leave JS on the exact settled value (the detent), not the last
    // sample the change threshold let through.
    if let progress { publish(progress, force: true) }
    displayLink?.preferredFrameRateRange = CAFrameRateRange(minimum: 8, maximum: 12, preferred: 10)
    sheetProgressLog.debug("idle at \(Double(progress ?? -1), privacy: .public)")
  }

  private func publish(_ progress: CGFloat, force: Bool = false) {
    let value = min(1, max(0, progress))
    guard force || abs(value - lastProgress) > 0.001 else { return }
    if value == 0 || force { sheetProgressLog.debug("publish \(Double(value), privacy: .public)") }
    lastProgress = value
    onProgress(["progress": value])
  }

  private func stopObservingSheet() {
    observedGestures.forEach {
      $0.removeTarget(proxy, action: #selector(NemuSheetProgressDisplayLinkProxy.gesture(_:)))
    }
    observedGestures = []
    observedLayers = []
    observedSheet = nil
  }

  /// The presented view and each ancestor up to (and including) the
  /// container: their layers' animations move the sheet, and the sheet's
  /// drag recognizer lives on one of them.
  private func observeSheet(_ sheet: UIViewController, presented: UIView, container: UIView) {
    guard observedSheet !== sheet else { return }
    stopObservingSheet()
    observedSheet = sheet
    var view: UIView? = presented
    while let current = view {
      observedLayers.append(current.layer)
      for recognizer in current.gestureRecognizers ?? [] where recognizer is UIPanGestureRecognizer {
        recognizer.addTarget(proxy, action: #selector(NemuSheetProgressDisplayLinkProxy.gesture(_:)))
        observedGestures.append(recognizer)
      }
      if current === container { break }
      view = current.superview
    }
  }

  fileprivate func sample() {
    let progress = measure()
    let animating = (observedSheet?.isBeingPresented ?? false) || (observedSheet?.isBeingDismissed ?? false)
      || observedLayers.contains { !($0.animationKeys()?.isEmpty ?? true) }
    if let progress, abs(progress - lastSample) < 0.0005 {
      stableFrames += 1
    } else {
      stableFrames = 0
    }
    lastSample = progress ?? -1
    if !fullRate {
      // The idle watch saw the sheet move: follow it at the full rate.
      if animating || (progress != nil && stableFrames == 0) { wake("moved") }
      return
    }
    let settled = !animating && (progress == nil || stableFrames >= 3)
    if settled && CACurrentMediaTime() >= awakeUntil { idle(at: progress) }
  }

  private func measure() -> CGFloat? {
    var responder: UIResponder? = self
    var sheet: UIViewController?
    while let next = responder?.next {
      if let controller = next as? UIViewController {
        var candidate: UIViewController? = controller
        while let current = candidate {
          if current.presentingViewController != nil,
             current.presentationController is UISheetPresentationController {
            sheet = current
            break
          }
          candidate = current.parent
        }
        if sheet != nil { break }
      }
      responder = next
    }
    guard let sheet, let presentation = sheet.presentationController,
          let container = presentation.containerView,
          let presented = presentation.presentedView else { return nil }
    observeSheet(sheet, presented: presented, container: container)
    if sheet.isBeingDismissed { hookDismissal(of: sheet) }
    let target = presentation.frameOfPresentedViewInContainerView
    let layer = presented.layer.presentation() ?? presented.layer
    let containerLayer = container.layer.presentation() ?? container.layer
    let current = layer.convert(layer.bounds, to: containerLayer)
    let travel = container.bounds.maxY - target.minY
    guard travel > 0 else { return nil }
    let progress = (container.bounds.maxY - current.minY) / travel
    // UIKit installs the final model frame before its entrance animation.
    // Do not mistake that first stationary frame for a completed presentation.
    if sheet.isBeingPresented && !observedPresentationMovement && progress >= 0.999 {
      publish(0)
      return progress
    }
    if progress > 0 && progress < 0.999 { observedPresentationMovement = true }
    // The last frames of a dismissal land a hair above 0 and the view may
    // leave the window (or JS unmount it) before another sample: snap to 0.
    publish(sheet.isBeingDismissed && progress < 0.02 ? 0 : progress)
    return progress
  }

  /// A dismissal (swipe, tap outside, programmatic) always ends on 0: the
  /// transition's completion publishes it before the sheet's own dismissal
  /// callbacks reach JS; a cancelled interactive dismissal resumes sampling.
  private func hookDismissal(of sheet: UIViewController) {
    guard !dismissalHooked, let coordinator = sheet.transitionCoordinator else { return }
    dismissalHooked = true
    coordinator.animate(alongsideTransition: nil) { [weak self] context in
      MainActor.assumeIsolated {
        guard let self else { return }
        self.dismissalHooked = false
        if context.isCancelled {
          self.wake("dismiss-cancelled")
        } else {
          self.publish(0, force: true)
        }
      }
    }
  }
}

private let sheetProgressLog = Logger(subsystem: "pm.nemu.window-layout", category: "sheet-progress")

/// Weak display-link / gesture target: `CADisplayLink` retains its target.
private final class NemuSheetProgressDisplayLinkProxy: NSObject {
  private weak var view: NemuSheetProgressView?
  init(_ view: NemuSheetProgressView) { self.view = view }
  @objc func tick() {
    MainActor.assumeIsolated { view?.sample() }
  }
  @objc func gesture(_ recognizer: UIGestureRecognizer) {
    MainActor.assumeIsolated {
      switch recognizer.state {
      case .began, .changed, .ended, .cancelled: view?.wake("drag")
      default: break
      }
    }
  }
}
