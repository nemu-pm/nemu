import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMobileRegistryCatalogScheduler } from "./mobileRegistryCatalogScheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("mobile registry catalog scheduler", () => {
  test("collapses simultaneous consumers onto one in-flight fetch", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const gate = deferred<string[]>();
    let loads = 0;

    const first = scheduler.fetch(() => {
      loads += 1;
      return gate.promise;
    });
    const second = scheduler.fetch(() => {
      loads += 1;
      return gate.promise;
    });

    gate.resolve(["a"]);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(loads).toBe(1);
    expect(firstResult.value).toEqual(["a"]);
    expect(secondResult.value).toEqual(["a"]);
    expect(secondResult.fetchId).toBe(firstResult.fetchId);
  });

  test("reuses the shared snapshot inside the freshness window", async () => {
    let clock = 1_000;
    const scheduler = createMobileRegistryCatalogScheduler<string[]>({
      now: () => clock,
    });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return ["a"];
    };

    const first = await scheduler.fetch(load, { ttlMs: 5_000 });
    clock += 4_000;
    const fresh = await scheduler.fetch(load, { ttlMs: 5_000 });
    clock += 2_000;
    const stale = await scheduler.fetch(load, { ttlMs: 5_000 });

    expect(loads).toBe(2);
    expect(first.loaded).toBe(true);
    expect(fresh.loaded).toBe(false);
    expect(fresh.fetchId).toBe(first.fetchId);
    expect(stale.loaded).toBe(true);
    expect(stale.fetchId).not.toBe(first.fetchId);
  });

  test("an explicit refresh ignores the freshness window", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>({
      now: () => 1_000,
    });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return ["a"];
    };

    await scheduler.fetch(load, { ttlMs: 5_000 });
    await scheduler.fetch(load);

    expect(loads).toBe(2);
  });

  test("a failed fetch is not remembered as fresh", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>({
      now: () => 1_000,
    });
    let loads = 0;

    await expect(
      scheduler.fetch(async () => {
        loads += 1;
        throw new Error("offline");
      }, { ttlMs: 5_000 }),
    ).rejects.toThrow("offline");
    expect(scheduler.lastCompletedAt()).toBeNull();

    await scheduler.fetch(async () => {
      loads += 1;
      return ["a"];
    }, { ttlMs: 5_000 });

    expect(loads).toBe(2);
    expect(scheduler.lastCompletedAt()).toBe(1_000);
  });

  test("runs the auto-update pass once per fetch", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const { fetchId } = await scheduler.fetch(async () => ["a"]);
    let passes = 0;
    const pass = async () => {
      passes += 1;
      return ["updated"];
    };

    const [owner, joiner] = await Promise.all([
      scheduler.runUpdatePass(fetchId, pass),
      scheduler.runUpdatePass(fetchId, pass),
    ]);
    const late = await scheduler.runUpdatePass(fetchId, pass);

    expect(passes).toBe(1);
    expect(owner).toEqual({ ran: true, value: ["updated"] });
    expect(joiner).toEqual({ ran: true, value: ["updated"] });
    expect(late).toEqual({ ran: false, value: null });
  });

  test("a newer fetch gets its own update pass", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    let passes = 0;
    const pass = async () => {
      passes += 1;
      return passes;
    };

    const first = await scheduler.fetch(async () => ["a"]);
    await scheduler.runUpdatePass(first.fetchId, pass);
    const second = await scheduler.fetch(async () => ["b"]);
    const result = await scheduler.runUpdatePass(second.fetchId, pass);

    expect(passes).toBe(2);
    expect(result).toEqual({ ran: true, value: 2 });
  });

  test("a stale fetch never re-runs the pass behind a newer one", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    let passes = 0;
    const pass = async () => {
      passes += 1;
      return passes;
    };

    const first = await scheduler.fetch(async () => ["a"]);
    const second = await scheduler.fetch(async () => ["b"]);
    await scheduler.runUpdatePass(second.fetchId, pass);
    const stale = await scheduler.runUpdatePass(first.fetchId, pass);

    expect(passes).toBe(1);
    expect(stale).toEqual({ ran: false, value: null });
  });

  test("one consumer detaching leaves the shared fetch running", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const gate = deferred<string[]>();
    const leaving = new AbortController();
    const loader: { signal: AbortSignal | null } = { signal: null };

    const detached = scheduler.fetch(
      (signal) => {
        loader.signal = signal;
        return gate.promise;
      },
      { signal: leaving.signal },
    );
    const staying = scheduler.fetch(() => gate.promise);

    leaving.abort();
    await expect(detached).rejects.toThrow(/aborted/);
    expect(loader.signal?.aborted).toBe(false);

    gate.resolve(["a"]);
    expect((await staying).value).toEqual(["a"]);
  });

  test("the shared fetch aborts once every consumer has detached", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const gate = deferred<string[]>();
    const only = new AbortController();
    const loader: { signal: AbortSignal | null } = { signal: null };

    const detached = scheduler.fetch(
      (signal) => {
        loader.signal = signal;
        return gate.promise;
      },
      { signal: only.signal },
    );

    only.abort();
    await expect(detached).rejects.toThrow(/aborted/);
    expect(loader.signal?.aborted).toBe(true);
    gate.resolve(["a"]);
  });

  test("an already-aborted consumer never starts a fetch", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const controller = new AbortController();
    controller.abort();
    let loads = 0;

    await expect(
      scheduler.fetch(
        async () => {
          loads += 1;
          return ["a"];
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/);
    expect(loads).toBe(0);
  });

  test("reset drops the shared snapshot and pass bookkeeping", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>({
      now: () => 1_000,
    });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return ["a"];
    };

    await scheduler.fetch(load, { ttlMs: 5_000 });
    scheduler.reset();
    expect(scheduler.lastCompletedAt()).toBeNull();
    await scheduler.fetch(load, { ttlMs: 5_000 });

    expect(loads).toBe(2);
  });

  test("a retry after the only consumer aborted starts a fresh fetch", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const first = deferred<string[]>();
    const abandoned = new AbortController();
    let loads = 0;

    const cancelled = scheduler.fetch(
      () => {
        loads += 1;
        return first.promise;
      },
      { signal: abandoned.signal },
    );
    abandoned.abort();
    await expect(cancelled).rejects.toThrow(/aborted/);

    // The abandoned loader has not settled yet; the retry must not inherit it.
    const retry = await scheduler.fetch(async () => {
      loads += 1;
      return ["fresh"];
    });
    expect(retry.value).toEqual(["fresh"]);
    expect(loads).toBe(2);

    // A late resolution from the abandoned run never overwrites the newer one.
    first.resolve(["stale"]);
    await first.promise;
    const cached = await scheduler.fetch(async () => ["never"], {
      ttlMs: 60_000,
    });
    expect(cached.value).toEqual(["fresh"]);
  });
});

describe("registry catalog update pass lifetime", () => {
  test("the initiating consumer unmounting does not cancel the shared pass", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const { fetchId } = await scheduler.fetch(async () => ["a"]);
    const gate = deferred<string[]>();
    const initiator = new AbortController();
    const passSignals: AbortSignal[] = [];
    const task = (signal: AbortSignal) => {
      passSignals.push(signal);
      return gate.promise;
    };

    const owner = scheduler.runUpdatePass(fetchId, task, {
      signal: initiator.signal,
    });
    const joiner = scheduler.runUpdatePass(fetchId, task);

    // The consumer that happened to start the pass walks away (screen unmount).
    initiator.abort();
    await expect(owner).rejects.toThrow(/aborted/);
    expect(passSignals).toHaveLength(1);
    expect(passSignals[0]!.aborted).toBe(false);

    gate.resolve(["updated"]);
    expect(await joiner).toEqual({ ran: true, value: ["updated"] });
  });

  test("a consumer joining after the initiator left still gets the result", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const { fetchId } = await scheduler.fetch(async () => ["a"]);
    const gate = deferred<string[]>();
    const initiator = new AbortController();
    let passes = 0;
    const task = () => {
      passes += 1;
      return gate.promise;
    };

    const owner = scheduler.runUpdatePass(fetchId, task, {
      signal: initiator.signal,
    });
    const staying = scheduler.runUpdatePass(fetchId, task);
    initiator.abort();
    await expect(owner).rejects.toThrow(/aborted/);

    // A consumer mounting after the initiator detached must not be told the
    // snapshot already had its pass.
    const late = scheduler.runUpdatePass(fetchId, task);
    gate.resolve(["updated"]);

    expect(await staying).toEqual({ ran: true, value: ["updated"] });
    expect(await late).toEqual({ ran: true, value: ["updated"] });
    expect(passes).toBe(1);
  });

  test("the pass aborts only once every participant has detached", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const { fetchId } = await scheduler.fetch(async () => ["a"]);
    const gate = deferred<string[]>();
    const first = new AbortController();
    const second = new AbortController();
    const passSignals: AbortSignal[] = [];
    const task = (signal: AbortSignal) => {
      passSignals.push(signal);
      return gate.promise;
    };

    const owner = scheduler.runUpdatePass(fetchId, task, {
      signal: first.signal,
    });
    const joiner = scheduler.runUpdatePass(fetchId, task, {
      signal: second.signal,
    });

    first.abort();
    await expect(owner).rejects.toThrow(/aborted/);
    expect(passSignals[0]!.aborted).toBe(false);

    second.abort();
    await expect(joiner).rejects.toThrow(/aborted/);
    expect(passSignals[0]!.aborted).toBe(true);
    gate.resolve(["updated"]);
  });

  test("reset lets a new profile run the pass for the same snapshot again", async () => {
    const scheduler = createMobileRegistryCatalogScheduler<string[]>();
    const { fetchId } = await scheduler.fetch(async () => ["a"]);
    let passes = 0;
    const task = async () => {
      passes += 1;
      return passes;
    };

    await scheduler.runUpdatePass(fetchId, task);
    expect(await scheduler.runUpdatePass(fetchId, task)).toEqual({
      ran: false,
      value: null,
    });

    scheduler.reset();
    expect(await scheduler.runUpdatePass(fetchId, task)).toEqual({
      ran: true,
      value: 2,
    });
  });
});

describe("registry catalog scheduler profile isolation", () => {
  test("the shared scheduler is reset on a profile transition", () => {
    // The scheduler is a module singleton: without this registration a profile
    // switch inside the freshness window serves the previous account's
    // snapshot, so `saveRegistry` and the "registries" emit never run.
    const hooks = readFileSync(
      path.join(import.meta.dir, "mobileHooks.ts"),
      "utf8",
    );
    expect(hooks).toContain(
      'registerMobileSourceProfileTransitionHandler("registry-catalog-scheduler"',
    );
    expect(hooks).toContain("registryCatalogScheduler.reset()");
  });
});
