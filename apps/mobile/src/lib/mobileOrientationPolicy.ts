import type { MobileWindowLayout } from "@/lib/mobileWindowLayout";

/**
 * App orientation policy (owner decision 2026-10-15):
 *
 * - An ordinary iPhone is portrait everywhere (Library, Browse, Search,
 *   Settings, the reader). Info.plist cannot say so: the iPhone Duo is an
 *   iPhone too, and it keeps rotating.
 * - iPhone Duo and iPad rotate on every screen, the reader included, on
 *   both Duo displays (owner decision 2026-10-19: the outer display has no
 *   special restriction). Only the reader's Orientation Lock holds it.
 * - The Duo inner display ignores orientation requests (Apple: "doesn't
 *   honor your supported interface orientations"), so a lock there is a
 *   request the system may refuse; no layout depends on it.
 *
 * "Foldable" is decided from what the system says about the device, not a
 * timeout (product rule, 2026-10-27): the window-layout module reports
 * `foldableDevice` (native `NemuDeviceInfo`: the display is wider than any
 * ordinary iPhone's, or a hinge reported or is remembered for this hardware
 * model) both as a constant read at load and on every observer snapshot. A
 * hinge or fold region reported at any time also makes the device foldable,
 * and a foldable stays foldable for the session. A window wider than any
 * phone is never a phone. Only a binary without `foldableDevice` falls back
 * to `MOBILE_FOLDABLE_PROBE_MS` of silence, and even then never on a window
 * wider than a phone.
 *
 * Pure decisions; `MobileOrientationController` applies them.
 */

export type MobileDeviceFormFactor = "phone" | "foldable" | "tablet" | "unknown";

/**
 * Last-resort fallback for binaries that do not report `foldableDevice`: how
 * long the window observer may stay silent about a hinge before a
 * phone-sized window counts as an ordinary phone.
 */
export const MOBILE_FOLDABLE_PROBE_MS = 600;

/**
 * Wider than any ordinary iPhone in either orientation (Pro Max: 440pt),
 * narrower than both iPhone Duo displays (outer 466pt, inner 669pt). Matches
 * native `NemuDeviceInfo.foldableMinimumShortSide`.
 */
export const MOBILE_PHONE_MAX_SHORT_SIDE = 460;

export function mobileLayoutShowsFold(layout: Partial<Pick<MobileWindowLayout, "hinge" | "divisions">> | null | undefined): boolean {
  if (!layout) return false;
  return layout.hinge != null || (layout.divisions?.length ?? 0) > 0;
}

/** The window is wider (short side) than any ordinary iPhone's display. */
export function mobileWindowWiderThanPhone(layout: Partial<Pick<MobileWindowLayout, "width" | "height">>): boolean {
  return Math.min(layout.width ?? 0, layout.height ?? 0) > MOBILE_PHONE_MAX_SHORT_SIDE;
}

export function mobileDeviceFormFactor(input: {
  platform: string;
  isPad: boolean;
  /** The app window's observer layout; null before its first report. */
  layout: MobileWindowLayout | null;
  previous: MobileDeviceFormFactor;
  /**
   * The window-layout module's synchronous `isFoldableDevice` constant;
   * undefined on binaries without it. Only `true` is trusted on its own: it
   * may be read before the display is known.
   */
  nativeFoldable?: boolean;
  /** The observer has reported for at least `MOBILE_FOLDABLE_PROBE_MS` (fallback only). */
  probeElapsed: boolean;
}): MobileDeviceFormFactor {
  // Android keeps its own behaviour: the reader's switch only.
  if (input.platform !== "ios") return "unknown";
  if (input.isPad) return "tablet";
  const layout = input.layout;
  if (
    input.previous === "foldable" ||
    input.nativeFoldable === true ||
    layout?.foldableDevice === true ||
    mobileLayoutShowsFold(layout)
  ) {
    return "foldable";
  }
  if (!layout) return input.previous === "phone" ? "phone" : "unknown";
  // No ordinary iPhone has a window this wide: never hold it portrait.
  if (mobileWindowWiderThanPhone(layout)) return "unknown";
  if (input.previous === "phone") return "phone";
  // The native module read the window's display: an ordinary iPhone's.
  if (layout.foldableDevice === false) return "phone";
  // Before iOS 27.1 there are no region APIs and no foldable iPhone.
  if (!layout.supported) return "phone";
  // A binary that does not report the device: the old hinge timeout.
  if (layout.foldableDevice === undefined && input.probeElapsed) return "phone";
  return "unknown";
}

/** Longer than the iPhone Duo outer display's long side (678pt), shorter than the inner one's (951pt). */
const MOBILE_OUTER_DISPLAY_MAX_LENGTH = 800;

/**
 * A window on the iPhone Duo inner display. A closed hinge is the outer
 * display; fully open, or a reported fold region, the inner one. Partly open
 * with no fold region is either tent (the outer display) or the inner display
 * whose region has not reported (iOS 27.1 reports none while it is flat, and
 * may not yet while it folds): the window's size tells them apart. Before the
 * hinge reports (a cold launch can take longer than expected) the size does
 * too, unless the device is known not to be foldable; with the device
 * unknown, also only when the window is wider than any phone (a Pro Max is
 * longer than 800pt).
 */
export function mobileWindowOnInnerDisplay(
  layout: Partial<Pick<MobileWindowLayout, "hinge" | "divisions" | "width" | "height" | "foldableDevice">>,
): boolean {
  if (layout.hinge === "closed") return false;
  if (layout.hinge === "fullyOpen" || (layout.divisions?.length ?? 0) > 0) return true;
  const long = Math.max(layout.width ?? 0, layout.height ?? 0) > MOBILE_OUTER_DISPLAY_MAX_LENGTH;
  if (layout.hinge === "partiallyOpen") return long;
  // No hinge reported (yet).
  if (layout.foldableDevice === false) return false;
  if (layout.foldableDevice === true) return long;
  return long && mobileWindowWiderThanPhone(layout);
}

/**
 * Where the reader shows its Orientation Lock switch: everywhere but an
 * ordinary iPhone, which is portrait anyway. The iPhone Duo shows it on both
 * displays (owner decision 2026-10-16).
 */
export function mobileReaderOrientationLockAvailable(input: { formFactor: MobileDeviceFormFactor }): boolean {
  return input.formFactor !== "phone";
}

/**
 * What the reader asks of the app while it is on screen. Its Orientation Lock
 * (iPad, both Duo displays) keeps the orientation the scene has, as the
 * system's Orientation Lock does: on the Duo outer display the native gate
 * narrows the mask to that orientation; elsewhere iOS 27 refuses a forced
 * orientation (a resizable scene's supported orientations are only a
 * preference), so the scene's own lock applies. Without the lock the reader
 * rotates. A binary without the scene lock falls back to the portrait
 * request. An ordinary iPhone is portrait anyway (`mobileOrientationLock`).
 */
export function mobileReaderOrientationRequest(input: {
  userLock: boolean;
  sceneLockAvailable: boolean;
}): { portrait: boolean; keepOrientation: boolean } {
  if (!input.userLock) return { portrait: false, keepOrientation: false };
  return input.sceneLockAvailable
    ? { portrait: false, keepOrientation: true }
    : { portrait: true, keepOrientation: false };
}

/** The lock to apply now: "portrait" or the app's supported orientations. */
export function mobileOrientationLock(input: {
  formFactor: MobileDeviceFormFactor;
  readerWantsPortrait: boolean;
}): "portrait" | "default" {
  if (input.formFactor === "phone") return "portrait";
  return input.readerWantsPortrait ? "portrait" : "default";
}

/**
 * Whether applying `next` over `previous` waits for the running screen
 * transition. Releasing a reader lock (Back) waits for the pop to
 * finish: rotating the scene under it made react-native-screens commit the
 * new bounds inside the transition, which aborted the app on the iPhone Duo
 * outer display (Reanimated's layout-animation tree, UIKit's vertical bar
 * corners). Taking portrait (opening the reader) applies at once.
 */
export function mobileOrientationLockWaitsForTransition(
  previous: "portrait" | "default",
  next: "portrait" | "default",
): boolean {
  return previous === "portrait" && next === "default";
}
