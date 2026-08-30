import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getActiveMobileSourceProfileScope,
  isMobileSourceProfileTransitionPending,
  makeMobileSourceExecutionKey,
  registerMobileSourceProfileTransitionHandler,
  resetMobileSourceProfileScopeForTesting,
  transitionMobileSourceProfile,
} from "./mobileSourceProfileScope";

describe("mobile source profile boundary", () => {
  beforeEach(resetMobileSourceProfileScopeForTesting);
  afterEach(resetMobileSourceProfileScopeForTesting);

  test("namespaces one canonical source without changing its identity", () => {
    expect(
      makeMobileSourceExecutionKey("aidoku-community:en.example", "profile:a"),
    ).toBe("profile:a::aidoku-community:en.example");
    expect(
      makeMobileSourceExecutionKey("aidoku-community:en.example", "profile:b"),
    ).not.toBe(
      makeMobileSourceExecutionKey("aidoku-community:en.example", "profile:a"),
    );
  });

  test("does not publish B until every A cleanup has completed", async () => {
    const cleanupStarted = Promise.withResolvers<void>();
    const releaseCleanup = Promise.withResolvers<void>();
    const unregister = registerMobileSourceProfileTransitionHandler(
      "profile-scope-test-gate",
      async ({ fromScope, toScope }) => {
        expect(fromScope).toBe("local");
        expect(toScope).toBe("profile:b");
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      },
    );

    const transition = transitionMobileSourceProfile("profile:b");
    await cleanupStarted.promise;
    expect(getActiveMobileSourceProfileScope()).toBe("local");
    releaseCleanup.resolve();
    await transition;
    expect(getActiveMobileSourceProfileScope()).toBe("profile:b");
    unregister();
  });

  test("fails closed and leaves the previous scope active on cleanup error", async () => {
    const unregister = registerMobileSourceProfileTransitionHandler(
      "profile-scope-test-failure",
      () => {
        throw new Error("native reset failed");
      },
    );

    await expect(
      transitionMobileSourceProfile("profile:b"),
    ).rejects.toThrow("native reset failed");
    expect(getActiveMobileSourceProfileScope()).toBe("local");

    unregister();
    await transitionMobileSourceProfile("profile:b");
    expect(getActiveMobileSourceProfileScope()).toBe("profile:b");
  });

  test("serializes rapid A to B to C transitions", async () => {
    const observed: string[] = [];
    const unregister = registerMobileSourceProfileTransitionHandler(
      "profile-scope-test-order",
      ({ fromScope, toScope }) => {
        observed.push(`${fromScope}->${toScope}`);
      },
    );

    await Promise.all([
      transitionMobileSourceProfile("profile:b"),
      transitionMobileSourceProfile("profile:c"),
    ]);
    expect(observed).toEqual(["local->profile:b", "profile:b->profile:c"]);
    expect(getActiveMobileSourceProfileScope()).toBe("profile:c");
    unregister();
  });

  test("lets a rapid A to B to A request restore A after pending B", async () => {
    const bStarted = Promise.withResolvers<void>();
    const releaseB = Promise.withResolvers<void>();
    const unregister = registerMobileSourceProfileTransitionHandler(
      "profile-scope-test-aba",
      async ({ toScope }) => {
        if (toScope === "profile:b") {
          bStarted.resolve();
          await releaseB.promise;
        }
      },
    );

    const toB = transitionMobileSourceProfile("profile:b");
    await bStarted.promise;
    expect(isMobileSourceProfileTransitionPending()).toBe(true);
    const backToA = transitionMobileSourceProfile("local");
    releaseB.resolve();
    await Promise.all([toB, backToA]);

    expect(getActiveMobileSourceProfileScope()).toBe("local");
    expect(isMobileSourceProfileTransitionPending()).toBe(false);
    unregister();
  });
});
