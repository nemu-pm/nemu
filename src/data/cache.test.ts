import { describe, expect, test } from "bun:test";
import { CacheKeys } from "./keys";
import { ProfileScopedCacheStore, type CacheStore } from "./cache";

class MemoryCacheStore implements CacheStore {
  readonly values = new Map<string, unknown>();

  async get(key: string): Promise<ArrayBuffer | null> {
    return (this.values.get(key) as ArrayBuffer | undefined) ?? null;
  }

  async set(key: string, data: ArrayBuffer): Promise<void> {
    this.values.set(key, data);
  }

  async getJson<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async setJson<T>(key: string, data: T): Promise<void> {
    this.values.set(key, data);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async clear(): Promise<void> {
    this.values.clear();
  }
}

describe("ProfileScopedCacheStore", () => {
  test("keeps authenticated source content isolated between profiles", async () => {
    const base = new MemoryCacheStore();
    const accountA = new ProfileScopedCacheStore(base, "user:account-a");
    const accountB = new ProfileScopedCacheStore(base, "user:account-b");
    const homeKey = CacheKeys.home("registry", "private-source");

    await accountA.setJson(homeKey, { title: "Account A home" });

    expect(await accountA.getJson<{ title: string }>(homeKey)).toEqual({
      title: "Account A home",
    });
    expect(await accountB.getJson<{ title: string }>(homeKey)).toBeNull();
  });

  test("keeps late writes from an old runtime in its original profile", async () => {
    const base = new MemoryCacheStore();
    const oldRuntimeCache = new ProfileScopedCacheStore(base, "user:account-a");
    const activeRuntimeCache = new ProfileScopedCacheStore(base, "user:account-b");
    const mangaKey = CacheKeys.manga("registry", "private-source", "manga");

    await activeRuntimeCache.setJson(mangaKey, { title: "Account B manga" });
    // This represents a request started by A resolving after B became active.
    await oldRuntimeCache.setJson(mangaKey, { title: "Late account A manga" });

    expect(await activeRuntimeCache.getJson<{ title: string }>(mangaKey)).toEqual({
      title: "Account B manga",
    });
    expect(await oldRuntimeCache.getJson<{ title: string }>(mangaKey)).toEqual({
      title: "Late account A manga",
    });
  });

  test("shares only account-independent AIX package artifacts", async () => {
    const base = new MemoryCacheStore();
    const accountA = new ProfileScopedCacheStore(base, "user:account-a");
    const accountB = new ProfileScopedCacheStore(base, "user:account-b");
    const packageKey = CacheKeys.aix("registry", "source");
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    await accountA.set(packageKey, bytes);

    expect(await accountB.get(packageKey)).toEqual(bytes);
    expect([...base.values.keys()]).toEqual([packageKey]);
  });
});
