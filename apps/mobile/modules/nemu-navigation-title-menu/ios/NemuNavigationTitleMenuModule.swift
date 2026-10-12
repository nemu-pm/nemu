import ExpoModulesCore
import LinkPresentation
import UIKit

/// One row of the title menu.
struct NemuTitleMenuItemRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var subtitle: String? = nil
  @Field var systemImage: String? = nil
  @Field var checked: Bool = false
  @Field var disabled: Bool = false
  @Field var destructive: Bool = false
}

/// A group of rows, drawn as an inline section (separated by a divider).
struct NemuTitleMenuSectionRecord: Record {
  @Field var id: String = ""
  @Field var title: String? = nil
  @Field var items: [NemuTitleMenuItemRecord] = []
}

/// The menu's header (`UINavigationItem.documentProperties`): icon + name, as
/// in Files' folder title menu.
struct NemuTitleMenuHeaderRecord: Record {
  @Field var title: String = ""
  @Field var systemImage: String? = nil
  @Field var tintColor: UIColor? = nil
}

public final class NemuNavigationTitleMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NemuNavigationTitleMenu")
    // Lets JS tell a binary with this view from one built before it.
    Constant("titleMenuAvailable") { true }
    View(NemuNavigationTitleMenuView.self) {
      Events("onSelectAction")
      Prop("sections") { (view: NemuNavigationTitleMenuView, sections: [NemuTitleMenuSectionRecord]) in
        view.sections = sections
      }
      Prop("header") { (view: NemuNavigationTitleMenuView, header: NemuTitleMenuHeaderRecord?) in
        view.header = header
      }
    }
  }
}

/// A hidden view that gives the react-native-screens screen hosting it a
/// UIKit title menu: `UINavigationItem.titleMenuProvider` (iOS 16+). UIKit then
/// draws the system chevron beside the navigation title and opens the menu
/// from the title, like Files' folder menu. react-native-screens 4.x exposes
/// no title menu of its own; its header config never touches
/// `titleMenuProvider` / `documentProperties`, so what this view sets survives
/// header updates.
///
/// The owning screen is the first view controller on the responder chain (the
/// `RNSScreen`). The provider reads the latest `sections` each time the menu
/// opens. Ownership is tracked per controller, so when a screen swaps one
/// instance for another (a branch change mounts the new view before the old
/// one leaves) the leaving view never clears the newcomer's menu.
final class NemuNavigationTitleMenuView: ExpoView {
  let onSelectAction = EventDispatcher()

  var sections: [NemuTitleMenuSectionRecord] = [] {
    didSet { attach() }
  }

  var header: NemuTitleMenuHeaderRecord? = nil {
    didSet { applyHeader() }
  }

  private weak var owner: UIViewController?
  private var retryScheduled = false

  /// Controller → the view currently owning its title menu.
  private static let owners = NSMapTable<UIViewController, NemuNavigationTitleMenuView>.weakToWeakObjects()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    isHidden = true
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    if superview == nil {
      detach()
    } else {
      attach()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Keep the menu while the screen is covered (a push removes its view from
    // the window), so the title still has its chevron during the pop back.
    guard window != nil else { return }
    attach()
    // react-native-screens attaches a new screen's controller after the view
    // hierarchy mounts; re-check once that has settled.
    scheduleRetry()
  }

  deinit {
    let owner = self.owner
    let identity = ObjectIdentifier(self)
    MainActor.assumeIsolated {
      guard let owner,
            let current = Self.owners.object(forKey: owner),
            ObjectIdentifier(current) == identity
      else { return }
      Self.clear(owner)
    }
  }

  private func scheduleRetry() {
    guard !retryScheduled else { return }
    retryScheduled = true
    for delay in [0.05, 0.35] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self else { return }
        if delay == 0.35 { self.retryScheduled = false }
        if self.superview != nil { self.attach() }
      }
    }
  }

  private func owningScreen() -> UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController { return controller }
      responder = next
    }
    return nil
  }

  private func attach() {
    guard superview != nil, let controller = owningScreen() else { return }
    if let previous = owner, previous !== controller { detach() }
    owner = controller
    let alreadyOwned = Self.owners.object(forKey: controller) === self
    Self.owners.setObject(self, forKey: controller)
    if sections.isEmpty {
      controller.navigationItem.titleMenuProvider = nil
    } else if !alreadyOwned || controller.navigationItem.titleMenuProvider == nil {
      // Reassigned only on a change of owner, so prop updates never rebuild
      // the title view (the closure reads `sections` when the menu opens).
      controller.navigationItem.titleMenuProvider = { [weak self] suggested in
        // A provider that returns nil shows no menu; fall back to UIKit's
        // suggestions only if this view is gone.
        self?.makeMenu() ?? UIMenu(children: suggested)
      }
    }
    applyHeader()
  }

  private func detach() {
    guard let controller = owner else { return }
    owner = nil
    guard Self.owners.object(forKey: controller) === self else { return }
    Self.clear(controller)
  }

  private static func clear(_ controller: UIViewController) {
    owners.removeObject(forKey: controller)
    controller.navigationItem.titleMenuProvider = nil
    controller.navigationItem.documentProperties = nil
  }

  private func applyHeader() {
    guard let controller = owner, Self.owners.object(forKey: controller) === self else { return }
    guard let header, !header.title.isEmpty else {
      controller.navigationItem.documentProperties = nil
      return
    }
    let metadata = LPLinkMetadata()
    metadata.title = header.title
    if let name = header.systemImage,
       let image = Self.headerIcon(named: name, tint: header.tintColor, traits: controller.traitCollection) {
      // The header draws the provider's bitmap as-is (a template symbol comes
      // out as a blank tile), so render the symbol in colour first.
      metadata.iconProvider = NSItemProvider(object: image)
    }
    controller.navigationItem.documentProperties = UIDocumentProperties(metadata: metadata)
  }

  /// A full-bleed tile (tint fill, white symbol). The header draws the
  /// provider's bitmap on a white thumbnail backdrop, so a bare template
  /// symbol came out blank and a transparent one sat on a white square in
  /// dark mode; filling the whole bitmap keeps the tile in the app colour.
  private static func headerIcon(named name: String, tint: UIColor?, traits: UITraitCollection) -> UIImage? {
    let side: CGFloat = 120
    let configuration = UIImage.SymbolConfiguration(pointSize: 54, weight: .medium)
    guard let symbol = UIImage(systemName: name, withConfiguration: configuration) else { return nil }
    let fill = (tint ?? .systemBlue).resolvedColor(with: traits)
    let glyph = symbol.withTintColor(.white, renderingMode: .alwaysOriginal)
    let format = UIGraphicsImageRendererFormat()
    format.opaque = true
    format.scale = 1
    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
      fill.setFill()
      context.fill(CGRect(x: 0, y: 0, width: side, height: side))
      glyph.draw(in: CGRect(
        x: (side - symbol.size.width) / 2,
        y: (side - symbol.size.height) / 2,
        width: symbol.size.width,
        height: symbol.size.height
      ))
    }
  }

  private func makeMenu() -> UIMenu {
    let children: [UIMenuElement] = sections.map { section in
      let actions: [UIMenuElement] = section.items.map { item in
        var attributes: UIMenuElement.Attributes = []
        if item.disabled { attributes.insert(.disabled) }
        if item.destructive { attributes.insert(.destructive) }
        let image = item.systemImage.flatMap { UIImage(systemName: $0) }
        let id = item.id
        let action = UIAction(
          title: item.title,
          subtitle: item.subtitle,
          image: image,
          identifier: UIAction.Identifier("pm.nemu.title-menu.\(id)"),
          attributes: attributes,
          state: item.checked ? .on : .off
        ) { [weak self] _ in
          self?.onSelectAction(["id": id])
        }
        return action
      }
      return UIMenu(title: section.title ?? "", options: .displayInline, children: actions)
    }
    return UIMenu(title: "", children: children)
  }
}
