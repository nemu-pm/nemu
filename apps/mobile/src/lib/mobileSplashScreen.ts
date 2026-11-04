export type MobileSplashScreenState = {
  rootLaidOut: boolean;
  splashHidden: boolean;
  /**
   * The first screen has committed its first local snapshot (the Library's
   * SQLite read: content, the empty state or an error), or the launch opened
   * somewhere that has nothing to wait for. Never network-bound.
   */
  contentReady: boolean;
  /**
   * Nothing on the first screen still waits for a layout input that arrives
   * after the first frame (`holdMobileLaunchLayout`).
   */
  layoutSettled: boolean;
};

/**
 * The launch screen stays up until the first frame under it is final: the
 * root has laid out, the first screen shows its local data and its layout
 * has settled, so the app never reveals a blank page, a skeleton that the
 * data then replaces, or a page that moves once its geometry arrives.
 */
export function shouldHideMobileSplashScreen({
  rootLaidOut,
  splashHidden,
  contentReady,
  layoutSettled,
}: MobileSplashScreenState): boolean {
  return rootLaidOut && contentReady && layoutSettled && !splashHidden;
}

/**
 * The longest the launch screen stays up, counted from JS start
 * (`startMobileSplashSafetyCap`, called from the entry module): past it the
 * app shows whatever it has. A stuck read, a slow migration or a provider that
 * has not mounted the root yet must never hold the launch screen.
 */
export const MOBILE_SPLASH_CONTENT_TIMEOUT_MS = 2500;

let safetyCapTimer: ReturnType<typeof setTimeout> | null = null;
let safetyCapExpired = false;
let splashHideClaimed = false;
let forceHideSplash: (() => void) | null = null;

let launchContentReady = false;
const launchContentListeners = new Set<() => void>();
const launchLayoutHolds = new Set<object>();

function notifyLaunchListeners(): void {
  for (const listener of [...launchContentListeners]) listener();
}

function releaseLaunchContent(): void {
  if (launchContentReady) return;
  launchContentReady = true;
  notifyLaunchListeners();
}

/**
 * Holds the launch screen while something on the first screen still waits
 * for a layout input that UIKit only reports after the first frame: the
 * window's own geometry (the Duo's outer display puts the tabs on a rail, so
 * until it reports the page lays out for a bottom tab bar) or a page's
 * observed bar insets (an empty page sized to its viewport). Revealing before
 * they arrive showed the page in its estimated place and then moved it.
 * Returns the release; a no-op once the launch screen is lifted, and the
 * safety cap releases every hold.
 */
export function holdMobileLaunchLayout(): () => void {
  if (splashHideClaimed || safetyCapExpired) return () => undefined;
  const hold = {};
  launchLayoutHolds.add(hold);
  return () => {
    if (!launchLayoutHolds.delete(hold)) return;
    if (launchLayoutHolds.size === 0) notifyLaunchListeners();
  };
}

export function isMobileLaunchLayoutSettled(): boolean {
  return launchLayoutHolds.size === 0;
}

/**
 * The first screen calls this once its first local snapshot is on screen.
 *
 * The launch screen does not also wait for the covers under it: a cover's
 * `onLoad` reaches JS only when the main run loop next goes idle (Fabric
 * dispatches events then), so it trails the native draw by a beat, and while
 * UIKit is busy at launch (the Duo's tab rail repair, inner landscape) by
 * longer than any cap. Covers whose bytes are local are drawn natively as
 * they decode, without a fade of their own (MobileCachedImage), behind the
 * Library's reveal veil.
 */
export function markMobileLaunchContentReady(): void {
  releaseLaunchContent();
}

function expireSafetyCap(): void {
  safetyCapTimer = null;
  safetyCapExpired = true;
  const heldLayout = launchLayoutHolds.size > 0;
  launchLayoutHolds.clear();
  // Listeners run synchronously: a root that has laid out claims the hide
  // here and runs its normal reveal.
  if (heldLayout && launchContentReady) notifyLaunchListeners();
  releaseLaunchContent();
  if (!splashHideClaimed && forceHideSplash) {
    splashHideClaimed = true;
    forceHideSplash();
  }
}

/**
 * Starts the launch screen's safety cap. Called once from the JS entry, so it
 * counts from JS start rather than from when the root stack mounts (which is
 * after the profile, the database and the settings have loaded). `startedAt`
 * is the JS start time if the caller knows an earlier one. Idempotent.
 */
export function startMobileSplashSafetyCap(startedAt: number = Date.now()): void {
  if (safetyCapTimer || safetyCapExpired) return;
  const remaining = Math.max(0, MOBILE_SPLASH_CONTENT_TIMEOUT_MS - (Date.now() - startedAt));
  safetyCapTimer = setTimeout(expireSafetyCap, remaining);
}

/**
 * How the cap lifts the launch screen when the root has not taken over the
 * hide by then (registered by the root layout module; a headless background
 * launch never registers one). Runs at once if the cap already expired.
 */
export function registerMobileSplashForceHide(hide: () => void): void {
  forceHideSplash = hide;
  if (safetyCapExpired && !splashHideClaimed) {
    splashHideClaimed = true;
    hide();
  }
}

/**
 * The root's reveal and the cap's forced hide each lift the launch screen at
 * most once between them: true for the first claimant only.
 */
export function claimMobileSplashHide(): boolean {
  if (splashHideClaimed) return false;
  splashHideClaimed = true;
  return true;
}

/** A failed reveal gives the hide back so a later attempt (or the cap) can run. */
export function releaseMobileSplashHideClaim(): void {
  splashHideClaimed = false;
  if (safetyCapExpired && forceHideSplash) {
    splashHideClaimed = true;
    forceHideSplash();
  }
}

export function isMobileLaunchContentReady(): boolean {
  return launchContentReady;
}

/** Runs when the content becomes ready and when the last layout hold is released. */
export function subscribeMobileLaunchContentReady(listener: () => void): () => void {
  launchContentListeners.add(listener);
  return () => {
    launchContentListeners.delete(listener);
  };
}

/** Tests only: a fresh launch. */
export function resetMobileLaunchContentReadyForTests(): void {
  if (safetyCapTimer) clearTimeout(safetyCapTimer);
  safetyCapTimer = null;
  safetyCapExpired = false;
  splashHideClaimed = false;
  forceHideSplash = null;
  launchContentReady = false;
  launchContentListeners.clear();
  launchLayoutHolds.clear();
}
