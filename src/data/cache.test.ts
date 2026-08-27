import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { CacheKeys } from "./keys";
import {
  IndexedDBCacheStore,
  ProfileScopedCacheStore,
  deleteProfileCacheEntries,
  isLegacyUnscopedCacheKey,
  profileCacheKeyPrefix,
  sweepLegacyCacheEntries,
  type CacheStore,
  type CacheStoreMaintenance,
} from "./cache";
import { IndexedDBUserDataStore } from "./indexeddb";

class MemoryCacheStore implements CacheStore, CacheStoreMaintenance {
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

  async deleteMatchingKeys(predicate: (key: string) => boolean): Promise<number> {
    let deleted = 0;
    for (const key of [...this.values.keys()]) {
      if (predicate(key)) {
        this.values.delete(key);
        deleted += 1;
      }
    }
    return deleted;
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

describe("profileCacheKeyPrefix", () => {
  test("separates the anonymous profile from owned ones", () => {
    expect(profileCacheKeyPrefix(undefined)).toBe("profile-cache:anonymous:");
    expect(profileCacheKeyPrefix("user:abc")).toBe("profile-cache:owned:user%3Aabc:");
  });

  test("one profile's prefix never prefixes another's", () => {
    expect(
      profileCacheKeyPrefix("user:ab").startsWith(profileCacheKeyPrefix("user:a")),
    ).toBe(false);
  });
});

describe("isLegacyUnscopedCacheKey", () => {
  test("flags pre-namespacing user content", () => {
    expect(isLegacyUnscopedCacheKey(CacheKeys.image("https://host/page.jpg"))).toBe(true);
    expect(isLegacyUnscopedCacheKey(CacheKeys.manga("registry", "source", "1"))).toBe(true);
  });

  test("keeps shared source packages and namespaced entries", () => {
    expect(isLegacyUnscopedCacheKey(CacheKeys.aix("registry", "source"))).toBe(false);
    expect(isLegacyUnscopedCacheKey("profile-cache:anonymous:image:abc")).toBe(false);
    expect(isLegacyUnscopedCacheKey("profile-cache:owned:user%3Aa:image:abc")).toBe(false);
  });
});

describe("deleteProfileCacheEntries", () => {
  test("removes one profile's user content and nothing else", async () => {
    const base = new MemoryCacheStore();
    const accountA = new ProfileScopedCacheStore(base, "user:account-a");
    const accountB = new ProfileScopedCacheStore(base, "user:account-b");
    const anonymous = new ProfileScopedCacheStore(base, undefined);
    const imageKey = CacheKeys.image("https://host/page.jpg");
    const packageKey = CacheKeys.aix("registry", "source");
    const bytes = (value: number) => new Uint8Array([value]).buffer;

    await accountA.set(imageKey, bytes(1));
    await accountA.set(packageKey, bytes(2));
    await accountB.set(imageKey, bytes(3));
    await anonymous.set(imageKey, bytes(4));

    expect(await deleteProfileCacheEntries("user:account-a", base)).toBe(1);

    expect(await accountA.get(imageKey)).toBeNull();
    // Account-independent source packages survive an account removal.
    expect(await accountA.get(packageKey)).toEqual(bytes(2));
    expect(await accountB.get(imageKey)).toEqual(bytes(3));
    expect(await anonymous.get(imageKey)).toEqual(bytes(4));
  });

  test("removes the anonymous profile's content without touching owned ones", async () => {
    const base = new MemoryCacheStore();
    const anonymous = new ProfileScopedCacheStore(base, undefined);
    const account = new ProfileScopedCacheStore(base, "user:account-a");
    const key = CacheKeys.image("https://host/page.jpg");
    const bytes = (value: number) => new Uint8Array([value]).buffer;

    await anonymous.set(key, bytes(1));
    await account.set(key, bytes(2));

    expect(await deleteProfileCacheEntries(undefined, base)).toBe(1);
    expect(await anonymous.get(key)).toBeNull();
    expect(await account.get(key)).toEqual(bytes(2));
  });
});

describe("sweepLegacyCacheEntries", () => {
  test("collects un-namespaced entries orphaned by profile namespacing", async () => {
    const base = new MemoryCacheStore();
    const profile = new ProfileScopedCacheStore(base, "user:account-a");
    const legacyImage = CacheKeys.image("https://host/legacy.jpg");
    const legacyManga = CacheKeys.manga("registry", "source", "legacy");
    const packageKey = CacheKeys.aix("registry", "source");
    const bytes = (value: number) => new Uint8Array([value]).buffer;

    // Written the way an older build wrote them: no profile prefix.
    await base.set(legacyImage, bytes(1));
    await base.set(legacyManga, bytes(2));
    await base.set(packageKey, bytes(3));
    await profile.set(legacyImage, bytes(4));

    expect(await sweepLegacyCacheEntries(base)).toBe(2);

    expect(base.values.has(legacyImage)).toBe(false);
    expect(base.values.has(legacyManga)).toBe(false);
    expect(base.values.has(packageKey)).toBe(true);
    expect(await profile.get(legacyImage)).toEqual(bytes(4));
  });
});

describe("IndexedDBCacheStore.deleteMatchingKeys", () => {
  test("deletes exactly the matching keys in one pass", async () => {
    const store = new IndexedDBCacheStore();
    const suffix = `${Date.now()}-${Math.random()}`;
    const bytes = (value: number) => new Uint8Array([value]).buffer;
    const doomed = `doomed:${suffix}`;
    const kept = `kept:${suffix}`;

    await store.set(doomed, bytes(1));
    await store.set(kept, bytes(2));

    expect(await store.deleteMatchingKeys((key) => key === doomed)).toBe(1);
    expect(await store.get(doomed)).toBeNull();
    expect(await store.get(kept)).toEqual(bytes(2));
  });
});

describe("clearAccountData", () => {
  test("also removes the profile's cached (possibly authenticated) content", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const profileId = `user:clear-${suffix}`;
    const store = new IndexedDBCacheStore();
    const profileCache = new ProfileScopedCacheStore(store, profileId);
    const imageKey = CacheKeys.image(`https://host/${suffix}.jpg`);
    const packageKey = CacheKeys.aix(`registry-${suffix}`, "source");
    const bytes = (value: number) => new Uint8Array([value]).buffer;

    await profileCache.set(imageKey, bytes(1));
    await profileCache.set(packageKey, bytes(2));

    await new IndexedDBUserDataStore(profileId).clearAccountData();

    expect(await profileCache.get(imageKey)).toBeNull();
    expect(await profileCache.get(packageKey)).toEqual(bytes(2));
  });

  test("clearing one profile leaves another profile's cache alone", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const keptProfileId = `user:kept-${suffix}`;
    const clearedProfileId = `user:cleared-${suffix}`;
    const store = new IndexedDBCacheStore();
    const keptCache = new ProfileScopedCacheStore(store, keptProfileId);
    const clearedCache = new ProfileScopedCacheStore(store, clearedProfileId);
    const key = CacheKeys.image(`https://host/${suffix}.jpg`);
    const bytes = (value: number) => new Uint8Array([value]).buffer;

    await keptCache.set(key, bytes(1));
    await clearedCache.set(key, bytes(2));

    await new IndexedDBUserDataStore(clearedProfileId).clearAccountData();

    expect(await keptCache.get(key)).toEqual(bytes(1));
    expect(await clearedCache.get(key)).toBeNull();
  });
});
