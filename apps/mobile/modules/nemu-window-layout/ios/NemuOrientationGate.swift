import ExpoModulesCore
import OSLog
import UIKit

/// The app's orientations from the first frame (owner decision 2026-10-15):
/// an ordinary iPhone is portrait everywhere; the iPhone Duo and iPad rotate.
///
/// Info.plist declares portrait for iPhone (the launch screen is drawn from it
/// before any code runs) and every orientation for iPad. The Duo is an iPhone
/// too, so this delegate widens the mask once the window's hinge reports:
/// `UIHingeInteraction` only reports a hinge on a device that has one. The JS
/// orientation policy still layers the reader's portrait lock on top (Expo
/// intersects every subscriber's mask).
public final class NemuOrientationGateAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NemuOrientationGate.start()
    return true
  }

  public func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    NemuOrientationGate.mask(idiom: UIDevice.current.userInterfaceIdiom)
  }
}

private let orientationGateLog = Logger(subsystem: "pm.nemu.window-layout", category: "orientation")

enum NemuOrientationGate {
  /// A hinge has reported this session; it never goes back.
  private(set) static var foldable = false
  private static var observer: NSObjectProtocol?
  private static var probes: [ObjectIdentifier: AnyObject] = [:]

  static func mask(idiom: UIUserInterfaceIdiom) -> UIInterfaceOrientationMask {
    idiom == .phone && !foldable ? .portrait : .all
  }

  static func start() {
    guard UIDevice.current.userInterfaceIdiom == .phone, observer == nil else { return }
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      // Scenes connect after launch; probe each window as it becomes key.
      observer = NotificationCenter.default.addObserver(
        forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main
      ) { note in
        MainActor.assumeIsolated {
          if let window = note.object as? UIWindow { probe(window) }
        }
      }
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
      becameFoldable()
    }
    window.addInteraction(interaction)
    probes[ObjectIdentifier(window)] = interaction
  }

  @MainActor
  private static func becameFoldable() {
    guard !foldable else { return }
    foldable = true
    orientationGateLog.debug("hinge reported: rotating like a foldable")
    probes.removeAll()
    if let observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows {
        window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
      }
    }
  }
  #endif
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
@MainActor
enum NemuTransitionSettle {
  static let grace: CFTimeInterval = 0.25

  static func wait(_ done: @escaping @MainActor () -> Void) {
    poll(until: CACurrentMediaTime() + grace, waited: false, done)
  }

  private static func poll(until deadline: CFTimeInterval, waited: Bool, _ done: @escaping @MainActor () -> Void) {
    if let coordinator = activeCoordinator() {
      orientationGateLog.debug("orientation change waits for a transition")
      coordinator.animate(alongsideTransition: nil) { _ in
        // A finished transition can hand over to another (a pop that lands on
        // a screen which presents); look again on the next turn.
        DispatchQueue.main.async {
          MainActor.assumeIsolated { poll(until: CACurrentMediaTime() + 0.05, waited: true, done) }
        }
      }
      return
    }
    if CACurrentMediaTime() >= deadline {
      orientationGateLog.debug("orientation change applies (\(waited ? "transition finished" : "no transition", privacy: .public))")
      done()
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 60.0) {
      MainActor.assumeIsolated { poll(until: deadline, waited: waited, done) }
    }
  }

  private static func activeCoordinator() -> UIViewControllerTransitionCoordinator? {
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes
    where scene.activationState != .background {
      for window in scene.windows where !window.isHidden {
        if let coordinator = coordinator(in: window.rootViewController) { return coordinator }
      }
    }
    return nil
  }

  private static func coordinator(in controller: UIViewController?) -> UIViewControllerTransitionCoordinator? {
    guard let controller else { return nil }
    if let coordinator = controller.transitionCoordinator { return coordinator }
    for child in controller.children {
      if let coordinator = coordinator(in: child) { return coordinator }
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
  /// reader's Back) to finish, see `NemuTransitionSettle`.
  static func set(_ value: Bool) {
    guard #available(iOS 26.0, *) else { return }
    install()
    wanted = value
    if value {
      apply(true)
    } else {
      NemuTransitionSettle.wait { if !wanted { apply(false) } }
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
