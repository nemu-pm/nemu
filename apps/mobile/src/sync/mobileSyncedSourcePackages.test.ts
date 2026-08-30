import { describe, expect, test } from "bun:test";
import type { InstalledSource, SourcePackageMetadata } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import { hydrateMobileSyncedSourcePackages } from "./mobileSyncedSourcePackages";

const ARTIFACT_CACHE_KEY = `aix:${"a".repeat(64)}`;
const SECOND_ARTIFACT_CACHE_KEY = `aix:${"b".repeat(64)}`;

function syncedSource(
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id: "aidoku-community:multi.mangadex",
    registryId: "aidoku-community",
    sourceKind: "aidoku",
    sourceId: "multi.mangadex",
    name: "MangaDex",
    icon: "https://example.test/icon.png",
    languages: ["multi"],
    downloadUrl: "https://example.test/mangadex.aix",
    version: 14,
    updatedAt: 100,
    removed: false,
    ...overrides,
  };
}

const packageMetadata: SourcePackageMetadata = {
  sourceId: "multi.mangadex",
  name: "MangaDex",
  version: 14,
  languages: ["en", "ja"],
  contentRating: 1,
  listings: [],
  filters: [],
  settings: [],
  hasWasm: true,
};

describe("hydrateMobileSyncedSourcePackages", () => {
  test("caches synced installed sources that only have cloud metadata", async () => {
    const calls: MobileRegistrySource[] = [];

    const [source] = await hydrateMobileSyncedSourcePackages(
      [syncedSource()],
      {
        hasPackage: async () => false,
        cachePackage: async (registrySource) => {
          calls.push(registrySource);
          return {
            packageUri: "file:///cache/mangadex.aix",
            packageCacheKey: ARTIFACT_CACHE_KEY,
            metadata: packageMetadata,
          };
        },
      },
    );

    expect(calls).toEqual([
      expect.objectContaining({
        id: "multi.mangadex",
        registryId: "aidoku-community",
        downloadUrl: "https://example.test/mangadex.aix",
      }),
    ]);
    expect(source).toMatchObject({
      packageUri: "file:///cache/mangadex.aix",
      packageCacheKey: ARTIFACT_CACHE_KEY,
      packageMetadata,
      sourceId: "multi.mangadex",
      name: "MangaDex",
      languages: ["en", "ja"],
      updatedAt: 100,
    });
  });

  test("repairs stale package cache metadata when bytes are missing locally", async () => {
    let cacheCalls = 0;

    const [source] = await hydrateMobileSyncedSourcePackages(
      [
        syncedSource({
          packageUri: "file:///cache/old.aix",
          packageCacheKey: "aix:old",
        }),
      ],
      {
        hasPackage: async () => false,
        cachePackage: async () => {
          cacheCalls += 1;
          return {
            packageUri: "file:///cache/new.aix",
            packageCacheKey: SECOND_ARTIFACT_CACHE_KEY,
            metadata: packageMetadata,
          };
        },
      },
    );

    expect(cacheCalls).toBe(1);
    expect(source?.packageUri).toBe("file:///cache/new.aix");
    expect(source?.packageCacheKey).toBe(SECOND_ARTIFACT_CACHE_KEY);
  });

  test("skips sources whose local package metadata is valid without reading bytes", async () => {
    let cacheCalls = 0;
    const checkedKeys: string[] = [];
    const existing = syncedSource({
      packageUri: "file:///cache/existing.aix",
      packageCacheKey: ARTIFACT_CACHE_KEY,
      packageMetadata,
    });

    const [source] = await hydrateMobileSyncedSourcePackages([existing], {
      hasPackage: async (key) => {
        checkedKeys.push(key);
        return true;
      },
      cachePackage: async () => {
        cacheCalls += 1;
        return {
          packageUri: "file:///cache/new.aix",
          packageCacheKey: SECOND_ARTIFACT_CACHE_KEY,
          metadata: packageMetadata,
        };
      },
    });

    expect(cacheCalls).toBe(0);
    expect(checkedKeys).toEqual([ARTIFACT_CACHE_KEY]);
    expect(source).toBe(existing);
  });

  test("keeps source metadata when hydration fails", async () => {
    const errors: unknown[] = [];
    const existing = syncedSource();

    const [source] = await hydrateMobileSyncedSourcePackages([existing], {
      hasPackage: async () => false,
      cachePackage: async () => {
        throw new Error("network unavailable");
      },
      onHydrationError: (_source, error) => errors.push(error),
    });

    expect(source).toBe(existing);
    expect(errors).toHaveLength(1);
  });

  test("uses the installed record key as the durable registry package identity", async () => {
    const calls: MobileRegistrySource[] = [];
    const [source] = await hydrateMobileSyncedSourcePackages(
      [syncedSource({ sourceId: "stale.mutable.id" })],
      {
        hasPackage: async () => false,
        cachePackage: async (registrySource) => {
          calls.push(registrySource);
          return {
            packageUri: "file:///cache/canonical.aix",
            packageCacheKey: ARTIFACT_CACHE_KEY,
            metadata: packageMetadata,
          };
        },
      },
    );

    expect(calls[0]?.id).toBe("multi.mangadex");
    expect(calls[0]?.version).toBe(14);
    expect(source?.sourceId).toBe("multi.mangadex");
  });

  test("rehydrates legacy mutable AIX keys even when their bytes still exist", async () => {
    let cacheCalls = 0;
    const [source] = await hydrateMobileSyncedSourcePackages(
      [
        syncedSource({
          packageUri: "file:///cache/legacy.aix",
          packageCacheKey: "aix:aidoku-community:multi.mangadex",
          packageMetadata,
        }),
      ],
      {
        hasPackage: async () => true,
        cachePackage: async () => {
          cacheCalls += 1;
          return {
            packageUri: "file:///cache/immutable.aix",
            packageCacheKey: ARTIFACT_CACHE_KEY,
            metadata: packageMetadata,
          };
        },
      },
    );

    expect(cacheCalls).toBe(1);
    expect(source?.packageCacheKey).toBe(ARTIFACT_CACHE_KEY);
  });

  test("rejects a downloaded package whose identity does not match the installed record", async () => {
    const errors: unknown[] = [];
    const existing = syncedSource({ sourceId: "stale.mutable.id" });
    const [source] = await hydrateMobileSyncedSourcePackages([existing], {
      hasPackage: async () => false,
      cachePackage: async () => ({
        packageUri: "file:///cache/mismatched.aix",
        packageCacheKey: ARTIFACT_CACHE_KEY,
        metadata: { ...packageMetadata, sourceId: "stale.mutable.id" },
      }),
      onHydrationError: (_source, error) => errors.push(error),
    });

    expect(source).toBe(existing);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("identity or version");
  });

  test("rejects downloaded AIX bytes that retain a legacy mutable cache key", async () => {
    const errors: unknown[] = [];
    const existing = syncedSource();
    const [source] = await hydrateMobileSyncedSourcePackages([existing], {
      hasPackage: async () => false,
      cachePackage: async () => ({
        packageUri: "file:///cache/legacy.aix",
        packageCacheKey: "aix:aidoku-community:multi.mangadex",
        metadata: packageMetadata,
      }),
      onHydrationError: (_source, error) => errors.push(error),
    });

    expect(source).toBe(existing);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("immutable artifact key");
  });

  test("does not download Tachiyomi APKs when this build has no executor", async () => {
    let packageChecks = 0;
    let downloads = 0;
    const existing = syncedSource({
      id: "tachiyomi-community:en.example",
      registryId: "tachiyomi-community",
      sourceKind: "tachiyomi",
      sourceId: "en.example",
      downloadUrl: "https://example.test/example.apk",
      packageUri: null,
      packageCacheKey: null,
    });

    const [source] = await hydrateMobileSyncedSourcePackages([existing], {
      hasPackage: async () => {
        packageChecks += 1;
        return false;
      },
      cachePackage: async () => {
        downloads += 1;
        return {
          packageUri: "file:///cache/example.apk",
          packageCacheKey: "tachiyomi:example",
          metadata: null,
        };
      },
    });

    expect(source).toBe(existing);
    expect(packageChecks).toBe(0);
    expect(downloads).toBe(0);
  });

  test("stops starting package downloads after its sync epoch is cancelled", async () => {
    const calls: string[] = [];
    let active = true;
    const sources = [
      syncedSource(),
      syncedSource({ id: "aidoku-community:en.second", sourceId: "en.second" }),
    ];

    const result = await hydrateMobileSyncedSourcePackages(sources, {
      hasPackage: async () => false,
      cachePackage: async (source) => {
        calls.push(source.id);
        active = false;
        return {
          packageUri: `file:///cache/${source.id}.aix`,
          packageCacheKey: ARTIFACT_CACHE_KEY,
          metadata: packageMetadata,
        };
      },
      shouldContinue: () => active,
    });

    expect(calls).toEqual(["multi.mangadex"]);
    expect(result).toBe(sources);
  });

  test("aborts an in-flight package hydration without publishing or reporting an error", async () => {
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let receivedSignal: AbortSignal | undefined;
    const hydrationErrors: unknown[] = [];
    const sources = [syncedSource()];

    const running = hydrateMobileSyncedSourcePackages(sources, {
      signal: controller.signal,
      hasPackage: async () => false,
      cachePackage: async (_source, options) => {
        receivedSignal = options?.signal;
        markStarted();
        return new Promise<never>((_resolve, reject) => {
          const rejectForAbort = () => {
            const error = new Error("cancelled");
            error.name = "AbortError";
            reject(error);
          };
          if (options?.signal?.aborted) rejectForAbort();
          else options?.signal?.addEventListener("abort", rejectForAbort, {
            once: true,
          });
        });
      },
      onHydrationError: (_source, error) => hydrationErrors.push(error),
    });

    await started;
    controller.abort();

    expect(await running).toBe(sources);
    expect(receivedSignal).toBe(controller.signal);
    expect(receivedSignal?.aborted).toBe(true);
    expect(hydrationErrors).toEqual([]);
  });
});
