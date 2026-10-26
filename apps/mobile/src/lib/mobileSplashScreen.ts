export type MobileSplashScreenState = {
  rootLaidOut: boolean;
  splashHidden: boolean;
  /**
   * The first screen has committed its first local snapshot (the Library's
   * SQLite read: content, the empty state or an error), or the launch opened
   * somewhere that has nothing to wait for. Never network-bound.
   */
  contentReady: boolean;
};

/**
 * The launch screen stays up until the first frame under it is final: the
 * root has laid out and the first screen shows its local data, so the app
 * never reveals a blank page or a skeleton that the data then replaces.
 */
export function shouldHideMobileSplashScreen({
  rootLaidOut,
  splashHidden,
  contentReady,
}: MobileSplashScreenState): boolean {
  return rootLaidOut && contentReady && !splashHidden;
}

/**
 * The longest the launch screen stays up, counted from JS start
 * (`startMobileSplashSafetyCap`, called from the entry module): past it the
 * app shows whatever it has. A stuck read, a slow migration or a provider that
 * has not mounted the root yet must never hold the launch screen.
 */
export const MOBILE_SPLASH_CONTENT_TIMEOUT_MS = 2500;

/**
 * The longest the launch screen waits, once the snapshot is in, for the images
 * already mounted under it (`holdMobileLaunchRevealForImage`): covers decoded
 * from the disk cache take a frame or few, a cover not yet downloaded would
 * take the network, which the launch never waits on.
 */
export const MOBILE_LAUNCH_IMAGE_HOLD_MS = 600;

let safetyCapTimer: ReturnType<typeof setTimeout> | null = null;
let safetyCapExpired = false;
let splashHideClaimed = false;
let forceHideSplash: (() => void) | null = null;

let launchContentMarked = false;
let launchContentReady = false;
let launchImageHolds = 0;
let launchImageTimer: ReturnType<typeof setTimeout> | null = null;
const launchContentListeners = new Set<() => void>();

function releaseLaunchContent(): void {
  if (launchContentReady) return;
  if (launchImageTimer) clearTimeout(launchImageTimer);
  launchImageTimer = null;
  launchContentReady = true;
  for (const listener of [...launchContentListeners]) listener();
}

/**
 * The first screen calls this once its first local snapshot is on screen.
 * The launch screen then also waits for the images mounted under it to
 * paint, so the first revealed frame already has its covers.
 */
export function markMobileLaunchContentReady(): void {
  if (launchContentMarked) return;
  launchContentMarked = true;
  if (launchImageHolds === 0) {
    releaseLaunchContent();
    return;
  }
  launchImageTimer = setTimeout(releaseLaunchContent, MOBILE_LAUNCH_IMAGE_HOLD_MS);
}

/**
 * An image mounted under the launch screen holds the reveal until it has
 * painted (or failed): call the returned release then. Null once the launch
 * has revealed; an image mounted later loads as usual.
 */
export function holdMobileLaunchRevealForImage(): (() => void) | null {
  if (launchContentReady) return null;
  launchImageHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    launchImageHolds -= 1;
    if (launchContentMarked && launchImageHolds === 0) releaseLaunchContent();
  };
}

function expireSafetyCap(): void {
  safetyCapTimer = null;
  safetyCapExpired = true;
  // Listeners run synchronously: a root that has laid out claims the hide
  // here and runs its normal reveal.
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

export function subscribeMobileLaunchContentReady(listener: () => void): () => void {
  launchContentListeners.add(listener);
  return () => {
    launchContentListeners.delete(listener);
  };
}

/** Tests only: a fresh launch. */
export function resetMobileLaunchContentReadyForTests(): void {
  if (launchImageTimer) clearTimeout(launchImageTimer);
  launchImageTimer = null;
  if (safetyCapTimer) clearTimeout(safetyCapTimer);
  safetyCapTimer = null;
  safetyCapExpired = false;
  splashHideClaimed = false;
  forceHideSplash = null;
  launchContentMarked = false;
  launchImageHolds = 0;
  launchContentReady = false;
  launchContentListeners.clear();
}
