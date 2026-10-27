import type { MobileCoverRgb } from "./mobileCoverTint";
import { mobileLayoutShowsFold, mobileWindowOnInnerDisplay } from "./mobileOrientationPolicy";
import type { MobileWindowLayout } from "./mobileWindowLayout";

/**
 * Show Cover on Outer Display (iPhone Duo): while the reader is open on the
 * inner display, the outer display shows the book's cover. iOS only presents
 * that content (a camera capture scene accessory) while a capture session
 * runs, so the reader keeps a minimal session running for it
 * (`modules/nemu-outer-cover`). Pure decisions; ReaderScreen applies them.
 */

/** No cover colour known: the outer display is black. */
export const MOBILE_OUTER_COVER_FALLBACK_BACKGROUND = "#000000";

/**
 * Where the reader settings show the toggle: a binary built with the iOS
 * 27.1+ SDK running on iOS 27.1+ (`isOuterCoverSupported`), on a device whose
 * window layout reports a hinge or a fold region (the window-layout module's
 * `UIHingeInteraction` report — the iPhone Duo). Every other device, OS and
 * platform never sees it.
 */
export function mobileOuterCoverToggleVisible(input: {
  nativeSupported: boolean;
  layout: Pick<MobileWindowLayout, "hinge" | "divisions"> | null | undefined;
}): boolean {
  return input.nativeSupported && mobileLayoutShowsFold(input.layout);
}

export type MobileOuterCoverAppState = "active" | "inactive" | "background" | "unknown" | "extension";

/**
 * Whether the camera runs and the cover is offered right now: the toggle is
 * on, the reader is the focused full-screen screen, the app is in the
 * foreground and the device is open on the inner display. `inactive` still
 * counts as foreground: folding and unfolding pass through it (and Control
 * Center / a system alert over the reader); only `background` stops it.
 * A closed device (outer display), tent pose or unknown posture never runs.
 */
export function shouldRunMobileOuterCover(input: {
  toggleVisible: boolean;
  enabled: boolean;
  readerFocused: boolean;
  appState: MobileOuterCoverAppState | string;
  layout: Partial<Pick<MobileWindowLayout, "hinge" | "divisions" | "width" | "height" | "fillsScreen">>;
}): boolean {
  if (!input.toggleVisible || !input.enabled || !input.readerFocused) return false;
  if (input.appState === "background" || input.appState === "unknown" || input.appState === "extension") return false;
  // Split View / a resizable window is not full-screen reading.
  if (input.layout.fillsScreen === false) return false;
  // The camera only runs on a reported posture: before the hinge reports,
  // the window size alone (enough for layout) does not start it.
  if (!mobileLayoutShowsFold(input.layout)) return false;
  return mobileWindowOnInnerDisplay(input.layout);
}

/**
 * The outer display's background: the cover-derived colour (the tint the
 * app's cover surfaces already sample, `useMobileCoverTint`) as `#RRGGBB`,
 * else black.
 */
export function mobileOuterCoverBackgroundColor(tint: MobileCoverRgb | null | undefined): string {
  if (!tint) return MOBILE_OUTER_COVER_FALLBACK_BACKGROUND;
  const channels = [tint.r, tint.g, tint.b];
  if (!channels.every((value) => Number.isFinite(value))) return MOBILE_OUTER_COVER_FALLBACK_BACKGROUND;
  return `#${channels
    .map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** What turning the toggle on does with the camera permission answer. */
export function mobileOuterCoverAfterCameraAccess(
  access: "granted" | "denied" | "restricted" | "undetermined",
): { enabled: boolean; deniedNote: boolean } {
  return access === "granted" ? { enabled: true, deniedNote: false } : { enabled: false, deniedNote: true };
}
