import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  clearRetainedMobileDataProfile,
  markMobileDataProfileCleanupPending,
  getMobileDataProfileSnapshot,
  getMobileDataProfileCleanupStartupAction,
  getMobileDataProfileRuntimeScope,
  getMobileProfileDatabaseName,
  isMobileDataProfileCleanupPendingError,
  makeMobileProfileId,
  normalizeStoredMobileDataProfile,
  resetMobileDataProfileForTesting,
  resolveMobileDataProfileSelection,
  resolveMobileDataProfileForUser,
  retainMobileDataProfile,
  setMobileDataProfileStorageForTesting,
} from "./mobileDataProfile";
import type { NativeKVStore } from "./contracts";
import { SecureNativeKVStore } from "./nativeKV";
import {
  MOBILE_ANONYMOUS_DATABASE_NAME,
  MOBILE_DATABASE_NAME,
} from "./nativeDatabase";

class ControlledKVStore implements NativeKVStore {
  readonly values = new Map<string, string>();
  failKey: string | null = null;

  async getString(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setString(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    if (key === this.failKey) throw new Error(`injected failure for ${key}`);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

let storage: ControlledKVStore;

describe("mobile data profiles", () => {
  beforeEach(async () => {
    storage = new ControlledKVStore();
    await setMobileDataProfileStorageForTesting(storage);
    await resetMobileDataProfileForTesting();
  });

  afterAll(async () => {
    await setMobileDataProfileStorageForTesting(new SecureNativeKVStore());
  });

  test("isolates a second account from the legacy profile database", async () => {
    const firstProfile = makeMobileProfileId("account-a");
    const secondProfile = makeMobileProfileId("account-b");
    expect(firstProfile).toBe("user:account-a");
    expect(secondProfile).toBe("user:account-b");

    const firstState = await retainMobileDataProfile(firstProfile!);
    expect(firstState.legacyDatabaseOwner).toBe(firstProfile);
    expect(
      getMobileProfileDatabaseName(firstProfile, firstState.legacyDatabaseOwner),
    ).toBe(MOBILE_DATABASE_NAME);

    const secondDatabase = getMobileProfileDatabaseName(
      secondProfile,
      firstState.legacyDatabaseOwner,
    );
    expect(secondDatabase).not.toBe(MOBILE_DATABASE_NAME);
    expect(secondDatabase).not.toContain("account-b");
    expect(secondDatabase).toMatch(/^nemu-mobile-profile-[a-f0-9]{64}\.db$/);
    expect(secondDatabase).toBe(
      getMobileProfileDatabaseName(secondProfile, firstState.legacyDatabaseOwner),
    );
  });

  test("derives stable source scopes without exposing raw account subjects", () => {
    const first = getMobileDataProfileRuntimeScope("user:account-a");
    const repeated = getMobileDataProfileRuntimeScope("user:account-a");
    const second = getMobileDataProfileRuntimeScope("user:account-b");

    expect(first).toBe(repeated);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^profile:[a-f0-9]{64}$/);
    expect(first).not.toContain("account-a");
    expect(getMobileDataProfileRuntimeScope(null)).toBe("local");
  });

  test("opens retained local data before network auth resolves and fails closed on account changes", () => {
    expect(
      resolveMobileDataProfileSelection(
        {
          loaded: false,
          retainedProfileId: "user:account-a",
          legacyDatabaseOwner: "user:account-a",
        },
        null,
      ),
    ).toBeNull();

    expect(
      resolveMobileDataProfileSelection(
        {
          loaded: true,
          retainedProfileId: "user:account-a",
          legacyDatabaseOwner: "user:account-a",
        },
        null,
      ),
    ).toEqual({
      profileId: "user:account-a",
      databaseName: MOBILE_DATABASE_NAME,
    });

    expect(
      resolveMobileDataProfileSelection(
        {
          loaded: true,
          retainedProfileId: "user:account-a",
          legacyDatabaseOwner: "user:account-a",
        },
        "user:account-b",
      ),
    ).toBeNull();

    const switched = resolveMobileDataProfileSelection(
      {
        loaded: true,
        retainedProfileId: "user:account-b",
        legacyDatabaseOwner: "user:account-a",
      },
      "user:account-b",
    );
    expect(switched?.profileId).toBe("user:account-b");
    expect(switched?.databaseName).toMatch(
      /^nemu-mobile-profile-[a-f0-9]{64}\.db$/,
    );
  });

  test("keeps explicitly signed-out local state in the anonymous database", () => {
    expect(
      resolveMobileDataProfileSelection(
        {
          loaded: true,
          retainedProfileId: null,
          legacyDatabaseOwner: "user:account-a",
        },
        null,
      ),
    ).toEqual({
      profileId: null,
      databaseName: MOBILE_ANONYMOUS_DATABASE_NAME,
    });
  });

  test("keeps a fenced profile mounted for cleanup across a concurrent sign-in", () => {
    expect(
      resolveMobileDataProfileSelection(
        {
          loaded: true,
          retainedProfileId: "user:account-a",
          legacyDatabaseOwner: "user:account-a",
          pendingCleanupProfileId: "user:account-a",
        },
        "user:account-b",
      ),
    ).toEqual({
      profileId: "user:account-a",
      databaseName: MOBILE_DATABASE_NAME,
    });
  });

  test("opens an unowned legacy database locally but waits to assign the first account", () => {
    const freshState = {
      loaded: true,
      retainedProfileId: null,
      legacyDatabaseOwner: null,
    } as const;
    expect(resolveMobileDataProfileSelection(freshState, null)).toEqual({
      profileId: null,
      databaseName: MOBILE_DATABASE_NAME,
    });
    expect(
      resolveMobileDataProfileSelection(freshState, "user:first-account"),
    ).toBeNull();
  });

  test("retains the signed-out profile only when local data is kept", async () => {
    const profile = makeMobileProfileId("account-a")!;
    const retained = await retainMobileDataProfile(profile);
    expect(retained.retainedProfileId).toBe(profile);

    const cleared = await clearRetainedMobileDataProfile();
    expect(cleared.retainedProfileId).toBeNull();
    expect(cleared.legacyDatabaseOwner).toBe(profile);
    expect(getMobileDataProfileSnapshot()).toEqual(cleared);
    expect(
      getMobileProfileDatabaseName(null, cleared.legacyDatabaseOwner),
    ).toBe(MOBILE_ANONYMOUS_DATABASE_NAME);
  });

  test("serializes an in-flight retain before a sign-out clear", async () => {
    const profile = makeMobileProfileId("account-a")!;
    const retaining = retainMobileDataProfile(profile);
    const clearing = clearRetainedMobileDataProfile();

    await Promise.all([retaining, clearing]);
    expect(getMobileDataProfileSnapshot().retainedProfileId).toBeNull();
    expect(getMobileDataProfileSnapshot().legacyDatabaseOwner).toBe(profile);
  });

  test("recovers an incomplete legacy-owner write without exposing the database", () => {
    const profile = makeMobileProfileId("account-a")!;
    expect(normalizeStoredMobileDataProfile(profile, null)).toEqual({
      retainedProfileId: profile,
      legacyDatabaseOwner: profile,
    });
  });

  test("does not overwrite a durable owner after the retained-profile write fails", async () => {
    storage.failKey = "nemu.mobile.last-profile-id";
    await expect(retainMobileDataProfile("user:account-a")).rejects.toThrow(
      "injected failure",
    );
    expect(storage.values.get("nemu.mobile.legacy-database-owner")).toBe(
      "user:account-a",
    );
    expect(getMobileDataProfileSnapshot().legacyDatabaseOwner).toBe(
      "user:account-a",
    );

    storage.failKey = null;
    const second = await retainMobileDataProfile("user:account-b");
    expect(second.legacyDatabaseOwner).toBe("user:account-a");
    expect(storage.values.get("nemu.mobile.legacy-database-owner")).toBe(
      "user:account-a",
    );
    expect(
      getMobileProfileDatabaseName("user:account-b", second.legacyDatabaseOwner),
    ).not.toBe(MOBILE_DATABASE_NAME);
  });

  test("resolves a background profile without changing the foreground selection", async () => {
    await retainMobileDataProfile("user:account-a");
    const background = await resolveMobileDataProfileForUser("account-b", {
      retain: false,
    });

    expect(background.profileId).toBe("user:account-b");
    expect(background.databaseName).not.toBe(MOBILE_DATABASE_NAME);
    expect(getMobileDataProfileSnapshot().retainedProfileId).toBe("user:account-a");
  });

  test("prevents a headless task from opening a profile fenced for removal", async () => {
    await retainMobileDataProfile("user:account-a");
    await markMobileDataProfileCleanupPending("user:account-a");

    const result = resolveMobileDataProfileForUser("account-a", {
      retain: false,
    });
    await expect(result).rejects.toThrow("MOBILE_DATA_PROFILE_CLEANUP_PENDING");
    await result.catch((error) => {
      expect(isMobileDataProfileCleanupPendingError(error)).toBe(true);
    });
  });

  test("waits for settled auth before deciding an unconfirmed reset marker", async () => {
    await retainMobileDataProfile("user:account-a");
    await markMobileDataProfileCleanupPending(
      "user:account-a",
      "all",
      false,
    );
    const pending = getMobileDataProfileSnapshot();

    expect(
      getMobileDataProfileCleanupStartupAction(pending, {
        settled: false,
        authenticatedProfileId: null,
      }),
    ).toBe("wait");
    expect(
      getMobileDataProfileCleanupStartupAction(
        { ...pending, pendingCleanupLocallyOwned: true },
        {
          settled: true,
          authenticatedProfileId: "user:account-a",
        },
      ),
    ).toBe("wait");
    expect(
      getMobileDataProfileCleanupStartupAction(pending, {
        settled: true,
        authenticatedProfileId: "user:account-a",
      }),
    ).toBe("cancel");
    expect(
      getMobileDataProfileCleanupStartupAction(pending, {
        settled: true,
        authenticatedProfileId: null,
      }),
    ).toBe("confirm");
  });
});
