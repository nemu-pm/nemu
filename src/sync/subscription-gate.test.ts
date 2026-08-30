import { afterEach, describe, expect, test } from "bun:test";
import {
  getSyncSubscriptionsStopped,
  setSyncSubscriptionsStopped,
  subscribeSyncSubscriptionsStopped,
} from "./subscription-gate";

afterEach(() => setSyncSubscriptionsStopped(false));

describe("web sync subscription gate", () => {
  test("notifies Convex-hook consumers when destructive work pauses and resumes", () => {
    const snapshots: boolean[] = [];
    const unsubscribe = subscribeSyncSubscriptionsStopped(() => {
      snapshots.push(getSyncSubscriptionsStopped());
    });

    setSyncSubscriptionsStopped(true);
    setSyncSubscriptionsStopped(true);
    setSyncSubscriptionsStopped(false);
    unsubscribe();
    setSyncSubscriptionsStopped(true);

    expect(snapshots).toEqual([true, false]);
  });
});
