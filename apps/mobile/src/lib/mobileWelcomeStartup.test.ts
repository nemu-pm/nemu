import { describe, expect, test } from "bun:test";
import {
  shouldShowMobileWelcomeWizard,
  type MobileWelcomeDeviceCompletion,
  type MobileWelcomeStartupStore,
} from "./mobileWelcome";

function profile({
  completed,
  sources = [],
  libraryCount = 0,
  settingsError,
}: {
  completed?: boolean;
  sources?: Array<{ removed?: boolean }>;
  libraryCount?: number;
  settingsError?: Error;
} = {}): MobileWelcomeStartupStore & { dataReads: number } {
  const store = {
    dataReads: 0,
    async getSettings() {
      if (settingsError) throw settingsError;
      return { mobileWelcomeCompleted: completed };
    },
    async getInstalledSources() {
      store.dataReads += 1;
      return sources;
    },
    async countLibraryEntries() {
      store.dataReads += 1;
      return libraryCount;
    },
  };
  return store;
}

function device(initial = false, options: { readError?: boolean; markError?: boolean } = {}) {
  const state = { completed: initial, marks: 0 };
  const completion: MobileWelcomeDeviceCompletion = {
    async read() {
      if (options.readError) throw new Error("marker read failed");
      return state.completed;
    },
    async mark() {
      state.marks += 1;
      if (options.markError) throw new Error("marker write failed");
      state.completed = true;
    },
  };
  return { completion, state };
}

describe("shouldShowMobileWelcomeWizard", () => {
  test("a genuinely new install sees the wizard", async () => {
    const { completion, state } = device(false);
    await expect(shouldShowMobileWelcomeWizard(profile(), completion)).resolves.toBe(true);
    expect(state.marks).toBe(0);
  });

  test("finishing onboarding signed out keeps it closed after sign-in to a fresh account profile", async () => {
    const { completion } = device(false);
    // Signed-out profile completes the wizard: the component marks the device.
    await completion.mark();
    // Sign-in switches to an account profile that never saw the wizard.
    await expect(
      shouldShowMobileWelcomeWizard(profile({ completed: undefined }), completion),
    ).resolves.toBe(false);
    // ...and signing out again lands in another empty profile.
    await expect(shouldShowMobileWelcomeWizard(profile(), completion)).resolves.toBe(false);
  });

  test("a profile flag from before the device marker is carried over to the device", async () => {
    const { completion, state } = device(false);
    await expect(
      shouldShowMobileWelcomeWizard(profile({ completed: true }), completion),
    ).resolves.toBe(false);
    expect(state.completed).toBe(true);
    await expect(shouldShowMobileWelcomeWizard(profile(), completion)).resolves.toBe(false);
  });

  test("an account whose data already has installed sources is never onboarded", async () => {
    const { completion, state } = device(false);
    await expect(
      shouldShowMobileWelcomeWizard(profile({ sources: [{}] }), completion),
    ).resolves.toBe(false);
    expect(state.completed).toBe(true);
  });

  test("an account whose data already has library items is never onboarded", async () => {
    const { completion } = device(false);
    await expect(
      shouldShowMobileWelcomeWizard(profile({ libraryCount: 3 }), completion),
    ).resolves.toBe(false);
  });

  test("uninstall tombstones alone are not existing data", async () => {
    const { completion } = device(false);
    await expect(
      shouldShowMobileWelcomeWizard(profile({ sources: [{ removed: true }] }), completion),
    ).resolves.toBe(true);
  });

  test("a completed device skips the data reads entirely", async () => {
    const store = profile();
    const { completion, state } = device(true);
    await expect(shouldShowMobileWelcomeWizard(store, completion)).resolves.toBe(false);
    expect(store.dataReads).toBe(0);
    expect(state.marks).toBe(0);
  });

  test("marker I/O failures fall back to the profile evidence", async () => {
    const unreadable = device(true, { readError: true });
    await expect(
      shouldShowMobileWelcomeWizard(profile(), unreadable.completion),
    ).resolves.toBe(true);
    await expect(
      shouldShowMobileWelcomeWizard(profile({ completed: true }), unreadable.completion),
    ).resolves.toBe(false);
    const unwritable = device(false, { markError: true });
    await expect(
      shouldShowMobileWelcomeWizard(profile({ completed: true }), unwritable.completion),
    ).resolves.toBe(false);
    expect(unwritable.state.marks).toBe(1);
  });

  test("a settings read failure propagates so startup fails closed", async () => {
    const { completion } = device(true);
    await expect(
      shouldShowMobileWelcomeWizard(
        profile({ settingsError: new Error("sqlite busy") }),
        completion,
      ),
    ).rejects.toThrow("sqlite busy");
  });
});
