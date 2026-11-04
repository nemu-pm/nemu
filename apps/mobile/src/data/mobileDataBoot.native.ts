import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { AppState, Platform } from "react-native";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import {
  loadMobileDataProfile,
  resolveMobileDataProfileSelection,
} from "./mobileDataProfile";
import { createMobileDatabaseEarlyOpen } from "./mobileDataEarlyOpen";
import { MOBILE_DATABASE_NAME, migrateNativeDatabase } from "./nativeDatabase";

const earlyOpen = createMobileDatabaseEarlyOpen<SQLiteDatabase>({
  // Same arguments SQLiteProvider uses (no options/directory), so expo-sqlite
  // hands the provider the same refcounted native connection.
  open: (databaseName) => openDatabaseAsync(databaseName),
  migrate: migrateNativeDatabase,
});

/** `SQLiteProvider` `onInit` (see mobileDataEarlyOpen.ts). */
export const migrateMobileDatabaseOnInit = earlyOpen.onInit;

let started = false;

/**
 * Called from the JS entry (index.ts) so the keychain profile reads and the
 * database open + migration overlap bundle evaluation and the first render
 * instead of starting from provider effects. MobileDataProvider later calls
 * `loadMobileDataProfile()` itself and gets this in-flight/cached result (a
 * failure here is not cached, so the provider retries as before).
 */
export function startMobileDataBoot(): void {
  if (started) return;
  started = true;
  // Android may evaluate the entry for a headless background task without any
  // UI; leave that path exactly as it was. iOS always mounts the root view.
  if (Platform.OS !== "ios" && AppState.currentState !== "active") return;
  if (!mobileSyncConfig.configured) {
    earlyOpen.start(MOBILE_DATABASE_NAME);
    return;
  }
  void loadMobileDataProfile().then(
    (snapshot) => {
      // A pending profile cleanup owns database selection; do not hold a
      // connection the cleanup may need to delete.
      if (snapshot.pendingCleanupProfileId) return;
      // Prediction for the first render: before the network session resolves
      // the provider selects the retained profile. If auth later selects a
      // different database, the early handle is simply closed unused.
      const selection = resolveMobileDataProfileSelection(snapshot, null);
      if (selection) earlyOpen.start(selection.databaseName);
    },
    () => undefined,
  );
}
