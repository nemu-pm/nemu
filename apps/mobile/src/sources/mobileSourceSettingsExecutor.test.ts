import { describe, expect, test } from "bun:test";
import type { MobileAidokuExecutorSource } from "./mobileSourceExecutor";
import type { MobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type { MobileRuntimeSource } from "./mobileSourceRuntime";
import { runMobileSourceSettingsOperation } from "./mobileSourceSettingsExecutor";

const runtimeSource = {
  id: "aidoku-community:en.example",
  registryId: "aidoku-community",
  sourceId: "en.example",
  sourceKind: "aidoku",
  name: "Example",
  version: 1,
} as MobileRuntimeSource;

function readyCache(
  source: Partial<MobileAidokuExecutorSource>,
  observedSettings: Record<string, unknown>[],
): MobileSourceSessionCache {
  return {
    async withSession(_source, options, fn) {
      observedSettings.push(options.settings ?? {});
      return fn({
        status: "ready",
        sourceKey: runtimeSource.id,
        runtime: "native-aidoku",
        source: source as MobileAidokuExecutorSource,
      });
    },
  } as MobileSourceSessionCache;
}

describe("mobile source settings executor", () => {
  test("runs basic login in a settings-matched cached session", async () => {
    const calls: unknown[][] = [];
    const observedSettings: Record<string, unknown>[] = [];
    const cache = readyCache(
      {
        async handleBasicLogin(...args) {
          calls.push(args);
          return true;
        },
      },
      observedSettings,
    );

    const result = await runMobileSourceSettingsOperation({
      cache,
      source: runtimeSource,
      settings: { baseUrl: "https://example.com" },
      operation: {
        kind: "basic-login",
        key: "login",
        username: "reader",
        password: "secret",
      },
    });

    expect(result).toEqual({ status: "complete" });
    expect(calls).toEqual([["login", "reader", "secret"]]);
    expect(observedSettings).toEqual([{ baseUrl: "https://example.com" }]);
  });

  test("does not report a rejected login as complete", async () => {
    const cache = readyCache(
      { async handleBasicLogin() { return false; } },
      [],
    );

    expect(
      await runMobileSourceSettingsOperation({
        cache,
        source: runtimeSource,
        settings: {},
        operation: {
          kind: "basic-login",
          key: "login",
          username: "reader",
          password: "wrong",
        },
      }),
    ).toEqual({ status: "rejected", reason: "credentials-rejected" });
  });

  test("runs web login and notifications through the same boundary", async () => {
    const calls: unknown[][] = [];
    const cache = readyCache(
      {
        async handleWebLogin(...args) {
          calls.push(args);
          return true;
        },
        async handleNotification(...args) {
          calls.push(args);
        },
      },
      [],
    );

    expect(
      await runMobileSourceSettingsOperation({
        cache,
        source: runtimeSource,
        settings: {},
        operation: {
          kind: "web-login",
          key: "login",
          cookies: { session: "abc" },
        },
      }),
    ).toEqual({ status: "complete" });
    expect(
      await runMobileSourceSettingsOperation({
        cache,
        source: runtimeSource,
        settings: {},
        operation: { kind: "notification", notification: "didLogin" },
      }),
    ).toEqual({ status: "complete" });
    expect(calls).toEqual([
      ["login", { session: "abc" }],
      ["didLogin"],
    ]);
  });

  test("preserves blocked-session detail and blocks missing handlers", async () => {
    const blockedCache = {
      async withSession(_source, _options, fn) {
        return fn({
          status: "blocked",
          sourceKey: runtimeSource.id,
          reason: "bridge-load-failed",
          detail: "runtime unavailable",
        });
      },
    } as MobileSourceSessionCache;

    expect(
      await runMobileSourceSettingsOperation({
        cache: blockedCache,
        source: runtimeSource,
        settings: {},
        operation: { kind: "notification", notification: "refresh" },
      }),
    ).toEqual({ status: "blocked", detail: "runtime unavailable" });

    expect(
      await runMobileSourceSettingsOperation({
        cache: readyCache({}, []),
        source: runtimeSource,
        settings: {},
        operation: { kind: "notification", notification: "refresh" },
      }),
    ).toEqual({
      status: "blocked",
      detail: "This source runtime does not support notifications.",
    });
  });
});
