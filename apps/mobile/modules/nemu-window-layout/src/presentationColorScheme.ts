import { createModifier } from "@expo/ui/swift-ui/modifiers";

/**
 * `@expo/ui` modifier: SwiftUI `preferredColorScheme` for the presentation
 * (popover, sheet) enclosing the content it is applied to. The system
 * container — material / Liquid Glass, grabber, dimming — and the content's
 * text then resolve from this one appearance, so they can never disagree
 * (an `environment("colorScheme")` or `Host colorScheme` only restyles the
 * content, leaving white text on a light system popover). Put it on the
 * presented root (the sheet's / popover's content). A binary built before
 * the modifier existed ignores it.
 */
export function presentationColorScheme(scheme: "light" | "dark") {
  return createModifier("nemuPresentationColorScheme", { colorScheme: scheme });
}

/**
 * `@expo/ui` modifier: `toolbarTitleDisplayMode(.inline)` for a sheet's root
 * view inside a NavigationStack, so no empty large-title row sits between the
 * bar and the Form. A binary built before the modifier existed ignores it.
 */
export function inlineToolbarTitle() {
  return createModifier("nemuInlineToolbarTitle");
}

/** Remove the grouped Form's extra top scroll-content margin below its toolbar. */
export function zeroTopScrollContentMargin() {
  return createModifier("nemuZeroTopScrollContentMargin");
}

/**
 * On a sheet's root (the `Group` inside `BottomSheet`): a single presentation
 * detent sized to the content of the Form on screen, reported by
 * `reportSheetContentHeight()` on each Form of the sheet (sub-pages pushed in
 * its NavigationStack included). Taller than the screen, the system caps the
 * detent and the Form scrolls. `initialHeight` is the detent until the first
 * measurement arrives (and on iOS < 18); omitted, it is `.large`. Replaces
 * `presentationDetents` there. A binary built before the modifier existed
 * ignores it (a full-height sheet).
 */
export function fitSheetDetentToContent(options: { initialHeight?: number } = {}) {
  return createModifier("nemuFitSheetDetent", { initialHeight: options.initialHeight ?? 0 });
}

/** On each Form of a `fitSheetDetentToContent()` sheet, see there. */
export function reportSheetContentHeight() {
  return createModifier("nemuReportSheetContentHeight");
}
