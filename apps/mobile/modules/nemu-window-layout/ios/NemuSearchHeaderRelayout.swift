import UIKit

/// Keeps a navigation bar that hosts a search field as tall as the field
/// after a live text-size change.
///
/// The header search field picks up a new text size a moment after
/// `UIContentSizeCategory.didChangeNotification`, but a navigation bar on a
/// pushed page (source home) keeps its old height: the safe area and the
/// page's adjusted content inset never follow, so the field grows over the
/// first row (or leaves a gap above it after shrinking) until the page is
/// reopened. Laying the bar out again once the field has resized makes it
/// measure the field; UIKit then moves a page resting at the top to its new
/// rest position itself, and a scrolled page keeps its offset.
enum NemuSearchHeaderRelayout {
  private static var installed = false

  @MainActor static func install() {
    guard !installed else { return }
    installed = true
    NotificationCenter.default.addObserver(
      forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main
    ) { _ in
      // Once now and again after the field has taken its new size.
      for delay in [0.0, 0.15, 0.4] {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
          MainActor.assumeIsolated { relayoutAll() }
        }
      }
    }
  }

  @MainActor private static func relayoutAll() {
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows {
        if let root = window.rootViewController { relayout(in: root) }
      }
    }
  }

  @MainActor private static func relayout(in controller: UIViewController) {
    if let nav = controller as? UINavigationController,
       nav.topViewController?.navigationItem.searchController != nil,
       nav.viewIfLoaded?.window != nil {
      let bar = nav.navigationBar
      bar.setNeedsLayout()
      bar.invalidateIntrinsicContentSize()
      bar.layoutIfNeeded()
      nav.view.setNeedsLayout()
      nav.view.layoutIfNeeded()
    }
    for child in controller.children { relayout(in: child) }
    if let presented = controller.presentedViewController,
       presented.presentingViewController === controller {
      relayout(in: presented)
    }
  }
}
