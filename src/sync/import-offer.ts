import {
  isWebSyncRunCurrent,
  type WebSyncRunIdentity,
} from "./web-snapshot-sync";

const IMPORT_OFFERED_SESSION_KEY = "nemu:import-offered-session";

export function getImportOfferedSessionKey(userId: string): string {
  return `${IMPORT_OFFERED_SESSION_KEY}:${encodeURIComponent(userId)}`;
}

export type WebImportOfferPage = {
  generation: number;
  items: readonly unknown[] | null;
};

export type WebImportOfferEligibilityOptions = {
  expectedIdentity: WebSyncRunIdentity;
  getCurrentIdentity: () => WebSyncRunIdentity;
  isCancelled: () => boolean;
  getSubscriptionsStopped: () => boolean;
  hasLegacyLibraryData: () => Promise<boolean>;
  loadRemoteUserId: () => Promise<string | null>;
  loadRemoteGeneration: () => Promise<number>;
  loadFirstRemoteLibraryPage: (
    generation: number,
  ) => Promise<WebImportOfferPage>;
  hasProfileLibraryData: () => Promise<boolean>;
};

/**
 * Re-check every precondition for offering or confirming the legacy import.
 *
 * The caller supplies one immutable account/profile/store identity. Each await
 * is followed by an identity/cancellation check so a late result for account A
 * can never become an offer or confirmation for account B.
 */
export async function isWebImportOfferEligible({
  expectedIdentity,
  getCurrentIdentity,
  isCancelled,
  getSubscriptionsStopped,
  hasLegacyLibraryData,
  loadRemoteUserId,
  loadRemoteGeneration,
  loadFirstRemoteLibraryPage,
  hasProfileLibraryData,
}: WebImportOfferEligibilityOptions): Promise<boolean> {
  const shouldContinue = () =>
    isWebSyncRunCurrent(
      expectedIdentity,
      getCurrentIdentity(),
      isCancelled(),
      getSubscriptionsStopped(),
    );

  if (!shouldContinue()) return false;
  const hasLegacyData = await hasLegacyLibraryData();
  if (!shouldContinue() || !hasLegacyData) return false;

  const remoteUserId = await loadRemoteUserId();
  if (!shouldContinue() || remoteUserId !== expectedIdentity.userId) {
    return false;
  }

  const remoteGeneration = await loadRemoteGeneration();
  if (!shouldContinue()) return false;

  const firstRemotePage = await loadFirstRemoteLibraryPage(remoteGeneration);
  if (!shouldContinue()) return false;
  if (
    firstRemotePage.generation !== remoteGeneration ||
    firstRemotePage.items === null ||
    firstRemotePage.items.length > 0
  ) {
    return false;
  }

  const profileHasLibraryData = await hasProfileLibraryData();
  if (!shouldContinue()) return false;
  if (profileHasLibraryData) return false;

  // The Convex transport can switch accounts before Better Auth/profile state
  // catches up. Re-probe at the final eligibility boundary so cloud emptiness
  // observed from B cannot authorize a local import into captured profile A.
  const finalRemoteUserId = await loadRemoteUserId();
  if (!shouldContinue()) return false;
  return finalRemoteUserId === expectedIdentity.userId;
}

/** Bind a dialog action to both the rendered offer token and active identity. */
export function isWebImportOfferActionCurrent(
  expectedOffer: WebSyncRunIdentity,
  activeOffer: WebSyncRunIdentity | null,
  currentIdentity: WebSyncRunIdentity,
  cancelled: boolean,
  subscriptionStopped: boolean,
): boolean {
  return (
    activeOffer === expectedOffer &&
    isWebSyncRunCurrent(
      expectedOffer,
      currentIdentity,
      cancelled,
      subscriptionStopped,
    )
  );
}
