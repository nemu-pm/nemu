import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { CacheKeys } from "@/data/keys";
import { createServicesContainer } from "./services";

let sequence = 0;

describe("web services cache profile isolation", () => {
  test("A -> B switches miss user content while sharing source packages", async () => {
    sequence += 1;
    const accountA = createServicesContainer(`user:cache-a:${sequence}`);
    const accountB = createServicesContainer(`user:cache-b:${sequence}`);
    const homeKey = CacheKeys.home(`registry-${sequence}`, "private-source");
    const packageKey = CacheKeys.aix(`registry-${sequence}`, "source");
    const packageBytes = new Uint8Array([4, 5, 6]).buffer;

    try {
      await accountA.cacheStore.setJson(homeKey, { title: "Account A home" });
      await accountA.cacheStore.set(packageKey, packageBytes);

      expect(
        await accountB.cacheStore.getJson<{ title: string }>(homeKey),
      ).toBeNull();
      expect(await accountB.cacheStore.get(packageKey)).toEqual(packageBytes);
    } finally {
      accountA.dispose();
      accountB.dispose();
    }
  });

  test("a disposed profile's late cache write cannot overwrite the active profile", async () => {
    sequence += 1;
    const accountA = createServicesContainer(`user:cache-late-a:${sequence}`);
    const accountB = createServicesContainer(`user:cache-late-b:${sequence}`);
    const mangaKey = CacheKeys.manga(
      `registry-${sequence}`,
      "private-source",
      "manga",
    );

    try {
      accountA.dispose();
      await accountB.cacheStore.setJson(mangaKey, { title: "Account B manga" });

      // A request that escaped runtime disposal still owns A's immutable store.
      await accountA.cacheStore.setJson(mangaKey, { title: "Late A manga" });

      expect(
        await accountB.cacheStore.getJson<{ title: string }>(mangaKey),
      ).toEqual({
        title: "Account B manga",
      });
      expect(
        await accountA.cacheStore.getJson<{ title: string }>(mangaKey),
      ).toEqual({
        title: "Late A manga",
      });
    } finally {
      accountA.dispose();
      accountB.dispose();
    }
  });
});
