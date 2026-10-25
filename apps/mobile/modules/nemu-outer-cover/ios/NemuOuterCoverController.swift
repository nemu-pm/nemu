import AVFoundation
import ImageIO
import OSLog
import UIKit

// MARK: - Controller

/// Owns the shared model, the capture session and the accessory registration.
/// Everything runs or stops from `reconcile`, which every input calls.
@MainActor
final class NemuOuterCoverController {
  static let shared = NemuOuterCoverController()

  /// Built with the iOS 27.1+ SDK and running on iOS 27.1+.
  nonisolated static var platformSupported: Bool {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) { return true }
    #endif
    return false
  }

  /// Passed to the accessory as its `userInfo`; kept here for its lifetime
  /// (the accessory only identifies it).
  let model = NemuOuterCoverModel()
  private let capture = NemuOuterCoverCapture()
  /// JS has content for the outer display (toggle on, reader open).
  private var configured = false
  /// The hook instance (one reader) whose content is configured: only it
  /// can clear it, so a reader's late cleanup never clears the next one's.
  private var owner: String?
  /// JS: every condition holds.
  private var wanted = false
  private var contentIdentity: String?
  private var loadGeneration = 0
  private var inBackground = UIApplication.shared.applicationState == .background
  private var anchors: [WeakAnchor] = []
  /// `UISceneAccessoryRegistration` (iOS 27.1 type; untyped so older SDKs compile).
  private var registration: AnyObject?
  private weak var registeredController: UIViewController?
  private var observers: [NSObjectProtocol] = []
  #if NEMU_OUTER_COVER_PREVIEW
  private var previewWindow: UIWindow?
  #endif

  private init() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        self?.inBackground = true
        self?.reconcile("background")
      }
    })
    observers.append(center.addObserver(
      forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        self?.inBackground = false
        self?.reconcile("foreground")
      }
    })
    // Scene lifecycle (any scene; reconcile reads the reader's own scene's
    // `activationState`, so another scene's change is a no-op re-check).
    observers.append(center.addObserver(
      forName: UIScene.didEnterBackgroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.reconcile("scene-background") }
    })
    observers.append(center.addObserver(
      forName: UIScene.willEnterForegroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.reconcile("scene-foreground") }
    })
    // `willEnterForeground` is posted before the scene's state changes; it
    // reads foreground once the scene activates.
    observers.append(center.addObserver(
      forName: UIScene.didActivateNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.reconcile("scene-active") }
    })
    capture.onRuntimeError = { [weak self] in
      DispatchQueue.main.async {
        MainActor.assumeIsolated { self?.reconcile("capture-error") }
      }
    }
  }

  func update(_ options: NemuOuterCoverSnapshot) {
    owner = options.owner
    configured = true
    wanted = options.enabled
    model.setAppearance(
      backgroundColor: Self.color(hex: options.backgroundColor),
      accessibilityLabel: options.accessibilityLabel
    )
    let identity = (options.coverKey ?? "") + "\u{0}" + (options.coverUri ?? "")
    if identity != contentIdentity {
      contentIdentity = identity
      loadCover(uri: options.coverUri)
    }
    reconcile("update")
  }

  /// Ignored unless `owner` configured the current content.
  func clear(owner: String) {
    guard owner == self.owner else {
      outerCoverLog.debug("clear ignored: not the current owner")
      return
    }
    self.owner = nil
    configured = false
    wanted = false
    contentIdentity = nil
    loadGeneration += 1
    model.clear()
    reconcile("clear")
  }

  /// `attached`: the anchor just entered a window, so it becomes the newest
  /// (the top reader). Any other change refreshes it where it is.
  func anchorDidChange(_ anchor: NemuOuterCoverAnchorView, reason: String, attached: Bool = false) {
    anchors.removeAll { $0.value == nil }
    if attached {
      anchors.removeAll { $0.value === anchor }
      anchors.append(WeakAnchor(anchor))
    } else if !anchors.contains(where: { $0.value === anchor }) {
      anchors.append(WeakAnchor(anchor))
    }
    reconcile(reason)
  }

  /// The latest anchor on screen and active (the top reader).
  private func currentAnchor() -> NemuOuterCoverAnchorView? {
    anchors.removeAll { $0.value == nil }
    return anchors.last { anchor in
      guard let view = anchor.value else { return false }
      return view.active && view.window != nil
    }?.value
  }

  private func reconcile(_ reason: String) {
    let anchor = currentAnchor()
    let authorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    let run = Self.platformSupported
      && configured
      && wanted
      && authorized
      && !inBackground
      && anchor != nil
      && anchor?.window?.windowScene?.activationState != .background
      // A hinge must have reported, and not closed (outer display in use).
      && anchor?.hingeClosed == false
    let controller = run ? anchor?.owningViewController() : nil
    if run && controller != nil {
      if registeredController !== controller {
        unregister()
        register(on: controller!)
      }
      capture.setRunning(true)
    } else {
      // Stop first, then withdraw the content.
      capture.setRunning(false)
      unregister()
    }
    #if NEMU_OUTER_COVER_PREVIEW
    updatePreview(anchor: anchor)
    #endif
    let hinge = anchor?.hingeClosed.map { $0 ? "closed" : "open" } ?? "none"
    outerCoverLog.debug("\(reason, privacy: .public): run=\(run && controller != nil) configured=\(self.configured) wanted=\(self.wanted) authorized=\(authorized) background=\(self.inBackground) anchor=\(anchor != nil) hinge=\(hinge, privacy: .public)")
  }

  private func register(on controller: UIViewController) {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *) {
      // Apple: "Registering a camera capture accessory on iPhone Duo".
      // As the sample. If this initializer is unavailable or rejected, the
      // fallback is `UISceneConfiguration(name: nil, sessionRole:
      // .windowCameraCaptureAccessory)` (the system assigns the role anyway).
      let configuration = UISceneConfiguration()
      configuration.delegateClass = NemuOuterCoverSceneDelegate.self
      let accessory = UISceneAccessory.cameraCapture(sceneConfiguration: configuration, userInfo: model)
      registration = controller.registerSceneAccessory(accessory)
      registeredController = controller
      outerCoverLog.debug("registered on \(String(describing: type(of: controller)), privacy: .public)")
    }
    #endif
  }

  private func unregister() {
    #if NEMU_SDK_27_1
    if #available(iOS 27.1, *),
       let registration = registration as? UISceneAccessoryRegistration,
       let controller = registeredController {
      controller.unregisterSceneAccessory(registration)
      outerCoverLog.debug("unregistered")
    }
    #endif
    registration = nil
    registeredController = nil
  }

  // MARK: Cover image

  /// Local files only: JS hands over the app's policy-checked cover cache
  /// file, so nothing here fetches from the network.
  private func loadCover(uri: String?) {
    loadGeneration += 1
    let generation = loadGeneration
    guard let uri, !uri.isEmpty, let url = Self.fileURL(for: uri) else {
      model.setImage(nil)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let data = try? Data(contentsOf: url, options: .mappedIfSafe)
      let image = data.flatMap(Self.downsampledImage)
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          guard let self, self.loadGeneration == generation else { return }
          self.model.setImage(image)
        }
      }
    }
  }

  nonisolated private static func fileURL(for uri: String) -> URL? {
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    guard let url = URL(string: uri), url.isFileURL else { return nil }
    return url
  }

  /// Decoded at most 1600 px on its long side: an outer display never needs more.
  nonisolated private static func downsampledImage(_ data: Data) -> UIImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary)
    else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: 1600,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    return UIImage(cgImage: image)
  }

  nonisolated static func color(hex: String?) -> UIColor {
    guard var text = hex?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return .black }
    if text.hasPrefix("#") { text.removeFirst() }
    guard text.count == 6, let value = UInt32(text, radix: 16) else { return .black }
    return UIColor(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }

  // MARK: Verification preview

  #if NEMU_OUTER_COVER_PREVIEW
  /// Verification builds only (see the podspec): while the device is folded
  /// closed with content configured, the accessory's own view controller is
  /// drawn over the reader on the outer display, at that display's real size.
  private func updatePreview(anchor: NemuOuterCoverAnchorView?) {
    let scene = anchor?.window?.windowScene
    let show = configured && !inBackground && anchor?.hingeClosed == true && scene != nil
    guard show, let scene else {
      previewWindow?.isHidden = true
      previewWindow = nil
      return
    }
    if previewWindow?.windowScene === scene { return }
    let window = UIWindow(windowScene: scene)
    window.windowLevel = .alert + 1
    window.isUserInteractionEnabled = false
    window.rootViewController = NemuOuterCoverViewController(model: model)
    window.isHidden = false
    previewWindow = window
  }
  #endif
}

private final class WeakAnchor {
  weak var value: NemuOuterCoverAnchorView?
  init(_ value: NemuOuterCoverAnchorView) { self.value = value }
}

// MARK: - Capture session

/// The lightest session that counts as capturing: one built-in camera input
/// at the `.low` preset and its lowest frame rate, no output that records,
/// saves or processes frames. Configured, started and stopped on its own
/// serial queue, never the main thread; every request is enqueued and the
/// queue checks the session itself. Fails quietly where there is no camera
/// (Simulator).
final class NemuOuterCoverCapture: @unchecked Sendable {
  private let queue = DispatchQueue(label: "pm.nemu.outer-cover.capture", qos: .userInitiated)
  /// Queue only.
  private var session: AVCaptureSession?
  /// Queue only.
  private var sessionObservers: [NSObjectProtocol] = []
  /// Set once on the main thread before any session exists; called from the
  /// queue after a runtime error has stopped the session.
  var onRuntimeError: (@Sendable () -> Void)?

  static func authorizationName(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "denied"
    }
  }

  func setRunning(_ running: Bool) {
    queue.async {
      if running { self.startOnQueue() } else { self.stopOnQueue() }
    }
  }

  private func startOnQueue() {
    if let session {
      if !session.isRunning { session.startRunning() }
      return
    }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      outerCoverLog.debug("capture: not authorized")
      return
    }
    // A camera that faces away from the reader: the inner (front) camera
    // would also activate the inner display's camera reserved region.
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
      ?? AVCaptureDevice.default(for: .video)
    else {
      outerCoverLog.info("capture: no camera on this device; outer cover not shown")
      return
    }
    let session = AVCaptureSession()
    session.beginConfiguration()
    if session.canSetSessionPreset(.low) { session.sessionPreset = .low }
    do {
      let input = try AVCaptureDeviceInput(device: device)
      guard session.canAddInput(input) else {
        session.commitConfiguration()
        outerCoverLog.error("capture: input rejected")
        return
      }
      session.addInput(input)
    } catch {
      session.commitConfiguration()
      outerCoverLog.error("capture: no input: \(error.localizedDescription, privacy: .public)")
      return
    }
    session.commitConfiguration()
    observe(session)
    self.session = session
    session.startRunning()
    if !session.isRunning {
      // A session that will not run without an output gets the cheapest one,
      // with no sample buffer delegate: every frame is discarded.
      let output = AVCaptureVideoDataOutput()
      output.alwaysDiscardsLateVideoFrames = true
      session.beginConfiguration()
      if session.canAddOutput(output) { session.addOutput(output) }
      session.commitConfiguration()
      session.startRunning()
    }
    // After `startRunning` (which may reset the device's format to the
    // preset's), inside a configuration block so it is applied at once.
    session.beginConfiguration()
    Self.useLowestFrameRate(device)
    session.commitConfiguration()
    outerCoverLog.debug("capture: running=\(session.isRunning)")
  }

  private func stopOnQueue() {
    guard let session else { return }
    session.stopRunning()
    for observer in sessionObservers { NotificationCenter.default.removeObserver(observer) }
    sessionObservers = []
    self.session = nil
    outerCoverLog.debug("capture: stopped")
  }

  private func observe(_ session: AVCaptureSession) {
    let center = NotificationCenter.default
    let sessionID = ObjectIdentifier(session)
    sessionObservers.append(center.addObserver(
      forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil
    ) { [weak self] notification in
      let error = notification.userInfo?[AVCaptureSessionErrorKey] as? Error
      outerCoverLog.error("capture: runtime error \(error?.localizedDescription ?? "unknown", privacy: .public)")
      guard let self else { return }
      // Tear the failed session down on the queue, then let the controller
      // decide on main: a fresh session starts if it is still wanted.
      self.queue.async {
        guard let current = self.session, ObjectIdentifier(current) == sessionID else { return }
        self.stopOnQueue()
        self.onRuntimeError?()
      }
    })
    sessionObservers.append(center.addObserver(
      forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil
    ) { _ in
      outerCoverLog.debug("capture: interrupted")
    })
  }

  private static func useLowestFrameRate(_ device: AVCaptureDevice) {
    guard let range = device.activeFormat.videoSupportedFrameRateRanges.min(by: { $0.minFrameRate < $1.minFrameRate })
    else { return }
    do {
      try device.lockForConfiguration()
      // Both durations from the active format's own range, so always valid.
      device.activeVideoMaxFrameDuration = range.maxFrameDuration
      device.activeVideoMinFrameDuration = range.maxFrameDuration
      device.unlockForConfiguration()
    } catch {
      outerCoverLog.debug("capture: frame rate unchanged: \(error.localizedDescription, privacy: .public)")
    }
  }
}

// MARK: - Shared model

/// The state both sides read: the reader side writes it, the accessory's
/// view controller observes it. Passed as the accessory's `userInfo`.
@MainActor
final class NemuOuterCoverModel: NSObject {
  private(set) var image: UIImage?
  private(set) var backgroundColor: UIColor = .black
  private(set) var coverLabel = ""
  private var observers: [ModelObserver] = []

  /// `handler` runs until `owner` is released (no removal needed, so no
  /// owner touches the model from its `deinit`).
  func observe(owner: AnyObject, _ handler: @escaping (_ animated: Bool) -> Void) {
    observers.removeAll { $0.owner == nil }
    observers.append(ModelObserver(owner: owner, handler: handler))
  }

  func setImage(_ image: UIImage?) {
    guard image !== self.image else { return }
    self.image = image
    notify(animated: true)
  }

  func setAppearance(backgroundColor: UIColor, accessibilityLabel: String) {
    guard !backgroundColor.isEqual(self.backgroundColor) || accessibilityLabel != coverLabel else { return }
    self.backgroundColor = backgroundColor
    coverLabel = accessibilityLabel
    notify(animated: true)
  }

  func clear() {
    image = nil
    backgroundColor = .black
    coverLabel = ""
    notify(animated: false)
  }

  private func notify(animated: Bool) {
    observers.removeAll { $0.owner == nil }
    for observer in observers { observer.handler(animated) }
  }
}

private struct ModelObserver {
  weak var owner: AnyObject?
  let handler: (_ animated: Bool) -> Void
}

// MARK: - Accessory scene

/// Delegate of the accessory's own scene (set on its `UISceneConfiguration`;
/// accessory scenes take no Info.plist manifest entry).
final class NemuOuterCoverSceneDelegate: NSObject, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    #if NEMU_SDK_27_1
    guard #available(iOS 27.1, *) else { return }
    let model = (connectionOptions.sceneAccessoryUserInfo as? NemuOuterCoverModel)
      ?? NemuOuterCoverController.shared.model
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = NemuOuterCoverViewController(model: model)
    // Visible but never made key: React Native's RCTKeyWindow() takes the key
    // window of whichever foreground scene it meets first, and the reader's
    // sizes, alerts and status bar must keep resolving to the app window.
    // The content takes no input, so it never needs to be key.
    window.isHidden = false
    self.window = window
    outerCoverLog.debug("accessory scene connected")
    #else
    _ = windowScene
    #endif
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
    outerCoverLog.debug("accessory scene disconnected")
  }
}

/// The outer display: the cover only, aspect-fit and centred with 24 pt side
/// margins, never cropped, no corner radius / shadow / border, over the
/// cover-derived colour filling the display. No cover: the colour alone.
/// Non-interactive; read as "<title> cover".
final class NemuOuterCoverViewController: UIViewController {
  static let sideMargin: CGFloat = 24
  /// The reader opening's fade.
  static let crossfadeDuration: TimeInterval = 0.25

  private let model: NemuOuterCoverModel
  private let imageView = UIImageView()

  init(model: NemuOuterCoverModel) {
    self.model = model
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = true
    view.accessibilityTraits = .image
    imageView.contentMode = .scaleAspectFit
    imageView.clipsToBounds = false
    imageView.isAccessibilityElement = false
    imageView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(imageView)
    let guide = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      imageView.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: Self.sideMargin),
      imageView.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -Self.sideMargin),
      imageView.topAnchor.constraint(equalTo: guide.topAnchor),
      imageView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
    ])
    apply(animated: false)
    model.observe(owner: self) { [weak self] animated in
      self?.apply(animated: animated)
    }
  }

  private func apply(animated: Bool) {
    view.accessibilityLabel = model.coverLabel
    let color = model.backgroundColor
    let image = model.image
    guard animated, view.window != nil else {
      view.backgroundColor = color
      imageView.image = image
      return
    }
    if !(view.backgroundColor?.isEqual(color) ?? false) {
      UIView.animate(withDuration: Self.crossfadeDuration, delay: 0, options: [.beginFromCurrentState]) {
        self.view.backgroundColor = color
      }
    }
    if imageView.image !== image {
      UIView.transition(
        with: imageView,
        duration: Self.crossfadeDuration,
        options: [.transitionCrossDissolve, .beginFromCurrentState]
      ) {
        self.imageView.image = image
      }
    }
  }
}
