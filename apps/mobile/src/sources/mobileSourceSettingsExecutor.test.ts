import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MobileAidokuExecutorSource } from "./mobileSourceExecutor";
import type { MobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type { MobileRuntimeSource } from "./mobileSourceRuntime";
import {
  completeMobileSourceLogin,
  completeMobileSourceLogout,
  getMobileSourceLoginCapabilities,
  resetMobileSourceRuntimeSettings,
  runMobileSourceSettingsOperation,
} from "./mobileSourceSettingsExecutor";
import {
  resetMobileSourceProfileScopeForTesting,
  transitionMobileSourceProfile,
} from "./mobileSourceProfileScope";

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
  beforeEach(resetMobileSourceProfileScopeForTesting);
  afterEach(resetMobileSourceProfileScopeForTesting);

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
      async clearSandbox() {},
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

  test("rolls back profile credentials and clears native state when login notification fails", async () => {
    const visibleSettings: Record<string, unknown> = { theme: "dark" };
    const nativeState: Record<string, unknown> = {};
    const removedSessions: string[] = [];
    const cache = readyCache(
      {
        async handleBasicLogin() {
          nativeState.token = "native-token";
          nativeState.just_logged_in = true;
          return true;
        },
        async handleNotification() {
          throw new Error("notification failed");
        },
      },
      [],
    );
    cache.remove = (sourceKey) => {
      removedSessions.push(sourceKey);
    };

    await expect(
      completeMobileSourceLogin({
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
        currentSettings: { ...visibleSettings },
        async clearSandbox() {
          for (const key of Object.keys(nativeState)) delete nativeState[key];
        },
        async persistSettings(patch, deleteKeys) {
          for (const key of deleteKeys) delete visibleSettings[key];
          Object.assign(visibleSettings, patch);
        },
      }),
    ).rejects.toThrow("notification failed");

    expect(visibleSettings).toEqual({ theme: "dark" });
    expect(nativeState).toEqual({});
    expect(removedSessions).toEqual(["aidoku-community:en.example"]);
  });

  test("clears native state when a login handler mutates state before rejecting", async () => {
    const nativeState: Record<string, unknown> = {};
    const removedSessions: string[] = [];
    const cache = readyCache(
      {
        async handleBasicLogin() {
          nativeState.token = "rejected-token";
          return false;
        },
      },
      [],
    );
    cache.remove = (sourceKey) => removedSessions.push(sourceKey);

    const result = await completeMobileSourceLogin({
      cache,
      source: runtimeSource,
      schema: [{ key: "auth", type: "login", title: "Log in" }],
      setting: { key: "auth", type: "login", title: "Log in" },
      submission: {
        method: "basic",
        username: "reader",
        password: "wrong",
      },
      currentSettings: {},
      async clearSandbox() {
        for (const key of Object.keys(nativeState)) delete nativeState[key];
      },
      async persistSettings() {
        throw new Error("must not persist rejected credentials");
      },
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "credentials-rejected",
    });
    expect(nativeState).toEqual({});
    expect(removedSessions).toEqual(["aidoku-community:en.example"]);
  });

  test("clears native state when a login handler mutates state before throwing", async () => {
    const nativeState: Record<string, unknown> = {};

    await expect(
      completeMobileSourceLogin({
        cache: readyCache(
          {
            async handleBasicLogin() {
              nativeState.token = "partial-token";
              throw new Error("handler failed");
            },
          },
          [],
        ),
        source: runtimeSource,
        schema: [{ key: "auth", type: "login", title: "Log in" }],
        setting: { key: "auth", type: "login", title: "Log in" },
        submission: {
          method: "basic",
          username: "reader",
          password: "secret",
        },
        currentSettings: {},
        async clearSandbox() {
          for (const key of Object.keys(nativeState)) delete nativeState[key];
        },
        async persistSettings() {
          throw new Error("must not persist failed credentials");
        },
      }),
    ).rejects.toThrow("handler failed");

    expect(nativeState).toEqual({});
  });

  test("keeps an interleaved login inside its original profile scope", async () => {
    const executionScopes: Array<string | undefined> = [];
    const removedScopes: Array<string | undefined> = [];
    const clearedScopes: Array<string | undefined> = [];
    let persisted = false;
    const cache = readyCache(
      {
        async handlesWebLogin() {
          return false;
        },
        async handleBasicLogin() {
          await transitionMobileSourceProfile("profile:b");
          return true;
        },
        async handleNotification() {
          throw new Error("must not notify the new profile");
        },
      },
      [],
    );
    const withSession = cache.withSession.bind(cache);
    cache.withSession = async (source, options, fn) => {
      executionScopes.push(options.executionScope);
      return withSession(source, options, fn);
    };
    cache.remove = (_sourceKey, executionScope) => {
      removedScopes.push(executionScope);
    };

    await expect(
      completeMobileSourceLogin({
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
          username: "account-a-reader",
          password: "account-a-secret",
        },
        currentSettings: {},
        async clearSandbox(_sourceKey, executionScope) {
          clearedScopes.push(executionScope);
        },
        async persistSettings() {
          persisted = true;
        },
      }),
    ).rejects.toThrow("profile changed");

    expect(executionScopes).toEqual(["local"]);
    expect(removedScopes).toEqual(["local"]);
    expect(clearedScopes).toEqual(["local"]);
    expect(persisted).toBe(false);
  });

  test("falls back to clearing native state when logout notification fails", async () => {
    const visibleSettings: Record<string, unknown> = {
      auth: "logged_in",
      "auth.username": "reader",
      "auth.password": "secret",
      theme: "dark",
    };
    const nativeState: Record<string, unknown> = { token: "native-token" };
    const removedSessions: string[] = [];
    const cache = readyCache(
      {
        async handleNotification() {
          throw new Error("notification failed");
        },
      },
      [],
    );
    cache.remove = (sourceKey) => {
      removedSessions.push(sourceKey);
    };

    const result = await completeMobileSourceLogout({
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
      currentSettings: { ...visibleSettings },
      async clearSandbox() {
        for (const key of Object.keys(nativeState)) delete nativeState[key];
      },
      async persistSettings(patch, deleteKeys) {
        for (const key of deleteKeys) delete visibleSettings[key];
        Object.assign(visibleSettings, patch);
      },
    });

    expect(result).toEqual({ status: "complete" });
    expect(visibleSettings).toEqual({ theme: "dark" });
    expect(nativeState).toEqual({});
    expect(removedSessions).toEqual(["aidoku-community:en.example"]);
  });

  test("clears native state when logout has no notification", async () => {
    const visibleSettings: Record<string, unknown> = {
      auth: "logged_in",
      "auth.username": "reader",
    };
    const nativeState: Record<string, unknown> = { token: "native-token" };
    const removedSessions: string[] = [];
    const cache = readyCache({}, []);
    cache.remove = (sourceKey) => removedSessions.push(sourceKey);

    const result = await completeMobileSourceLogout({
      cache,
      source: runtimeSource,
      schema: [{ key: "auth", type: "login", title: "Log in" }],
      setting: { key: "auth", type: "login", title: "Log in" },
      currentSettings: { ...visibleSettings },
      async clearSandbox() {
        for (const key of Object.keys(nativeState)) delete nativeState[key];
      },
      async persistSettings(patch, deleteKeys) {
        for (const key of deleteKeys) delete visibleSettings[key];
        Object.assign(visibleSettings, patch);
      },
    });

    expect(result).toEqual({ status: "complete" });
    expect(visibleSettings).toEqual({});
    expect(nativeState).toEqual({});
    expect(removedSessions).toEqual(["aidoku-community:en.example"]);
  });

  test("does not notify a new profile after an interleaved logout", async () => {
    const executionScopes: Array<string | undefined> = [];
    const visibleSettings: Record<string, unknown> = {
      auth: "logged_in",
      "auth.username": "account-a-reader",
    };
    let persistenceCalls = 0;
    const cache = readyCache(
      {
        async handleNotification() {
          throw new Error("must not notify the new profile");
        },
      },
      [],
    );
    const withSession = cache.withSession.bind(cache);
    cache.withSession = async (source, options, fn) => {
      executionScopes.push(options.executionScope);
      return withSession(source, options, fn);
    };

    await expect(
      completeMobileSourceLogout({
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
        currentSettings: { ...visibleSettings },
        async clearSandbox() {
          throw new Error("must not clear the new profile");
        },
        async persistSettings(patch, deleteKeys) {
          persistenceCalls += 1;
          for (const key of deleteKeys) delete visibleSettings[key];
          Object.assign(visibleSettings, patch);
          if (persistenceCalls === 1) {
            await transitionMobileSourceProfile("profile:b");
          }
        },
      }),
    ).rejects.toThrow("profile changed");

    expect(executionScopes).toEqual([]);
    expect(visibleSettings).toEqual({
      auth: "logged_in",
      "auth.username": "account-a-reader",
    });
  });

  test("keeps profile credentials deleted when the profile changes during native logout", async () => {
    const visibleSettings: Record<string, unknown> = {
      auth: "logged_in",
      "auth.username": "account-a-reader",
    };
    const nativeState: Record<string, unknown> = { token: "account-a-token" };
    const clearedScopes: string[] = [];
    const cache = readyCache(
      {
        async handleNotification() {
          delete nativeState.token;
          await transitionMobileSourceProfile("profile:b");
        },
      },
      [],
    );
    cache.remove = () => undefined;

    await expect(
      completeMobileSourceLogout({
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
        currentSettings: { ...visibleSettings },
        async clearSandbox(_sourceKey, executionScope) {
          clearedScopes.push(executionScope);
          for (const key of Object.keys(nativeState)) delete nativeState[key];
        },
        async persistSettings(patch, deleteKeys) {
          for (const key of deleteKeys) delete visibleSettings[key];
          Object.assign(visibleSettings, patch);
        },
      }),
    ).rejects.toThrow("profile changed");

    expect(visibleSettings).toEqual({});
    expect(nativeState).toEqual({});
    expect(clearedScopes).toEqual(["local"]);
  });

  test("keeps profile credentials deleted when the profile changes during sandbox cleanup", async () => {
    const visibleSettings: Record<string, unknown> = {
      auth: "logged_in",
      "auth.username": "account-a-reader",
    };

    const cache = readyCache({}, []);
    cache.remove = () => undefined;

    await expect(
      completeMobileSourceLogout({
        cache,
        source: runtimeSource,
        schema: [{ key: "auth", type: "login", title: "Log in" }],
        setting: { key: "auth", type: "login", title: "Log in" },
        currentSettings: { ...visibleSettings },
        async clearSandbox(_sourceKey, executionScope) {
          expect(executionScope).toBe("local");
          await transitionMobileSourceProfile("profile:b");
        },
        async persistSettings(patch, deleteKeys) {
          for (const key of deleteKeys) delete visibleSettings[key];
          Object.assign(visibleSettings, patch);
        },
      }),
    ).rejects.toThrow("profile changed");

    expect(visibleSettings).toEqual({});
  });

  test("restores profile and native state when persisting a login fails partway", async () => {
    const visibleSettings: Record<string, unknown> = { theme: "dark" };
    const nativeState: Record<string, unknown> = {};
    let persistenceCalls = 0;

    await expect(
      completeMobileSourceLogin({
        cache: readyCache(
          {
            async handleBasicLogin() {
              nativeState.token = "native-token";
              return true;
            },
          },
          [],
        ),
        source: runtimeSource,
        schema: [{ key: "auth", type: "login", title: "Log in" }],
        setting: { key: "auth", type: "login", title: "Log in" },
        submission: {
          method: "basic",
          username: "reader",
          password: "secret",
        },
        currentSettings: { ...visibleSettings },
        async clearSandbox() {
          for (const key of Object.keys(nativeState)) delete nativeState[key];
        },
        async persistSettings(patch, deleteKeys) {
          persistenceCalls += 1;
          for (const key of deleteKeys) delete visibleSettings[key];
          Object.assign(visibleSettings, patch);
          if (persistenceCalls === 1) throw new Error("write failed");
        },
      }),
    ).rejects.toThrow("write failed");

    expect(visibleSettings).toEqual({ theme: "dark" });
    expect(nativeState).toEqual({});
  });

  test("restores profile credentials when persisting logout fails partway", async () => {
    const originalSettings: Record<string, unknown> = {
      auth: "logged_in",
      "auth.username": "reader",
      "auth.password": "secret",
      theme: "dark",
    };
    const visibleSettings = { ...originalSettings };
    let persistenceCalls = 0;

    await expect(
      completeMobileSourceLogout({
        cache: readyCache({}, []),
        source: runtimeSource,
        schema: [{ key: "auth", type: "login", title: "Log in" }],
        setting: { key: "auth", type: "login", title: "Log in" },
        currentSettings: originalSettings,
        async clearSandbox() {},
        async persistSettings(patch, deleteKeys) {
          persistenceCalls += 1;
          for (const key of deleteKeys) delete visibleSettings[key];
          Object.assign(visibleSettings, patch);
          if (persistenceCalls === 1) throw new Error("write failed");
        },
      }),
    ).rejects.toThrow("write failed");

    expect(visibleSettings).toEqual(originalSettings);
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

  test("finishes the captured profile reset after a transition during native cleanup", async () => {
    const effects: string[] = [];

    await resetMobileSourceRuntimeSettings({
      cache: {
        remove(_sourceKey, executionScope) {
          effects.push(`remove:${executionScope}`);
        },
      } as MobileSourceSessionCache,
      source: runtimeSource,
      async clearSandbox(_sourceKey, executionScope) {
        effects.push(`clear:${executionScope}`);
        await transitionMobileSourceProfile("profile:b");
      },
      async resetProfileSettings() {
        effects.push("reset:local");
      },
    });

    expect(effects).toEqual([
      "remove:local",
      "clear:local",
      "reset:local",
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
