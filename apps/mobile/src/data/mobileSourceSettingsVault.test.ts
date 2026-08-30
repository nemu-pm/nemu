import { describe, expect, test } from "bun:test";
import type { NativeKVStore } from "./contracts";
import {
  MOBILE_SECURE_STORE_ITEM_MAX_BYTES,
  SecureMobileSourceSettingsVault,
  decodeMobileSourceSettingsVaultMarker,
  encodeMobileSourceSettingsVaultMarker,
  getMobileSourceSettingsDatabaseScope,
} from "./mobileSourceSettingsVault";

class MemoryKV implements NativeKVStore {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];
  failNextChunkWrite = false;
  failRemoveOnce: string | null = null;
  commitThenThrowKey: string | null = null;
  skipPersistKey: string | null = null;

  async getString(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setString(key: string, value: string): Promise<void> {
    if (
      new TextEncoder().encode(value).byteLength >
      MOBILE_SECURE_STORE_ITEM_MAX_BYTES
    ) {
      throw new Error("test storage rejected an oversized SecureStore value");
    }
    if (this.failNextChunkWrite && key.includes(".chunk.")) {
      this.failNextChunkWrite = false;
      throw new Error("simulated interrupted chunk write");
    }
    this.writes.push({ key, value });
    if (this.skipPersistKey === key) {
      this.skipPersistKey = null;
      return;
    }
    this.values.set(key, value);
    if (this.commitThenThrowKey === key) {
      this.commitThenThrowKey = null;
      throw new Error("simulated post-commit native error");
    }
  }

  async remove(key: string): Promise<void> {
    if (this.failRemoveOnce === key) {
      this.failRemoveOnce = null;
      throw new Error("simulated interrupted secure deletion");
    }
    this.values.delete(key);
  }
}

function chunkKeys(storage: MemoryKV, ref: string): string[] {
  return Array.from(storage.values.keys())
    .filter((key) => key.startsWith(`${ref}.chunk.`))
    .sort();
}

describe("SecureMobileSourceSettingsVault", () => {
  test("canonicalizes native SQLite path shapes without retaining absolute paths", () => {
    const absolute = "/data/user/0/pm.nemu.mobile/files/SQLite/nemu-mobile.db";
    expect(getMobileSourceSettingsDatabaseScope(absolute)).toBe(
      "nemu-mobile.db",
    );
    expect(
      getMobileSourceSettingsDatabaseScope({ databasePath: absolute }),
    ).toBe("nemu-mobile.db");
    expect(
      getMobileSourceSettingsDatabaseScope({ uri: `file://${absolute}` }),
    ).toBe("nemu-mobile.db");
    expect(
      getMobileSourceSettingsDatabaseScope({
        pathname: "C:\\private\\profile-a.db",
      }),
    ).toBe("profile-a.db");
    expect(getMobileSourceSettingsDatabaseScope(Object(absolute))).toBe(
      "nemu-mobile.db",
    );
    expect(getMobileSourceSettingsDatabaseScope({})).toBe("default");
    expect(getMobileSourceSettingsDatabaseScope(42)).toBe("default");
    expect(getMobileSourceSettingsDatabaseScope(null)).toBe("default");
    expect(getMobileSourceSettingsDatabaseScope(absolute)).not.toContain(
      "/data/user",
    );
  });

  test("stores credentials only in the secure KV namespace and clears them", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "/private/profile-a.db",
      storage,
    );
    const settings = {
      sourceKey: "aidoku-community:en.example",
      values: { accessToken: "top-secret", quality: "high" },
      updatedAt: 42,
    };

    const ref = await vault.put(settings);
    expect(ref).not.toContain(settings.sourceKey);
    expect(await vault.get(ref, settings.sourceKey)).toEqual(settings);
    expect(Array.from(storage.values.keys())).toContain(ref);

    const markerJson = encodeMobileSourceSettingsVaultMarker(ref);
    expect(markerJson).not.toContain("top-secret");
    expect(decodeMobileSourceSettingsVaultMarker(markerJson)).toEqual({
      __nemuSourceSettingsVault: 1,
      ref,
    });
    expect(
      decodeMobileSourceSettingsVaultMarker(
        JSON.stringify({
          __nemuSourceSettingsVault: 1,
          ref,
          leakedCredential: "must-not-be-accepted-as-a-marker",
        }),
      ),
    ).toBeNull();
    expect(decodeMobileSourceSettingsVaultMarker("not-json")).toBeNull();
    expect(
      decodeMobileSourceSettingsVaultMarker(
        JSON.stringify({
          __nemuSourceSettingsVault: 1,
          ref: "a".repeat(257),
        }),
      ),
    ).toBeNull();

    await vault.clearAll();
    expect(storage.values.size).toBe(0);
    await expect(vault.get(ref, settings.sourceKey)).rejects.toThrow(
      "unavailable",
    );
  });

  test("binds each secure value to its expected source", async () => {
    const vault = new SecureMobileSourceSettingsVault(
      "profile-b.db",
      new MemoryKV(),
    );
    const ref = await vault.put({
      sourceKey: "registry:source-a",
      values: { token: "credential" },
      updatedAt: 1,
    });

    await expect(vault.get(ref, "registry:source-b")).rejects.toThrow(
      "Invalid secure mobile source settings",
    );
    expect(vault.isValidRef("nemu.mobile.last-profile-id")).toBe(false);
    await expect(
      vault.put({
        sourceKey: "registry:oversized",
        values: { token: "x".repeat(512 * 1024) },
        updatedAt: 2,
      }),
    ).rejects.toThrow("safety limit");
  });

  test("chunks large unicode credentials below the portable per-item byte limit", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-large.db",
      storage,
    );
    const settings = {
      sourceKey: "registry:large",
      values: {
        accessToken: `prefix-${"🔐密碼".repeat(8_000)}-suffix`,
      },
      updatedAt: 3,
    };

    const ref = await vault.put(settings);

    expect(chunkKeys(storage, ref).length).toBeGreaterThan(1);
    expect(await vault.get(ref, settings.sourceKey)).toEqual(settings);
    for (const { value } of storage.writes) {
      expect(new TextEncoder().encode(value).byteLength).toBeLessThanOrEqual(
        MOBILE_SECURE_STORE_ITEM_MAX_BYTES,
      );
    }
    expect(storage.values.get(ref)).not.toContain("prefix-");
  });

  test("rejects unsafe value shapes on write without invoking accessors", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-shape-write.db",
      storage,
    );
    let getterCalls = 0;
    const accessorValues: Record<string, unknown> = { token: "safe" };
    Object.defineProperty(accessorValues, "unsafe", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "must-not-run";
      },
    });

    await expect(
      vault.put({
        sourceKey: "registry:accessor",
        values: accessorValues,
        updatedAt: 17,
      }),
    ).rejects.toThrow("unsupported shape");
    await expect(
      vault.put({
        sourceKey: "registry:nested",
        values: { token: "safe", nested: { secret: "unsafe" } },
        updatedAt: 18,
      }),
    ).rejects.toThrow("unsupported shape");
    expect(getterCalls).toBe(0);
    expect(storage.values.size).toBe(0);
  });

  test("salvages bounded scalar and list values from a corrupt legacy record", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-shape-load.db",
      storage,
    );
    const sourceKey = "registry:shape-load";
    const ref = await vault.put({
      sourceKey,
      values: { token: "initial" },
      updatedAt: 19,
    });
    for (const key of chunkKeys(storage, ref)) storage.values.delete(key);
    storage.values.delete(`${ref}.pending`);
    storage.values.set(
      ref,
      JSON.stringify({
        sourceKey,
        values: {
          token: "credential",
          timestamp: 9_999_999_999_999,
          cookies: ["a=1", "b=2"],
          nested: { secret: "unsafe" },
          mixed: ["safe", 1],
          nonFinite: null,
        },
        updatedAt: 20,
      }),
    );

    await expect(vault.get(ref, sourceKey)).resolves.toEqual({
      sourceKey,
      values: {
        token: "credential",
        timestamp: 9_999_999_999_999,
        cookies: ["a=1", "b=2"],
      },
      updatedAt: 20,
    });
  });

  test("fails closed when a committed credential chunk is tampered with", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-tamper.db",
      storage,
    );
    const settings = {
      sourceKey: "registry:tamper",
      values: { accessToken: "s".repeat(4_000) },
      updatedAt: 4,
    };
    const ref = await vault.put(settings);
    const firstChunkKey = chunkKeys(storage, ref)[0]!;
    const chunk = storage.values.get(firstChunkKey)!;
    storage.values.set(
      firstChunkKey,
      `${chunk[0] === "A" ? "B" : "A"}${chunk.slice(1)}`,
    );

    await expect(vault.get(ref, settings.sourceKey)).rejects.toThrow(
      "integrity",
    );
  });

  test("rolls back an interrupted update without losing the committed value", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-rollback.db",
      storage,
    );
    const sourceKey = "registry:rollback";
    const first = {
      sourceKey,
      values: { accessToken: "old-secret".repeat(300) },
      updatedAt: 5,
    };
    const ref = await vault.put(first);
    const oldChunkKeys = chunkKeys(storage, ref);

    storage.failNextChunkWrite = true;
    await expect(
      vault.put({
        sourceKey,
        values: { accessToken: "new-secret".repeat(300) },
        updatedAt: 6,
      }),
    ).rejects.toThrow("interrupted chunk write");

    expect(await vault.get(ref, sourceKey)).toEqual(first);
    expect(chunkKeys(storage, ref)).toEqual(oldChunkKeys);
    expect(
      Array.from(storage.values.keys()).some((key) => key.endsWith(".pending")),
    ).toBe(false);
  });

  test("durably resumes stale-chunk cleanup after a committed update", async () => {
    const storage = new MemoryKV();
    const databasePath = "profile-recovery.db";
    const vault = new SecureMobileSourceSettingsVault(databasePath, storage);
    const sourceKey = "registry:recovery";
    const ref = await vault.put({
      sourceKey,
      values: { accessToken: "old".repeat(1_000) },
      updatedAt: 7,
    });
    const oldChunkKeys = chunkKeys(storage, ref);
    storage.failRemoveOnce = oldChunkKeys[0]!;

    const next = {
      sourceKey,
      values: { accessToken: "new".repeat(1_100) },
      updatedAt: 8,
    };
    await vault.put(next);

    expect(storage.values.has(oldChunkKeys[0]!)).toBe(true);
    expect(storage.values.has(`${ref}.pending`)).toBe(true);

    const afterRestart = new SecureMobileSourceSettingsVault(
      databasePath,
      storage,
    );
    expect(await afterRestart.get(ref, sourceKey)).toEqual(next);
    expect(storage.values.has(oldChunkKeys[0]!)).toBe(false);
    expect(storage.values.has(`${ref}.pending`)).toBe(false);
  });

  test("keeps a manifest that native storage committed before throwing", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-ambiguous.db",
      storage,
    );
    const sourceKey = "registry:ambiguous";
    const ref = await vault.put({
      sourceKey,
      values: { accessToken: "old".repeat(900) },
      updatedAt: 9,
    });
    const next = {
      sourceKey,
      values: { accessToken: "new".repeat(950) },
      updatedAt: 10,
    };
    storage.commitThenThrowKey = ref;

    await expect(vault.put(next)).resolves.toBe(ref);
    expect(await vault.get(ref, sourceKey)).toEqual(next);
    expect(storage.values.has(`${ref}.pending`)).toBe(false);
  });

  test("detects a silently dropped manifest and retains the prior generation", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-silent-drop.db",
      storage,
    );
    const sourceKey = "registry:silent-drop";
    const previous = {
      sourceKey,
      values: { accessToken: "old".repeat(800) },
      updatedAt: 11,
    };
    const ref = await vault.put(previous);
    const previousChunks = chunkKeys(storage, ref);
    storage.skipPersistKey = ref;

    await expect(
      vault.put({
        sourceKey,
        values: { accessToken: "new".repeat(850) },
        updatedAt: 12,
      }),
    ).rejects.toThrow("did not persist a credential manifest");
    expect(await vault.get(ref, sourceKey)).toEqual(previous);
    expect(chunkKeys(storage, ref)).toEqual(previousChunks);
  });

  test("serializes write, read, and removal across vault instances", async () => {
    const storage = new MemoryKV();
    const databasePath = "profile-concurrent.db";
    const firstVault = new SecureMobileSourceSettingsVault(
      databasePath,
      storage,
    );
    const secondVault = new SecureMobileSourceSettingsVault(
      databasePath,
      storage,
    );
    const firstSettings = {
      sourceKey: "registry:concurrent-a",
      values: { token: "a".repeat(2_000) },
      updatedAt: 13,
    };
    const secondSettings = {
      sourceKey: "registry:concurrent-b",
      values: { token: "b".repeat(2_000) },
      updatedAt: 14,
    };

    const firstPut = firstVault.put(firstSettings);
    const secondPut = secondVault.put(secondSettings);
    const firstRef = await firstPut;
    const secondRef = await secondPut;
    await Promise.all([
      firstVault.get(firstRef, firstSettings.sourceKey),
      secondVault.remove(firstRef),
    ]);

    await expect(
      firstVault.get(firstRef, firstSettings.sourceKey),
    ).rejects.toThrow("unavailable");
    expect(await firstVault.get(secondRef, secondSettings.sourceKey)).toEqual(
      secondSettings,
    );
    await secondVault.clearAll();
    expect(storage.values.size).toBe(0);
  });

  test("reads legacy single-item vault values and upgrades them on write", async () => {
    const storage = new MemoryKV();
    const vault = new SecureMobileSourceSettingsVault(
      "profile-legacy.db",
      storage,
    );
    const sourceKey = "registry:legacy";
    const initial = {
      sourceKey,
      values: { token: "legacy-secret" },
      updatedAt: 15,
    };
    const ref = await vault.put(initial);
    for (const key of chunkKeys(storage, ref)) storage.values.delete(key);
    storage.values.delete(`${ref}.pending`);
    storage.values.set(ref, JSON.stringify(initial));

    expect(await vault.get(ref, sourceKey)).toEqual(initial);

    const updated = {
      ...initial,
      values: { token: "updated-secret" },
      updatedAt: 16,
    };
    await vault.put(updated);
    expect(storage.values.get(ref)).not.toContain("updated-secret");
    expect(await vault.get(ref, sourceKey)).toEqual(updated);
  });
});
