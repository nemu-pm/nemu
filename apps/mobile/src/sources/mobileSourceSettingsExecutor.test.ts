import { describe, expect, test } from "bun:test";
import type { MobileAidokuExecutorSource } from "./mobileSourceExecutor";
import type { MobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type { MobileRuntimeSource } from "./mobileSourceRuntime";
import {
  completeMobileSourceLogin,
  getMobileSourceLoginCapabilities,
  resetMobileSourceRuntimeSettings,
  runMobileSourceSettingsOperation,
} from "./mobileSourceSettingsExecutor";

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
        source: {
          async handlesBasicLogin() {
            return true;
          },
          async handlesWebLogin() {
            return true;
          },
          ...source,
        } as MobileAidokuExecutorSource,
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

  test("blocks a login method the source runtime does not implement", async () => {
    const cache = readyCache(
      {
        async handlesBasicLogin() {
          return false;
        },
        async handleBasicLogin() {
          throw new Error("must not run");
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
          kind: "basic-login",
          key: "login",
          username: "reader",
          password: "secret",
        },
      }),
    ).toEqual({
      status: "blocked",
      detail: "This source runtime does not support basic login.",
    });
  });

  test("reports the runtime login capabilities used to disable unsupported rows", async () => {
    const cache = readyCache(
      {
        async handlesBasicLogin() {
          return false;
        },
        async handlesWebLogin() {
          return true;
        },
      },
      [],
    );

    expect(
      await getMobileSourceLoginCapabilities({
        cache,
        source: runtimeSource,
        settings: {},
      }),
    ).toEqual({ basic: false, web: true });
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

  test("commits and notifies login before a later logout notification", async () => {
    const persistedDefaults: Record<string, unknown> = {};
    const visibleSettings: Record<string, unknown> = {};
    const observedSettings: Record<string, unknown>[] = [];
    const cache = readyCache(
      {
        async handleBasicLogin() {
          persistedDefaults.token = "native-token";
          persistedDefaults.just_logged_in = true;
          return true;
        },
        async handleNotification(notification) {
          if (notification === "login-changed") {
            if (
              visibleSettings.auth === "logged_in" &&
              persistedDefaults.just_logged_in === true
            ) {
              delete persistedDefaults.just_logged_in;
            } else if (visibleSettings.auth === undefined) {
              delete persistedDefaults.token;
            }
          }
        },
      },
      observedSettings,
    );

    const result = await completeMobileSourceLogin({
      cache,
      source: runtimeSource,
      schema: [
        {
          key: "auth",
          type: "login",
          title: "Log in",
          notification: "login-changed",
        },
      ],
      setting: {
        key: "auth",
        type: "login",
        title: "Log in",
        notification: "login-changed",
      },
      submission: {
        method: "basic",
        username: "reader",
        password: "secret",
      },
      currentSettings: {},
      async persistSettings(patch, deleteKeys) {
        for (const key of deleteKeys) delete visibleSettings[key];
        Object.assign(visibleSettings, patch);
      },
    });

    expect(result).toEqual({ status: "complete" });
    expect(persistedDefaults).toEqual({ token: "native-token" });
    expect(visibleSettings.auth).toBe("logged_in");
    expect(observedSettings.at(-1)?.auth).toBe("logged_in");

    delete visibleSettings.auth;
    expect(
      await runMobileSourceSettingsOperation({
        cache,
        source: runtimeSource,
        settings: visibleSettings,
        operation: {
          kind: "notification",
          notification: "login-changed",
        },
      }),
    ).toEqual({ status: "complete" });
    expect(persistedDefaults).toEqual({});
  });

  test("reset invalidates the live session and clears native persistence", async () => {
    const effects: string[] = [];
    const persistedDefaults: Record<string, unknown> = {
      token: "native-token",
      just_logged_in: true,
    };
    const cache = {
      remove(sourceKey: string) {
        effects.push(`remove:${sourceKey}`);
      },
    } as MobileSourceSessionCache;

    await resetMobileSourceRuntimeSettings({
      cache,
      source: runtimeSource,
      async clearSandbox(sourceKey) {
        effects.push(`clear:${sourceKey}`);
        for (const key of Object.keys(persistedDefaults)) {
          delete persistedDefaults[key];
        }
      },
      async resetProfileSettings() {
        effects.push("reset-profile");
      },
    });

    expect(effects).toEqual([
      "remove:aidoku-community:en.example",
      "clear:aidoku-community:en.example",
      "reset-profile",
    ]);
    expect(persistedDefaults).toEqual({});
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
