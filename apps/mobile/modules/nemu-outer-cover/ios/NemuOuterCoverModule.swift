import AVFoundation
import ExpoModulesCore
import OSLog
import UIKit

let outerCoverLog = Logger(subsystem: "pm.nemu.outer-cover", category: "outer-cover")

/// What JS wants on the outer display (see `src/OuterCover.ts`).
struct NemuOuterCoverOptions: Record {
  /// The reader hook instance this content belongs to (see `clearOuterCover`).
  @Field var owner: String = ""
  /// JS: every condition holds (toggle on, reader open and focused, app in
  /// the foreground, device open). Native re-checks what it can see itself.
  @Field var enabled: Bool = false
  /// The cover cache's local file (`file://` or an absolute path); nothing
  /// else is loaded.
  @Field var coverUri: String? = nil
  /// The book / work; the cover crossfades only when this (or the image) changes.
  @Field var coverKey: String? = nil
  /// `#RRGGBB`; black when absent or unreadable.
  @Field var backgroundColor: String? = nil
  @Field var accessibilityLabel: String = ""
}

/// The options' values, copied off the Record (not Sendable) before they
/// cross to the main actor.
struct NemuOuterCoverSnapshot: Sendable {
  let owner: String
  let enabled: Bool
  let coverUri: String?
  let coverKey: String?
  let backgroundColor: String?
  let accessibilityLabel: String

  init(_ options: NemuOuterCoverOptions) {
    owner = options.owner
    enabled = options.enabled
    coverUri = options.coverUri
    coverKey = options.coverKey
    backgroundColor = options.backgroundColor
    accessibilityLabel = options.accessibilityLabel
  }
}

/// The book's cover on the iPhone Duo outer display while reading on the
/// inner display: a camera capture scene accessory (`UISceneAccessory
/// .cameraCapture`, iOS 27.1) registered on the reader's view controller,
/// presented by the system only while a capture session runs — so a minimal
/// session (one input, nothing recorded) runs while it is wanted.
public final class NemuOuterCoverModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NemuOuterCover")
    // Built with the iOS 27.1+ SDK and running on iOS 27.1+. Whether the
    // device has a hinge is JS's call (the window layout's hinge report).
    Constant("outerCoverAvailable") { NemuOuterCoverController.platformSupported }
    Function("isOuterCoverSupported") { () -> Bool in
      NemuOuterCoverController.platformSupported
    }
    Function("cameraAccessStatus") { () -> String in
      NemuOuterCoverCapture.authorizationName(AVCaptureDevice.authorizationStatus(for: .video))
    }
    // The only place the app asks for the camera: the reader's toggle turning on.
    AsyncFunction("requestCameraAccess") { () async -> String in
      let status = AVCaptureDevice.authorizationStatus(for: .video)
      guard status == .notDetermined else { return NemuOuterCoverCapture.authorizationName(status) }
      let granted = await AVCaptureDevice.requestAccess(for: .video)
      return granted ? "granted" : "denied"
    }
    AsyncFunction("setOuterCover") { (options: NemuOuterCoverOptions) in
      let snapshot = NemuOuterCoverSnapshot(options)
      MainActor.assumeIsolated { NemuOuterCoverController.shared.update(snapshot) }
    }.runOnQueue(.main)
    // Only the owner that configured the current content can clear it.
    AsyncFunction("clearOuterCover") { (owner: String) in
      MainActor.assumeIsolated { NemuOuterCoverController.shared.clear(owner: owner) }
    }.runOnQueue(.main)
    // Zero-size view mounted in the reader: its view controller hosts the
    // registration, and the camera never runs while no anchor is on screen.
    View(NemuOuterCoverAnchorView.self) {
      Prop("active") { (view: NemuOuterCoverAnchorView, active: Bool) in
        view.active = active
      }
    }
  }
}

/// Marks the reader screen. While it is in a window and `active`, the
/// controller may register the accessory on its owning view controller (the
/// react-native-screens screen) and run the session; leaving the window
/// stops both. It also watches the hinge, so a device folded closed stops
/// the camera even before JS hears of it.
final class NemuOuterCoverAnchorView: ExpoView {
  var active = false {
    didSet {
      guard active != oldValue else { return }
      NemuOuterCoverController.shared.anchorDidChange(self, reason: "active")
    }
  }
  /// Whether the hinge reports `.closed` (outer display in use); nil while
  /// no hinge has reported (no hinge, an older OS): the camera never runs then.
  private(set) var hingeClosed: Bool?
  private var hingeInteraction: UIInteraction?
  private var retryScheduled = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    backgroundColor = .clear
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      let interaction = UIHingeInteraction { [weak self] _, update in
        self?.hingeDidUpdate(closed: update.hinge.map { $0.status == .closed })
      }
      addInteraction(interaction)
      hingeInteraction = interaction
    }
    #endif
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    NemuOuterCoverController.shared.anchorDidChange(
      self,
      reason: window == nil ? "window-removed" : "window",
      attached: window != nil
    )
    // react-native-screens attaches a new screen's controller after the
    // view hierarchy mounts; look again once the push has settled.
    if window != nil { scheduleRetry() }
  }

  private func scheduleRetry() {
    guard !retryScheduled else { return }
    retryScheduled = true
    for delay in [0.05, 0.35, 1.0] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self else { return }
        if delay == 1.0 { self.retryScheduled = false }
        NemuOuterCoverController.shared.anchorDidChange(self, reason: "retry")
      }
    }
  }

  private func hingeDidUpdate(closed: Bool?) {
    guard closed != hingeClosed else { return }
    hingeClosed = closed
    let reason = closed.map { $0 ? "hinge-closed" : "hinge-open" } ?? "hinge-none"
    NemuOuterCoverController.shared.anchorDidChange(self, reason: reason)
  }

  /// The view controller that shows the reader.
  func owningViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }
}
