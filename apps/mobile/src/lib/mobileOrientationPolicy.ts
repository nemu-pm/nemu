import type { MobileWindowLayout } from "@/lib/mobileWindowLayout";

/**
 * App orientation policy (owner decision 2026-10-15):
 *
 * - An ordinary iPhone is portrait everywhere (Library, Browse, Search,
 *   Settings, the reader). Info.plist cannot say so: the iPhone Duo is an
 *   iPhone too, and it keeps rotating.
 * - iPhone Duo and iPad rotate on every screen. The reader alone stays
 *   portrait on the Duo outer display (nobody reads sideways on a
 *   phone-sized display) and wherever the reader's Orientation Lock is on.
 * - The Duo inner display ignores orientation requests (Apple: "doesn't
 *   honor your supported interface orientations"), so a lock there is a
 *   request the system may refuse; no layout depends on it.
 *
 * "Foldable" is a capability read from the window observer (a hinge status
 * or a fold region), never a model string. The observer only learns the
 * hinge after `UIHingeInteraction` reports, so an iPhone is only called a
 * phone once the observer has reported for `MOBILE_FOLDABLE_PROBE_MS`
 * without either; a foldable seen once stays foldable for the session.
 *
 * Pure decisions; `MobileOrientationController` applies them.
 */

export type MobileDeviceFormFactor = "phone" | "foldable" | "tablet" | "unknown";

/** How long the window observer may stay silent about a hinge before the device counts as an ordinary phone. */
export const MOBILE_FOLDABLE_PROBE_MS = 600;

export function mobileLayoutShowsFold(layout: Pick<MobileWindowLayout, "hinge" | "divisions"> | null | undefined): boolean {
  if (!layout) return false;
  return layout.hinge != null || (layout.divisions?.length ?? 0) > 0;
}

export function mobileDeviceFormFactor(input: {
  platform: string;
  isPad: boolean;
  /** The app window's observer layout; null before its first report. */
  layout: MobileWindowLayout | null;
  previous: MobileDeviceFormFactor;
  /** The observer has reported for at least `MOBILE_FOLDABLE_PROBE_MS`. */
  probeElapsed: boolean;
}): MobileDeviceFormFactor {
  // Android keeps its own behaviour: the reader's switch only.
  if (input.platform !== "ios") return "unknown";
  if (input.isPad) return "tablet";
  if (input.previous === "foldable" || mobileLayoutShowsFold(input.layout)) return "foldable";
  if (input.previous === "phone") return "phone";
  if (!input.layout) return "unknown";
  // Before iOS 27.1 there are no region APIs and no foldable iPhone.
  if (!input.layout.supported) return "phone";
  return input.probeElapsed ? "phone" : "unknown";
}

/** Longer than the iPhone Duo outer display's long side (678pt), shorter than the inner one's (951pt). */
const MOBILE_OUTER_DISPLAY_MAX_LENGTH = 800;

/**
 * A window on the iPhone Duo inner display. A closed hinge is the outer
 * display; fully open, or a reported fold region, the inner one. Partly open
 * with no fold region is either tent (the outer display) or the inner display
 * whose region has not reported (iOS 27.1 reports none while it is flat, and
 * may not yet while it folds): the window's size tells them apart.
 */
export function mobileWindowOnInnerDisplay(
  layout: Partial<Pick<MobileWindowLayout, "hinge" | "divisions" | "width" | "height">>,
): boolean {
  if (layout.hinge === "closed") return false;
  if (layout.hinge === "fullyOpen" || (layout.divisions?.length ?? 0) > 0) return true;
  // No hinge (an ordinary phone, or before the hinge reports): not a fold.
  if (layout.hinge !== "partiallyOpen") return false;
  return Math.max(layout.width ?? 0, layout.height ?? 0) > MOBILE_OUTER_DISPLAY_MAX_LENGTH;
}

/**
 * The reader sits on a phone-sized display: an ordinary iPhone, or the
 * folded Duo (its outer display). Read from the reader's own window, so it
 * changes the moment the device folds or unfolds.
 */
export function mobileReaderOnPhoneSizedDisplay(input: {
  formFactor: MobileDeviceFormFactor;
  layout: Pick<MobileWindowLayout, "hinge" | "divisions" | "fillsScreen" | "width" | "height"> | null | undefined;
}): boolean {
  if (input.formFactor === "phone") return true;
  if (input.formFactor !== "foldable" || !input.layout) return false;
  if (input.layout.hinge === "closed") return true;
  // Split View on the inner display is not the outer display.
  if (input.layout.fillsScreen === false) return false;
  return !mobileWindowOnInnerDisplay(input.layout);
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
 * What the reader asks of the app while it is on screen: portrait on a
 * phone-sized display. Its Orientation Lock elsewhere (iPad, the Duo's inner
 * display) keeps the orientation the scene has, as the system's Orientation
 * Lock does; iOS 27 refuses a forced orientation there (a resizable scene's
 * supported orientations are only a preference). A binary without the scene
 * lock falls back to the portrait request.
 */
export function mobileReaderOrientationRequest(input: {
  phoneSizedDisplay: boolean;
  userLock: boolean;
  sceneLockAvailable: boolean;
}): { portrait: boolean; keepOrientation: boolean } {
  if (input.phoneSizedDisplay) return { portrait: true, keepOrientation: false };
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
 * transition. Releasing the reader's portrait (Back) waits for the pop to
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
