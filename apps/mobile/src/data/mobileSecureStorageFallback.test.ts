import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  clearMobileSecureStorageUnavailable,
  isMobileSecureStorageUnavailable,
  markMobileSecureStorageUnavailable,
  mobileSecureStorageFailure,
  resetMobileSecureStorageStatusForTesting,
  resolveMobileLocalOnlySelection,
} from "./mobileSecureStorageFallback";
import { MOBILE_ANONYMOUS_DATABASE_NAME, MOBILE_DATABASE_NAME } from "./nativeDatabase";
import { getMobileProfileDatabaseName, type MobileDataProfileSnapshot } from "./mobileDataProfile";

const unloaded: MobileDataProfileSnapshot = { loaded: false, retainedProfileId: null, legacyDatabaseOwner: null };
const loaded = (overrides: Partial<MobileDataProfileSnapshot> = {}): MobileDataProfileSnapshot => ({
  loaded: true,
  retainedProfileId: null,
  legacyDatabaseOwner: null,
  pendingCleanupProfileId: null,
  ...overrides,
});
const keychainError = new Error("User interaction is not allowed.");

describe("mobileSecureStorageFailure", () => {
  const none = { loadError: null, persistError: null, persistErrorCurrent: false, pendingCleanup: false };

  test("working storage: no failure", () => {
    expect(mobileSecureStorageFailure(none)).toBeNull();
  });

  test("an unreadable profile record is a load failure, whatever else is going on", () => {
    expect(mobileSecureStorageFailure({ ...none, loadError: keychainError })).toBe("profile-load");
    expect(mobileSecureStorageFailure({ ...none, loadError: keychainError, pendingCleanup: true })).toBe("profile-load");
  });

  test("saving the signed-in account failed: a persist failure for the current attempt only", () => {
    expect(mobileSecureStorageFailure({ ...none, persistError: keychainError, persistErrorCurrent: true })).toBe("profile-persist");
    // A stale error from an earlier account attempt does not count.
    expect(mobileSecureStorageFailure({ ...none, persistError: keychainError, persistErrorCurrent: false })).toBeNull();
  });

  test("a removal fence is never bypassed by a persist failure", () => {
    expect(
      mobileSecureStorageFailure({ ...none, persistError: keychainError, persistErrorCurrent: true, pendingCleanup: true }),
    ).toBeNull();
  });
});

describe("resolveMobileLocalOnlySelection", () => {
  test("always opens with no account", () => {
    for (const failure of ["profile-load", "profile-persist"] as const) {
      for (const anonymousDatabaseExists of [false, true]) {
        const selection = resolveMobileLocalOnlySelection({
          failure,
          state: loaded({ retainedProfileId: "user:a", legacyDatabaseOwner: "user:a" }),
          anonymousDatabaseExists,
        });
        expect(selection.profileId).toBeNull();
      }
    }
  });

  test("unreadable record: the device library, or the anonymous one once it exists", () => {
    expect(resolveMobileLocalOnlySelection({ failure: "profile-load", state: unloaded, anonymousDatabaseExists: false }))
      .toEqual({ profileId: null, databaseName: MOBILE_DATABASE_NAME });
    // After an account owned the device library and signed out, its library is
    // never shown as the local one.
    expect(resolveMobileLocalOnlySelection({ failure: "profile-load", state: unloaded, anonymousDatabaseExists: true }))
      .toEqual({ profileId: null, databaseName: MOBILE_ANONYMOUS_DATABASE_NAME });
  });

  test("record read, account not saved: the library the device shows without a session", () => {
    const signedOutAfterLegacy = loaded({ legacyDatabaseOwner: "user:a" });
    expect(resolveMobileLocalOnlySelection({ failure: "profile-persist", state: signedOutAfterLegacy, anonymousDatabaseExists: false }))
      .toEqual({ profileId: null, databaseName: MOBILE_ANONYMOUS_DATABASE_NAME });
    const retained = loaded({ retainedProfileId: "user:b", legacyDatabaseOwner: "user:a" });
    expect(resolveMobileLocalOnlySelection({ failure: "profile-persist", state: retained, anonymousDatabaseExists: true }))
      .toEqual({ profileId: null, databaseName: getMobileProfileDatabaseName("user:b", "user:a") });
    expect(resolveMobileLocalOnlySelection({ failure: "profile-persist", state: loaded(), anonymousDatabaseExists: true }))
      .toEqual({ profileId: null, databaseName: MOBILE_DATABASE_NAME });
  });

  test("a persist failure before the record loaded falls back like a load failure", () => {
    expect(resolveMobileLocalOnlySelection({ failure: "profile-persist", state: unloaded, anonymousDatabaseExists: true }))
      .toEqual({ profileId: null, databaseName: MOBILE_ANONYMOUS_DATABASE_NAME });
  });
});

describe("secure storage status", () => {
  afterEach(() => resetMobileSecureStorageStatusForTesting());

  test("marks, logs once, and clears when storage works again", () => {
    const log = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(isMobileSecureStorageUnavailable()).toBe(false);
      markMobileSecureStorageUnavailable(keychainError);
      markMobileSecureStorageUnavailable(keychainError);
      expect(isMobileSecureStorageUnavailable()).toBe(true);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[0])).toContain("Secure storage is unavailable");
      clearMobileSecureStorageUnavailable();
      expect(isMobileSecureStorageUnavailable()).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
