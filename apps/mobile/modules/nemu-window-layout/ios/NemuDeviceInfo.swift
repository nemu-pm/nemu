import Darwin
import Foundation
import UIKit

/// What the system says about the device itself, read synchronously: no hinge
/// report, no timeout.
///
/// - The display: the iPhone Duo's displays are wider than any ordinary
///   iPhone's in either orientation (outer 466 × 678 pt, inner 669 × 951 pt;
///   the widest ordinary iPhone, a Pro Max, is 440 pt). The short side is
///   read both from `bounds` and from `nativeBounds / scale` (the latter
///   ignores Display Zoom, which shrinks `bounds`), so a zoomed Duo still
///   counts.
/// - The hardware model identifier (`utsname.machine`; the simulated model's
///   `SIMULATOR_MODEL_IDENTIFIER` on the simulator) scopes the remembered hinge
///   to this hardware model, so a Duo's backup restored onto an ordinary
///   iPhone does not make that iPhone rotate. The memory is never deleted.
enum NemuDeviceInfo {
  /// Wider than any ordinary iPhone display (440 pt), narrower than the
  /// iPhone Duo's outer display (466 pt).
  static let foldableMinimumShortSide: CGFloat = 460

  /// The hardware model identifier ("iPhone18,2"); the simulated model on the
  /// simulator. Empty when unavailable.
  static let modelIdentifier: String = {
    if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !simulated.isEmpty {
      return simulated
    }
    var info = utsname()
    guard uname(&info) == 0 else { return "" }
    let machine = info.machine
    return withUnsafeBytes(of: machine) { raw in
      String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
    }
  }()

  private static let rememberedModelKey = "pm.nemu.device.foldable-model"
  /// Written by builds before the model was remembered; read only when no
  /// model is remembered. Never deleted.
  private static let legacyFoldableKey = "pm.nemu.orientation-gate.foldable"

  /// A hinge reported on this hardware model (this launch or an earlier one).
  static var rememberedFoldable: Bool {
    let defaults = UserDefaults.standard
    if let model = defaults.string(forKey: rememberedModelKey) {
      return !model.isEmpty && model == modelIdentifier
    }
    return defaults.bool(forKey: legacyFoldableKey)
  }

  /// Remembers that this hardware model is foldable.
  static func rememberFoldable() {
    let defaults = UserDefaults.standard
    if !modelIdentifier.isEmpty {
      defaults.set(modelIdentifier, forKey: rememberedModelKey)
    }
    defaults.set(true, forKey: legacyFoldableKey)
  }

  /// Whether `screen` is a foldable iPhone's display: true or false for a
  /// phone, false elsewhere (iPad, Mac), nil while nothing is known (no
  /// screen, or one not laid out yet).
  @MainActor static func screenIsFoldable(_ screen: UIScreen?) -> Bool? {
    guard UIDevice.current.userInterfaceIdiom == .phone else { return false }
    guard let screen else { return nil }
    let size = screen.bounds.size
    guard size.width > 0, size.height > 0 else { return nil }
    var shortSide = min(size.width, size.height)
    let scale = screen.scale
    if scale > 0 {
      let native = screen.nativeBounds.size
      shortSide = max(shortSide, min(native.width, native.height) / scale)
    }
    return shortSide >= foldableMinimumShortSide
  }

  /// `screenIsFoldable` for every screen the app's scenes are on: true if any
  /// is a foldable's display, nil when no scene has a screen yet.
  @MainActor static func connectedScreensAreFoldable() -> Bool? {
    var answer: Bool?
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      guard let foldable = screenIsFoldable(scene.screen) else { continue }
      if foldable { return true }
      answer = false
    }
    return answer
  }
}
