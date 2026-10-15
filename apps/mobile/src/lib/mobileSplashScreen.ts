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

let launchContentReady = false;
const launchContentListeners = new Set<() => void>();

/** The first screen calls this once its first local snapshot is on screen. */
export function markMobileLaunchContentReady(): void {
  if (launchContentReady) return;
  launchContentReady = true;
  for (const listener of [...launchContentListeners]) listener();
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
  launchContentReady = false;
  launchContentListeners.clear();
}
