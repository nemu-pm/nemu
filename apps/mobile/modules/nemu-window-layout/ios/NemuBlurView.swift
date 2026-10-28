import ExpoModulesCore
import UIKit

/// A blur at a partial intensity that always ends up with its effect applied.
///
/// UIKit has no intensity for `UIBlurEffect`; the usual way, as expo-blur's
/// `BlurView` does it, is a `UIViewPropertyAnimator` that animates the effect
/// in and is left paused at `fractionComplete = intensity`. expo-blur only
/// sets that up from `draw(_:)`, which UIKit skips for a view laid out at an
/// empty size or before it is on screen and does not call again when the
/// bounds change: on about half of the cold launches the Library's scroll
/// edge band (mounted with the first screen) was left with no effect at all,
/// so it drew nothing (iPhone Duo inner display, r6), while every band
/// mounted later blurred.
///
/// Here the effect is (re)applied whenever the view is in a window, has a
/// size and has no effect: on entering the window, on layout, on a trait
/// change, on a prop change and when the app becomes active. The animator
/// lives only while the view is in a window and is stopped (a paused animator
/// must never be released while active) when the view leaves it: UIKit always
/// takes a view out of its window before it goes away, so no deinit is needed.
/// On becoming active again the animator is rebuilt, since a paused animator
/// can come back from the background at the wrong fraction.
final class NemuBlurView: ExpoView {
  private let effectView = UIVisualEffectView(effect: nil)
  private var animator: UIViewPropertyAnimator?
  /// What the running animator was built for; a change rebuilds it.
  private var appliedStyle: UIBlurEffect.Style?
  private var appliedIntensity: Double?
  private var activeObserver: NSObjectProtocol?

  /// 0…100, as expo-blur's `intensity`.
  var intensity: Double = 50 {
    didSet { if intensity != oldValue { applyIfNeeded() } }
  }

  var style: UIBlurEffect.Style = .systemUltraThinMaterial {
    didSet { if style != oldValue { applyIfNeeded() } }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    isUserInteractionEnabled = false
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      tearDown()
      if let observer = activeObserver {
        NotificationCenter.default.removeObserver(observer)
        activeObserver = nil
      }
      return
    }
    if activeObserver == nil {
      activeObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.applyIfNeeded(rebuild: true) }
      }
    }
    applyIfNeeded()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    applyIfNeeded()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    applyIfNeeded()
  }

  /// Applies the effect when it is missing or was built for other props (or
  /// always, with `rebuild`). Only in a window and at a size: the state UIKit
  /// needs to render the blur.
  private func applyIfNeeded(rebuild: Bool = false) {
    guard window != nil, bounds.width > 0, bounds.height > 0 else { return }
    let current = effectView.effect != nil && animator != nil
      && appliedStyle == style && appliedIntensity == intensity
    if current && !rebuild { return }
    tearDown()
    let fraction = CGFloat(min(1, max(0.01, intensity / 100)))
    let effect = UIBlurEffect(style: style)
    let next = UIViewPropertyAnimator(duration: 1, curve: .linear) { [effectView] in
      effectView.effect = effect
    }
    next.pausesOnCompletion = true
    next.fractionComplete = fraction
    animator = next
    appliedStyle = style
    appliedIntensity = intensity
  }

  private func tearDown() {
    if let animator {
      animator.stopAnimation(true)
      self.animator = nil
    }
    effectView.effect = nil
    appliedStyle = nil
    appliedIntensity = nil
  }

  /// expo-blur's tint names (the ones the app uses, and their kin).
  static func style(named name: String) -> UIBlurEffect.Style {
    switch name {
    case "light": return .light
    case "dark": return .dark
    case "extraLight": return .extraLight
    case "regular", "default": return .regular
    case "prominent": return .prominent
    case "systemUltraThinMaterial": return .systemUltraThinMaterial
    case "systemThinMaterial": return .systemThinMaterial
    case "systemMaterial": return .systemMaterial
    case "systemThickMaterial": return .systemThickMaterial
    case "systemChromeMaterial": return .systemChromeMaterial
    case "systemUltraThinMaterialLight": return .systemUltraThinMaterialLight
    case "systemThinMaterialLight": return .systemThinMaterialLight
    case "systemMaterialLight": return .systemMaterialLight
    case "systemThickMaterialLight": return .systemThickMaterialLight
    case "systemChromeMaterialLight": return .systemChromeMaterialLight
    case "systemUltraThinMaterialDark": return .systemUltraThinMaterialDark
    case "systemThinMaterialDark": return .systemThinMaterialDark
    case "systemMaterialDark": return .systemMaterialDark
    case "systemThickMaterialDark": return .systemThickMaterialDark
    case "systemChromeMaterialDark": return .systemChromeMaterialDark
    default: return .systemUltraThinMaterial
    }
  }
}
