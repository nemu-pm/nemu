import type { MobileDataStore } from "./storeTypes";
import {
  MOBILE_DATA_PROFILE_CLEANUP_PENDING,
  getMobileDataProfileSnapshot,
} from "./mobileDataProfile";

const ACCOUNT_MUTATION_METHODS = new Set<keyof MobileDataStore>([
  "applySyncGeneration",
  "recordSyncSnapshotState",
  "updateSettings",
  "saveSettings",
  "clearPackageCacheReferences",
  "clearAllUserData",
  "saveInstalledSource",
  "saveInstalledSourceIfCurrent",
  "removeInstalledSource",
  "saveSourceSettings",
  "resetSourceSettings",
  "saveRegistry",
  "removeRegistry",
  "saveLibraryItem",
  "saveLibrarySnapshot",
  "removeLibraryItem",
  "restoreLibraryItem",
  "saveSourceLink",
  "removeSourceLink",
  "saveChapterProgress",
  "saveChapterProgressBatch",
  "saveMangaProgress",
  "saveMangaProgressBatch",
  "saveCollectionsSnapshot",
  "saveCollection",
  "removeCollection",
  "addCollectionItems",
  "removeCollectionItems",
  "clearPendingSyncDeletion",
  "applyLibrarySnapshot",
  "applyCollectionsSnapshot",
  "applyChapterProgressSnapshot",
  "applyMangaProgressSnapshot",
  "applyInstalledSourcesSnapshot",
]);

function profileCleanupPendingError(): Error {
  return new Error(MOBILE_DATA_PROFILE_CLEANUP_PENDING);
}

/**
 * Fences every foreground/background mutation as soon as an account removal
 * marker is published. A mutation that enters the underlying store first is
 * already ahead of clearAccountData in the shared write queue; a mutation that
 * arrives afterward is rejected, so no late async task can repopulate the
 * cleared profile database.
 *
 * clearAccountData itself is intentionally not in the blocked set. A full
 * clear is admitted only when the durable marker preserves the user's exact
 * all-device scope; an account-only fence cannot erase device registries.
 */
export function createMobileDataProfileGuardedStore(
  store: MobileDataStore,
  isCleanupPending: () => boolean = () =>
    Boolean(getMobileDataProfileSnapshot().pendingCleanupProfileId),
  isFullCleanupPending: () => boolean = () =>
    getMobileDataProfileSnapshot().pendingCleanupMode === "all",
): MobileDataStore {
  const wrappedMethods = new Map<PropertyKey, unknown>();

  return new Proxy(store, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== "function") return value;
      if (wrappedMethods.has(property)) return wrappedMethods.get(property);

      const wrapped = (...args: unknown[]) => {
        if (
          ACCOUNT_MUTATION_METHODS.has(property as keyof MobileDataStore) &&
          isCleanupPending() &&
          !(
            property === "clearAllUserData" && isFullCleanupPending()
          )
        ) {
          return Promise.reject(profileCleanupPendingError());
        }
        return Reflect.apply(value, target, args) as unknown;
      };
      wrappedMethods.set(property, wrapped);
      return wrapped;
    },
  });
}
