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
      ViewModifierRegistry.register(NemuPresentationPlacementModifier.type) { params, _, _ in
        NemuPresentationPlacementModifier(params: params)
      }
      ViewModifierRegistry.register(NemuZeroTopScrollContentMarginModifier.type) { _, _, _ in
        NemuZeroTopScrollContentMarginModifier()
      }
      ViewModifierRegistry.register(NemuScrollEdgeEffectHiddenModifier.type) { _, _, _ in
        NemuScrollEdgeEffectHiddenModifier()
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
      ViewModifierRegistry.register(NemuFitPopoverToContentModifier.type) { params, _, _ in
        NemuFitPopoverToContentModifier(params: params)
      }
      ViewModifierRegistry.register(NemuNavigationBarHiddenModifier.type) { _, _, _ in
        NemuNavigationBarHiddenModifier()
      }
      ViewModifierRegistry.register(NemuFormRowIconModifier.type) { params, _, _ in
        NemuFormRowIconModifier(params: params)
      }
      ViewModifierRegistry.register(NemuFormRowMenuTitleModifier.type) { _, _, _ in
        NemuFormRowMenuTitleModifier()
      }
      ViewModifierRegistry.register(NemuReportFormGroupInsetModifier.type) { _, _, eventDispatcher in
        NemuReportFormGroupInsetModifier(eventDispatcher: eventDispatcher)
      }
      ViewModifierRegistry.register(NemuReportPageWidthModifier.type) { _, _, eventDispatcher in
        NemuReportPageWidthModifier(eventDispatcher: eventDispatcher)
      }
      // The in-app theme from the last run, before any JS (see `NemuAppAppearance`).
      DispatchQueue.main.async {
        MainActor.assumeIsolated { NemuAppAppearance.restore() }
      }
      // Header search bars follow a live text-size change
      // (see `NemuSearchHeaderRelayout`).
      DispatchQueue.main.async {
        MainActor.assumeIsolated { NemuSearchHeaderRelayout.install() }
      }
    }
    OnDestroy {
      ViewModifierRegistry.unregister(NemuPresentationColorSchemeModifier.type)
      ViewModifierRegistry.unregister(NemuInlineToolbarTitleModifier.type)
      ViewModifierRegistry.unregister(NemuPresentationPlacementModifier.type)
      ViewModifierRegistry.unregister(NemuZeroTopScrollContentMarginModifier.type)
      ViewModifierRegistry.unregister(NemuScrollEdgeEffectHiddenModifier.type)
      ViewModifierRegistry.unregister(NemuFitSheetDetentModifier.type)
      ViewModifierRegistry.unregister(NemuReportSheetContentHeightModifier.type)
      ViewModifierRegistry.unregister(NemuMeasureSheetPageModifier.type)
      ViewModifierRegistry.unregister(NemuFitPopoverToContentModifier.type)
      ViewModifierRegistry.unregister(NemuNavigationBarHiddenModifier.type)
      ViewModifierRegistry.unregister(NemuFormRowIconModifier.type)
      ViewModifierRegistry.unregister(NemuFormRowMenuTitleModifier.type)
      ViewModifierRegistry.unregister(NemuReportFormGroupInsetModifier.type)
      ViewModifierRegistry.unregister(NemuReportPageWidthModifier.type)
    }
    // Lets JS tell a binary with these views from one built before them.
    Constant("verticalBarBehaviorViewAvailable") { true }
    Constant("verticalBarOnlyLeadingItemsViewAvailable") { true }
    // 2: hides the items from a horizontal bar on every OS (none has a
    // vertical bar before iOS 27.1) and re-hides rebuilt items, so JS may
    // keep them mounted under a top bar; with `NemuBarAxisVisibilityView`.
    Constant("barAxisViewsVersion") { 2 }
    Constant("glassViewHostsChildren") { true }
    // The glass view takes `materializeOffsetY` / `materializeNotBeforeMs`:
    // its slide runs in the same Core Animation as its material, optionally
    // starting at a wall-clock time.
    Constant("glassMaterializeMotionAvailable") { true }
    // The glass view takes `childrenAboveMaterial`: its children sit in an
    // unclipped layer above the material instead of in its contentView.
    Constant("glassChildrenAboveMaterialAvailable") { true }
    Constant("pageCurlViewAvailable") { true }
    Constant("pageCurlTurnAvailable") { true }
    Constant("pageSlideViewAvailable") { true }
    Constant("pagePushViewAvailable") { true }
    // The reader's Orientation Lock where the system only takes a preference
    // (iPad, resizable scenes): keep the scene's current orientation.
    AsyncFunction("setInterfaceOrientationLocked") { (locked: Bool) in
      MainActor.assumeIsolated { NemuInterfaceOrientationLock.set(locked) }
    }.runOnQueue(.main)
    Constant("interfaceOrientationLockAvailable") { true }
    // A foldable iPhone (the iPhone Duo), from what the system says about the
    // device (its display, a reported or remembered hinge; `NemuDeviceInfo`),
    // never a timeout. Read synchronously by JS at load; the window observer
    // also reports it (`foldableDevice`) on every snapshot. JS learns it is
    // foldable and stays so; false only means the display looks like an
    // ordinary iPhone's (a hinge may still report later).
    Constant("isFoldableDevice") { () -> Bool in
      if Thread.isMainThread {
        return MainActor.assumeIsolated { NemuOrientationGate.resolveFoldable() }
      }
      return NemuOrientationGate.foldable
    }
    Constant("deviceModelIdentifier") { NemuDeviceInfo.modelIdentifier }
    // Resolves once no view controller transition is running in the app's
    // windows (see `NemuTransitionSettle`): orientation changes wait for it.
    AsyncFunction("afterTransitions") { (promise: Promise) in
      MainActor.assumeIsolated { NemuTransitionSettle.wait { promise.resolve() } }
    }.runOnQueue(.main)
    Constant("afterTransitionsAvailable") { true }
    // A list at its top after its inset behaviour flipped: rests at its new top.
    AsyncFunction("scrollToAdjustedTop") { (viewTag: Int) in
      guard let view = self.appContext?.findView(withTag: viewTag, ofType: UIView.self) else { return }
      MainActor.assumeIsolated { NemuScrollRest.restAtAdjustedTop(view) }
    }.runOnQueue(.main)
    AsyncFunction("setAppAppearance") { (appearance: String) in
      MainActor.assumeIsolated { NemuAppAppearance.set(appearance) }
    }.runOnQueue(.main)
    // Cold-launch reveal: true until this process has revealed its window once,
    // so a JS reload into an already visible UI never plays it again.
    Function("launchRevealPending") { () -> Bool in
      NemuLaunchReveal.pending
    }
    AsyncFunction("prepareLaunchReveal") { (mode: String, background: String?, promise: Promise) in
      MainActor.assumeIsolated { NemuLaunchReveal.prepare(mode: mode, background: background) { promise.resolve($0) } }
    }.runOnQueue(.main)
    AsyncFunction("startLaunchReveal") {
      MainActor.assumeIsolated { NemuLaunchReveal.start() }
    }.runOnQueue(.main)
    // Spread pairing evidence for one cached reader page file (margins, edge
    // profiles, border colour; see `NemuPageAnalysis`). Runs on the module's
    // background queue, one page at a time.
    AsyncFunction("analyzePage") { (uri: String) -> [String: Any]? in
      NemuPageAnalysis.analyze(uri: uri)
    }
    // The observer stays the first (default) view: `requireNativeViewManager("NemuWindowLayout")`.
    View(NemuWindowLayoutView.self) {
      Events("onRegionsChange", "onWillTransition")
      Prop("enabled") { (view: NemuWindowLayoutView, enabled: Bool) in
        view.observationEnabled = enabled
      }
    }
    View(NemuPageCurlView.self) {
      Events("onSettle", "onEdgeDrag", "onTurnBegin", "onTurnEnd")
      Prop("spine") { (view: NemuPageCurlView, spine: String) in view.spine = spine }
      Prop("slotCount") { (view: NemuPageCurlView, count: Int) in view.slotCount = count }
      // Changes whenever a mounted child takes another slot: re-host them.
      Prop("slotsKey") { (view: NemuPageCurlView, _: String) in view.setNeedsLayout() }
      Prop("curlFrame") { (view: NemuPageCurlView, frame: [String: Double]) in
        view.curlFrame = CGRect(x: frame["x"] ?? 0, y: frame["y"] ?? 0, width: frame["width"] ?? 0, height: frame["height"] ?? 0)
      }
      Prop("turningEnabled") { (view: NemuPageCurlView, enabled: Bool) in view.turningEnabled = enabled }
      // JS always sends the reader's page background; an unparsable one is
      // the reader's default (White), never a black that was never chosen.
      Prop("pageBackground") { (view: NemuPageCurlView, color: UIColor?) in view.pageBackground = color ?? .white }
      Prop("slotBackgrounds") { (view: NemuPageCurlView, colors: [String: String]?) in
        view.slotBackgrounds = NemuSlotBackgrounds.parse(colors)
      }
      Prop("navigationIndex") { (view: NemuPageCurlView, index: Int) in view.navigationIndex = index; view.setNeedsLayout() }
      // A tap turn starts here at once, ahead of the React commit that brings
      // the same navigation as props (which then changes nothing).
      AsyncFunction("turn") { (view: NemuPageCurlView, slot: Int, animated: Bool, token: Int) in
        view.requestTurn(slot: slot, animated: animated, token: token)
      }.runOnQueue(.main)
      Prop("navigationAnimated") { (view: NemuPageCurlView, animated: Bool) in view.navigationAnimated = animated }
      Prop("navigationToken") { (view: NemuPageCurlView, token: Int) in view.navigationToken = token }
    }
    // The slide page turn (`NemuPageSlideView`): the curl's props and children.
    View(NemuPageSlideView.self) {
      Events("onSettle", "onEdgeDrag", "onTurnBegin", "onTurnEnd")
      Prop("spine") { (view: NemuPageSlideView, spine: String) in view.spine = spine }
      Prop("rtl") { (view: NemuPageSlideView, rtl: Bool) in view.rtl = rtl }
      Prop("slotCount") { (view: NemuPageSlideView, count: Int) in view.slotCount = count }
      Prop("slotsKey") { (view: NemuPageSlideView, _: String) in view.setNeedsLayout() }
      Prop("curlFrame") { (view: NemuPageSlideView, frame: [String: Double]) in
        view.curlFrame = CGRect(x: frame["x"] ?? 0, y: frame["y"] ?? 0, width: frame["width"] ?? 0, height: frame["height"] ?? 0)
      }
      Prop("turningEnabled") { (view: NemuPageSlideView, enabled: Bool) in view.turningEnabled = enabled }
      Prop("pageBackground") { (view: NemuPageSlideView, color: UIColor?) in view.pageBackground = color ?? .white }
      Prop("slotBackgrounds") { (view: NemuPageSlideView, colors: [String: String]?) in
        view.slotBackgrounds = NemuSlotBackgrounds.parse(colors)
      }
      Prop("navigationIndex") { (view: NemuPageSlideView, index: Int) in view.navigationIndex = index; view.setNeedsLayout() }
      AsyncFunction("turn") { (view: NemuPageSlideView, slot: Int, animated: Bool, token: Int) in
        view.requestTurn(slot: slot, animated: animated, token: token)
      }.runOnQueue(.main)
      Prop("navigationAnimated") { (view: NemuPageSlideView, animated: Bool) in view.navigationAnimated = animated }
      Prop("navigationToken") { (view: NemuPageSlideView, token: Int) in view.navigationToken = token }
    }
    // The push page turn (`NemuPagePushView`, Photos-style paging): the curl's props and children.
    View(NemuPagePushView.self) {
      Events("onSettle", "onEdgeDrag", "onTurnBegin", "onTurnEnd")
      Prop("spine") { (view: NemuPagePushView, spine: String) in view.spine = spine }
      Prop("rtl") { (view: NemuPagePushView, rtl: Bool) in view.rtl = rtl }
      Prop("slotCount") { (view: NemuPagePushView, count: Int) in view.slotCount = count }
      Prop("slotsKey") { (view: NemuPagePushView, _: String) in view.setNeedsLayout() }
      Prop("curlFrame") { (view: NemuPagePushView, frame: [String: Double]) in
        view.curlFrame = CGRect(x: frame["x"] ?? 0, y: frame["y"] ?? 0, width: frame["width"] ?? 0, height: frame["height"] ?? 0)
      }
      Prop("turningEnabled") { (view: NemuPagePushView, enabled: Bool) in view.turningEnabled = enabled }
      Prop("pageBackground") { (view: NemuPagePushView, color: UIColor?) in view.pageBackground = color ?? .white }
      Prop("slotBackgrounds") { (view: NemuPagePushView, colors: [String: String]?) in
        view.slotBackgrounds = NemuSlotBackgrounds.parse(colors)
      }
      Prop("navigationIndex") { (view: NemuPagePushView, index: Int) in view.navigationIndex = index; view.setNeedsLayout() }
      AsyncFunction("turn") { (view: NemuPagePushView, slot: Int, animated: Bool, token: Int) in
        view.requestTurn(slot: slot, animated: animated, token: token)
      }.runOnQueue(.main)
      Prop("navigationAnimated") { (view: NemuPagePushView, animated: Bool) in view.navigationAnimated = animated }
      Prop("navigationToken") { (view: NemuPagePushView, token: Int) in view.navigationToken = token }
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
    View(NemuVerticalBarOnlyLeadingItemsView.self) {
      Prop("enabled") { (view: NemuVerticalBarOnlyLeadingItemsView, enabled: Bool) in
        view.guardEnabled = enabled
      }
    }
    View(NemuBarAxisVisibilityView.self) {
      Prop("axis") { (view: NemuBarAxisVisibilityView, axis: String) in
        view.axis = axis
      }
    }
    Constant("nameAlertViewAvailable") { true }
    View(NemuNameAlertView.self)
    // A partial-intensity blur that re-applies its effect (see NemuBlurView):
    // the scroll edge bands, where expo-blur's BlurView could stay empty.
    Constant("blurViewAvailable") { true }
    View(NemuBlurView.self) {
      Prop("intensity") { (view: NemuBlurView, intensity: Double) in view.intensity = intensity }
      Prop("tint") { (view: NemuBlurView, tint: String) in view.style = NemuBlurView.style(named: tint) }
    }
    Constant("segmentedControlViewAvailable") { true }
    View(NemuSegmentedControlView.self) {
      Events("onSelectionChange")
      Prop("labels") { (view: NemuSegmentedControlView, labels: [String]) in view.labels = labels }
      Prop("selectedIndex") { (view: NemuSegmentedControlView, index: Int) in view.selectedIndex = index }
      Prop("selectionColor") { (view: NemuSegmentedControlView, color: UIColor) in view.control.selectedSegmentTintColor = color }
      Prop("textColor") { (view: NemuSegmentedControlView, color: UIColor) in view.textColor = color }
      Prop("selectedTextColor") { (view: NemuSegmentedControlView, color: UIColor) in view.selectedTextColor = color }
    }
    Constant("concentricViewAvailable") { true }
    View(NemuConcentricView.self) {
      Prop("minimumRadius") { (view: NemuConcentricView, radius: Double) in
        view.minimumRadius = CGFloat(radius)
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
      Prop("materializeOffsetY") { (view: NemuGlassView, offset: Double) in
        view.materializeOffsetY = offset.isFinite ? CGFloat(offset) : 0
      }
      Prop("materializeNotBeforeMs") { (view: NemuGlassView, ms: Double) in
        view.materializeNotBeforeMs = ms.isFinite ? ms : 0
      }
      Prop("childrenAboveMaterial") { (view: NemuGlassView, above: Bool) in
        view.childrenAboveMaterial = above
      }
    }
    // Cover zoom transition (iOS 18+ `preferredTransition = .zoom`): a source
    // registers itself under an id; the pushed screen's target sets the zoom
    // on its view controller and names its own alignment rect.
    Constant("zoomTransitionAvailable") { true }
    // The target reports when the zoom has landed (`onZoomSettled`).
    Constant("zoomSettledEventAvailable") { true }
    // ... and when it starts, with its duration (`onZoomStarted`).
    Constant("zoomStartedEventAvailable") { true }
    View(NemuZoomSourceView.self) {
      Prop("zoomId") { (view: NemuZoomSourceView, id: String) in
        view.zoomId = id
      }
    }
    View(NemuZoomTargetView.self) {
      Prop("zoomId") { (view: NemuZoomTargetView, id: String) in
        view.zoomId = id
      }
      Prop("align") { (view: NemuZoomTargetView, align: Bool) in
        view.alignsToSelf = align
      }
      Events("onZoomSettled", "onZoomStarted")
      Prop("interactiveDismiss") { (view: NemuZoomTargetView, enabled: Bool) in
        view.interactiveDismiss = enabled
      }
      Prop("freezePresenter") { (view: NemuZoomTargetView, freeze: Bool) in
        view.freezePresenter = freeze
      }
    }
    // Hands a list's scroll view to UIKit as the content scroll view of its
    // screen and every parent up to the tab bar controller, so the tab bar can
    // minimise on scroll for lists inside a nested native stack.
    Constant("contentScrollMarkerAvailable") { true }
    View(NemuContentScrollMarkerView.self) {
      // Re-applies the registration (e.g. after the list remounted).
      Prop("generation") { (view: NemuContentScrollMarkerView, _: Double) in
        view.scheduleApply()
      }
      // False beside a vertical bar: the list is not the top edge's content
      // scroll view (see `NemuContentScrollMarkerView.topEdge`).
      Prop("topEdge") { (view: NemuContentScrollMarkerView, topEdge: Bool?) in
        let next = topEdge ?? true
        guard next != view.topEdge else { return }
        view.topEdge = next
        view.scheduleApply()
      }
    }
    View(NemuGlassContainerView.self) {
      Prop("spacing") { (view: NemuGlassContainerView, spacing: Double) in
        view.spacing = CGFloat(spacing)
      }
    }
    // A system context menu on any view (long press: the view lifts and the
    // menu opens), see `NemuContextMenuView`.
    Constant("contextMenuViewAvailable") { true }
    View(NemuContextMenuView.self) {
      Events("onMenuAction", "onMenuWillDisplay", "onMenuWillEnd", "onMenuConfigure")
      Prop("items") { (view: NemuContextMenuView, items: [NemuContextMenuItem]) in
        view.items = items
      }
      Prop("previewCornerRadius") { (view: NemuContextMenuView, radius: Double) in view.previewCornerRadius = CGFloat(radius) }
      Prop("menuTitle") { (view: NemuContextMenuView, title: String?) in
        view.menuTitle = title ?? ""
      }
    }
  }
}

/// One action of a `NemuContextMenuView`.
struct NemuContextMenuItem: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var subtitle: String?
  @Field var systemImage: String?
  @Field var destructive: Bool = false
  @Field var disabled: Bool = false
}

/// A view whose long press opens a system context menu (`UIContextMenuInteraction`):
/// the view lifts as the menu's preview, the menu lists `items`, and choosing
/// one sends `onMenuAction` with its id. Taps pass through to the React
/// Native content as usual. No items: no menu.
final class NemuContextMenuView: ExpoView, UIContextMenuInteractionDelegate {
  let onMenuAction = EventDispatcher()
  /// The menu is presenting / going away. React Native's touch handler is not
  /// cancelled by this interaction (it lives inside the RN root), so the
  /// release after the hold still reaches the pressable underneath; these let
  /// it drop that release (`ContextMenuLongPress.ts`). Every menu event carries
  /// `uptime`: when UIKit called us, in ms on the touch clock (`systemUptime`,
  /// the base of `UITouch.timestamp` and so of RN's `nativeEvent.timestamp`),
  /// so JS can tell a lift UIKit cancelled under a resting finger (moved, or a
  /// scroll view's pan began) from one the release ended.
  let onMenuWillDisplay = EventDispatcher()
  let onMenuWillEnd = EventDispatcher()
  /// The interaction asked for the menu (~150 ms into a hold): a lift may
  /// follow, so a release from here waits for willDisplay or willEnd (which
  /// UIKit also sends, without a display, when the lift is cancelled).
  let onMenuConfigure = EventDispatcher()
  var items: [NemuContextMenuItem] = []
  var menuTitle = ""
  var previewCornerRadius: CGFloat = 16
  private var pendingAction: String?

  static func uptimeMs() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIContextMenuInteraction(delegate: self))
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard !items.isEmpty else { return nil }
    onMenuConfigure(["uptime": Self.uptimeMs()])
    let items = self.items
    let title = menuTitle
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      let actions = items.map { item -> UIAction in
        var attributes: UIMenuElement.Attributes = []
        if item.destructive { attributes.insert(.destructive) }
        if item.disabled { attributes.insert(.disabled) }
        let action = UIAction(
          title: item.title,
          image: item.systemImage.flatMap { UIImage(systemName: $0) },
          attributes: attributes
        ) { _ in
          self?.pendingAction = item.id
        }
        action.subtitle = item.subtitle
        return action
      }
      return UIMenu(title: title, children: actions)
    }
  }
  /// nil when the view has left the window (unmounted, recycled or reparented
  /// while the menu was opening or dismissing): UITargetedPreview asserts on a
  /// windowless view, and UIKit falls back to its default preview for nil.
  private func menuPreview() -> UITargetedPreview? {
    guard window != nil, !bounds.isEmpty else { return nil }
    let parameters = UIPreviewParameters()
    parameters.backgroundColor = .clear
    parameters.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: previewCornerRadius)
    return UITargetedPreview(view: self, parameters: parameters)
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? { menuPreview() }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? { menuPreview() }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    willDisplayMenuFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
    onMenuWillDisplay(["uptime": Self.uptimeMs()])
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
    onMenuWillEnd(["uptime": Self.uptimeMs()])
    let finish = { [weak self] in
      guard let self, let id = self.pendingAction else { return }
      self.pendingAction = nil
      self.onMenuAction(["id": id])
    }
    if let animator { animator.addCompletion(finish) } else { finish() }
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

/// On a Form row with an icon (Picker, Toggle, Button, a NavigationLink's
/// Label): at accessibility text sizes the icon gets a column of its own,
/// beside the control. The stock row draws its icon inline with the title,
/// so wrapped title lines run under the icon, and starts a menu Picker's
/// value line on the row's edge; here every title line and the value line
/// start on the first title line's edge (as Settings lays out its rows at
/// these sizes), the icon centred in its column on that line's baseline, at
/// the stock icon's size and in its place. At the other sizes the row is the
/// stock one, untouched.
///
/// At accessibility sizes the control itself must come without its icon: a
/// Form's Picker and Toggle draw theirs whatever the `labelStyle`, so the
/// JS side passes those (and Buttons) no `systemImage` there; a Label gets
/// `.titleOnly` here. Put the modifier first in the control's modifiers so
/// `disabled` / `foregroundStyle` after it reach the icon too. The icon is in
/// the tint, like a stock Picker's / Toggle's / NavigationLink Label's,
/// unless `tinted` is false (a row in the label colour, an action Button's:
/// the icon takes the row's `foregroundStyle`). `menu`: a menu Picker, whose
/// value line the system draws in a button `menuValueInset` inside the
/// Picker's edge; the Picker moves out by that inset and its title (in a
/// `nemuFormRowMenuTitle` label) back in, so both start on the column's edge.
/// `toggle`: a Toggle, drawn with `NemuFormRowIconToggleStyle` (its title and
/// switch laid out here, the icon on the title's first line). `actionRow`: an
/// action Button whose `foregroundStyle` (after this modifier) puts its title
/// in the label colour; its icon stays in the tint like every other row's, at
/// every size (`NemuFormRowActionLabelStyle`).
struct NemuFormRowIconModifier: ViewModifier {
  static let type = "nemuFormRowIcon"
  /// How far a Form's menu Picker draws its value line inside the Picker's
  /// edge at accessibility sizes (iOS 26/27, the same at AX1…AX5).
  static let menuValueInset: CGFloat = 11.67
  let systemImage: String
  let tinted: Bool
  let menu: Bool
  let toggle: Bool
  let actionRow: Bool
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.isEnabled) private var isEnabled
  // The stock row's first title line and icon, measured at AX1, AX3 and AX5
  // (iOS 26/27): the title starts 25.03 × the body's `ScaledMetric` factor
  // + 9.83 in from the row's edge, the icon is centred half of 25.03 × the
  // factor − 13.9 in. So: an icon column of that width, then the rest.
  @ScaledMetric(relativeTo: .body) private var scaledIconWidth: CGFloat = 25.03
  private static let iconWidthExtra: CGFloat = -13.9
  private static let iconSpacing: CGFloat = 23.73

  init(params: [String: Any]) {
    systemImage = params["systemImage"] as? String ?? ""
    tinted = params["tinted"] as? Bool ?? true
    menu = params["menu"] as? Bool ?? false
    toggle = params["toggle"] as? Bool ?? false
    actionRow = params["actionRow"] as? Bool ?? false
  }

  @ViewBuilder
  func body(content: Content) -> some View {
    if dynamicTypeSize.isAccessibilitySize && !systemImage.isEmpty && toggle {
      content.toggleStyle(NemuFormRowIconToggleStyle(icon: AnyView(iconColumn), spacing: Self.iconSpacing))
    } else if dynamicTypeSize.isAccessibilitySize && !systemImage.isEmpty {
      HStack(alignment: .firstTextBaseline, spacing: Self.iconSpacing) {
        iconColumn
        control(content)
          .frame(maxWidth: .infinity, alignment: .leading)
          // The row's separator starts on the title's edge.
          .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
      }
    } else if actionRow {
      content.labelStyle(NemuFormRowActionLabelStyle())
    } else {
      content
    }
  }

  @ViewBuilder
  private func control(_ content: Content) -> some View {
    if menu {
      NemuFormRowMenuPickerLayout {
        content
          .labelStyle(.titleOnly)
          .padding(.leading, -Self.menuValueInset)
      }
    } else {
      content.labelStyle(.titleOnly)
    }
  }

  private var iconColumn: some View {
    icon
      // No height of its own: a symbol taller than the first line (the page
      // one, at AX1) sits on the line's baseline but doesn't make its row
      // taller and push the text down.
      .frame(width: scaledIconWidth + Self.iconWidthExtra, height: 0)
      .accessibilityHidden(true)
  }

  @ViewBuilder
  private var icon: some View {
    // The stock icon steps down a symbol scale from AX3 on.
    let image = Image(systemName: systemImage)
      .imageScale(dynamicTypeSize >= .accessibility3 ? .small : .medium)
    if !isEnabled {
      image.foregroundStyle(.tertiary)
    } else if tinted || actionRow {
      image.foregroundStyle(.tint)
    } else {
      image
    }
  }
}

/// An action Button's Label (`nemuFormRowIcon(actionRow: true)`): rebuilt as a
/// stock Label, so the Form lays the row out as its own (icon column,
/// separator inset), with the icon set in the tint — inside the Button's
/// `foregroundStyle`, which then reaches the title only.
struct NemuFormRowActionLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    Label {
      configuration.title
    } icon: {
      NemuFormRowActionIcon(icon: configuration.icon)
    }
  }
}

private struct NemuFormRowActionIcon<Icon: View>: View {
  let icon: Icon
  @Environment(\.isEnabled) private var isEnabled

  var body: some View {
    if isEnabled {
      icon.foregroundStyle(.tint)
    } else {
      icon.foregroundStyle(.tertiary)
    }
  }
}

/// A Form Toggle with `nemuFormRowIcon` at accessibility sizes. The stock
/// Toggle sizes its title for a narrower width than it draws it at and
/// reports that layout's first baseline (a title that fits on one line is
/// sized for two and drawn on one, centred), so an icon on the Toggle's
/// baseline sat up to a line above the title. Here the title is laid out
/// beside the icon, on the title's own first baseline, and the switch (a
/// stock one, the title hidden but still its accessibility label) centred
/// beside the two, as the stock row centres it.
struct NemuFormRowIconToggleStyle: ToggleStyle {
  let icon: AnyView
  let spacing: CGFloat

  func makeBody(configuration: Configuration) -> some View {
    HStack(alignment: .center) {
      HStack(alignment: .firstTextBaseline, spacing: spacing) {
        icon
        configuration.label
          .labelStyle(.titleOnly)
          .frame(maxWidth: .infinity, alignment: .leading)
          // The row's separator starts on the title's edge.
          .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
          .accessibilityHidden(true)
      }
      Toggle(isOn: configuration.$isOn) { configuration.label }
        .labelsHidden()
        .toggleStyle(.switch)
    }
  }
}

/// The title of a menu Picker carrying `nemuFormRowIcon(menu: true)`, in its
/// `label`: in by the inset of the Picker's value line, on that line's edge.
struct NemuFormRowMenuTitleModifier: ViewModifier {
  static let type = "nemuFormRowMenuTitle"

  func body(content: Content) -> some View {
    content.padding(.leading, NemuFormRowIconModifier.menuValueInset)
  }
}

/// Around a menu Picker in `nemuFormRowIcon`: the Picker draws as wide as its
/// title's longest line, so a longer value wraps there; but asked for its size
/// with no height proposed it answers for the whole width offered, the value
/// on one line, and the row, sized on that, clipped the extra line and lost
/// its top and bottom inset. Asked with an unbounded height it answers with
/// the lines it draws: the row takes that height.
struct NemuFormRowMenuPickerLayout: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let picker = subviews.first else { return .zero }
    var size = picker.sizeThatFits(proposal)
    let drawn = picker.sizeThatFits(ProposedViewSize(width: size.width, height: .infinity))
    if drawn.height.isFinite, drawn.height > size.height { size.height = drawn.height }
    return size
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    guard let picker = subviews.first else { return }
    picker.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
  }

  func explicitAlignment(
    of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) -> CGFloat? {
    guard let picker = subviews.first else { return nil }
    return bounds.minY + picker.dimensions(in: ProposedViewSize(width: bounds.width, height: bounds.height))[guide]
  }
}

/// `toolbarTitleDisplayMode(.inline)`: a sheet's root in a NavigationStack
/// otherwise reserves an (empty) large-title row between its bar and the Form.
/// SwiftUI `presentationPlacement` (iOS 27.0) on a sheet's content root:
/// where in the presenting view the system places the sheet. On an iPhone
/// Duo half folded like a book an `automatic` sheet takes the leading half;
/// `trailing` puts it over the trailing half (the reader's side pane), and
/// the system presents its bars vertically there. Earlier systems: no-op.
/// Always in the chain (`automatic` when nothing is asked): a modifier
/// joining mid-presentation rehosts the content.
struct NemuPresentationPlacementModifier: ViewModifier {
  static let type = "nemuPresentationPlacement"
  let placement: String

  init(params: [String: Any]) {
    placement = params["placement"] as? String ?? "automatic"
  }

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 27.0, *) {
      content.presentationPlacement(resolved)
    } else {
      content
    }
  }

  @available(iOS 27.0, *)
  private var resolved: PresentationPlacement {
    switch placement {
    case "leading": return .leading
    case "trailing": return .trailing
    case "center": return .center
    default: return .automatic
    }
  }
}

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

/// `scrollEdgeEffectHidden(true, for: .vertical)` (iOS 26): a Form beside the
/// Duo's vertical bar draws no system top / bottom edge, as the stack screens'
/// own `scrollEdgeEffects` are `hidden` there (`nativeHeaderChrome.ts`); the
/// page lays the app's band over it instead (`NemuScrollEdgeSurface`). Earlier
/// systems have no scroll edge effect to hide.
struct NemuScrollEdgeEffectHiddenModifier: ViewModifier {
  static let type = "nemuScrollEdgeEffectHidden"

  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      content.scrollEdgeEffectHidden(true, for: .vertical)
    } else {
      content
    }
  }
}

/// `toolbar(.hidden, for: .navigationBar)`: a popover's root page in a
/// NavigationStack keeps its bar-less look; the pages pushed from it show the
/// bar (title, system back).
struct NemuNavigationBarHiddenModifier: ViewModifier {
  static let type = "nemuNavigationBarHidden"

  func body(content: Content) -> some View {
    content.toolbar(.hidden, for: .navigationBar)
  }
}

/// On a row inside a Form: reports where the Form draws its groups — the
/// leading and trailing distance from the list's edges to the row's cell (the
/// inset-grouped margin UIKit picks for this width, size class and safe
/// area: 20pt on a Pro Max sheet, 16pt on the Duo's), minus the list's own
/// horizontal safe area (where a page's content starts) — and that content
/// width. A React Native page pushed in the same NavigationStack is laid out
/// at that width and sets its groups on these edges. In the list's own
/// (unscaled) points, which the pushed page shares.
struct NemuReportFormGroupInsetModifier: ViewModifier {
  static let type = "nemuReportFormGroupInset"
  let eventDispatcher: EventDispatcher

  func body(content: Content) -> some View {
    content.background(
      NemuFormGroupInsetProbe { inset in
        eventDispatcher([
          NemuReportFormGroupInsetModifier.type: [
            "left": inset.left,
            "right": inset.right,
            "width": inset.width,
          ],
        ])
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
    )
  }
}

/// On a view in a NavigationStack page: reports the page's content width —
/// its hosting controller's view, inside its horizontal safe area — whatever
/// the view itself is sized to (a ScrollView around content that sets its own
/// width hugs it). Reported on appearing and whenever the page resizes
/// (rotation, a resized window), also while the page is on top of the stack
/// and the Form below it is off screen.
struct NemuReportPageWidthModifier: ViewModifier {
  static let type = "nemuReportPageWidth"
  let eventDispatcher: EventDispatcher

  func body(content: Content) -> some View {
    content.background(
      NemuPageWidthProbe { width, fullWidth in
        eventDispatcher([NemuReportPageWidthModifier.type: ["width": width, "fullWidth": fullWidth]])
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
    )
  }
}

private struct NemuPageWidthProbe: UIViewRepresentable {
  /// The width inside the horizontal safe area, and the page's whole width.
  let onChange: (CGFloat, CGFloat) -> Void

  func makeUIView(context: Context) -> NemuPageWidthProbeView {
    let view = NemuPageWidthProbeView()
    view.isUserInteractionEnabled = false
    view.onChange = onChange
    return view
  }

  func updateUIView(_ uiView: NemuPageWidthProbeView, context: Context) {
    uiView.onChange = onChange
    uiView.sampleSoon()
  }
}

final class NemuPageWidthProbeView: UIView {
  var onChange: ((CGFloat, CGFloat) -> Void)?
  private var last: CGFloat?
  private weak var observedPage: UIView?
  private var boundsToken: NSKeyValueObservation?

  deinit {
    boundsToken?.invalidate()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Every appearance reports (a new presentation starts without a width).
    last = nil
    if window != nil {
      sampleSoon()
    } else {
      boundsToken?.invalidate()
      boundsToken = nil
      observedPage = nil
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sample()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    sampleSoon()
  }

  /// After the page has its frame (a probe can lay out before its page does).
  func sampleSoon() {
    DispatchQueue.main.async { [weak self] in self?.sample() }
  }

  private var pageView: UIView? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller.view }
      responder = current.next
    }
    return nil
  }

  private func sample() {
    guard window != nil, let page = pageView else { return }
    if observedPage !== page {
      boundsToken?.invalidate()
      observedPage = page
      // The page resizes (rotation) without this zero-size probe laying out.
      boundsToken = page.observe(\.bounds, options: [.new]) { [weak self] _, _ in
        MainActor.assumeIsolated { self?.sampleSoon() }
      }
    }
    let width = page.bounds.width - page.safeAreaInsets.left - page.safeAreaInsets.right
    guard width > 0 else { return }
    if let last, abs(last - width) < 0.25 { return }
    last = width
    onChange?(width, page.bounds.width)
  }
}

struct NemuFormGroupInset: Equatable {
  var left: CGFloat
  var right: CGFloat
  var width: CGFloat
}

private struct NemuFormGroupInsetProbe: UIViewRepresentable {
  let onChange: (NemuFormGroupInset) -> Void

  func makeUIView(context: Context) -> NemuFormGroupInsetProbeView {
    let view = NemuFormGroupInsetProbeView()
    view.isUserInteractionEnabled = false
    view.onChange = onChange
    return view
  }

  func updateUIView(_ uiView: NemuFormGroupInsetProbeView, context: Context) {
    uiView.onChange = onChange
    uiView.sampleSoon()
  }
}

final class NemuFormGroupInsetProbeView: UIView {
  var onChange: ((NemuFormGroupInset) -> Void)?
  private var last: NemuFormGroupInset?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Every appearance reports (a new presentation starts without a width).
    last = nil
    if window != nil { sampleSoon() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sample()
  }

  /// After the cell has its frame (a probe can lay out before its cell does).
  func sampleSoon() {
    DispatchQueue.main.async { [weak self] in self?.sample() }
  }

  private func sample() {
    guard window != nil else { return }
    var view = superview
    var cell: UIView?
    while let current = view {
      if current is UICollectionViewCell || current is UITableViewCell {
        cell = current
        break
      }
      view = current.superview
    }
    guard let cell else { return }
    var container = cell.superview
    while let current = container, !(current is UIScrollView) {
      container = current.superview
    }
    guard let list = container, list.bounds.width > 0, cell.bounds.width > 0 else { return }
    let frame = cell.convert(cell.bounds, to: list)
    let left = frame.minX - list.bounds.minX - list.safeAreaInsets.left
    let right = list.bounds.maxX - frame.maxX - list.safeAreaInsets.right
    guard left >= 0, right >= 0, left < list.bounds.width / 3, right < list.bounds.width / 3 else { return }
    let inset = NemuFormGroupInset(
      left: (left * 2).rounded() / 2,
      right: (right * 2).rounded() / 2,
      // The page's content width (inside the list's horizontal safe area):
      // what a page pushed beside the Form lays its content out at.
      width: list.bounds.width - list.safeAreaInsets.left - list.safeAreaInsets.right
    )
    if inset == last { return }
    last = inset
    onChange?(inset)
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
  /// The user dragged an expandable sheet to `.large`.
  @Published var userExpanded = false
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
  /// `.large` stays available: the user can drag the sheet taller than its
  /// content, and it stays there (the fitted detent no longer follows).
  let expandable: Bool
  /// The tallest the fitted detent goes (> 0): a taller page scrolls, and the
  /// sheet keeps its margin from the screen's top where no status bar sets one.
  let maxHeight: CGFloat?
  /// What an expandable sheet is dragged up to, > 0 where `.large` would meet
  /// the screen's top (no status bar above it): else `.large`.
  let expandedDetent: PresentationDetent
  @ObservedObject private var store: NemuSheetFitStore
  @StateObject private var state = NemuSheetFitState()

  init(params: [String: Any]) {
    page = (params["page"] as? String) ?? "root"
    initialHeight = CGFloat((params["initialHeight"] as? Double) ?? 0)
    let height = CGFloat((params["height"] as? Double) ?? 0)
    explicitHeight = height > 0 ? height.rounded(.up) : nil
    expandable = (params["expandable"] as? Bool) ?? false
    let maxHeight = CGFloat((params["maxHeight"] as? Double) ?? 0)
    self.maxHeight = maxHeight > 0 ? maxHeight.rounded(.down) : nil
    let expandedHeight = CGFloat((params["expandedHeight"] as? Double) ?? 0)
    expandedDetent = expandedHeight > 0 ? .height(expandedHeight.rounded(.down)) : .large
    store = NemuSheetFitStore.named((params["group"] as? String) ?? "default")
  }

  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      let fittedHeight = explicitHeight ?? store.detentHeight(page: state.activePage ?? page)
      let target = fittedHeight.map { height in maxHeight.map { min(height, $0) } ?? height }
      let fallback = nemuDetent(nil, fallback: initialHeight)
      let current = nemuDetent(state.presented ? state.height : target, fallback: initialHeight)
      let fitted: Set<PresentationDetent> = state.outgoing.map { [current, $0] } ?? [current]
      // A tall sheet with one detent drops its bottom margin and sits on the
      // screen's edge; a second one (a point shorter: nowhere taller to drag
      // to) keeps it floating with its margins at the cap.
      let cappedAtMax = maxHeight != nil && target == maxHeight
      let floating: Set<PresentationDetent> = cappedAtMax ? [.height((maxHeight ?? 1) - 1)] : []
      let detents = (expandable ? fitted.union([expandedDetent]) : fitted).union(floating)
      content
        .environment(\.nemuSheetFit, state)
        .environment(\.nemuSheetFitStore, store)
        // The selection follows the content; a drag toward the outgoing
        // detent during a resize is not kept. An expandable sheet the user
        // dragged taller stays there until they drag it back.
        .presentationDetents(
          detents,
          selection: Binding(
            get: { expandable && state.userExpanded ? expandedDetent : current },
            set: { next in if expandable { state.userExpanded = next == expandedDetent } }
          )
        )
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

/// On a popover's Form: its ideal size is `width` × the height its
/// off-screen copy measured (`NemuMeasureSheetPageModifier`, same `group` and
/// `page`). A Form has no ideal height of its own, so without one the popover
/// would not know how tall its rows are. The system shows the popover at that
/// height when there is room and caps it otherwise, the Form scrolling from
/// its top. Unmeasured (before iOS 18, or before the copy has laid out), the
/// ideal height is `initialHeight`.
struct NemuFitPopoverToContentModifier: ViewModifier {
  static let type = "nemuFitPopoverToContent"
  let page: String
  let width: CGFloat
  let initialHeight: CGFloat
  @ObservedObject private var store: NemuSheetFitStore

  init(params: [String: Any]) {
    page = (params["page"] as? String) ?? "root"
    width = CGFloat((params["width"] as? Double) ?? 0)
    initialHeight = CGFloat((params["initialHeight"] as? Double) ?? 0)
    store = NemuSheetFitStore.named((params["group"] as? String) ?? "default")
  }

  func body(content: Content) -> some View {
    let height = store.contentHeights[page] ?? (initialHeight > 0 ? initialHeight : nil)
    content.frame(
      minWidth: width > 0 ? width : nil,
      idealWidth: width > 0 ? width : nil,
      maxWidth: width > 0 ? width : nil,
      idealHeight: height
    )
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
///   `registerForTraitChanges`; the payload carries the window's size classes;
/// - fold active ↔ inactive at constant bounds: `UIHingeInteraction` (documented
///   to call its handler whenever the hinge state changes) plus a hosted SwiftUI
///   probe whose `onGeometryChange` reads `GeometryProxy.reservedRegions`, the
///   geometry-invalidated path Apple recommends for reserved regions (also covers
///   the inner camera occlusion activating, which has no hinge event);
/// - scene returning to the foreground: `UIScene.didActivateNotification`.
///
/// UIKit documents no reserved-region change callback, so both region triggers
/// coalesce into one query of the public `UIView.reservedRegions` API.
/// A zero-size child of the window's root view controller. UIKit forwards
/// `viewWillTransition(to:with:)` to every child, so this hears each rotation,
/// fold and Split View resize with the system's own timing: the coordinator's
/// duration and curve. Plain UIKit API, no OS or SDK gating.
final class NemuTransitionProbeController: UIViewController {
  var onWillTransition: ((CGSize, TimeInterval, String) -> Void)?

  override func viewWillTransition(to size: CGSize, with coordinator: any UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)
    let curve: String
    switch coordinator.completionCurve {
    case .easeIn: curve = "easeIn"
    case .easeOut: curve = "easeOut"
    case .linear: curve = "linear"
    default: curve = "easeInOut"
    }
    let duration = coordinator.isAnimated ? coordinator.transitionDuration : 0
    onWillTransition?(size, duration, curve)
  }
}

/// Detaches a zero-size transition probe from the root it was added to.
@MainActor
func nemuRemoveTransitionProbe(_ probe: UIViewController?) {
  guard let probe else { return }
  probe.willMove(toParent: nil)
  probe.view.removeFromSuperview()
  probe.removeFromParent()
}

final class NemuWindowLayoutView: ExpoView {
  let onRegionsChange = EventDispatcher()
  /// `{ width, height, durationMs, curve }` of a window size change about to animate.
  let onWillTransition = EventDispatcher()
  private var transitionProbe: NemuTransitionProbeController?

  /// Installs the probe under the current window's root, or removes it when
  /// the view has left its window: a probe left on the root after its view is
  /// gone (one per reader open) only adds to UIKit's child walks during every
  /// later size and trait change.
  private func installTransitionProbe() {
    let root = window?.rootViewController
    if let probe = transitionProbe, let root, probe.parent === root { return }
    nemuRemoveTransitionProbe(transitionProbe)
    transitionProbe = nil
    guard let root else { return }
    let probe = NemuTransitionProbeController()
    probe.onWillTransition = { [weak self] size, duration, curve in
      self?.onWillTransition([
        "width": Double(size.width),
        "height": Double(size.height),
        "durationMs": duration * 1000,
        "curve": curve,
      ])
    }
    root.addChild(probe)
    probe.view.frame = .zero
    probe.view.isUserInteractionEnabled = false
    probe.view.isHidden = true
    root.view.addSubview(probe.view)
    probe.didMove(toParent: root)
    transitionProbe = probe
  }

  deinit {
    // `didMoveToWindow(nil)` normally removed it already; this covers a view
    // released while still attached.
    let probe = transitionProbe
    MainActor.assumeIsolated { nemuRemoveTransitionProbe(probe) }
  }
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
    installTransitionProbe()
    updateObservation()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    probeController?.view.frame = bounds
    setNeedsPublish("layout")
  }

  override func layoutMarginsDidChange() {
    super.layoutMarginsDidChange()
    setNeedsPublish("margins")
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsPublish("safeArea")
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
    // The device itself, not this window: see `NemuDeviceInfo`.
    payload["foldableDevice"] = NemuOrientationGate.resolveFoldable(screen: scene.screen)
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
    // A resizable iPad window's controls sit in its top-leading corner, inside
    // the plain safe area: the horizontally corner-adapted region clears them.
    if #available(iOS 26.0, *) {
      let corner = edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))
      payload["cornerSafeAreaInsets"] = ["top": corner.top, "left": corner.left, "bottom": corner.bottom, "right": corner.right]
    }
    payload["layoutDirection"] = effectiveUserInterfaceLayoutDirection == .rightToLeft ? "rtl" : "ltr"
    // The window's size classes, not this view's: a sheet or popover hosting
    // the observer overrides its own (an iPad form sheet is compact width),
    // while layout decisions follow the window, as UISplitViewController's do.
    // Changes reach this view through the trait registration above.
    let windowTraits = window?.traitCollection ?? traitCollection
    let sizeClassName = { (sizeClass: UIUserInterfaceSizeClass) -> String? in
      switch sizeClass {
      case .compact: "compact"
      case .regular: "regular"
      default: nil
      }
    }
    if let horizontal = sizeClassName(windowTraits.horizontalSizeClass) {
      payload["horizontalSizeClass"] = horizontal
    }
    if let vertical = sizeClassName(windowTraits.verticalSizeClass) {
      payload["verticalSizeClass"] = vertical
    }
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
    // The containers up to the screen's navigation controller (which hosts
    // the navigation bar and the vertical bar), never the window's root: a
    // style change at the root is a trait change for the whole window — the
    // tab bar controller, every glass view — and its restore landed in the
    // middle of the reader's Back. Without a navigation controller on the
    // path, every container up to the root of the presentation as before.
    var targets = path.count > 1 ? Array(path.dropFirst()) : path
    if let navigation = targets.firstIndex(where: { $0 is UINavigationController }) {
      targets = Array(targets[...navigation])
    }
    // Restore what is no longer a target (popped, covered, prop cleared) —
    // unless someone else changed it since — once that controller's own
    // transition (the reader's Back) has finished (`scheduleRestore`).
    let restoredStyle = appliedStyle
    styled.removeAll { entry in
      guard let controller = entry.controller.value else { return true }
      if targets.contains(where: { $0 === controller }) { return false }
      NemuVerticalBarBehaviorView.scheduleRestore(controller, previous: entry.previous, applied: restoredStyle)
      return true
    }
    for target in targets {
      if !styled.contains(where: { $0.controller.value === target }) {
        // A restore still waiting for the transition: take over its original
        // style instead of recording the forced one as the "previous".
        let previous = NemuVerticalBarBehaviorView.takePendingRestore(target) ?? target.overrideUserInterfaceStyle
        styled.append((WeakViewController(target), previous))
      }
      if target.overrideUserInterfaceStyle != forcedStyle {
        target.overrideUserInterfaceStyle = forcedStyle
      }
    }
    appliedStyle = forcedStyle
  }
  /// The style last applied to `styled` (a prop change restores the old one).
  private var appliedStyle: UIUserInterfaceStyle = .unspecified

  private struct PendingRestore {
    let controller: WeakViewController
    let previous: UIUserInterfaceStyle
    let applied: UIUserInterfaceStyle
    /// Tells this restore apart from a later one for the same controller, so
    /// a superseded wait does not flush it.
    let id: Int
  }
  /// Restores waiting for the controller's own transition to finish, by controller.
  private static var pendingRestores: [ObjectIdentifier: PendingRestore] = [:]
  private static var nextRestoreId = 0
  /// Longest a restore looks for its controller's transition to start (React
  /// commits the pop before UIKit starts it at the stack's next layout).
  private static let restoreGrace: CFTimeInterval = 0.25
  /// Backstop: a restore never waits longer than this.
  private static let restoreCap: CFTimeInterval = 1.0

  /// Waits only for the restored controller's own transition — never the
  /// global `NemuTransitionSettle` walk, which any follow-up transition on any
  /// stack kept restarting until its cap. A controller already out of its
  /// window (Back popped the whole stack hosting it) is never seen again, so
  /// it restores on the next turn.
  private static func scheduleRestore(_ controller: UIViewController, previous: UIUserInterfaceStyle, applied: UIUserInterfaceStyle) {
    let key = ObjectIdentifier(controller)
    nextRestoreId += 1
    let id = nextRestoreId
    pendingRestores[key] = PendingRestore(
      controller: WeakViewController(controller), previous: previous, applied: applied, id: id
    )
    let startedAt = CACurrentMediaTime()
    DispatchQueue.main.asyncAfter(deadline: .now() + restoreCap) {
      MainActor.assumeIsolated { flushRestore(key, id: id) }
    }
    if controller.viewIfLoaded?.window == nil {
      DispatchQueue.main.async {
        MainActor.assumeIsolated { flushRestore(key, id: id) }
      }
      return
    }
    // The pop is not running yet: look on the next turn.
    DispatchQueue.main.async {
      MainActor.assumeIsolated { awaitOwnTransition(key, id: id, startedAt: startedAt) }
    }
  }

  /// One grace-loop step for a pending restore: waits once on the transition
  /// coordinator of its controller (or the nearest one up its parent chain),
  /// else looks again next frame until `restoreGrace`, then restores.
  private static func awaitOwnTransition(_ key: ObjectIdentifier, id: Int, startedAt: CFTimeInterval) {
    guard let pending = pendingRestores[key], pending.id == id else { return }
    guard let controller = pending.controller.value else {
      pendingRestores[key] = nil
      return
    }
    if controller.viewIfLoaded?.window == nil {
      flushRestore(key, id: id)
      return
    }
    var cursor: UIViewController? = controller
    var coordinator: UIViewControllerTransitionCoordinator?
    while let current = cursor, coordinator == nil {
      coordinator = current.transitionCoordinator
      cursor = current.parent
    }
    if let coordinator {
      let queued = coordinator.animate(alongsideTransition: nil) { _ in
        MainActor.assumeIsolated { flushRestore(key, id: id) }
      }
      // UIKit refused the completion: it will never come.
      if !queued {
        DispatchQueue.main.async {
          MainActor.assumeIsolated { flushRestore(key, id: id) }
        }
      }
      return
    }
    if CACurrentMediaTime() - startedAt >= restoreGrace {
      flushRestore(key, id: id)
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 60.0) {
      MainActor.assumeIsolated { awaitOwnTransition(key, id: id, startedAt: startedAt) }
    }
  }

  private static func takePendingRestore(_ controller: UIViewController) -> UIUserInterfaceStyle? {
    let key = ObjectIdentifier(controller)
    guard let pending = pendingRestores[key], pending.controller.value === controller else { return nil }
    pendingRestores[key] = nil
    return pending.previous
  }

  /// Applies one restore exactly once: a later call for the same `id` (the
  /// backstop after a completion, or the reverse) and a restore taken over by
  /// `takePendingRestore` or superseded by a newer one are no-ops.
  private static func flushRestore(_ key: ObjectIdentifier, id: Int) {
    guard let pending = pendingRestores[key], pending.id == id else { return }
    pendingRestores[key] = nil
    if let controller = pending.controller.value, controller.overrideUserInterfaceStyle == pending.applied {
      controller.overrideUserInterfaceStyle = pending.previous
    }
  }

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

// MARK: - Vertical-bar-only leading items

/// Zero-size, noninteractive view: while mounted, the leading bar items of the
/// screen it is in (`navigationItem.leftBarButtonItems` of the owning view
/// controller, which react-native-screens fills from `Stack.Toolbar
/// placement="left"`) are shown only while the system places bars vertically
/// (`UITraitCollection.verticalBarEdge` leading or trailing), and hidden the
/// moment it does not.
///
/// JS mounts such items only beside a vertical bar, but hears of a new edge
/// late, and not in one step: the window observer publishes a main-queue turn
/// later; then the stack's screen options (which follow the bar side) commit
/// first, and react-native-screens rebuilds every bar item from the header
/// config — a new, visible `UIBarButtonItem` for the Back the screen has not
/// yet removed — and only a commit after that does the screen drop its
/// toolbar. `UIBarButtonItem.AxisBehavior` cannot say "vertical only" (its
/// cases are automatic, horizontal-only and vertical-preferred), so the items
/// are hidden natively, at each point the bar or the items can change:
///
/// - the edge changes: a trait-change registration on the navigation
///   controller (its view hosts the navigation bar and the vertical bar),
///   then the bar is laid out again at once;
/// - a size transition: the coordinator's alongside-animation block, where the
///   new traits are in place, re-checks (no speculative hide at its start: a
///   transition that keeps the bar vertical must not blink the item);
/// - the items are replaced: key-value observation of the navigation item's
///   `leftBarButtonItems`, so a rebuilt item is hidden in the setter call,
///   before anything draws it — and an item that arrives while the bar is
///   horizontal is never shown;
/// - the view moves to a window.
///
/// Showing follows the same points, so the item appears as soon as the edge
/// is vertical (the trait change), never later than the bar itself. Only
/// items this view hid are shown again. Items are left as they are when it
/// unmounts: JS removes it with the items.
final class NemuVerticalBarOnlyLeadingItemsView: ExpoView {
  /// Off: leaves the items alone (and shows again any this view hid).
  var guardEnabled = true {
    didSet { if guardEnabled != oldValue { reconcile() } }
  }
  private weak var observed: UIViewController?
  /// `any UITraitChangeRegistration` (iOS 17+; the deployment target is lower).
  private var registration: Any?
  private weak var observedItem: UINavigationItem?
  private var itemsToken: NSKeyValueObservation?
  private var transitionProbe: NemuLeadingItemsTransitionProbe?
  private let hiddenItems = NSHashTable<UIBarButtonItem>.weakObjects()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    isHidden = true
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    reconcile()
  }

  deinit {
    // Normally removed when the view left its window (`reconcile`).
    let probe = transitionProbe
    MainActor.assumeIsolated { nemuRemoveTransitionProbe(probe) }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    reconcile()
  }

  /// Owning view controller (the `RNSScreen` whose navigation item holds the items).
  private func owningController() -> UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController { return controller }
      responder = next
    }
    return nil
  }

  private func reconcile() {
    let screen = window == nil ? nil : owningController()
    let target = screen?.navigationController ?? screen
    if target !== observed {
      unregisterTraits()
      observed = target
      registerTraits()
    }
    let item = screen?.navigationItem
    if item !== observedItem {
      itemsToken?.invalidate()
      itemsToken = nil
      observedItem = item
      // react-native-screens assigns the property on every header update.
      itemsToken = item?.observe(\.leftBarButtonItems, options: []) { [weak self] _, _ in
        MainActor.assumeIsolated { self?.applyVisibility(relayoutBar: false) }
      }
    }
    installTransitionProbe()
    applyVisibility(relayoutBar: false)
  }

  private func unregisterTraits() {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *), let registration = registration as? any UITraitChangeRegistration, let observed {
      observed.unregisterForTraitChanges(registration)
    }
    #endif
    registration = nil
  }

  private func registerTraits() {
    #if NEMU_SDK_27_1
    guard #available(iOS 27.1, *), let observed else { return }
    var traits: [UITrait] = [UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]
    traits += UITraitCollection.systemTraitsAffectingVerticalBarEdge
    registration = observed.registerForTraitChanges(traits) { [weak self] (_: UIViewController, _: UITraitCollection) in
      self?.applyVisibility(relayoutBar: true)
    }
    #endif
  }

  /// A zero-size child of the window's root view controller: UIKit forwards
  /// `viewWillTransition(to:with:)` to every child (as for `NemuTransitionProbeController`).
  private func installTransitionProbe() {
    let root = window?.rootViewController
    if let probe = transitionProbe, let root, probe.parent === root { return }
    nemuRemoveTransitionProbe(transitionProbe)
    transitionProbe = nil
    guard let root else { return }
    let probe = NemuLeadingItemsTransitionProbe()
    probe.onWillTransition = { [weak self] coordinator in
      coordinator.animate(alongsideTransition: { _ in
        MainActor.assumeIsolated { self?.applyVisibility(relayoutBar: true) }
      }, completion: { _ in
        MainActor.assumeIsolated { self?.applyVisibility(relayoutBar: true) }
      })
    }
    root.addChild(probe)
    probe.view.frame = .zero
    probe.view.isUserInteractionEnabled = false
    probe.view.isHidden = true
    root.view.addSubview(probe.view)
    probe.didMove(toParent: root)
    transitionProbe = probe
  }

  /// Whether the system places this screen's bars vertically. Without the
  /// iOS 27.1 API (older SDK or OS) there is no vertical bar: never.
  private func barIsVertical(_ screen: UIViewController) -> Bool {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      switch (observed ?? screen).traitCollection.verticalBarEdge {
      case .leading, .trailing: return true
      default: return false
      }
    }
    #endif
    return false
  }

  private func applyVisibility(relayoutBar: Bool) {
    guard window != nil, let screen = owningController() else { return }
    let hide = guardEnabled && !barIsVertical(screen)
    var changed = false
    for item in screen.navigationItem.leftBarButtonItems ?? [] {
      if hide {
        guard !item.isHidden else { continue }
        item.isHidden = true
        hiddenItems.add(item)
        changed = true
      } else if hiddenItems.contains(item) {
        item.isHidden = false
        hiddenItems.remove(item)
        changed = true
      }
    }
    // The bar may already have laid out for the new edge in this pass: lay it
    // out again now rather than on the next one.
    if changed, relayoutBar, let bar = screen.navigationController?.navigationBar {
      bar.setNeedsLayout()
      bar.layoutIfNeeded()
    }
  }
}

/// Container shown only while the system bars are on one axis
/// (`axis` "horizontal": no vertical bar; "vertical": a vertical bar), from
/// its own trait changes, which UIKit delivers as it lays the container out
/// for new traits — so content that belongs to one bar axis (a drawn back
/// button in a top bar's title row) comes and goes in the same frame as the
/// bar, not a React commit later. Without the iOS 27.1 API bars are always
/// horizontal.
final class NemuBarAxisVisibilityView: ExpoView {
  var axis = "horizontal" {
    didSet { if axis != oldValue { apply() } }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      var traits: [UITrait] = [UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]
      traits += UITraitCollection.systemTraitsAffectingVerticalBarEdge
      // UIKit keeps the registration for the view's lifetime.
      _ = registerForTraitChanges(traits) { (view: NemuBarAxisVisibilityView, _: UITraitCollection) in
        view.apply()
      }
    }
    #endif
    apply()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    apply()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    apply()
  }

  private func apply() {
    var vertical = false
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      switch traitCollection.verticalBarEdge {
      case .leading, .trailing: vertical = true
      default: vertical = false
      }
    }
    #endif
    let shown = (axis == "vertical") == vertical
    if isHidden == shown { isHidden = !shown }
    if accessibilityElementsHidden == shown { accessibilityElementsHidden = !shown }
  }
}

/// Hears each size transition with its coordinator (see `NemuVerticalBarOnlyLeadingItemsView`).
final class NemuLeadingItemsTransitionProbe: UIViewController {
  var onWillTransition: ((any UIViewControllerTransitionCoordinator) -> Void)?

  override func viewWillTransition(to size: CGSize, with coordinator: any UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)
    onWillTransition?(coordinator)
  }
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

  static func release(path: [UIViewController], afterTransitions: Bool = true) {
    guard let leaf = path.first else { return }
    let count = (objc_getAssociatedObject(leaf, &disabledKey) as? NSNumber)?.intValue ?? 0
    objc_setAssociatedObject(leaf, &disabledKey, count > 1 ? NSNumber(value: count - 1) : nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    for (child, parent) in zip(path, path.dropFirst()) {
      // Only clear a forward that still points at this path.
      if let box = objc_getAssociatedObject(parent, &forwardKey) as? WeakViewController, box.value === child || box.value == nil {
        objc_setAssociatedObject(parent, &forwardKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
      }
    }
    // The bar comes back once the transition that released it (the
    // reader's Back) has finished, with one update from the root (UIKit
    // reads the preference from there down), not one per controller in the
    // middle of the pop. The tab rail repair has no transition to wait for.
    let roots = invalidationRoots(path).map(WeakViewController.init)
    let update = {
      for root in roots { root.value?.setNeedsUpdateOfVerticalBarConfiguration() }
    }
    if afterTransitions { NemuTransitionSettle.wait(update) } else { update() }
  }

  private static func invalidate(_ path: [UIViewController]) {
    for controller in path { controller.setNeedsUpdateOfVerticalBarConfiguration() }
    path.last?.view.window?.rootViewController?.setNeedsUpdateOfVerticalBarConfiguration()
  }

  /// The root UIKit reads the preference from: the window's root, and the
  /// root of the path's presentation when that is a different controller.
  private static func invalidationRoots(_ path: [UIViewController]) -> [UIViewController] {
    guard let top = path.last else { return [] }
    var roots: [UIViewController] = []
    if let windowRoot = top.viewIfLoaded?.window?.rootViewController { roots.append(windowRoot) }
    if !roots.contains(where: { $0 === top }) { roots.append(top) }
    return roots
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
  static func replace(_ cls: AnyClass, _ selector: Selector, _ method: Method, _ imp: IMP) {
    if !class_addMethod(cls, selector, imp, method_getTypeEncoding(method)) {
      method_setImplementation(method, imp)
    }
  }
}

/// iOS 27.2 (iPhone Duo inner display, landscape): a tab bar controller that
/// first appears while its scene already has a vertical bar never moves its
/// tabs into the bar. Its `UITabBar` stays an empty strip in the bottom bar
/// group and the vertical bar shows the status column and navigation items
/// but no tab group, until the bar goes away and comes back (a rotation
/// through portrait). 27.1 builds the tab group either way. So when a tab
/// bar controller first appears with a vertical bar on 27.2+, the bar is
/// turned off along its path until the controller's traits say it is gone,
/// then back on: the same change a rotation makes. Turning it back on in the
/// same or the next run-loop turn is too soon, UIKit never drops the bar.
///
/// The round trip shows (tabs at the bottom over full-width content, then
/// the rail), and at a cold launch the tab bar controller first appears just
/// before the launch screen lifts. So the launch reveal waits for it
/// (`afterRepairs`), and the bar comes back as soon as it is gone, without
/// the transition grace the reader's release waits for: the controller's
/// own appearance is over.
@available(iOS 27.1, *)
@MainActor
enum NemuTabRailRepair {
  nonisolated(unsafe) private static var appearedKey: UInt8 = 0
  private static var installed = false
  /// Turn the bar back on after this even if the traits never report it gone.
  private static let releaseCap: TimeInterval = 0.5
  /// Count the rail as rebuilt after this even if the traits never report the bar back.
  private static let rebuildCap: TimeInterval = 0.5
  /// The longest `afterRepairs` holds its caller.
  private static let waitCap: TimeInterval = 1.2
  /// Repairs whose rail is not rebuilt yet.
  private static var running: [Toggle] = []
  private static var waiters: [Waiter] = []

  static func install() {
    guard #available(iOS 27.2, *), !installed else { return }
    installed = true
    let cls: AnyClass = UITabBarController.self
    let selector = #selector(UIViewController.viewDidAppear(_:))
    guard let method = class_getInstanceMethod(cls, selector) else { return }
    typealias Original = @convention(c) (UIViewController, Selector, Bool) -> Void
    let original = unsafeBitCast(method_getImplementation(method), to: Original.self)
    let block: @convention(block) (UIViewController, Bool) -> Void = { controller, animated in
      original(controller, selector, animated)
      MainActor.assumeIsolated {
        if let tabs = controller as? UITabBarController { repairIfNeeded(tabs) }
      }
    }
    NemuVerticalBarOverride.replace(cls, selector, method, imp_implementationWithBlock(block))
  }

  static func repairIfNeeded(_ controller: UITabBarController) {
    // Only the first appearance: a controller that first appeared without the
    // bar got its tab group when the bar came.
    guard objc_getAssociatedObject(controller, &appearedKey) == nil else { return }
    objc_setAssociatedObject(controller, &appearedKey, true, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    defer { scheduleWaiters() }
    guard let window = controller.viewIfLoaded?.window,
      controller.traitCollection.verticalBarEdge != .unspecified else { return }
    // UIKit reads the preference at the end of its walk: past the tab bar
    // controller, down through the selected tab to its top screen.
    var leaf: UIViewController = controller
    while let child = leaf.childForPreferredVerticalBarBehavior, child.parent === leaf { leaf = child }
    var path: [UIViewController] = [leaf]
    while let parent = path.last?.parent { path.append(parent) }
    let toggle = Toggle(controller: controller, path: path)
    running.append(toggle)
    toggle.registration = controller.registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) {
      (tabs: UITabBarController, _: UITraitCollection) in
      if tabs.traitCollection.verticalBarEdge == .unspecified {
        // Back on once UIKit has finished taking the bar away.
        DispatchQueue.main.async { MainActor.assumeIsolated { toggle.release("bar off") } }
      } else if toggle.released {
        // The bar is back with the tab group in it.
        toggle.finish()
      }
    }
    // Off on the next turn, out of UIKit's appearance pass: turning the bar off
    // inside `viewDidAppear` re-enters UIKit's walk over the child controllers
    // while it is still changing them (a first launch presenting the welcome
    // flow aborted on the mutated enumeration). `running` already holds the
    // repair, so the launch reveal keeps waiting for it.
    DispatchQueue.main.async {
      MainActor.assumeIsolated {
        guard !toggle.released else { return }
        // The window left its scene before this turn: there is no bar to turn
        // off. Finish the repair (dropping its trait registration) so it does
        // not hold `afterRepairs` callers to their cap.
        guard window.windowScene != nil else { return toggle.finish() }
        UIView.performWithoutAnimation {
          NemuVerticalBarOverride.acquire(path: path)
          window.layoutIfNeeded()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + releaseCap) { MainActor.assumeIsolated { toggle.release("cap") } }
      }
    }
  }

  /// Runs `done` once no tab bar controller is in a repair or about to start
  /// one (at once when none is), at the latest after `waitCap`.
  static func afterRepairs(_ done: @escaping @MainActor () -> Void) {
    guard pending() else { return done() }
    let waiter = Waiter(done)
    waiters.append(waiter)
    DispatchQueue.main.asyncAfter(deadline: .now() + waitCap) { MainActor.assumeIsolated { waiter.run() } }
  }

  /// A repair is running, or a tab bar controller on screen under a vertical
  /// bar has not appeared yet (its repair starts when it does).
  private static func pending() -> Bool {
    guard installed else { return false }
    if !running.isEmpty { return true }
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes where scene.activationState != .background {
      for window in scene.windows where !window.isHidden {
        var queue = window.rootViewController.map { [$0] } ?? []
        while let next = queue.popLast() {
          if let tabs = next as? UITabBarController, objc_getAssociatedObject(tabs, &appearedKey) == nil,
            tabs.viewIfLoaded?.window === window, tabs.traitCollection.verticalBarEdge != .unspecified {
            return true
          }
          queue.append(contentsOf: next.children)
        }
      }
    }
    return false
  }

  private static func finished(_ toggle: Toggle) {
    running.removeAll { $0 === toggle }
    scheduleWaiters()
  }

  /// On the next turn, out of UIKit's appearance and trait callbacks.
  private static func scheduleWaiters() {
    guard !waiters.isEmpty else { return }
    DispatchQueue.main.async {
      MainActor.assumeIsolated {
        guard !pending() else { return }
        let ready = waiters
        waiters = []
        for waiter in ready { waiter.run() }
      }
    }
  }

  @MainActor
  private final class Waiter {
    private var done: (@MainActor () -> Void)?

    init(_ done: @escaping @MainActor () -> Void) {
      self.done = done
    }

    /// Once: by the repairs finishing or by the cap, whichever comes first.
    func run() {
      let done = done
      self.done = nil
      done?()
    }
  }

  @MainActor
  private final class Toggle {
    weak var controller: UIViewController?
    let path: [WeakViewController]
    var registration: UITraitChangeRegistration?
    private(set) var released = false
    private var finished = false

    init(controller: UIViewController, path: [UIViewController]) {
      self.controller = controller
      self.path = path.map(WeakViewController.init)
    }

    func release(_ reason: String) {
      guard !released else { return }
      released = true
      let path = path.compactMap(\.value)
      verticalBarLog.debug("tab bar rail rebuilt (\(reason, privacy: .public)): \(path.map { String(describing: type(of: $0)) }.joined(separator: " → "), privacy: .public)")
      // Laid out at once and unanimated: the bar is usually back before
      // this returns, not half a second later.
      UIView.performWithoutAnimation {
        NemuVerticalBarOverride.release(path: path, afterTransitions: false)
        controller?.view.window?.layoutIfNeeded()
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + rebuildCap) { MainActor.assumeIsolated { self.finish() } }
    }

    func finish() {
      guard !finished else { return }
      finished = true
      if let registration { controller?.unregisterForTraitChanges(registration) }
      NemuTabRailRepair.finished(self)
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

// MARK: - Launch reveal

/// The cold-launch reveal under the launch screen. The window's root view
/// (which carries the native tab bar / Duo vertical bar with everything else,
/// out of reach of a React transform) is set to its start state before the
/// launch screen hides, so the first frame after it is the page background,
/// then animates when JS starts its own content stagger:
/// - "full": the window scales 0.97 → 1 over 700 ms on (.16, 1, .3, 1) from
///   its centre while the tab bar and navigation bars fade in over 280 ms
///   ease-out. The scale is drawn only (a layer animation over an identity
///   transform): a scaled root view has a smaller frame in the window, so
///   UIKit recomputed its safe area (82 → 68pt under the Duo's outer bar) and
///   the page, its scroll insets and an empty page's viewport moved twice
///   while the reveal ran;
/// - "fade": a 200 ms cross-fade of the whole window (Reduce Motion, or a
///   launch straight into a screen other than the Library).
/// Once per process; a missing `start` is recovered after a short cap.
@MainActor
enum NemuLaunchReveal {
  nonisolated(unsafe) private(set) static var pending = true
  private static weak var root: UIView?
  private static var bars: [WeakView] = []
  private static var mode = "full"
  private static var started = false
  private static let startCap: TimeInterval = 1.5
  private static let scaleKey = "nemuLaunchRevealScale"
  private static let startScale = CATransform3DMakeScale(0.97, 0.97, 1)

  final class WeakView {
    weak var view: UIView?
    init(_ view: UIView) { self.view = view }
  }

  /// Sets the start state once the iPhone Duo's tab rail repair (iOS 27.2,
  /// `NemuTabRailRepair`) is done: the tab bar controller first appears just
  /// before the launch screen lifts, and the repair's off-and-on round trip
  /// must stay under it. Without a repair to wait for, at once.
  static func prepare(mode: String, background: String?, completion: @escaping @MainActor (Bool) -> Void) {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      NemuTabRailRepair.afterRepairs { completion(prepareNow(mode: mode, background: background)) }
      return
    }
    #endif
    completion(prepareNow(mode: mode, background: background))
  }

  private static func prepareNow(mode: String, background: String?) -> Bool {
    guard pending, let window = keyWindow(), let controller = window.rootViewController, let view = controller.viewIfLoaded else {
      pending = false
      return false
    }
    pending = false
    self.mode = mode
    root = view
    // The scaled window uncovers the window behind its edges: the page colour.
    if let color = background.flatMap(color(fromHex:)) { window.backgroundColor = color }
    if mode == "full" {
      bars = barViews(under: controller).map(WeakView.init)
      // Held at the start scale until `start` (or the cap) replaces it.
      let hold = CABasicAnimation(keyPath: "transform")
      hold.fromValue = NSValue(caTransform3D: startScale)
      hold.toValue = NSValue(caTransform3D: startScale)
      hold.duration = startCap + 1
      hold.fillMode = .forwards
      hold.isRemovedOnCompletion = false
      view.layer.add(hold, forKey: scaleKey)
      for bar in bars { bar.view?.alpha = 0 }
    } else {
      view.alpha = 0
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + startCap) { start() }
    return true
  }

  static func start() {
    guard !started, let view = root else { return }
    started = true
    if mode == "full" {
      let scale = CABasicAnimation(keyPath: "transform")
      scale.fromValue = NSValue(caTransform3D: startScale)
      scale.toValue = NSValue(caTransform3D: CATransform3DIdentity)
      scale.duration = 0.7
      scale.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 1, 0.3, 1)
      view.layer.add(scale, forKey: scaleKey)
      let fade = UIViewPropertyAnimator(duration: 0.28, curve: .easeOut) {
        for bar in bars { bar.view?.alpha = 1 }
      }
      fade.addCompletion { _ in
        for bar in bars { bar.view?.alpha = 1 }
        bars = []
      }
      fade.startAnimation()
    } else {
      UIViewPropertyAnimator(duration: 0.2, curve: .easeInOut) { view.alpha = 1 }.startAnimation()
    }
  }

  private static func keyWindow() -> UIWindow? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    return windows.first(where: \.isKeyWindow) ?? windows.first
  }

  /// The tab bar and every navigation bar under the root controller (the
  /// Duo's vertical bar is drawn from these).
  private static func barViews(under controller: UIViewController) -> [UIView] {
    var result: [UIView] = []
    var queue = [controller]
    while let next = queue.popLast() {
      if let tabs = next as? UITabBarController { result.append(tabs.tabBar) }
      if let navigation = next as? UINavigationController, !navigation.isNavigationBarHidden {
        result.append(navigation.navigationBar)
      }
      queue.append(contentsOf: next.children)
    }
    return result
  }

  private static func color(fromHex hex: String) -> UIColor? {
    var value = hex.trimmingCharacters(in: .whitespaces)
    if value.hasPrefix("#") { value.removeFirst() }
    guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
    return UIColor(
      red: CGFloat((rgb >> 16) & 0xff) / 255,
      green: CGFloat((rgb >> 8) & 0xff) / 255,
      blue: CGFloat(rgb & 0xff) / 255,
      alpha: 1
    )
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

/// The glass's unclipped children layer: touches between its children fall
/// through to the material (its interactive press response), never to it.
private final class NemuGlassOverlayView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

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
  /// Where the piece sits while dematerialized, relative to its frame (pt,
  /// vertical): it comes in from there as it materializes and goes back as it
  /// dematerializes, in the same `UIView.animate` as the effect and content
  /// alpha — one Core Animation, run by the render server, so a busy main
  /// thread can neither skip the slide (a Reanimated slide on the main thread
  /// jumped 6pt in one frame at the end of the reader's opening fade, build 9
  /// round 3) nor run it apart from the material.
  var materializeOffsetY: CGFloat = 0
  /// Wall clock (ms since 1970) before which a materialize does not start
  /// (0: at once): the reader's opening chrome waits for its zoom's visible
  /// landing however early it mounted. The wait is the animation's own delay
  /// (Core Animation), not a main-thread timer.
  var materializeNotBeforeMs: Double = 0
  /// The children sit in `overlayView`, an unclipped layer above the
  /// material, instead of the effect's `contentView` (which the glass clips
  /// to its shape): the reader's title keeps its text at its final width,
  /// centred and fully drawn, while only the material widens behind it
  /// (designer, build 9 round 3). The overlay fades and slides with the
  /// material in the same animation as the content view would.
  var childrenAboveMaterial = false {
    didSet {
      guard childrenAboveMaterial != oldValue else { return }
      let from = oldValue ? overlayView : effectView.contentView
      let to = childrenAboveMaterial ? overlayView : effectView.contentView
      for child in from.subviews { to.addSubview(child) }
    }
  }
  private let overlayView: UIView = {
    let view = NemuGlassOverlayView()
    view.backgroundColor = .clear
    view.clipsToBounds = false
    return view
  }()
  private var childHost: UIView { childrenAboveMaterial ? overlayView : effectView.contentView }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    // Placed by bounds + center (never `frame`): it carries the
    // materialize slide's transform.
    layoutEffectView()
    addSubview(effectView)
    addSubview(overlayView)
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
    childHost.insertSubview(childComponentView, at: index)
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
    layoutEffectView()
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
      overlayView.alpha = 0
      effectView.transform = dematerializedTransform
      overlayView.transform = dematerializedTransform
    } else if animateAppearance && materializeDuration > 0 {
      effectView.effect = nil
      effectView.contentView.alpha = 0
      overlayView.alpha = 0
      effectView.transform = dematerializedTransform
      overlayView.transform = dematerializedTransform
      animateMaterial(to: true, duration: materializeDuration)
    } else {
      effectView.contentView.alpha = 1
      overlayView.alpha = 1
      effectView.transform = .identity
      overlayView.transform = .identity
      applyEffect()
    }
  }

  private var dematerializedTransform: CGAffineTransform {
    materializeOffsetY == 0 ? .identity : CGAffineTransform(translationX: 0, y: materializeOffsetY)
  }

  private func layoutEffectView() {
    effectView.bounds = CGRect(origin: .zero, size: bounds.size)
    effectView.center = CGPoint(x: bounds.midX, y: bounds.midY)
    overlayView.bounds = CGRect(origin: .zero, size: bounds.size)
    overlayView.center = CGPoint(x: bounds.midX, y: bounds.midY)
  }

  private func animateMaterial(to visible: Bool, duration: TimeInterval) {
    let changes = { [self] in
      if visible {
        applyEffect()
      } else {
        effectView.effect = nil
      }
      effectView.contentView.alpha = visible ? 1 : 0
      overlayView.alpha = visible ? 1 : 0
      effectView.transform = visible ? .identity : dematerializedTransform
      overlayView.transform = visible ? .identity : dematerializedTransform
    }
    if duration <= 0 {
      changes()
      return
    }
    // A materialize waits for `materializeNotBeforeMs` (the reader's zoom
    // landing) as the animation's delay; a dematerialize never waits.
    let delay = visible && materializeNotBeforeMs > 0
      ? max(0, (materializeNotBeforeMs - Date().timeIntervalSince1970 * 1000) / 1000)
      : 0
    UIView.animate(withDuration: duration, delay: delay, options: [.beginFromCurrentState, .curveEaseOut, .allowUserInteraction], animations: changes)
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


// MARK: - Cover zoom transition

/// One line per zoomed open (Release included): `log stream --predicate
/// 'subsystem == "pm.nemu" AND category == "reader-zoom"'`.
private let readerZoomLog = Logger(subsystem: "pm.nemu", category: "reader-zoom")

/// Weak registry of zoom sources by id (one live source per id). Every id is
/// keyed by its one spelling (`NemuZoomId.canonical`, as JS `canonicalZoomId`).
@MainActor
enum NemuZoomRegistry {
  private static let sources = NSMapTable<NSString, UIView>.strongToWeakObjects()

  private static func key(_ id: String) -> NSString {
    NemuZoomId.canonical(id) as NSString
  }

  static func register(_ view: UIView, id: String) {
    guard !id.isEmpty else { return }
    sources.setObject(view, forKey: key(id))
  }

  static func unregister(_ view: UIView, id: String) {
    guard !id.isEmpty, sources.object(forKey: key(id)) === view else { return }
    sources.removeObject(forKey: key(id))
  }

  static func source(_ id: String) -> UIView? {
    sources.object(forKey: key(id))
  }

  /// Where a zoom lands in the pushed screen (the hero cover), by id.
  private static let alignments = NSMapTable<NSString, UIView>.strongToWeakObjects()

  static func registerAlignment(_ view: UIView, id: String) {
    guard !id.isEmpty else { return }
    alignments.setObject(view, forKey: key(id))
  }

  static func unregisterAlignment(_ view: UIView, id: String) {
    guard !id.isEmpty, alignments.object(forKey: key(id)) === view else { return }
    alignments.removeObject(forKey: key(id))
  }

  static func alignment(_ id: String) -> UIView? {
    alignments.object(forKey: key(id))
  }

  /// The zoom each screen was last given (id and options), so it is set once.
  private static let configurations = NSMapTable<UIViewController, NSString>.weakToStrongObjects()

  static func configuration(of controller: UIViewController) -> String? {
    configurations.object(forKey: controller) as String?
  }

  static func setConfiguration(_ key: String, of controller: UIViewController) {
    configurations.setObject(key as NSString, forKey: controller)
  }
}

/// The view a zoom grows out of (a cover). Ordinary layout: it is sized by
/// its React style, never `display: contents`.
final class NemuZoomSourceView: ExpoView {
  var zoomId = "" {
    didSet {
      guard zoomId != oldValue else { return }
      NemuZoomRegistry.unregister(self, id: oldValue)
      if window != nil { NemuZoomRegistry.register(self, id: zoomId) }
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Registered while on screen; a source that scrolled out of a recycled
    // list keeps its last registration until another view takes the id.
    if window != nil { NemuZoomRegistry.register(self, id: zoomId) }
  }
}

/// Placed in the pushed screen. A route-level target (`align` false) gives
/// that screen's view controller a zoom transition from the registered source
/// and reports when the zoom has landed. A target with `align` (the hero
/// cover) is where the zoom lands: it registers its frame under the id and
/// the transition looks it up when it runs, so a hero that mounts later never
/// replaces the transition of a screen that is already animating in.
final class NemuZoomTargetView: ExpoView {
  let onZoomSettled = EventDispatcher()
  /// The zoom into this screen started: its nominal duration and the wall
  /// clock (ms since 1970) it started at, so the screen can time work
  /// against the landing (a cover cross-fading into its page) on its own
  /// clock however late the event reaches it.
  let onZoomStarted = EventDispatcher()
  var zoomId = "" {
    didSet {
      guard zoomId != oldValue else { return }
      NemuZoomRegistry.unregisterAlignment(self, id: oldValue)
      registerAlignmentIfNeeded()
      scheduleSetup()
    }
  }
  var alignsToSelf = true {
    didSet {
      guard alignsToSelf != oldValue else { return }
      if alignsToSelf { registerAlignmentIfNeeded() } else { NemuZoomRegistry.unregisterAlignment(self, id: zoomId) }
    }
  }
  var interactiveDismiss = true { didSet { if interactiveDismiss != oldValue { scheduleSetup() } } }
  /// This screen changes something the whole window lays out by as it arrives
  /// (the reader's vertical-bar opt-out: the tab rail becomes a bottom bar):
  /// the screen it zooms out of stays as it looked at the tap until the zoom
  /// has covered it, a snapshot over its live view.
  var freezePresenter = false
  private var presenterFreeze: UIView?
  private var settleObserved = false
  private var settled = false

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    guard superview != nil else { return }
    // The stack pushes the new screen on the main-queue turn after the
    // mounting transaction that carries this view, so a zoom set later than
    // that only reaches the pop. Set it now when this subtree already hangs
    // under its screen, and again on the next turn for the case where the
    // screen attaches after this view.
    setup()
    scheduleSetup()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else {
      NemuZoomRegistry.unregisterAlignment(self, id: zoomId)
      releasePresenterFreeze()
      return
    }
    registerAlignmentIfNeeded()
    observeSettle()
    scheduleSetup()
  }

  private func registerAlignmentIfNeeded() {
    if alignsToSelf, window != nil { NemuZoomRegistry.registerAlignment(self, id: zoomId) }
  }

  /// Reports once that the zoom into this screen has landed: the nominal
  /// transition duration after the animation starts (the spring's long tail
  /// is not waited for), or at once when the screen appears without one.
  private func observeSettle() {
    guard !alignsToSelf, !settleObserved else { return }
    settleObserved = true
    let coordinator = owningViewController().map(NemuZoomTargetView.pushedController(for:))?.transitionCoordinator
    guard let coordinator, coordinator.isAnimated else {
      DispatchQueue.main.async { [weak self] in self?.sendSettled() }
      return
    }
    let delay = coordinator.transitionDuration + NemuZoomTargetView.settleMargin
    let duration = coordinator.transitionDuration
    let queued = coordinator.animate(alongsideTransition: { [weak self] _ in
      self?.onZoomStarted([
        "durationMs": duration * 1000,
        "startedAtMs": Date().timeIntervalSince1970 * 1000,
      ])
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { self?.sendSettled() }
    }, completion: { [weak self] _ in
      self?.sendSettled()
    })
    if !queued { DispatchQueue.main.async { [weak self] in self?.sendSettled() } }
  }

  /// Past the nominal duration the zoom is within a few points of its end.
  private static let settleMargin: TimeInterval = 0.1

  private func sendSettled() {
    guard !settled else { return }
    settled = true
    releasePresenterFreeze()
    onZoomSettled([:])
  }

  private func scheduleSetup() {
    DispatchQueue.main.async { [weak self] in self?.setup() }
  }

  private func owningViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }

  /// The screen a stack actually pushes and pops for `controller`: the root
  /// screen of a nested stack (the reader opening the sources flow) moves
  /// with the outer screen that hosts that stack, so the zoom belongs there.
  private static func pushedController(for controller: UIViewController) -> UIViewController {
    var current = controller
    while let host = hostScreen(of: current) {
      current = host
    }
    return current
  }

  private static func hostScreen(of screen: UIViewController) -> UIViewController? {
    if let stack = screen.navigationController {
      guard stack.viewControllers.first === screen,
            let host = stack.parent,
            host.navigationController != nil else { return nil }
      return host
    }
    // Being mounted: a nested stack joins its host only once the outer stack's
    // push has put it in a window, and a zoom set after that push only reaches
    // the pop (the reader then opened as a plain slide and closed as a zoom).
    // The React tree already links them.
    guard let stack = reactParent(of: screen.view),
          NSStringFromClass(type(of: stack)) == "RNSScreenStackView",
          reactChildren(of: stack).first === screen.view else { return nil }
    var ancestor = reactParent(of: stack)
    while let view = ancestor {
      if let host = view.next as? UIViewController {
        return reactParent(of: view).map { NSStringFromClass(type(of: $0)) } == "RNSScreenStackView" ? host : nil
      }
      ancestor = reactParent(of: view)
    }
    return nil
  }

  private static func reactParent(of view: UIView) -> UIView? {
    let selector = NSSelectorFromString("reactSuperview")
    guard view.responds(to: selector) else { return view.superview }
    return view.perform(selector)?.takeUnretainedValue() as? UIView
  }

  private static func reactChildren(of view: UIView) -> [UIView] {
    let selector = NSSelectorFromString("reactSubviews")
    guard view.responds(to: selector) else { return view.subviews }
    return view.perform(selector)?.takeUnretainedValue() as? [UIView] ?? []
  }

  /// The screen under the push: the source's ancestor in the stack `pushed` is
  /// joining. Taken once, before the push; a push still in flight has no
  /// "before" left to show.
  private func takePresenterFreeze(source: UIView, pushed: UIViewController) {
    guard freezePresenter, presenterFreeze == nil, !settled, !settleObserved,
          pushed.transitionCoordinator == nil,
          let stack = NemuZoomTargetView.reactParent(of: pushed.view) else { return }
    var responder: UIResponder? = source
    while let current = responder {
      if let screen = current as? UIViewController,
         screen.isViewLoaded,
         NemuZoomTargetView.reactParent(of: screen.view) === stack,
         screen !== pushed {
        guard let snapshot = screen.view.snapshotView(afterScreenUpdates: false) else { return }
        snapshot.frame = screen.view.bounds
        snapshot.isUserInteractionEnabled = false
        screen.view.addSubview(snapshot)
        presenterFreeze = snapshot
        return
      }
      responder = current.next
    }
  }

  private func releasePresenterFreeze() {
    presenterFreeze?.removeFromSuperview()
    presenterFreeze = nil
  }

  private func setup() {
    // The hero only names where the zoom lands; the route-level target owns
    // the transition.
    guard #available(iOS 18.0, *), !alignsToSelf, !zoomId.isEmpty, let owner = owningViewController() else { return }
    let controller = NemuZoomTargetView.pushedController(for: owner)
    let id = zoomId
    let key = "\(id)|\(interactiveDismiss)"
    // Assigning the same transition again (the second setup pass, a
    // re-render) would replace the one UIKit may already be running.
    guard NemuZoomRegistry.configuration(of: controller) != key else { return }
    NemuZoomRegistry.setConfiguration(key, of: controller)
    // One line per open: the id asked for, whether its source is registered,
    // and whether the push is already under way (a transition set then only
    // reaches the pop). Public: visible in Release / TestFlight.
    let sourceView = NemuZoomRegistry.source(id)
    readerZoomLog.notice(
      "open id=\(NemuZoomId.canonical(id), privacy: .public) found=\(sourceView != nil, privacy: .public) onWindow=\(sourceView?.window != nil, privacy: .public) transitionCoordinator=\(controller.transitionCoordinator != nil, privacy: .public) reduceMotion=\(UIAccessibility.isReduceMotionEnabled, privacy: .public)"
    )
    if let sourceView { takePresenterFreeze(source: sourceView, pushed: controller) }
    let options = UIViewController.Transition.ZoomOptions()
    options.alignmentRectProvider = { context in
      MainActor.assumeIsolated {
        guard let view = NemuZoomRegistry.alignment(id), view.window != nil, view.bounds.width > 0 else { return nil }
        return view.convert(view.bounds, to: context.zoomedViewController.view)
      }
    }
    if !interactiveDismiss {
      options.interactiveDismissShouldBegin = { _ in false }
    }
    controller.preferredTransition = .zoom(options: options) { _ in
      MainActor.assumeIsolated { NemuZoomRegistry.source(id) }
    }
  }
}

// MARK: - Content scroll view for tab bar minimise

/// Zero-size view inside a list (e.g. its header). It finds the enclosing
/// scroll view and registers it as the content scroll view of the screen that
/// shows it and of each parent controller below the tab bar controller.
/// Re-applied whenever the screen comes back on screen.
final class NemuContentScrollMarkerView: ExpoView {
  /// Register the list for the top edge too. Off beside the Duo's vertical
  /// bar: there the top edge's system effect is hidden and the page draws its
  /// own band under the bar's title (NemuScrollEdgeSurface), and a registered
  /// top content scroll view made the bar track the list itself (the title
  /// hid on scroll and the page's band never showed over the list, unlike on
  /// every page without a marker). Cleared, not left registered, when it
  /// turns off (a fold that brings the vertical bar).
  var topEdge = true

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    scheduleApply()
  }

  func scheduleApply() {
    DispatchQueue.main.async { [weak self] in self?.apply() }
  }

  private func apply() {
    guard window != nil else { return }
    var view: UIView? = superview
    var scrollView: UIScrollView?
    while let current = view {
      if let found = current as? UIScrollView { scrollView = found; break }
      view = current.superview
    }
    guard let scrollView else { return }
    var responder: UIResponder? = self
    var controller: UIViewController?
    while let current = responder {
      if let found = current as? UIViewController { controller = found; break }
      responder = current.next
    }
    while let current = controller, !(current is UITabBarController) {
      if topEdge {
        current.setContentScrollView(scrollView, for: [.top, .bottom])
      } else {
        current.setContentScrollView(scrollView, for: .bottom)
        if current.contentScrollView(for: .top) === scrollView {
          current.setContentScrollView(nil, for: .top)
        }
      }
      controller = current.parent
    }
  }
}

/// Keep selection tracking, lifting and lens transitions in UIKit. Like Telegram's
/// iOS 26 segmented control, the React view only owns labels, colours and selection.
/// Use the public appearance API; do not depend on private lens views/subview order.
final class NemuSegmentedControlView: ExpoView {
  let control = UISegmentedControl(items: [])
  let onSelectionChange = EventDispatcher()
  var selectedIndex = 0 { didSet { applySelection() } }
  var labels: [String] = [] {
    didSet {
      guard labels != oldValue else { return }
      control.removeAllSegments()
      for (index, label) in labels.enumerated() {
        control.insertSegment(withTitle: label, at: index, animated: false)
      }
      applySelection()
    }
  }
  var textColor = UIColor.secondaryLabel { didSet { updateText() } }
  var selectedTextColor = UIColor.white { didSet { updateText() } }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addSubview(control)
    control.addTarget(self, action: #selector(selectionChanged), for: .valueChanged)
    updateText()
  }

  /// Props land before Fabric's first layout, while the control still has the size
  /// `insertSegment` gave it. A segment selected then gets its indicator placed on a
  /// later layout pass, one frame after the labels, so the control takes this view's
  /// frame first and selection waits until there is one (see `layoutSubviews`).
  private func applySelection() {
    guard !bounds.isEmpty else { return }
    if control.frame != bounds { control.frame = bounds }
    guard labels.indices.contains(selectedIndex), control.selectedSegmentIndex != selectedIndex else { return }
    control.selectedSegmentIndex = selectedIndex
  }

  private func updateText() {
    let font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(
      for: .systemFont(ofSize: 13, weight: .semibold), maximumPointSize: 16.9)
    control.setTitleTextAttributes([.font: font, .foregroundColor: textColor], for: .normal)
    control.setTitleTextAttributes([.font: font, .foregroundColor: selectedTextColor], for: .selected)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if control.frame != bounds || control.selectedSegmentIndex != selectedIndex {
      // Frame, then selection, then the indicator's layout, all in this pass.
      UIView.performWithoutAnimation {
        applySelection()
        control.layoutIfNeeded()
      }
    }
    updateText()
  }

  @objc private func selectionChanged() {
    selectedIndex = control.selectedSegmentIndex
    UISelectionFeedbackGenerator().selectionChanged()
    onSelectionChange(["selectedIndex": selectedIndex])
  }
}

/// Marks the positive alert action as the default, giving UIKit the native
/// emphasis and Return-key behaviour instead of two equivalent actions.


// Keep the actual TextField and Buttons in one native alert builder. Wrapping
// each action in Expo's type-erased child view loses alert-specific traits.
final class NemuNameAlertProps: ExpoSwiftUI.ViewProps {
  @Field var presented = false
  @Field var title = ""
  @Field var message = ""
  @Field var placeholder = ""
  @Field var initialValue = ""
  @Field var confirmLabel = ""
  @Field var cancelLabel = ""
  @Field var requireChange = false
  /// `url`: an address (URL keyboard, no capitals or autocorrection).
  @Field var inputKind = "name"
  var onConfirm = EventDispatcher()
  var onCancel = EventDispatcher()
}

private struct NemuNameAlertFieldInput: ViewModifier {
  let kind: String
  @ViewBuilder func body(content: Content) -> some View {
    if kind == "url" {
      content
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled(true)
        .keyboardType(.URL)
        .textContentType(.URL)
    } else {
      content.textInputAutocapitalization(.words)
    }
  }
}

struct NemuNameAlertView: ExpoSwiftUI.View {
  @ObservedObject var props: NemuNameAlertProps
  @State private var presented = false
  @State private var text = ""
  @State private var settled = false

  private var name: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
  private var confirmRole: SwiftUI.ButtonRole? {
    if #available(iOS 26.0, *) { return .confirm }
    return nil
  }
  private func present() {
    text = props.initialValue
    settled = false
    presented = true
  }
  var body: some View {
    Children()
      .alert(props.title, isPresented: $presented) {
        TextField(props.placeholder, text: $text)
          .modifier(NemuNameAlertFieldInput(kind: props.inputKind))
          .submitLabel(.done)
        SwiftUI.Button(props.cancelLabel, role: .cancel) {
          settled = true
          props.onCancel()
        }
        SwiftUI.Button(props.confirmLabel, role: confirmRole) {
          settled = true
          props.onConfirm(["name": name])
        }
        .keyboardShortcut(.defaultAction)
        .disabled(name.isEmpty || (props.requireChange && name == props.initialValue.trimmingCharacters(in: .whitespacesAndNewlines)))
      } message: {
        Text(props.message)
      }
      .tint(nil)
      .onAppear { if props.presented { present() } }
      .onChange(of: props.presented) { value in
        if value { present() } else { presented = false }
      }
      .onChange(of: presented) { value in
        if !value && !settled {
          settled = true
          props.onCancel()
        }
      }
  }
}

/// Artwork follows the containing surface's corners without adding glass to content.
final class NemuConcentricView: ExpoView {
  var minimumRadius: CGFloat = 8 { didSet { updateCorners() } }
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    updateCorners()
  }
  private func updateCorners() {
    if #available(iOS 26.0, *) {
      cornerConfiguration = .corners(radius: .containerConcentric(minimum: minimumRadius))
    } else {
      layer.cornerRadius = minimumRadius
      layer.cornerCurve = .continuous
    }
  }
}

/// `contentOffset` a list rests at is minus its adjusted inset. UIKit keeps a
/// list there when the inset changes, but not when
/// `contentInsetAdjustmentBehavior` flips, and RN's `scrollTo` clamps to the raw
/// `contentInset`, so JS cannot reach it.
enum NemuScrollRest {
  @MainActor static func restAtAdjustedTop(_ view: UIView) {
    guard let scrollView = scrollView(in: view),
          !scrollView.isTracking, !scrollView.isDecelerating,
          scrollView.refreshControl?.isRefreshing != true else { return }
    let top = -scrollView.adjustedContentInset.top
    guard abs(scrollView.contentOffset.y - top) > 0.5 else { return }
    scrollView.setContentOffset(CGPoint(x: scrollView.contentOffset.x, y: top), animated: false)
  }

  @MainActor private static func scrollView(in view: UIView) -> UIScrollView? {
    if let found = view as? UIScrollView { return found }
    return view.subviews.lazy.compactMap { $0 as? UIScrollView }.first
  }
}
