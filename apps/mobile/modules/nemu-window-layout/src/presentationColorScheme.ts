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
