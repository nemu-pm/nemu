import { describe, expect, test } from "bun:test";
import { removeMobileSourceAfterSettingsCleanup } from "./mobileSourceUninstall";

describe("mobile source uninstall ordering", () => {
  test("does not tombstone a source when any secure-settings cleanup fails", async () => {
    const events: string[] = [];

    await expect(
      removeMobileSourceAfterSettingsCleanup({
        settingsKeys: ["source:current", "source:legacy"],
        async resetSourceSettings(key) {
          events.push(`reset:${key}`);
          if (key === "source:legacy") {
            throw new Error("secure settings cleanup failed");
          }
        },
        async removeInstalledSource() {
          events.push("remove");
        },
      }),
    ).rejects.toThrow("secure settings cleanup failed");

    expect(events).toEqual([
      "reset:source:current",
      "reset:source:legacy",
    ]);
  });

  test("deduplicates aliases and removes only after cleanup succeeds", async () => {
    const events: string[] = [];
    await removeMobileSourceAfterSettingsCleanup({
      settingsKeys: ["source:current", "source:current"],
      async resetSourceSettings(key) {
        events.push(`reset:${key}`);
      },
      async removeInstalledSource() {
        events.push("remove");
      },
    });

    expect(events).toEqual(["reset:source:current", "remove"]);
  });

  test("clears cached source details alongside the settings scrub", async () => {
    const events: string[] = [];
    await removeMobileSourceAfterSettingsCleanup({
      settingsKeys: ["source:current"],
      async resetSourceSettings(key) {
        events.push(`reset:${key}`);
      },
      async removeInstalledSource() {
        events.push("remove");
      },
      async clearSourceDetailCache() {
        events.push("clear-detail-cache");
      },
    });

    expect(events).toEqual(["reset:source:current", "clear-detail-cache", "remove"]);
  });

  test("a detail-cache clearing failure never blocks the uninstall", async () => {
    const events: string[] = [];
    await removeMobileSourceAfterSettingsCleanup({
      settingsKeys: ["source:current"],
      async resetSourceSettings(key) {
        events.push(`reset:${key}`);
      },
      async removeInstalledSource() {
        events.push("remove");
      },
      async clearSourceDetailCache() {
        throw new Error("detail cache unavailable");
      },
    });

    expect(events).toEqual(["reset:source:current", "remove"]);
  });
});
