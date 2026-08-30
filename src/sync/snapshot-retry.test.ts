import { beforeEach, describe, expect, test } from "bun:test";
import {
  getSyncSnapshotRetryAttempt,
  requestSyncSnapshotRetry,
  resetSyncSnapshotRetry,
  subscribeSyncSnapshotRetry,
} from "./snapshot-retry";

describe("sync snapshot retry channel", () => {
  beforeEach(() => {
    resetSyncSnapshotRetry();
  });

  test("changes the mount key so a stopped round can start over", () => {
    // SyncSetup keys its run on this value. An exhausted snapshot budget used
    // to disable sync for the whole session with no way to re-drive the
    // paginated subscriptions from page one.
    const before = getSyncSnapshotRetryAttempt();
    requestSyncSnapshotRetry();
    expect(getSyncSnapshotRetryAttempt()).not.toBe(before);
  });

  test("notifies every subscriber on each request", () => {
    let first = 0;
    let second = 0;
    const unsubscribeFirst = subscribeSyncSnapshotRetry(() => {
      first += 1;
    });
    const unsubscribeSecond = subscribeSyncSnapshotRetry(() => {
      second += 1;
    });

    requestSyncSnapshotRetry();
    requestSyncSnapshotRetry();
    expect(first).toBe(2);
    expect(second).toBe(2);

    unsubscribeFirst();
    requestSyncSnapshotRetry();
    expect(first).toBe(2);
    expect(second).toBe(3);
    unsubscribeSecond();
  });

  test("keeps a stable value between requests so React does not loop", () => {
    requestSyncSnapshotRetry();
    const attempt = getSyncSnapshotRetryAttempt();
    expect(getSyncSnapshotRetryAttempt()).toBe(attempt);
  });
});
