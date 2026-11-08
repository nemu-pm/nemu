import { useSyncExternalStore } from "react";
import { MOBILE_ANONYMOUS_DATABASE_NAME, MOBILE_DATABASE_NAME } from "./nativeDatabase";
import {
  resolveMobileDataProfileSelection,
  type MobileDataProfileSelection,
  type MobileDataProfileSnapshot,
} from "./mobileDataProfile";
import { sanitizeMobileErrorDiagnostic } from "@/lib/mobileSourceErrors";

// Secure storage (Keychain / Keystore) holds the data-profile record: which
// account's database is on screen, who owns the legacy database, and any
// pending removal. When it cannot be read or written the app runs local-only
// instead of failing at the root: one local library, sign-in and sync off,
// and Settings says why. A later attempt (the next foreground, the next
// launch) that succeeds returns to the normal profile.

/** Why the profile record is out of reach, if it is. */
export type MobileSecureStorageFailure =
  /** The record could not be read: the profile is unknown. */
  | "profile-load"
  /** The record was read but the signed-in account could not be saved to it. */
  | "profile-persist";

/** The failure in force for this render, or null when storage works. */
export function mobileSecureStorageFailure(input: {
  loadError: unknown;
  persistError: unknown;
  /** The persist error belongs to the current session's account attempt. */
  persistErrorCurrent: boolean;
  /** An account removal fence owns profile selection (never bypassed). */
  pendingCleanup: boolean;
}): MobileSecureStorageFailure | null {
  if (input.loadError) return "profile-load";
  if (input.persistError && input.persistErrorCurrent && !input.pendingCleanup) {
    return "profile-persist";
  }
  return null;
}

/**
 * The local library to open while secure storage is unavailable, always with
 * no account (`profileId: null`), so nothing is synced or attributed.
 *
 * - The record was read (only saving the new account failed): the profile the
 *   device already shows without a session — the retained account's library
 *   or the anonymous one; a removal fence keeps its own selection.
 * - The record is unreadable: the device's library. Once an account has owned
 *   that database and signed out, the anonymous library has its own file;
 *   when that file exists it is the one opened, so a signed-out account's
 *   library is never shown in its place.
 */
export function resolveMobileLocalOnlySelection(input: {
  failure: MobileSecureStorageFailure;
  state: MobileDataProfileSnapshot;
  anonymousDatabaseExists: boolean;
}): MobileDataProfileSelection {
  if (input.failure === "profile-persist" && input.state.loaded) {
    const selection = resolveMobileDataProfileSelection(input.state, null);
    if (selection) return { profileId: null, databaseName: selection.databaseName };
  }
  return {
    profileId: null,
    databaseName: input.anonymousDatabaseExists ? MOBILE_ANONYMOUS_DATABASE_NAME : MOBILE_DATABASE_NAME,
  };
}

let unavailable = false;
let logged = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  if (unavailable === next) return;
  unavailable = next;
  for (const listener of listeners) listener();
}

/** Secure storage failed: the app is local-only until it works again. Logs once per process. */
export function markMobileSecureStorageUnavailable(error: unknown): void {
  if (!logged) {
    logged = true;
    console.error(
      "[MobileData] Secure storage is unavailable; running local-only (sign-in and sync are off):",
      sanitizeMobileErrorDiagnostic(error) ?? "Unknown storage error.",
    );
  }
  publish(true);
}

/** Secure storage works again. */
export function clearMobileSecureStorageUnavailable(): void {
  publish(false);
}

export function isMobileSecureStorageUnavailable(): boolean {
  return unavailable;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the app runs local-only because secure storage failed. */
export function useMobileSecureStorageUnavailable(): boolean {
  return useSyncExternalStore(subscribe, isMobileSecureStorageUnavailable, isMobileSecureStorageUnavailable);
}

export function resetMobileSecureStorageStatusForTesting(): void {
  unavailable = false;
  logged = false;
  listeners.clear();
}
