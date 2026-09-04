import { beforeEach, describe, expect, test } from "bun:test";
import {
  beginMobileSyncProgress,
  getMobileSyncProgress,
  isMobileSyncProgressComplete,
  markMobileSyncProgressDomain,
  pauseMobileSyncProgress,
  resetMobileSyncProgress,
  resetMobileSyncProgressForTesting,
  subscribeMobileSyncProgress,
} from "./mobileSyncProgress";

beforeEach(() => {
  resetMobileSyncProgressForTesting();
});

describe("mobileSyncProgress", () => {
  test("begins syncing for an account from idle", () => {
    beginMobileSyncProgress("user-a");
    expect(getMobileSyncProgress()).toMatchObject({
      status: "syncing",
      accountUserId: "user-a",
    });
  });

  test("begin is idempotent for the same active run", () => {
    beginMobileSyncProgress("user-a");
    markMobileSyncProgressDomain("user-a", "library");
    beginMobileSyncProgress("user-a");
    expect(getMobileSyncProgress().status).toBe("syncing");
    expect(getMobileSyncProgress().domainsCompleted.library).toBe(true);
  });

  test("a different account restarts tracking", () => {
    beginMobileSyncProgress("user-a");
    markMobileSyncProgressDomain("user-a", "library");
    beginMobileSyncProgress("user-b");
    expect(getMobileSyncProgress()).toMatchObject({
      status: "syncing",
      accountUserId: "user-b",
      libraryCount: null,
    });
    expect(
      getMobileSyncProgress().domainsCompleted.library,
    ).toBe(false);
  });

  test("completes only after all three domains applied", () => {
    beginMobileSyncProgress("user-a");
    markMobileSyncProgressDomain("user-a", "library", { libraryCount: 12 });
    expect(getMobileSyncProgress().status).toBe("syncing");
    markMobileSyncProgressDomain("user-a", "settings", { sourceCount: 3 });
    expect(getMobileSyncProgress().status).toBe("syncing");
    markMobileSyncProgressDomain("user-a", "progress");
    expect(getMobileSyncProgress()).toMatchObject({
      status: "completed",
      libraryCount: 12,
      sourceCount: 3,
    });
  });

  test("duplicate domain marks are ignored", () => {
    beginMobileSyncProgress("user-a");
    markMobileSyncProgressDomain("user-a", "library", { libraryCount: 5 });
    markMobileSyncProgressDomain("user-a", "library", { libraryCount: 99 });
    expect(getMobileSyncProgress().libraryCount).toBe(5);
  });

  test("marks from another account are ignored", () => {
    beginMobileSyncProgress("user-a");
    markMobileSyncProgressDomain("user-b", "library");
    expect(getMobileSyncProgress().domainsCompleted.library).toBe(false);
  });

  test("marks after completion are ignored", () => {
    beginMobileSyncProgress("user-a");
    for (const domain of ["library", "progress", "settings"] as const) {
      markMobileSyncProgressDomain("user-a", domain);
    }
    expect(getMobileSyncProgress().status).toBe("completed");
    markMobileSyncProgressDomain("user-a", "library", { libraryCount: 1 });
    expect(getMobileSyncProgress().libraryCount).toBe(null);
  });

  test("pause parks a syncing run for the same account only", () => {
    beginMobileSyncProgress("user-a");
    pauseMobileSyncProgress("user-b");
    expect(getMobileSyncProgress().status).toBe("syncing");
    pauseMobileSyncProgress("user-a");
    expect(getMobileSyncProgress().status).toBe("paused");
  });

  test("begin never restarts a paused run for the same account", () => {
    // The snapshot-gate effect re-runs on every sync-status revision; a
    // restart there would republish `syncing` over the parked run and make
    // the toast flip between warning and spinner.
    beginMobileSyncProgress("user-a");
    pauseMobileSyncProgress("user-a");
    beginMobileSyncProgress("user-a");
    expect(getMobileSyncProgress().status).toBe("paused");
  });

  test("begin never restarts a completed run for the same account", () => {
    beginMobileSyncProgress("user-a");
    for (const domain of ["library", "progress", "settings"] as const) {
      markMobileSyncProgressDomain("user-a", domain);
    }
    beginMobileSyncProgress("user-a");
    expect(getMobileSyncProgress().status).toBe("completed");
  });

  test("a different account takes over a parked run", () => {
    beginMobileSyncProgress("user-a");
    pauseMobileSyncProgress("user-a");
    beginMobileSyncProgress("user-b");
    expect(getMobileSyncProgress()).toMatchObject({
      status: "syncing",
      accountUserId: "user-b",
    });
  });

  test("reset clears state, scoped to an account when given", () => {
    beginMobileSyncProgress("user-a");
    resetMobileSyncProgress("user-b");
    expect(getMobileSyncProgress().status).toBe("syncing");
    resetMobileSyncProgress("user-a");
    expect(getMobileSyncProgress().status).toBe("idle");
    resetMobileSyncProgress();
    expect(getMobileSyncProgress().status).toBe("idle");
  });

  test("notifies subscribers on transitions only", () => {
    const events: string[] = [];
    subscribeMobileSyncProgress(() => events.push("changed"));
    beginMobileSyncProgress("user-a");
    beginMobileSyncProgress("user-a");
    markMobileSyncProgressDomain("user-a", "library");
    expect(events).toHaveLength(2);
  });
});

describe("isMobileSyncProgressComplete", () => {
  test("requires every domain", () => {
    expect(
      isMobileSyncProgressComplete({
        library: true,
        progress: true,
        settings: false,
      }),
    ).toBe(false);
    expect(
      isMobileSyncProgressComplete({
        library: true,
        progress: true,
        settings: true,
      }),
    ).toBe(true);
  });
});
