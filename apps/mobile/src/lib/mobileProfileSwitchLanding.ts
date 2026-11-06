/**
 * Switching the data profile (a first sign-in, signing out with Remove data)
 * mounts the app's tree anew on another database, and the navigator with it,
 * so it would come back on Library. Both are started from Settings: they hold
 * this landing while they run, and the new tree opens Settings once if it
 * mounted during that time.
 */

/** A remount can follow the flow's end by a moment (the profile is retained asynchronously). */
export const MOBILE_PROFILE_SWITCH_LANDING_GRACE_MS = 10_000;

export function createMobileProfileSwitchLanding(now: () => number = Date.now) {
  let held = false;
  let expiresAt: number | null = null;
  return {
    hold(): void {
      held = true;
      expiresAt = null;
    },
    /** The flow ended; `switching`: it succeeded, so a remount may still follow. */
    release(switching: boolean): void {
      if (!held) return;
      if (switching) expiresAt = now() + MOBILE_PROFILE_SWITCH_LANDING_GRACE_MS;
      else held = false;
    },
    /** A new tree mounted: whether it should open Settings (once). */
    consume(): boolean {
      const land = held && (expiresAt === null || now() < expiresAt);
      held = false;
      expiresAt = null;
      return land;
    },
  };
}

export const mobileProfileSwitchLanding = createMobileProfileSwitchLanding();
