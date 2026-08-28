import { describe, expect, test } from "bun:test";
import { requireAuthForUser } from "../convex/_lib";
import {
  requireSyncMutationContext,
  resolveLegacySyncWritePolicy,
} from "../convex/syncCompatibility";

function contextFor(subject: string | null) {
  return {
    auth: {
      getUserIdentity: async () =>
        subject === null ? null : ({ subject } as never),
    },
  } as never;
}

describe("Convex queued sync mutation ownership", () => {
  test("accepts a mutation only for the authenticated owner it captured", async () => {
    await expect(requireAuthForUser(contextFor("account-a"), "account-a"))
      .resolves.toBe("account-a");
  });

  test("rejects a queued account-A mutation replayed after authentication becomes B", async () => {
    await expect(requireAuthForUser(contextFor("account-b"), "account-a"))
      .rejects.toThrow("AUTH_ACCOUNT_MISMATCH");
  });
});

function syncContextFor(subject: string | null, generations: number[]) {
  return {
    ...contextFor(subject),
    db: {
      query: () => ({
        withIndex: () => ({
          collect: async () =>
            generations.map((generation) => ({ generation })),
        }),
      }),
    },
  } as never;
}

describe("Convex legacy sync compatibility", () => {
  // Convex deploys independently of the web bundle, so for the whole rollout
  // window every live client is still sending an argument object with neither
  // fencing field. Rejecting those payloads discarded 100% of their writes.
  test("accepts a legacy-shaped payload instead of discarding the write", async () => {
    await expect(
      requireSyncMutationContext(syncContextFor("account-a", [0]), {}),
    ).resolves.toMatchObject({
      userId: "account-a",
      generation: 0,
      legacy: true,
    });
  });

  test("derives the legacy account from auth, never from client input", async () => {
    // The payload carries no owner at all, so the only possible answer is the
    // account the transport is authenticated as. A queued payload replayed on
    // a reconnected socket can never be steered at another user's data.
    const asA = await requireSyncMutationContext(
      syncContextFor("account-a", [0]),
      {},
    );
    const asB = await requireSyncMutationContext(
      syncContextFor("account-b", [0]),
      {},
    );
    expect(asA.userId).toBe("account-a");
    expect(asB.userId).toBe("account-b");
  });

  test("refuses a legacy write with no authenticated transport", async () => {
    await expect(
      requireSyncMutationContext(syncContextFor(null, [0]), {}),
    ).rejects.toThrow("Not authenticated");
  });

  test("lands a legacy write in the account's current generation", async () => {
    // A legacy client cannot name a generation, so it writes wherever the
    // account currently is rather than into the abandoned generation zero.
    await expect(
      requireSyncMutationContext(syncContextFor("account-a", [1, 3, 2]), {}),
    ).resolves.toMatchObject({
      userId: "account-a",
      generation: 3,
      legacy: true,
    });
  });

  test("falls back to the server clock for a legacy payload", async () => {
    // Legacy payloads predate the logical clock requirement. Requiring one
    // would reject the very writes this path exists to accept.
    const legacy = await requireSyncMutationContext(
      syncContextFor("account-a", [3]),
      {},
    );
    expect(legacy.resolveClock(undefined, 42)).toBe(42);
    expect(legacy.resolveClock(41, 42)).toBe(41);
  });

  test("keeps rollout compatibility by default and supports a bounded cutoff", () => {
    expect(resolveLegacySyncWritePolicy(undefined, 1_000)).toEqual({
      allow: true,
      cutoffAt: null,
      reason: "compatibility-default",
    });
    expect(resolveLegacySyncWritePolicy("2000", 1_000)).toEqual({
      allow: true,
      cutoffAt: 2_000,
      reason: "before-cutoff",
    });
    expect(resolveLegacySyncWritePolicy("1970-01-01T00:00:02.000Z", 2_000)).toEqual({
      allow: false,
      cutoffAt: 2_000,
      reason: "cutoff-reached",
    });
    expect(resolveLegacySyncWritePolicy("not-a-date", 1_000)).toEqual({
      allow: false,
      cutoffAt: null,
      reason: "invalid-cutoff",
    });
    expect(resolveLegacySyncWritePolicy("   ", 1_000)).toEqual({
      allow: false,
      cutoffAt: null,
      reason: "invalid-cutoff",
    });
  });

  test("emits grace telemetry before cutoff and rejects with upgrade-required at cutoff", async () => {
    const events: unknown[] = [];
    await expect(
      requireSyncMutationContext(
        syncContextFor("account-a", [3]),
        {},
        {
          cutoffValue: "2000",
          now: 1_999,
          onLegacyTelemetry: (event) => events.push(event),
        },
      ),
    ).resolves.toMatchObject({ legacy: true, generation: 3 });
    await expect(
      requireSyncMutationContext(
        syncContextFor("account-a", [3]),
        {},
        {
          cutoffValue: "2000",
          now: 2_000,
          onLegacyTelemetry: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow("SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED");
    expect(events).toEqual([
      {
        event: "legacy-sync-write-grace",
        generation: 3,
        cutoffAt: 2_000,
      },
      {
        event: "legacy-sync-write-rejected",
        generation: 3,
        cutoffAt: 2_000,
      },
    ]);
  });

  test("fails closed on an explicitly invalid cutoff configuration", async () => {
    await expect(
      requireSyncMutationContext(
        syncContextFor("account-a", [1]),
        {},
        {
          cutoffValue: "tomorrow-ish",
          now: 1_000,
          onLegacyTelemetry: () => undefined,
        },
      ),
    ).rejects.toThrow("SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED");
  });

  test("rejects partially fenced mutation payloads", async () => {
    const ctx = syncContextFor("account-a", [0]);
    await expect(
      requireSyncMutationContext(ctx, { expectedUserId: "account-a" }),
    ).rejects.toThrow("SYNC_MUTATION_CONTEXT_REQUIRED");
    await expect(
      requireSyncMutationContext(ctx, { generation: 0 }),
    ).rejects.toThrow("SYNC_MUTATION_CONTEXT_REQUIRED");
  });

  test("keeps current clients strictly generation fenced", async () => {
    const ctx = syncContextFor("account-a", [3]);
    await expect(
      requireSyncMutationContext(ctx, { expectedUserId: "account-a" }),
    ).rejects.toThrow("SYNC_MUTATION_CONTEXT_REQUIRED");
    await expect(
      requireSyncMutationContext(ctx, {
        expectedUserId: "account-a",
        generation: 2,
      }),
    ).rejects.toThrow("SYNC_GENERATION_MISMATCH");
    await expect(
      requireSyncMutationContext(ctx, {
        expectedUserId: "account-a",
        generation: 3,
      }),
    ).resolves.toMatchObject({
      userId: "account-a",
      generation: 3,
      legacy: false,
    });
  });

  test("requires an explicit clock for every accepted payload", async () => {
    const current = await requireSyncMutationContext(
      syncContextFor("account-a", [3]),
      { expectedUserId: "account-a", generation: 3 },
    );
    expect(() => current.resolveClock(undefined, 42)).toThrow(
      "SYNC_CLOCK_REQUIRED",
    );
    expect(current.resolveClock(41, 42)).toBe(41);
  });
});
