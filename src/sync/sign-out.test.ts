import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import { getSyncStore } from "@/stores/sync";
import {
  authSessionIdRef,
  authSessionRevisionRef,
  effectiveProfileIdRef,
  isAuthenticatedRef,
  lastProfileIdRef,
  sessionUserIdRef,
  signOut,
  updateObservedAuthSession,
} from "./services";
import {
  getSyncSubscriptionsStopped,
  setSyncSubscriptionsStopped,
} from "./subscription-gate";
import { getImportOfferedSessionKey } from "./import-offer";
import { getSourceSettingsStoreForProfile } from "@/stores/source-settings";

const localStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function restoreGlobalStorage(
  name: "localStorage" | "sessionStorage",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, name);
  }
}

let sequence = 0;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  isAuthenticatedRef.current = false;
  effectiveProfileIdRef.current = undefined;
  sessionUserIdRef.current = undefined;
  authSessionIdRef.current = undefined;
  authSessionRevisionRef.current = 0;
  lastProfileIdRef.current = undefined;
  setSyncSubscriptionsStopped(false);
  getSyncStore().getState().reset();
});

afterEach(() => {
  isAuthenticatedRef.current = false;
  effectiveProfileIdRef.current = undefined;
  sessionUserIdRef.current = undefined;
  authSessionIdRef.current = undefined;
  authSessionRevisionRef.current = 0;
  lastProfileIdRef.current = undefined;
  setSyncSubscriptionsStopped(false);
  getSyncStore().getState().reset();
  restoreGlobalStorage("localStorage", localStorageDescriptor);
  restoreGlobalStorage("sessionStorage", sessionStorageDescriptor);
});

describe("web sign-out service", () => {
  test("copies a consistent local profile only after remote confirmation", async () => {
    sequence += 1;
    const userId = `signout-success-${sequence}`;
    const profileId = `user:${userId}`;
    const store = new IndexedDBUserDataStore(profileId);
    const localProfile = new IndexedDBUserDataStore();
    await localProfile.clearAccountData();
    await store.saveLibraryItem({
      libraryItemId: "kept-after-signout",
      metadata: { title: "Kept after sign-out" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    isAuthenticatedRef.current = true;
    effectiveProfileIdRef.current = profileId;
    sessionUserIdRef.current = userId;
    lastProfileIdRef.current = profileId;
    localStorage.setItem("nemu:last-profile-id", profileId);
    sessionStorage.setItem(getImportOfferedSessionKey(userId), "true");
    sessionStorage.setItem(getImportOfferedSessionKey("another-user"), "true");

    let remoteConfirmed = false;
    await signOut(store, true, async () => {
      expect(
        await store.getAllLibraryItems({ includeRemoved: true }),
      ).toHaveLength(1);
      expect(
        await localProfile.getAllLibraryItems({ includeRemoved: true }),
      ).toEqual([]);
      remoteConfirmed = true;
    });

    expect(remoteConfirmed).toBe(true);
    expect(
      await store.getAllLibraryItems({ includeRemoved: true }),
    ).toEqual([]);
    expect(
      await localProfile.getAllLibraryItems({ includeRemoved: true }),
    ).toEqual([
      expect.objectContaining({ libraryItemId: "kept-after-signout" }),
    ]);
    expect(lastProfileIdRef.current).toBeUndefined();
    expect(localStorage.getItem("nemu:last-profile-id")).toBeNull();
    expect(sessionStorage.getItem(getImportOfferedSessionKey(userId))).toBeNull();
    expect(sessionStorage.getItem(getImportOfferedSessionKey("another-user"))).toBe("true");
    expect(getSyncSubscriptionsStopped()).toBe(true);
  });

  test("does not copy or clear local data when remote sign-out fails", async () => {
    sequence += 1;
    const userId = `signout-failure-${sequence}`;
    const profileId = `user:${userId}`;
    const store = new IndexedDBUserDataStore(profileId);
    const localProfile = new IndexedDBUserDataStore();
    await localProfile.clearAccountData();
    await store.saveLibraryItem({
      libraryItemId: "only-local-copy",
      metadata: { title: "Only local copy" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    isAuthenticatedRef.current = true;
    effectiveProfileIdRef.current = profileId;
    sessionUserIdRef.current = userId;
    lastProfileIdRef.current = profileId;

    await expect(
      signOut(store, true, async () => {
        expect(
          await store.getAllLibraryItems({ includeRemoved: true }),
        ).toHaveLength(1);
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");

    expect(
      await store.getAllLibraryItems({ includeRemoved: true }),
    ).toHaveLength(1);
    expect(
      await localProfile.getAllLibraryItems({ includeRemoved: true }),
    ).toEqual([]);
    expect(getSyncSubscriptionsStopped()).toBe(false);
  });

  test("finalizes the captured account without clobbering a newer account", async () => {
    sequence += 1;
    const oldUserId = `signout-old-${sequence}`;
    const oldProfileId = `user:${oldUserId}`;
    const newUserId = `signout-new-${sequence}`;
    const newProfileId = `user:${newUserId}`;
    const oldStore = new IndexedDBUserDataStore(oldProfileId);
    const newStore = new IndexedDBUserDataStore(newProfileId);
    await oldStore.saveLibraryItem({
      libraryItemId: "old-account-item",
      metadata: { title: "Old account" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await newStore.saveLibraryItem({
      libraryItemId: "new-account-item",
      metadata: { title: "New account" },
      inLibrary: true,
      createdAt: 2,
      updatedAt: 2,
    });

    isAuthenticatedRef.current = true;
    effectiveProfileIdRef.current = oldProfileId;
    sessionUserIdRef.current = oldUserId;
    lastProfileIdRef.current = oldProfileId;
    localStorage.setItem("nemu:last-profile-id", oldProfileId);

    await signOut(oldStore, false, async () => {
      // Remote confirmation must happen while the old account's local data is
      // still intact. Simulate React publishing a new session before the
      // captured account's local finalizer resumes.
      expect(
        await oldStore.getAllLibraryItems({ includeRemoved: true }),
      ).toHaveLength(1);
      effectiveProfileIdRef.current = newProfileId;
      sessionUserIdRef.current = newUserId;
      lastProfileIdRef.current = newProfileId;
      localStorage.setItem("nemu:last-profile-id", newProfileId);

      const syncStore = getSyncStore().getState();
      syncStore.setAuthState(true, false);
      syncStore.setSyncStatus("synced");
      syncStore.setUser({
        id: newUserId,
        name: "New account",
        email: "new@example.invalid",
        image: null,
      });
    });

    expect(
      await oldStore.getAllLibraryItems({ includeRemoved: true }),
    ).toEqual([]);
    expect(
      await newStore.getAllLibraryItems({ includeRemoved: true }),
    ).toHaveLength(1);
    expect(lastProfileIdRef.current).toBe(newProfileId);
    expect(localStorage.getItem("nemu:last-profile-id")).toBe(newProfileId);
    expect(getSyncStore().getState().isAuthenticated).toBe(true);
    expect(getSyncStore().getState().syncStatus).toBe("synced");
    expect(getSyncStore().getState().user?.id).toBe(newUserId);
    expect(getSyncSubscriptionsStopped()).toBe(false);
  });

  test("does not clear or reset a same-account session that replaced the signed-out session", async () => {
    sequence += 1;
    const userId = `signout-relogin-${sequence}`;
    const profileId = `user:${userId}`;
    const store = new IndexedDBUserDataStore(profileId);
    await store.saveLibraryItem({
      libraryItemId: "active-session-item",
      metadata: { title: "Active session" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });

    isAuthenticatedRef.current = true;
    effectiveProfileIdRef.current = profileId;
    sessionUserIdRef.current = userId;
    authSessionIdRef.current = "session-before-signout";
    authSessionRevisionRef.current = 1;
    lastProfileIdRef.current = profileId;
    localStorage.setItem("nemu:last-profile-id", profileId);
    sessionStorage.setItem(getImportOfferedSessionKey(userId), "true");

    await signOut(store, false, async () => {
      // Model Better Auth publishing logout followed by a fresh login for the
      // same user before the captured local finalizer gets the write queue.
      isAuthenticatedRef.current = true;
      sessionUserIdRef.current = userId;
      authSessionIdRef.current = "session-after-relogin";
      authSessionRevisionRef.current = 3;
      effectiveProfileIdRef.current = profileId;
      lastProfileIdRef.current = profileId;
      const syncStore = getSyncStore().getState();
      syncStore.setAuthState(true, false);
      syncStore.setSyncStatus("synced");
      syncStore.setUser({
        id: userId,
        name: "Same account",
        email: "same@example.invalid",
        image: null,
      });
    });

    expect(await store.getAllLibraryItems({ includeRemoved: true })).toHaveLength(1);
    expect(lastProfileIdRef.current).toBe(profileId);
    expect(localStorage.getItem("nemu:last-profile-id")).toBe(profileId);
    expect(sessionStorage.getItem(getImportOfferedSessionKey(userId))).toBeNull();
    expect(getSyncStore().getState().isAuthenticated).toBe(true);
    expect(getSyncStore().getState().syncStatus).toBe("synced");
    expect(getSyncStore().getState().user?.id).toBe(userId);
    expect(getSyncSubscriptionsStopped()).toBe(false);
  });

  test("atomically aborts a clear when the same account starts a new session mid-transaction", async () => {
    sequence += 1;
    const userId = `signout-mid-clear-${sequence}`;
    const profileId = `user:${userId}`;
    const store = new IndexedDBUserDataStore(profileId);
    await store.saveLibraryItem({
      libraryItemId: "must-survive-aborted-clear",
      metadata: { title: "Must survive" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });

    isAuthenticatedRef.current = true;
    effectiveProfileIdRef.current = profileId;
    sessionUserIdRef.current = userId;
    authSessionIdRef.current = "session-before-clear";
    authSessionRevisionRef.current = 1;
    lastProfileIdRef.current = profileId;

    let markClearStarted!: () => void;
    const clearStarted = new Promise<void>((resolve) => {
      markClearStarted = resolve;
    });
    let resumeClear!: () => void;
    const clearCanResume = new Promise<void>((resolve) => {
      resumeClear = resolve;
    });
    const clearAccountData = store.clearAccountData.bind(store);
    store.clearAccountData = async (signal?: AbortSignal) => {
      markClearStarted();
      await clearCanResume;
      return clearAccountData(signal);
    };

    const signingOut = signOut(store, false, async () => undefined);
    await clearStarted;
    updateObservedAuthSession(true, userId, "session-after-clear-started");
    effectiveProfileIdRef.current = profileId;
    resumeClear();
    await signingOut;

    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([
      expect.objectContaining({ libraryItemId: "must-survive-aborted-clear" }),
    ]);
    expect(getSyncSubscriptionsStopped()).toBe(false);
    expect(authSessionRevisionRef.current).toBe(2);
  });

  test("restores account data when relogin aborts the later source-settings clear", async () => {
    sequence += 1;
    const userId = `signout-source-settings-${sequence}`;
    const profileId = `user:${userId}`;
    const store = new IndexedDBUserDataStore(profileId);
    expect(await store.prepareSyncGeneration(5)).toBe("reset");
    await store.saveLibraryItem({
      libraryItemId: "restore-after-settings-abort",
      metadata: { title: "Restore after source settings abort" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const sourceSettings = getSourceSettingsStoreForProfile(profileId);
    sourceSettings.getState().setSetting("aidoku:test", "token", "preserved");

    isAuthenticatedRef.current = true;
    effectiveProfileIdRef.current = profileId;
    sessionUserIdRef.current = userId;
    authSessionIdRef.current = "session-before-settings-clear";
    authSessionRevisionRef.current = 1;
    lastProfileIdRef.current = profileId;

    let markSettingsClearStarted!: () => void;
    const settingsClearStarted = new Promise<void>((resolve) => {
      markSettingsClearStarted = resolve;
    });
    let resumeSettingsClear!: () => void;
    const settingsClearCanResume = new Promise<void>((resolve) => {
      resumeSettingsClear = resolve;
    });
    const clearSettings = sourceSettings.getState().clearAll;
    sourceSettings.setState({
      clearAll: async (signal?: AbortSignal) => {
        markSettingsClearStarted();
        await settingsClearCanResume;
        return clearSettings(signal);
      },
    });

    const signingOut = signOut(store, false, async () => undefined);
    await settingsClearStarted;
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    updateObservedAuthSession(true, userId, "session-after-settings-clear-started");
    effectiveProfileIdRef.current = profileId;
    resumeSettingsClear();
    await signingOut;

    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([
      expect.objectContaining({ libraryItemId: "restore-after-settings-abort" }),
    ]);
    expect(await store.getSyncGeneration()).toBe(5);
    expect(await store.prepareSyncGeneration(5)).toBe("current");
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([
      expect.objectContaining({ libraryItemId: "restore-after-settings-abort" }),
    ]);
    sourceSettings.getState().setSetting("aidoku:test", "refresh", "writable");
    expect(sourceSettings.getState().values.get("aidoku:test")).toEqual({
      token: "preserved",
      refresh: "writable",
    });
    expect(getSyncSubscriptionsStopped()).toBe(false);
  });
});
