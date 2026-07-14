import { describe, expect, test } from "bun:test";
import { orchestrateRemoteFirstSignOut } from "./sign-out-orchestration";

describe("orchestrateRemoteFirstSignOut", () => {
  test("commits local data only after remote sign-out is confirmed", async () => {
    const calls: string[] = [];

    await orchestrateRemoteFirstSignOut({
      prepareLocalSignOut: () => {
        calls.push("prepare");
        return async () => {
          calls.push("local-commit");
        };
      },
      signOutRemotely: async () => {
        calls.push("remote-start");
        await Promise.resolve();
        calls.push("remote-confirmed");
      },
      resumeAfterRemoteFailure: () => {
        calls.push("resume");
      },
    });

    expect(calls).toEqual([
      "prepare",
      "remote-start",
      "remote-confirmed",
      "local-commit",
    ]);
  });

  test("does not mutate local data and resumes sync when remote sign-out fails", async () => {
    const calls: string[] = [];

    await expect(
      orchestrateRemoteFirstSignOut({
        prepareLocalSignOut: () => {
          calls.push("prepare");
          return async () => {
            calls.push("local-commit");
          };
        },
        signOutRemotely: async () => {
          calls.push("remote-start");
          throw new Error("offline");
        },
        resumeAfterRemoteFailure: () => {
          calls.push("resume");
        },
      }),
    ).rejects.toThrow("offline");

    expect(calls).toEqual(["prepare", "remote-start", "resume"]);
  });

  test("does not resume authenticated sync after a post-signout local failure", async () => {
    let resumeCalls = 0;

    await expect(
      orchestrateRemoteFirstSignOut({
        prepareLocalSignOut: () => async () => {
          throw new Error("local cleanup failed");
        },
        signOutRemotely: async () => undefined,
        resumeAfterRemoteFailure: () => {
          resumeCalls += 1;
        },
      }),
    ).rejects.toThrow("local cleanup failed");

    expect(resumeCalls).toBe(0);
  });
});
