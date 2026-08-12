import { describe, expect, test } from "bun:test";
import type { MobileAidokuExecutorSource } from "./mobileSourceExecutor";
import type { MobileSourceExecutorSession } from "./mobileSourceExecutor";
import type { MobileRuntimeSource } from "./mobileSourceRuntime";
import {
  createMobileSourceSessionCache,
  hashSettings,
  MobileSourceSessionInvalidatedError,
} from "./mobileSourceExecutorCache";
import { MobileSourceOperationTimeoutError } from "./mobileSourceOperationTimeout";

function makeSource(overrides: Partial<MobileRuntimeSource> = {}): MobileRuntimeSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    sourceKind: "aidoku",
    name: "Example",
    version: 2,
    packageUri: "file:///cache/example.aix",
    packageCacheKey: "aix:aidoku-community:en.example",
    packageMetadata: {
      sourceId: "en.example",
      name: "Example",
      version: 2,
      listings: [],
      filters: [],
      settings: [],
      hasWasm: true,
    },
    ...overrides,
  };
}

function makeExecutorSource(onDispose?: () => void): MobileAidokuExecutorSource {
  return {
    id: "en.example",
    async getSearchMangaList() {
      return { entries: [], hasNextPage: false };
    },
    async getMangaDetails() {
      return { key: "k", title: "T" };
    },
    async getChapterList() {
      return [];
    },
    async getPageList() {
      return [];
    },
    async getFilters() {
      return [];
    },
    async getListings() {
      return [];
    },
    async getMangaListForListing() {
      return { entries: [], hasNextPage: false };
    },
    async hasListingProvider() {
      return false;
    },
    async hasHomeProvider() {
      return false;
    },
    async hasListings() {
      return false;
    },
    async isOnlySearch() {
      return true;
    },
    async handlesBasicLogin() {
      return false;
    },
    async handlesWebLogin() {
      return false;
    },
    async getHome() {
      return null;
    },
    async getHomeWithPartials() {
      return null;
    },
    async modifyImageRequest(url) {
      return { url, headers: {} };
    },
    async hasImageProcessor() {
      return false;
    },
    async processPageImage() {
      return null;
    },
    updateSettings() {},
    dispose() {
      onDispose?.();
    },
  };
}

type FactoryCalls = {
  sourceKey: string;
  settings: Record<string, unknown>;
  executionScope?: string;
}[];

function makeFactory(calls: FactoryCalls, onDispose?: () => void) {
  return async (
    source: MobileRuntimeSource,
    options: { settings?: Record<string, unknown>; executionScope?: string }
  ): Promise<MobileSourceExecutorSession> => {
    calls.push({
      sourceKey: `${source.registryId}:${source.sourceId}`,
      settings: options.settings ?? {},
      executionScope: options.executionScope,
    });
    return {
      status: "ready",
      sourceKey: `${source.registryId}:${source.sourceId}`,
      runtime: "native-aidoku",
      source: makeExecutorSource(onDispose),
    };
  };
}

function blockedFactory() {
  return async (): Promise<MobileSourceExecutorSession> => ({
    status: "blocked",
    sourceKey: null,
    reason: "native-bridge-missing",
    detail: "no bridge",
  });
}

describe("mobileSourceExecutorCache", () => {
  test("hashSettings is stable for equal content and differs for changes", () => {
    expect(hashSettings({ a: 1, b: 2 })).toBe(hashSettings({ a: 1, b: 2 }));
    expect(hashSettings({ a: 1 })).not.toBe(hashSettings({ a: 2 }));
  });

  test("reuses a ready session across acquires and does not call the factory twice", async () => {
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({ factory: makeFactory(calls) });
    const a = await cache.acquire(makeSource(), { settings: {} });
    const b = await cache.acquire(makeSource(), { settings: {} });
    expect(a.status).toBe("ready");
    expect(b.status).toBe("ready");
    expect(calls.length).toBe(1);
    expect(cache.size()).toBe(1);
  });

  test("never reuses one account's source session for another account", async () => {
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({ factory: makeFactory(calls) });
    const source = makeSource();

    await cache.acquire(source, { settings: {}, executionScope: "profile:a" });
    await cache.acquire(source, { settings: {}, executionScope: "profile:a" });
    await cache.acquire(source, { settings: {}, executionScope: "profile:b" });

    expect(calls.map((call) => call.executionScope)).toEqual([
      "profile:a",
      "profile:b",
    ]);
    expect(cache.size()).toBe(2);
    await cache.clear();
  });

  test("explicit-scope removal cannot evict another account's session", async () => {
    const calls: FactoryCalls = [];
    let disposed = 0;
    const cache = createMobileSourceSessionCache({
      factory: makeFactory(calls, () => {
        disposed += 1;
      }),
    });
    const source = makeSource();

    await cache.acquire(source, { settings: {}, executionScope: "profile:a" });
    await cache.acquire(source, { settings: {}, executionScope: "profile:b" });
    cache.remove("aidoku-community:en.example", "profile:a");
    await Promise.resolve();

    expect(disposed).toBe(1);
    expect(cache.size()).toBe(1);
    await cache.acquire(source, { settings: {}, executionScope: "profile:b" });
    await cache.acquire(source, { settings: {}, executionScope: "profile:a" });
    expect(calls.map((call) => call.executionScope)).toEqual([
      "profile:a",
      "profile:b",
      "profile:a",
    ]);
    await cache.clear();
  });

  test("updateSettings is called when settings signature changes and not when it matches", async () => {
    const calls: FactoryCalls = [];
    let updateCalls = 0;
    const factory = makeFactory(calls);
    const cache = createMobileSourceSessionCache({
      factory: async (source, options) => {
        const session = await factory(source, options);
        if (session.status === "ready") {
          const real = session.source.updateSettings;
          session.source.updateSettings = (next) => {
            updateCalls += 1;
            real(next);
          };
        }
        return session;
      },
    });

    await cache.acquire(makeSource(), { settings: { lang: "en" } });
    await cache.acquire(makeSource(), { settings: { lang: "en" } });
    expect(updateCalls).toBe(0);

    await cache.acquire(makeSource(), { settings: { lang: "ja" } });
    expect(updateCalls).toBe(1);
    expect(calls.length).toBe(1); // still no second factory call
  });

  test("keeps a concurrent old-settings request from running behind a newer settings update", async () => {
    let appliedLanguage = "en";
    let runtimeQueue = Promise.resolve();
    const updateStarted = Promise.withResolvers<void>();
    const releaseUpdate = Promise.withResolvers<void>();
    const updateCalls: string[] = [];
    const runtime = makeExecutorSource();

    runtime.updateSettings = (settings) => {
      const language = String(settings.lang ?? "");
      const update = runtimeQueue.then(async () => {
        updateCalls.push(language);
        if (language === "ja") {
          updateStarted.resolve();
          await releaseUpdate.promise;
        }
        appliedLanguage = language;
      });
      runtimeQueue = update.catch(() => undefined);
      return update;
    };
    runtime.getMangaDetails = async () => {
      await runtimeQueue;
      return { key: "manga", title: appliedLanguage };
    };

    const cache = createMobileSourceSessionCache({
      factory: async () => ({
        status: "ready",
        sourceKey: "aidoku-community:en.example",
        runtime: "native-aidoku",
        source: runtime,
      }),
    });
    await cache.acquire(makeSource(), { settings: { lang: "en" } });

    const japanese = cache.withSession(
      makeSource(),
      { settings: { lang: "ja" } },
      async (session) => {
        if (session.status !== "ready") throw new Error("Expected ready session");
        return (await session.source.getMangaDetails({ key: "manga" })).title;
      },
    );
    await updateStarted.promise;
    const english = cache.withSession(
      makeSource(),
      { settings: { lang: "en" } },
      async (session) => {
        if (session.status !== "ready") throw new Error("Expected ready session");
        return (await session.source.getMangaDetails({ key: "manga" })).title;
      },
    );

    releaseUpdate.resolve();

    await expect(japanese).resolves.toBe("ja");
    await expect(english).resolves.toBe("en");
    expect(updateCalls).toEqual(["ja", "en"]);
  });

  test("blocked sessions are never cached", async () => {
    const cache = createMobileSourceSessionCache({ factory: blockedFactory() });
    const a = await cache.acquire(makeSource(), { settings: {} });
    const b = await cache.acquire(makeSource(), { settings: {} });
    expect(a.status).toBe("blocked");
    expect(b.status).toBe("blocked");
    expect(cache.size()).toBe(0);
  });

  test("cacheBust evicts and rebuilds the session", async () => {
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({ factory: makeFactory(calls) });
    await cache.acquire(makeSource(), { settings: {} });
    await cache.acquire(makeSource(), { settings: {}, cacheBust: true });
    expect(calls.length).toBe(2);
    expect(cache.size()).toBe(1);
  });

  test("LRU evicts the least-recently-used entry when over capacity", async () => {
    const disposed: string[] = [];
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({
      maxEntries: 2,
      factory: async (source, options) => {
        calls.push({ sourceKey: `${source.registryId}:${source.sourceId}`, settings: options.settings ?? {} });
        return {
          status: "ready",
          sourceKey: `${source.registryId}:${source.sourceId}`,
          runtime: "native-aidoku",
          source: makeExecutorSource(() => disposed.push(`${source.registryId}:${source.sourceId}`)),
        };
      },
    });

    const s1 = makeSource({ sourceId: "one", id: "aidoku-community:one" });
    const s2 = makeSource({ sourceId: "two", id: "aidoku-community:two" });
    const s3 = makeSource({ sourceId: "three", id: "aidoku-community:three" });

    await cache.acquire(s1, { settings: {} });
    await cache.acquire(s2, { settings: {} });
    // touch s1 so s2 becomes the oldest
    await cache.acquire(s1, { settings: {} });
    await cache.acquire(s3, { settings: {} }); // evicts s2

    expect(disposed).toEqual(["aidoku-community:two"]);
    expect(cache.size()).toBe(2);
  });

  test("production defaults retain only the two sessions Dual Reader needs", async () => {
    const disposed: string[] = [];
    const cache = createMobileSourceSessionCache({
      factory: async (source) => ({
        status: "ready",
        sourceKey: `${source.registryId}:${source.sourceId}`,
        runtime: "native-aidoku",
        source: makeExecutorSource(() =>
          disposed.push(`${source.registryId}:${source.sourceId}`),
        ),
      }),
    });

    await cache.acquire(
      makeSource({ sourceId: "one", id: "aidoku-community:one" }),
      { settings: {} },
    );
    await cache.acquire(
      makeSource({ sourceId: "two", id: "aidoku-community:two" }),
      { settings: {} },
    );
    await cache.acquire(
      makeSource({ sourceId: "three", id: "aidoku-community:three" }),
      { settings: {} },
    );

    await Promise.resolve();
    expect(disposed).toEqual(["aidoku-community:one"]);
    expect(cache.size()).toBe(2);
  });

  test("idle sweep disposes entries past their TTL", async () => {
    const disposed: string[] = [];
    let clock = 1000;
    const cache = createMobileSourceSessionCache({
      idleTtlMs: 100,
      sweepIntervalMs: 5,
      now: () => clock,
      factory: async (source) => ({
        status: "ready",
        sourceKey: `${source.registryId}:${source.sourceId}`,
        runtime: "native-aidoku",
        source: makeExecutorSource(() => disposed.push(`${source.registryId}:${source.sourceId}`)),
      }),
    });

    await cache.acquire(makeSource(), { settings: {} });
    clock += 200; // past idle TTL
    // Wait for the sweep interval to fire and reap the idle entry.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(disposed).toContain("aidoku-community:en.example");
    expect(cache.size()).toBe(0);
  });

  test("withSession releases (keeps) the session on success and on throw", async () => {
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({ factory: makeFactory(calls) });

    await cache.withSession(makeSource(), { settings: {} }, async (session) => {
      expect(session.status).toBe("ready");
      return "ok";
    });
    expect(cache.size()).toBe(1);

    await expect(
      cache.withSession(makeSource(), { settings: {} }, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    // session still cached after a fn error
    expect(cache.size()).toBe(1);
    expect(calls.length).toBe(1);
  });

  test("withSession evicts timed-out sessions before reuse", async () => {
    const calls: FactoryCalls = [];
    const disposed: string[] = [];
    const cache = createMobileSourceSessionCache({
      factory: makeFactory(calls, () => disposed.push("aidoku-community:en.example")),
    });

    await expect(
      cache.withSession(makeSource(), { settings: {} }, async () => {
        throw new MobileSourceOperationTimeoutError("hung source");
      })
    ).rejects.toThrow("hung source");

    expect(cache.size()).toBe(0);
    expect(disposed).toEqual(["aidoku-community:en.example"]);

    await cache.acquire(makeSource(), { settings: {} });
    expect(calls.length).toBe(2);
  });

  test("eviction during a mid-flight withSession defers dispose until the callback completes", async () => {
    // Regression for the Add Sources crash: when "Add Sources" fans out
    // `withSession` across more sources than `maxEntries`, LRU eviction must
    // NOT dispose a session whose withSession callback is still mid-await —
    // disposing freed WASM memory mid-use traps in
    // `NativeArrayBuffer.asJavaScriptArrayBuffer`. Pinning defers the dispose
    // until the callback's `finally` unpins it.
    const disposed: string[] = [];
    let resolveCallback: () => void = () => {};
    const cache = createMobileSourceSessionCache({
      maxEntries: 2,
      factory: async (source) => ({
        status: "ready",
        sourceKey: `${source.registryId}:${source.sourceId}`,
        runtime: "native-aidoku",
        source: makeExecutorSource(() => disposed.push(`${source.registryId}:${source.sourceId}`)),
      }),
    });

    const s1 = makeSource({ sourceId: "one", id: "aidoku-community:one" });
    const s2 = makeSource({ sourceId: "two", id: "aidoku-community:two" });
    const s3 = makeSource({ sourceId: "three", id: "aidoku-community:three" });

    let callbackDone = false;
    const inFlight = cache.withSession(s1, { settings: {} }, async (session) => {
      expect(session.status).toBe("ready");
      // Block the callback so eviction happens while it is still pinned.
      await new Promise<void>((resolve) => {
        resolveCallback = resolve;
      });
      callbackDone = true;
      return "ok";
    });

    // Let withSession acquire + pin s1.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed).toEqual([]);

    // Force LRU eviction of s1 while it is still pinned by the in-flight callback.
    await cache.acquire(s2, { settings: {} });
    await cache.acquire(s3, { settings: {} }); // evicts s1 (oldest)

    // Evicted but pinned → dispose deferred; the in-flight callback is untouched.
    expect(disposed).toEqual([]);
    expect(callbackDone).toBe(false);

    // Releasing the callback unpins s1 → the deferred dispose now fires.
    resolveCallback();
    await inFlight;

    expect(callbackDone).toBe(true);
    expect(disposed).toEqual(["aidoku-community:one"]);
  });

  test("clear disposes every cached session", async () => {
    const disposed: string[] = [];
    const cache = createMobileSourceSessionCache({
      factory: async (source) => ({
        status: "ready",
        sourceKey: `${source.registryId}:${source.sourceId}`,
        runtime: "native-aidoku",
        source: makeExecutorSource(() => disposed.push(`${source.registryId}:${source.sourceId}`)),
      }),
    });

    await cache.acquire(makeSource({ sourceId: "a", id: "aidoku-community:a" }), { settings: {} });
    await cache.acquire(makeSource({ sourceId: "b", id: "aidoku-community:b" }), { settings: {} });
    await cache.clear();
    expect(disposed.sort()).toEqual(["aidoku-community:a", "aidoku-community:b"]);
    expect(cache.size()).toBe(0);
  });

  test("concurrent misses for the same key share one factory run", async () => {
    const calls: FactoryCalls = [];
    let releaseFactory: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    const cache = createMobileSourceSessionCache({
      factory: async (source, options) => {
        calls.push({
          sourceKey: `${source.registryId}:${source.sourceId}`,
          settings: options.settings ?? {},
        });
        await gate;
        return {
          status: "ready",
          sourceKey: `${source.registryId}:${source.sourceId}`,
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    });

    const first = cache.acquire(makeSource(), { settings: {} });
    const second = cache.acquire(makeSource(), { settings: {} });
    const third = cache.acquire(makeSource(), { settings: {} });
    releaseFactory!();
    const sessions = await Promise.all([first, second, third]);
    expect(sessions.every((session) => session.status === "ready")).toBe(true);
    expect(calls.length).toBe(1);
    expect(cache.size()).toBe(1);
  });

  test("remove invalidates a pending factory and disposes its late session once", async () => {
    const disposed: string[] = [];
    let factoryRuns = 0;
    let releaseFactory: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    const cache = createMobileSourceSessionCache({
      factory: async (source) => {
        factoryRuns += 1;
        await gate;
        return {
          status: "ready",
          sourceKey: `${source.registryId}:${source.sourceId}`,
          runtime: "native-aidoku",
          source: makeExecutorSource(() => disposed.push("late")),
        };
      },
    });

    const pending = cache.acquire(makeSource(), { settings: {} });
    const waitingOnPending = cache.acquire(makeSource(), { settings: {} });
    const outcome = pending.then(
      () => null,
      (error: unknown) => error,
    );
    const waitingOutcome = waitingOnPending.then(
      () => null,
      (error: unknown) => error,
    );
    cache.remove("aidoku-community:en.example");
    releaseFactory!();

    expect(await outcome).toBeInstanceOf(MobileSourceSessionInvalidatedError);
    expect(await waitingOutcome).toBeInstanceOf(
      MobileSourceSessionInvalidatedError,
    );
    expect(factoryRuns).toBe(1);
    expect(cache.peek("aidoku-community:en.example")).toBeUndefined();
    expect(cache.size()).toBe(0);
    expect(disposed).toEqual(["late"]);

    cache.remove("aidoku-community:en.example");
    await cache.clear();
    expect(disposed).toEqual(["late"]);
  });

  test("a synchronous disposer failure cannot escape cache invalidation", async () => {
    const cache = createMobileSourceSessionCache({
      factory: async (source) => ({
        status: "ready",
        sourceKey: `${source.registryId}:${source.sourceId}`,
        runtime: "native-aidoku",
        source: makeExecutorSource(),
      }),
      dispose: () => {
        throw new Error("native teardown failed");
      },
    });

    await cache.acquire(makeSource(), { settings: {} });
    expect(() => cache.remove("aidoku-community:en.example")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.size()).toBe(0);
  });

  test("clear globally invalidates pending factories for every source", async () => {
    const disposed: string[] = [];
    const releases = new Map<string, () => void>();
    const cache = createMobileSourceSessionCache({
      factory: async (source) => {
        const sourceKey = `${source.registryId}:${source.sourceId}`;
        await new Promise<void>((resolve) => {
          releases.set(sourceKey, resolve);
        });
        return {
          status: "ready",
          sourceKey,
          runtime: "native-aidoku",
          source: makeExecutorSource(() => disposed.push(sourceKey)),
        };
      },
    });
    const sourceA = makeSource({
      id: "aidoku-community:a",
      sourceId: "a",
    });
    const sourceB = makeSource({
      id: "aidoku-community:b",
      sourceId: "b",
    });

    const pendingA = cache.acquire(sourceA, { settings: {} });
    const pendingB = cache.acquire(sourceB, { settings: {} });
    const outcomeA = pendingA.then(
      () => null,
      (error: unknown) => error,
    );
    const outcomeB = pendingB.then(
      () => null,
      (error: unknown) => error,
    );
    await cache.clear();
    releases.get("aidoku-community:a")!();
    releases.get("aidoku-community:b")!();

    expect(await outcomeA).toBeInstanceOf(MobileSourceSessionInvalidatedError);
    expect(await outcomeB).toBeInstanceOf(MobileSourceSessionInvalidatedError);
    expect(cache.size()).toBe(0);
    expect(disposed.sort()).toEqual([
      "aidoku-community:a",
      "aidoku-community:b",
    ]);

    await cache.clear();
    expect(disposed).toHaveLength(2);
  });

  test("the newest concurrent cacheBust wins and the superseded build is disposed once", async () => {
    const disposed: string[] = [];
    const releases: Array<() => void> = [];
    let factoryRun = 0;
    const cache = createMobileSourceSessionCache({
      factory: async (source) => {
        factoryRun += 1;
        const run = factoryRun;
        await new Promise<void>((resolve) => {
          releases[run] = resolve;
        });
        return {
          status: "ready",
          sourceKey: `${source.registryId}:${source.sourceId}`,
          runtime: "native-aidoku",
          source: makeExecutorSource(() => disposed.push(`build-${run}`)),
        };
      },
    });

    const superseded = cache.acquire(makeSource(), {
      settings: {},
      cacheBust: true,
    });
    const supersededOutcome = superseded.then(
      () => null,
      (error: unknown) => error,
    );
    const newest = cache.acquire(makeSource(), {
      settings: {},
      cacheBust: true,
    });

    releases[2]!();
    const newestSession = await newest;
    releases[1]!();

    expect(await supersededOutcome).toBeInstanceOf(
      MobileSourceSessionInvalidatedError,
    );
    expect(newestSession.status).toBe("ready");
    if (newestSession.status !== "ready") {
      throw new Error("Expected newest cacheBust to produce a ready session.");
    }
    expect(cache.peek("aidoku-community:en.example")).toBe(newestSession);
    expect(cache.size()).toBe(1);
    expect(disposed).toEqual(["build-1"]);

    cache.remove("aidoku-community:en.example");
    await Promise.resolve();
    expect(disposed).toEqual(["build-1", "build-2"]);
  });

  test("remove evicts and disposes the entry for a source key", async () => {
    const disposed: string[] = [];
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({
      factory: makeFactory(calls, () => disposed.push("disposed")),
    });

    await cache.acquire(makeSource(), { settings: {} });
    cache.remove("aidoku-community:en.example");
    await Promise.resolve();
    expect(disposed).toEqual(["disposed"]);
    expect(cache.size()).toBe(0);

    await cache.acquire(makeSource(), { settings: {} });
    expect(calls.length).toBe(2);
  });

  test("remove defers dispose while the entry is pinned by withSession", async () => {
    const disposed: string[] = [];
    const calls: FactoryCalls = [];
    const cache = createMobileSourceSessionCache({
      factory: makeFactory(calls, () => disposed.push("disposed")),
    });

    let releaseCallback: (() => void) | null = null;
    const callbackGate = new Promise<void>((resolve) => {
      releaseCallback = resolve;
    });
    const inFlight = cache.withSession(makeSource(), { settings: {} }, async () => {
      cache.remove("aidoku-community:en.example");
      expect(disposed).toEqual([]);
      await callbackGate;
      return "ok";
    });
    releaseCallback!();
    await expect(inFlight).resolves.toBe("ok");
    await Promise.resolve();
    expect(disposed).toEqual(["disposed"]);
    expect(cache.size()).toBe(0);
  });
});
