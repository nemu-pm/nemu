import { afterEach, describe, expect, test } from "bun:test";
import { readSyncGenerationObservation } from "../convex/sync";

const originalDateNow = Date.now;

afterEach(() => {
  Date.now = originalDateNow;
});

function contextFor(generations: number[]) {
  return {
    auth: {
      getUserIdentity: async () => ({ subject: "account-a" }),
    },
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

describe("Convex sync clock observation contract", () => {
  test("returns the authenticated account generation and server execution time", async () => {
    Date.now = () => 1_700_000_000_123;
    await expect(
      readSyncGenerationObservation(contextFor([1, 4, 2])),
    ).resolves.toEqual({
      generation: 4,
      serverNow: 1_700_000_000_123,
      chapterProgressIntraPageVersion: 1,
    });
  });
});
