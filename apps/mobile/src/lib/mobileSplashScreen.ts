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
 * The longest the launch screen waits for the first local snapshot after the
 * root has laid out; past it the app shows whatever it has (a stuck read must
 * never hold the launch screen).
 */
export const MOBILE_SPLASH_CONTENT_TIMEOUT_MS = 2500;

/**
 * The longest the launch screen waits, once the snapshot is in, for the images
 * already mounted under it (`holdMobileLaunchRevealForImage`): covers decoded
 * from the disk cache take a frame or few, a cover not yet downloaded would
 * take the network, which the launch never waits on.
 */
export const MOBILE_LAUNCH_IMAGE_HOLD_MS = 600;

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
  launchContentMarked = false;
  launchImageHolds = 0;
  launchContentReady = false;
  launchContentListeners.clear();
}
