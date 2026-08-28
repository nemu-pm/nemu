/**
 * Signing in must not destroy credentials configured while signed out.
 *
 * Source logins can be configured anonymously (that is why
 * `migrateFromLocalStorage` only runs for the anonymous profile), so committing
 * an authenticated container must leave the anonymous source-settings database
 * — and its live store — completely alone.
 */
import "fake-indexeddb/auto";
import { afterAll, afterEach, describe, expect, test, mock } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Window } from "happy-dom";
// Captured before the mock below replaces it, so the real module can be put
// back for the rest of the suite (bun module mocks are process-wide).
import * as realConvexReact from "convex/react";

const windowInstance = new Window();
Object.defineProperty(windowInstance.navigator, "locks", {
  configurable: true,
  value: {
    request<T>(
      _name: string,
      _options: LockOptions,
      operation: () => Promise<T>,
    ): Promise<T> {
      return operation();
    },
  },
});
globalThis.window = windowInstance as unknown as typeof globalThis.window;
globalThis.document = windowInstance.document as unknown as typeof globalThis.document;
globalThis.HTMLElement = windowInstance.HTMLElement as unknown as typeof globalThis.HTMLElement;
globalThis.Node = windowInstance.Node as unknown as typeof globalThis.Node;
globalThis.navigator = windowInstance.navigator as unknown as typeof globalThis.navigator;
globalThis.localStorage = windowInstance.localStorage;
globalThis.sessionStorage = windowInstance.sessionStorage;

const SIGNED_IN_USER_ID = `signed-in-${Date.now()}`;

// Only the two auth entry points are faked; everything else (including the real
// services container) stays real so this exercises the actual sign-in path.
mock.module("convex/react", () => ({
  ...realConvexReact,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

// Stubbed outright rather than spread from the real module: importing it would
// construct a live better-auth client at module load. No other test imports it.
mock.module("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: SIGNED_IN_USER_ID } } }),
  },
  getAuthHeaders: () => ({}),
}));

afterAll(() => {
  mock.module("convex/react", () => realConvexReact);
});

afterEach(() => cleanup());

const { getSourceSettingsStore, getSourceSettingsStoreForProfile } = await import(
  "@/stores/source-settings"
);
const { IndexedDBUserDataStore } = await import("@/data/indexeddb");
const {
  listPendingSignOutCleanups,
  persistPendingSignOutCleanup,
} = await import("@/sync/pending-signout-cleanup");
const { DataServicesProvider } = await import("./services-provider");
const { ProfileWriteFence } = await import("./profile-write-fence");
const {
  checkpointPendingDeviceDataWipe,
  createPendingDeviceDataWipe,
  readPendingDeviceDataWipe,
} = await import("./device-data-wipe-journal");
const {
  persistDeviceProfileWipeGuard,
  readDeviceProfileWipeGuard,
} = await import("./device-profile-wipe-guard");

describe("DataServicesProvider — anonymous source credentials", () => {
  test("signing in leaves the anonymous source-settings store intact", async () => {
    const anonymous = getSourceSettingsStore();
    await anonymous.getState().initialize();
    anonymous.getState().setSetting("registry:source", "login.password", "hunter2");

    render(
      <DataServicesProvider>
        <div>signed in</div>
      </DataServicesProvider>,
    );
    // Let the provider's mount effects (and any async work they start) run.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The values survive...
    expect(anonymous.getState().values.get("registry:source")).toEqual({
      "login.password": "hunter2",
    });
    // ...the store is still the registered anonymous store (a clear detaches it)...
    expect(getSourceSettingsStore()).toBe(anonymous);
    // ...and it still accepts writes (a clear freezes the store permanently).
    anonymous.getState().setSetting("registry:source", "login.username", "reader");
    expect(anonymous.getState().values.get("registry:source")).toEqual({
      "login.password": "hunter2",
      "login.username": "reader",
    });
  });

  test("the signed-in profile gets its own source-settings namespace", () => {
    expect(getSourceSettingsStoreForProfile(`user:${SIGNED_IN_USER_ID}`)).not.toBe(
      getSourceSettingsStore(),
    );
  });

  test("settled same-user startup supersedes its marker without clearing data", async () => {
    const profileId = `user:${SIGNED_IN_USER_ID}`;
    const store = new IndexedDBUserDataStore(profileId);
    await store.saveLibraryItem({
      libraryItemId: "survives-startup-supersession",
      metadata: { title: "Survives startup supersession" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await persistPendingSignOutCleanup({
      profileId,
      userId: SIGNED_IN_USER_ID,
      keepData: false,
      expectedGeneration: null,
      remoteConfirmedAt: 1_000,
    });

    render(
      <DataServicesProvider>
        <div>same user signed in again</div>
      </DataServicesProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      (await listPendingSignOutCleanups()).filter(
        (marker) => marker.profileId === profileId,
      ),
    ).toEqual([]);
    expect(
      await store.getAllLibraryItems({ includeRemoved: true }),
    ).toEqual([
      expect.objectContaining({
        libraryItemId: "survives-startup-supersession",
      }),
    ]);
  });

  test("a newer authenticated startup cancels a pending whole-device wipe", async () => {
    const profileId = `user:${SIGNED_IN_USER_ID}`;
    const fence = new ProfileWriteFence(profileId);
    let journal = await createPendingDeviceDataWipe({
      profiles: [{ profileId, expectedEpoch: fence.epoch }],
      databases: [],
      initiatingProfileId: profileId,
    });
    persistDeviceProfileWipeGuard({
      operationId: journal.operationId,
      profileId,
      expectedEpoch: fence.epoch,
    });
    journal = checkpointPendingDeviceDataWipe(journal, {
      ...journal,
      remoteSignOutConfirmed: true,
    });

    const view = render(
      <DataServicesProvider>
        <div>new authenticated session</div>
      </DataServicesProvider>,
    );

    await waitFor(() => {
      expect(view.getByText("new authenticated session")).toBeTruthy();
    });
    expect(readPendingDeviceDataWipe()).toBeNull();
    expect(readDeviceProfileWipeGuard(profileId)).toBeNull();
  });
});
