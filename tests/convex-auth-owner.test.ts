import { describe, expect, test } from "bun:test";
import { requireAuthForUser } from "../convex/_lib";
import { requireSyncMutationContext } from "../convex/syncCompatibility";

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
  test("rejects ownerless writes under every transport identity", async () => {
    await expect(
      requireSyncMutationContext(
        syncContextFor("account-a", [0]),
        {},
      ),
    ).rejects.toThrow("SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED");
    await expect(
      requireSyncMutationContext(
        syncContextFor("account-b", [0]),
        {},
      ),
    ).rejects.toThrow("SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED");
  });

  test("rejects ownerless writes independently of account generation", async () => {
    await expect(
      requireSyncMutationContext(
        syncContextFor("account-a", [1, 3, 2]),
        {},
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
