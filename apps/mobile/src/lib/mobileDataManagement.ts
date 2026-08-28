import type { InstalledSource } from "@/data/schema";
import { signOutAndUnregisterMobileBackgroundSync } from "@/sync/mobileBackgroundSyncLifecycle";

export type MobileAuthSessionClearer = {
  isAuthenticated: () => boolean;
  signOut: () => Promise<unknown>;
  unregisterBackgroundSync: () => Promise<void>;
};

export type MobileDataResetAuthProfileFinalizer = MobileAuthSessionClearer & {
  clearRetainedProfile: () => Promise<unknown>;
};

export function sourceHasCachedPackage(source: InstalledSource): boolean {
  return !!source.packageUri || !!source.packageCacheKey;
}

export function clearInstalledSourcePackageCache(
  source: InstalledSource,
): InstalledSource {
  if (!sourceHasCachedPackage(source)) return source;
  return {
    ...source,
    packageUri: null,
    packageCacheKey: null,
  };
}

export async function clearMobileAuthSessionAfterDataReset({
  isAuthenticated,
  signOut,
  unregisterBackgroundSync,
}: MobileAuthSessionClearer): Promise<boolean> {
  if (!isAuthenticated()) return false;
  await signOutAndUnregisterMobileBackgroundSync({
    onSignOutConfirmed: async () => undefined,
    signOut,
    unregister: unregisterBackgroundSync,
  });
  return true;
}

/**
 * Finalizes the auth/profile half of a destructive local reset. The retained
 * profile must remain mounted when an authenticated offline sign-out fails;
 * otherwise the already-cleared database disappears from the provider while
 * the still-authenticated background worker remains registered.
 */
export async function finalizeMobileDataResetAuthProfile({
  clearRetainedProfile,
  ...auth
}: MobileDataResetAuthProfileFinalizer): Promise<boolean> {
  const signedOut = await clearMobileAuthSessionAfterDataReset(auth);
  await clearRetainedProfile();
  return signedOut;
}
