import { createModifier, createModifierWithEventListener } from "@expo/ui/swift-ui/modifiers";

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

/**
 * `@expo/ui` modifier: `toolbar(.hidden, for: .navigationBar)` on a page in a
 * NavigationStack. A popover's root page keeps its bar-less look while the
 * pages pushed from it show the bar (title, system back). A binary built
 * before the modifier existed ignores it (an empty bar above the root).
 */
export function navigationBarHidden() {
  return createModifier("nemuNavigationBarHidden");
}

/**
 * Where a Form draws its groups, measured from the list's (safe-area) edges,
 * and the width between those edges (the page's content width).
 */
export type FormGroupInset = { left: number; right: number; width: number };

/**
 * `@expo/ui` modifier, on a row inside a Form: reports the Form's actual
 * inset-grouped margins (UIKit picks them from the width, size class and
 * safe area: 20pt on a Pro Max sheet, 16pt on the Duo's), so a React Native
 * page pushed beside the Form can set its groups on the same edges. A binary
 * built before the modifier existed never reports.
 */
export function reportFormGroupInset(handler: (inset: FormGroupInset) => void) {
  return createModifierWithEventListener("nemuReportFormGroupInset", (inset: FormGroupInset) => handler(inset));
}

/**
 * `@expo/ui` modifier, on a view in a NavigationStack page: reports the
 * page's content width (its hosting controller's view, inside the horizontal
 * safe area), whatever the view is sized to, on appearing and on every
 * resize (rotation) — also while the Form below the page is off screen. A
 * binary built before the modifier existed never reports.
 */
export function reportPageWidth(handler: (width: number) => void) {
  return createModifierWithEventListener("nemuReportPageWidth", (event: { width: number }) => handler(event.width));
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
  /**
   * The large detent stays available beside the fitted one: the user can
   * drag the sheet taller (and it stays there). Off below a fold.
   */
  expandable?: boolean;
}) {
  return createModifier("nemuFitSheetDetent", {
    group: options.group,
    page: options.page,
    initialHeight: options.initialHeight ?? 0,
    height: options.height ?? 0,
    expandable: options.expandable ?? false,
  });
}

/**
 * On each Form of a `fitSheetDetentToContent()` sheet: which measured page it
 * is, so the sheet takes that page's height when the Form appears.
 */
/**
 * On a popover's Form: its ideal size is `width` × the height its off-screen
 * copy measured (`measureSheetPage`, same `group` / `page`; the copy at the
 * popover's width). The system shows the popover whole when there is room
 * and caps it otherwise, the Form scrolling from its top. `initialHeight`
 * until the copy has measured.
 */
export function fitPopoverToContent(options: { group: string; page: string; width: number; initialHeight: number }) {
  return createModifier("nemuFitPopoverToContent", options);
}

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
