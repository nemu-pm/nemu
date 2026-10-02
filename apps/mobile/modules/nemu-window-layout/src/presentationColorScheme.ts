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
 * On a sheet's root (the `Group` inside `BottomSheet`): one presentation
 * detent as tall as the sheet's page on screen, from the heights measured by
 * that page's off-screen copy (`measureSheetPage`, same `group`) — known
 * before the sheet presents, so UIKit presents it once, natively, at its
 * final height (a sheet that measured its own Form could only resize after
 * its presentation had started: a second, visible jump). `page` is the page
 * on top when it opens; a Form marked `reportSheetContentHeight({ page })`
 * takes over as it appears (push / pop), resizing the sheet with the system's
 * sheet animation. Taller than the screen, the system caps the detent and
 * the Form scrolls. Unmeasured (iOS < 18), the detent is `initialHeight`
 * when given, else `.medium`. Replaces `presentationDetents` there. A binary
 * built before the modifier existed ignores it (a full-height sheet).
 */
export function fitSheetDetentToContent(options: {
  group: string;
  page: string;
  initialHeight?: number;
  /**
   * The detent itself, for a sheet whose pages are React Native views the
   * caller measured off screen before presenting (no SwiftUI copies, no
   * `reportSheetContentHeight`): the sheet presents once at this height and
   * a new value resizes it with the system's sheet animation. 0 / omitted:
   * the measured store decides.
   */
  height?: number;
}) {
  return createModifier("nemuFitSheetDetent", {
    group: options.group,
    page: options.page,
    initialHeight: options.initialHeight ?? 0,
    height: options.height ?? 0,
  });
}

/**
 * On each Form of a `fitSheetDetentToContent()` sheet: which measured page it
 * is, so the sheet takes that page's height when the Form appears.
 */
export function reportSheetContentHeight(options: { page: string }) {
  return createModifier("nemuReportSheetContentHeight", { page: options.page });
}

/**
 * On the off-screen copy of a `fitSheetDetentToContent()` sheet's page (a
 * Form with the page's rows and spacing, outside any presentation): lays it
 * out invisibly at the sheet's `width` and `height` (the window's height, so
 * every row of a page that fits on screen is laid out) and records its
 * content height for `group` / `page`. Keep the copy free of presentation
 * modifiers (`presentationColorScheme` would restyle the window).
 */
export function measureSheetPage(options: { group: string; page: string; width: number; height: number }) {
  return createModifier("nemuMeasureSheetPage", options);
}
