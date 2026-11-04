import ExpoModulesCore
import OSLog
import UIKit

/// The app's orientations (owner decisions 2026-10-15, 2026-10-19): an
/// ordinary iPhone is portrait everywhere; the iPhone Duo (both displays) and
/// iPad rotate, the reader included.
///
/// Info.plist declares every orientation for iPhone and iPad, so a Duo opened
/// sideways on its outer display launches in landscape. The gate decides
/// what the device is from what the system says about it, synchronously
/// (`NemuDeviceInfo`): the first time UIKit asks, the asking window's display
/// tells a Duo (either display is wider than any ordinary iPhone's) from an
/// ordinary iPhone, which is narrowed to portrait (before the first frame of
/// the app's own UI; the launch screen is a plain background colour, so a
/// settle behind it is invisible). A hinge report (`UIHingeInteraction` only
/// reports a hinge on a device that has one) and a hinge remembered for this
/// hardware model also make it foldable. Foldable is one-way: nothing ever
/// narrows a foldable back to portrait or deletes the memory (product rule,
/// 2026-10-27; a cold launch whose hinge was late used to forget it and hold
/// the inner display portrait). The reader's Orientation Lock narrows the
/// Duo's mask to the orientation it has (`NemuInterfaceOrientationLock`);
/// Expo intersects every subscriber's mask.
public final class NemuOrientationGateAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NemuOrientationGate.start()
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) { MainActor.assumeIsolated { NemuTabRailRepair.install() } }
    #endif
    return true
  }

  public func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    NemuOrientationGate.mask(idiom: UIDevice.current.userInterfaceIdiom, window: window)
  }
}

private let orientationGateLog = Logger(subsystem: "pm.nemu.window-layout", category: "orientation")

enum NemuOrientationGate {
  /// The device is a foldable iPhone: its display says so, a hinge reported,
  /// or a hinge was remembered for this hardware model. Never reset.
  private(set) static var foldable = NemuDeviceInfo.rememberedFoldable
  /// The mask allows landscape: a foldable known the first time UIKit asks
  /// at once, one found later `widenDelay` after (see `becameFoldable`).
  private static var widened = NemuDeviceInfo.rememberedFoldable
  /// UIKit has asked for the mask at least once.
  private static var answered = false
  /// A hinge often reports within ~20 ms of the app becoming active, while
  /// the launch is still settling: the scene then takes the wider mask as its
  /// preferences but stays portrait. Reported 110 ms or more after, it turns.
  private static let widenDelay: TimeInterval = 0.25
  private static var observers: [NSObjectProtocol] = []
  private static var probes: [ObjectIdentifier: AnyObject] = [:]

  /// The reader's Orientation Lock on a foldable iPhone: the orientation the
  /// scene had when it locked (the outer display honours the mask; the inner
  /// one ignores it and keeps the scene lock instead).
  @MainActor static var heldMask: UIInterfaceOrientationMask?
  /// The scene whose orientation `heldMask` holds (the app scene the reader
  /// is in). The hold narrows only its windows: a second foreground scene
  /// (the outer cover's camera-capture accessory) is never narrowed to an
  /// orientation read from another display, nor re-asked on the release.
  @MainActor private static weak var heldScene: UIWindowScene?

  static func mask(idiom: UIUserInterfaceIdiom, window: UIWindow? = nil) -> UIInterfaceOrientationMask {
    guard idiom == .phone else { return .all }
    return MainActor.assumeIsolated { () -> UIInterfaceOrientationMask in
      if !foldable {
        let screen = window?.windowScene?.screen
        if NemuDeviceInfo.screenIsFoldable(screen) == true {
          // Asked for the first time: answer wide now. Later: widen as a
          // late hinge does, after the launch settles.
          becameFoldable(reason: "display wider than an iPhone", widenNow: !answered)
        }
      }
      answered = true
      guard widened else { return .portrait }
      guard let heldMask else { return .all }
      if let scene = window?.windowScene, let heldScene, scene !== heldScene { return .all }
      return heldMask
    }
  }

  /// Whether this is a foldable iPhone, from everything known now (main
  /// thread): the display of `screen` (or of every connected scene), a
  /// reported or remembered hinge. Learning it here widens the mask.
  @MainActor static func resolveFoldable(screen: UIScreen? = nil) -> Bool {
    guard UIDevice.current.userInterfaceIdiom == .phone else { return false }
    if foldable { return true }
    let display: Bool?
    if let screen {
      display = NemuDeviceInfo.screenIsFoldable(screen)
    } else {
      display = NemuDeviceInfo.connectedScreensAreFoldable()
    }
    if display == true { becameFoldable(reason: "display wider than an iPhone", widenNow: false) }
    return foldable
  }

  /// Holds (or releases) a foldable iPhone's current orientation.
  @available(iOS 26.0, *)
  @MainActor static func hold(_ value: Bool) {
    let scene = value && foldable ? appScene() : nil
    let next: UIInterfaceOrientationMask? = scene.flatMap { currentMask(of: $0) }
    // Nothing held and nothing to hold, or the same orientation of the same
    // scene: no supported-orientations update (each one re-asks UIKit for
    // the scene's geometry).
    guard next != heldMask || (next != nil && scene !== heldScene) else { return }
    let previousScene = heldScene
    heldMask = next
    heldScene = next == nil ? nil : scene
    orientationGateLog.debug("orientation hold \(next == nil ? "off" : "on", privacy: .public)")
    // Only the scenes the change applies to: the one held before and the one
    // held now (the mask of every other scene stays `.all`).
    var scenes: [UIWindowScene] = []
    for candidate in [previousScene, heldScene] {
      if let candidate, !scenes.contains(where: { $0 === candidate }) { scenes.append(candidate) }
    }
    if scenes.isEmpty {
      updateSupportedOrientations()
    } else {
      for scene in scenes { updateSupportedOrientations(in: scene) }
    }
  }

  /// The app's own scene, the one the reader is in: the scene holding the
  /// key window, else a foreground app-role scene. Never the first active
  /// scene in `connectedScenes` order, which may be the outer cover's
  /// camera-capture accessory scene on the other display (its window is
  /// never key).
  @MainActor static func appScene() -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.first { $0.windows.contains(where: \.isKeyWindow) }
      ?? scenes.first { $0.session.role == .windowApplication && $0.activationState == .foregroundActive }
      ?? scenes.first { $0.session.role == .windowApplication }
      ?? scenes.first
  }

  @available(iOS 26.0, *)
  @MainActor private static func currentMask(of scene: UIWindowScene) -> UIInterfaceOrientationMask? {
    switch scene.effectiveGeometry.interfaceOrientation {
    case .portrait: return .portrait
    case .portraitUpsideDown: return .portraitUpsideDown
    case .landscapeLeft: return .landscapeLeft
    case .landscapeRight: return .landscapeRight
    default: return nil
    }
  }

  @MainActor private static func updateSupportedOrientations() {
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      updateSupportedOrientations(in: scene)
    }
  }

  @MainActor private static func updateSupportedOrientations(in scene: UIWindowScene) {
    for window in scene.windows {
      window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }
  }

  static func start() {
    guard UIDevice.current.userInterfaceIdiom == .phone, observers.isEmpty, !foldable else { return }
    // Each time a scene activates (launch, a display switch, back from the
    // background): read its display and probe its windows for a hinge.
    observers.append(NotificationCenter.default.addObserver(
      forName: UIScene.didActivateNotification, object: nil, queue: .main
    ) { note in
      MainActor.assumeIsolated {
        if let scene = note.object as? UIWindowScene { sceneDidActivate(scene) }
      }
    })
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      // Scenes connect after launch; probe each window as it becomes key too.
      observers.append(NotificationCenter.default.addObserver(
        forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main
      ) { note in
        MainActor.assumeIsolated {
          if let window = note.object as? UIWindow { probe(window) }
        }
      })
    }
    #endif
  }

  @MainActor
  private static func sceneDidActivate(_ scene: UIWindowScene) {
    guard !foldable else { return }
    if NemuDeviceInfo.screenIsFoldable(scene.screen) == true {
      becameFoldable(reason: "display wider than an iPhone", widenNow: false)
      return
    }
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      for window in scene.windows { probe(window) }
    }
    #endif
  }

  #if NEMU_SDK_27_1
  @available(iOS 27.1, *)
  @MainActor
  private static func probe(_ window: UIWindow) {
    guard !foldable, probes[ObjectIdentifier(window)] == nil else { return }
    let interaction = UIHingeInteraction { [weak window] interaction, update in
      guard update.hinge != nil, let window else { return }
      window.removeInteraction(interaction)
      becameFoldable(reason: "hinge reported", widenNow: false)
    }
    window.addInteraction(interaction)
    probes[ObjectIdentifier(window)] = interaction
  }
  #endif

  /// The device is foldable: remember it for this hardware model and widen
  /// the mask, at once (`widenNow`, while answering UIKit's first ask) or
  /// `widenDelay` later, once the launch has settled.
  @MainActor
  private static func becameFoldable(reason: String, widenNow: Bool) {
    guard !foldable else { return }
    foldable = true
    NemuDeviceInfo.rememberFoldable()
    orientationGateLog.debug("\(reason, privacy: .public): rotating like a foldable (\(NemuDeviceInfo.modelIdentifier, privacy: .public))")
    probes.removeAll()
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
    if widenNow {
      widened = true
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + widenDelay) {
      MainActor.assumeIsolated {
        guard foldable, !widened else { return }
        widened = true
        updateSupportedOrientations()
      }
    }
  }
}

/// Waits out the view controller transitions running in the app's windows
/// (a navigation pop, a push, a modal presentation) before an orientation
/// change. The reader released its portrait lock as Back began, so the scene
/// rotated under the pop: react-native-screens then commits the new screen
/// bounds synchronously inside the transition's layout pass, which tripped
/// Reanimated's layout-animation tree ("Indices are wrong in Remove
/// mutation", SIGABRT) or sent the vertical bar container
/// (`_UIFloatingBarContainerView`) into an Observation tracking feedback
/// loop on its corners (iPhone Duo outer display).
///
/// The request usually arrives just before the transition exists: React
/// commits the pop, then the screen's blur releases the lock, while UIKit
/// only starts a navigation transition at the stack's next layout pass
/// (`startDeferredTransitionIfNeeded`). So it watches for one for
/// `grace` seconds; with none (a tab switch) `done` runs after that.
///
/// A wait never lasts longer than `cap` seconds: the tab bar, the orientation
/// lock's release and the reader's style restore all wait here, and a
/// transition whose completion never comes (an interactive or cancelled one,
/// a presentation left behind) or a coordinator that stays reachable after it
/// finished held them for a minute. Only the app's own scenes count (never
/// the outer cover's accessory scene), and a controller already dismissed
/// out of its window is skipped.
@MainActor
enum NemuTransitionSettle {
  static let grace: CFTimeInterval = 0.25
  static let cap: CFTimeInterval = 1.0

  /// One wait: `done` runs exactly once, at the latest `cap` after `wait`.
  @MainActor
  private final class Pending {
    let startedAt = CACurrentMediaTime()
    let done: @MainActor () -> Void
    var finished = false
    var waited = false
    var polls = 0

    init(_ done: @escaping @MainActor () -> Void) {
      self.done = done
    }
  }

  static func wait(_ done: @escaping @MainActor () -> Void) {
    let pending = Pending(done)
    // The cap holds even while a transition's completion never comes.
    DispatchQueue.main.asyncAfter(deadline: .now() + cap) {
      MainActor.assumeIsolated { finish(pending, capped: true) }
    }
    poll(pending, until: pending.startedAt + grace)
  }

  private static func finish(_ pending: Pending, capped: Bool) {
    guard !pending.finished else { return }
    pending.finished = true
    orientationGateLog.debug("orientation change applies (\(capped ? "capped" : pending.waited ? "transition finished" : "no transition", privacy: .public))")
    pending.done()
  }

  private static func poll(_ pending: Pending, until deadline: CFTimeInterval) {
    guard !pending.finished else { return }
    pending.polls += 1
    if let found = activeCoordinator() {
      orientationGateLog.debug("orientation change waits for a transition")
      pending.waited = true
      let queued = found.coordinator.animate(alongsideTransition: nil) { _ in
        // A finished transition can hand over to another (a pop that lands on
        // a screen which presents); look again on the next turn.
        DispatchQueue.main.async {
          MainActor.assumeIsolated { poll(pending, until: CACurrentMediaTime() + 0.05) }
        }
      }
      // UIKit refused the completion (the transition is over or never ran
      // its animations): it will never come, so look again next frame
      // instead of waiting for it; the cap still bounds the wait.
      if !queued {
        let retryUntil = max(deadline, CACurrentMediaTime() + 0.05)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 60.0) {
          MainActor.assumeIsolated { poll(pending, until: retryUntil) }
        }
      }
      return
    }
    if CACurrentMediaTime() >= deadline {
      finish(pending, capped: false)
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 60.0) {
      MainActor.assumeIsolated { poll(pending, until: deadline) }
    }
  }

  private typealias Found = (coordinator: UIViewControllerTransitionCoordinator, controller: UIViewController)

  /// The first running transition in the app's own scenes, with the
  /// controller it was found on.
  private static func activeCoordinator() -> Found? {
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes
    where scene.activationState != .background && scene.session.role == .windowApplication {
      for window in scene.windows where !window.isHidden {
        if let found = coordinator(in: window.rootViewController) { return found }
      }
    }
    return nil
  }

  private static func coordinator(in controller: UIViewController?) -> Found? {
    guard let controller else { return nil }
    // Dismissed and already out of its window: whatever it still reports is
    // not a transition anything on screen waits for.
    if controller.isBeingDismissed && controller.viewIfLoaded?.window == nil { return nil }
    if let coordinator = controller.transitionCoordinator { return (coordinator, controller) }
    for child in controller.children {
      if let found = coordinator(in: child) { return found }
    }
    return coordinator(in: controller.presentedViewController)
  }
}

/// The reader's Orientation Lock (方向锁定) where a forced orientation is only
/// a preference (iPad, the Duo's inner display, iOS 27 resizable scenes): the
/// scene keeps the orientation it has, the way the system's own Orientation
/// Lock does (`prefersInterfaceOrientationLocked`, iOS 26). UIKit asks the
/// root view controller; Expo's root controller does not override the getter,
/// so it is added to `UIViewController` once, answering for root controllers
/// only.
@MainActor
enum NemuInterfaceOrientationLock {
  private static var locked = false
  private static var wanted = false
  private static var installed = false

  /// Locks at once; a release waits for the transition that caused it (the
  /// reader's Back) to finish, see `NemuTransitionSettle`. On a foldable
  /// iPhone the gate also holds the current orientation (the outer display
  /// honours supported orientations, not the scene lock).
  static func set(_ value: Bool) {
    guard #available(iOS 26.0, *) else { return }
    install()
    wanted = value
    if value {
      apply(true)
      NemuOrientationGate.hold(true)
    } else {
      // Nothing locked and nothing held: no release to defer, and no
      // orientation request to make while the pop runs.
      guard locked || NemuOrientationGate.heldMask != nil else { return }
      // One deferred release, after the transition that caused it (Back).
      NemuTransitionSettle.wait {
        guard !wanted else { return }
        apply(false)
        NemuOrientationGate.hold(false)
      }
    }
  }

  @available(iOS 26.0, *)
  private static func apply(_ value: Bool) {
    guard value != locked else { return }
    locked = value
    orientationGateLog.debug("interface orientation lock \(value ? "on" : "off", privacy: .public)")
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows {
        window.rootViewController?.setNeedsUpdateOfPrefersInterfaceOrientationLocked()
      }
    }
  }

  @available(iOS 26.0, *)
  private static func install() {
    guard !installed else { return }
    installed = true
    let cls: AnyClass = UIViewController.self
    let selector = NSSelectorFromString("prefersInterfaceOrientationLocked")
    guard let method = class_getInstanceMethod(cls, selector) else { return }
    typealias Getter = @convention(c) (UIViewController, Selector) -> Bool
    let original = unsafeBitCast(method_getImplementation(method), to: Getter.self)
    let block: @convention(block) (UIViewController) -> Bool = { controller in
      MainActor.assumeIsolated {
        (locked && controller.view.window?.rootViewController === controller) || original(controller, selector)
      }
    }
    let imp = imp_implementationWithBlock(block)
    if !class_addMethod(cls, selector, imp, method_getTypeEncoding(method)) {
      method_setImplementation(method, imp)
    }
  }
}
