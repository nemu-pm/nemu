import { describe, expect, test } from "bun:test";
import {
  decodeSandboxPersistedSettings,
  encodeSandboxSettingsPatch,
  SandboxSettingsTransaction,
} from "../../modules/nemu-aidoku/runtime/aidokuSandboxSettings";

describe("Android Aidoku sandbox settings transactions", () => {
  test("round-trips every supported durable setting type", () => {
    const encoded = encodeSandboxSettingsPatch({
      empty: null,
      enabled: true,
      count: 42,
      label: "猫",
      languages: ["en", "ja"],
      token: Uint8Array.of(0, 127, 255),
    });

    const decoded = decodeSandboxPersistedSettings(
      JSON.parse(JSON.stringify(encoded)),
    );
    expect(decoded).toEqual({
      empty: null,
      enabled: true,
      count: 42,
      label: "猫",
      languages: ["en", "ja"],
      token: Uint8Array.of(0, 127, 255),
    });
  });

  test("discards replay writes and commits only the final-run patch", () => {
    const defaults = { endpoint: "default", language: "ja" };
    const persisted = { session: "old", language: "fr" };
    const user = { language: "en" };

    const abandonedReplay = new SandboxSettingsTransaction(
      defaults,
      persisted,
      user,
    );
    abandonedReplay.set("session", "transient");
    expect(abandonedReplay.get("session")).toBe("transient");
    expect(abandonedReplay.get("language")).toBe("en");

    // A replay starts from the committed snapshot, not the abandoned overlay.
    const finalRun = new SandboxSettingsTransaction(defaults, persisted, user);
    expect(finalRun.get("session")).toBe("old");
    finalRun.set("session", "committed");
    finalRun.set("language", "source-value");
    const patch = decodeSandboxPersistedSettings(
      JSON.parse(JSON.stringify(finalRun.encodedPatch())),
    );

    const nextOperation = new SandboxSettingsTransaction(
      defaults,
      { ...persisted, ...patch },
      user,
    );
    expect(nextOperation.get("session")).toBe("committed");
    // Explicit user settings remain authoritative over source persistence.
    expect(nextOperation.get("language")).toBe("en");
  });

  test("rejects unbounded or non-persistable values at the setter boundary", () => {
    const transaction = new SandboxSettingsTransaction({}, {}, {});

    expect(() => transaction.set("", "invalid")).toThrow();
    expect(() => transaction.set("object", { nested: true })).toThrow();
    expect(() => transaction.set("infinite", Number.POSITIVE_INFINITY)).toThrow();
    expect(() => transaction.set("bytes", new Uint8Array(64 * 1024 + 1))).toThrow();
  });
});
