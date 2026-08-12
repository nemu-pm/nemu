import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  makeMobileRuntimeSourceKey,
  type MobileRuntimeSource,
} from "./mobileSourceRuntime";
import type { SourcePackageSetting } from "@/data/schema";
import {
  sourceLoginLogoutKeys,
  sourceLoginStoragePatch,
  type MobileSourceLoginSubmission,
} from "@/lib/mobileSourceSettingActions";
import { applyMobileSourceSettingsPatch } from "@/lib/mobileSourceSettings";
import {
  assertActiveMobileSourceProfileScope,
  getActiveMobileSourceProfileScope,
  isMobileSourceProfileChangedError,
} from "./mobileSourceProfileScope";

export type MobileSourceSettingsOperation =
  | {
      kind: "basic-login";
      key: string;
      username: string;
      password: string;
    }
  | {
      kind: "web-login";
      key: string;
      cookies: Record<string, string>;
    }
  | { kind: "notification"; notification: string };

export type MobileSourceSettingsOperationResult =
  | { status: "complete" }
  | { status: "rejected"; reason: "credentials-rejected" }
  | { status: "blocked"; detail: string };

export type MobileSourceLoginCapabilities = {
  basic: boolean;
  web: boolean;
};

type ClearMobileSourceSandbox = (
  sourceKey: string,
  executionScope: string,
) => Promise<void>;

function getSettingsRollback(
  currentSettings: Record<string, unknown>,
  affectedKeys: Iterable<string>,
): { patch: Record<string, unknown>; deleteKeys: string[] } {
  const patch: Record<string, unknown> = {};
  const deleteKeys: string[] = [];
  for (const key of affectedKeys) {
    if (Object.hasOwn(currentSettings, key)) patch[key] = currentSettings[key];
    else deleteKeys.push(key);
  }
  return { patch, deleteKeys };
}

async function clearNativeSourceState(
  cache: MobileSourceSessionCache,
  source: MobileRuntimeSource,
  clearSandbox: ClearMobileSourceSandbox,
  executionScope: string,
): Promise<void> {
  const sourceKey = makeMobileRuntimeSourceKey(source);
  let cacheError: unknown;
  try {
    cache.remove(sourceKey, executionScope);
  } catch (error) {
    cacheError = error;
  }
  await clearSandbox(sourceKey, executionScope);
  if (cacheError) throw cacheError;
}

async function restoreSettings(
  persistSettings: (
    patch: Record<string, unknown>,
    deleteKeys: string[],
  ) => Promise<void>,
  rollback: { patch: Record<string, unknown>; deleteKeys: string[] },
): Promise<void> {
  await persistSettings(rollback.patch, rollback.deleteKeys);
}

async function compensateFailedLogin(
  cache: MobileSourceSessionCache,
  source: MobileRuntimeSource,
  clearSandbox: ClearMobileSourceSandbox,
  persistSettings: (
    patch: Record<string, unknown>,
    deleteKeys: string[],
  ) => Promise<void>,
  rollback: { patch: Record<string, unknown>; deleteKeys: string[] },
  executionScope: string,
): Promise<void> {
  let nativeError: unknown;
  try {
    await clearNativeSourceState(
      cache,
      source,
      clearSandbox,
      executionScope,
    );
  } catch (error) {
    nativeError = error;
  }
  await restoreSettings(persistSettings, rollback);
  if (nativeError) throw nativeError;
}

export async function getMobileSourceLoginCapabilities({
  cache = defaultMobileSourceSessionCache,
  source,
  settings,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  settings: Record<string, unknown>;
}): Promise<MobileSourceLoginCapabilities> {
  return cache.withSession(source, { settings }, async (session) => {
    if (session.status === "blocked") {
      return { basic: false, web: false };
    }

    const [basic, web] = await Promise.all([
      session.source.handlesBasicLogin(),
      session.source.handlesWebLogin(),
    ]);
    return { basic, web };
  });
}

export async function runMobileSourceSettingsOperation({
  cache = defaultMobileSourceSessionCache,
  source,
  settings,
  operation,
  executionScope,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  settings: Record<string, unknown>;
  operation: MobileSourceSettingsOperation;
  executionScope?: string;
}): Promise<MobileSourceSettingsOperationResult> {
  return cache.withSession(
    source,
    { settings, executionScope },
    async (session) => {
      if (session.status === "blocked") {
        return { status: "blocked", detail: session.detail };
      }

      if (operation.kind === "basic-login") {
        if (
          !session.source.handleBasicLogin ||
          !(await session.source.handlesBasicLogin())
        ) {
          return {
            status: "blocked",
            detail: "This source runtime does not support basic login.",
          };
        }
        const accepted = await session.source.handleBasicLogin(
          operation.key,
          operation.username,
          operation.password,
        );
        return accepted
          ? { status: "complete" }
          : { status: "rejected", reason: "credentials-rejected" };
      }

      if (operation.kind === "web-login") {
        if (
          !session.source.handleWebLogin ||
          !(await session.source.handlesWebLogin())
        ) {
          return {
            status: "blocked",
            detail: "This source runtime does not support web login.",
          };
        }
        const accepted = await session.source.handleWebLogin(
          operation.key,
          operation.cookies,
        );
        return accepted
          ? { status: "complete" }
          : { status: "rejected", reason: "credentials-rejected" };
      }

      if (!session.source.handleNotification) {
        return {
          status: "blocked",
          detail: "This source runtime does not support notifications.",
        };
      }
      await session.source.handleNotification(operation.notification);
      return { status: "complete" };
    },
  );
}

export async function completeMobileSourceLogin({
  cache = defaultMobileSourceSessionCache,
  source,
  schema,
  setting,
  submission,
  currentSettings,
  clearSandbox,
  persistSettings,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  schema: SourcePackageSetting[];
  setting: SourcePackageSetting;
  submission: MobileSourceLoginSubmission;
  currentSettings: Record<string, unknown>;
  clearSandbox: ClearMobileSourceSandbox;
  persistSettings: (
    patch: Record<string, unknown>,
    deleteKeys: string[],
  ) => Promise<void>;
}): Promise<MobileSourceSettingsOperationResult> {
  const executionScope = getActiveMobileSourceProfileScope();
  assertActiveMobileSourceProfileScope(executionScope);
  try {
    let loginResult: MobileSourceSettingsOperationResult = {
      status: "complete",
    };
    if (submission.method === "basic") {
      loginResult = await runMobileSourceSettingsOperation({
        cache,
        source,
        settings: currentSettings,
        operation: {
          kind: "basic-login",
          key: setting.key,
          username: submission.username,
          password: submission.password,
        },
        executionScope,
      });
    } else if (
      submission.method === "web" &&
      Object.keys(submission.cookies).length > 0
    ) {
      loginResult = await runMobileSourceSettingsOperation({
        cache,
        source,
        settings: currentSettings,
        operation: {
          kind: "web-login",
          key: setting.key,
          cookies: submission.cookies,
        },
        executionScope,
      });
    }
    assertActiveMobileSourceProfileScope(executionScope);
    if (loginResult.status !== "complete") {
      await clearNativeSourceState(
        cache,
        source,
        clearSandbox,
        executionScope,
      );
      return loginResult;
    }
  } catch (error) {
    try {
      await clearNativeSourceState(
        cache,
        source,
        clearSandbox,
        executionScope,
      );
    } catch {
      // Preserve the handler error while still attempting fail-closed cleanup.
    }
    throw error;
  }

  let patch: Record<string, unknown>;
  try {
    patch = sourceLoginStoragePatch(setting, submission);
  } catch (error) {
    try {
      await clearNativeSourceState(
        cache,
        source,
        clearSandbox,
        executionScope,
      );
    } catch {
      // Preserve the validation error while still attempting cleanup.
    }
    throw error;
  }
  const deleteKeys = sourceLoginLogoutKeys(setting).filter(
    (key) => !Object.hasOwn(patch, key),
  );
  const nextSettings = applyMobileSourceSettingsPatch(
    schema,
    currentSettings,
    patch,
    deleteKeys,
  ).values;
  const rollback = getSettingsRollback(currentSettings, [
    ...Object.keys(patch),
    ...deleteKeys,
  ]);
  const notification = setting.notification?.trim();
  let result: MobileSourceSettingsOperationResult = { status: "complete" };
  try {
    assertActiveMobileSourceProfileScope(executionScope);
    await persistSettings(patch, deleteKeys);
    assertActiveMobileSourceProfileScope(executionScope);
    if (notification) {
      result = await runMobileSourceSettingsOperation({
        cache,
        source,
        settings: nextSettings,
        operation: { kind: "notification", notification },
        executionScope,
      });
      assertActiveMobileSourceProfileScope(executionScope);
    }
  } catch (error) {
    try {
      await compensateFailedLogin(
        cache,
        source,
        clearSandbox,
        persistSettings,
        rollback,
        executionScope,
      );
    } catch {
      // Preserve the operation error; callers already surface a retryable
      // failure and the compensation attempted both native and profile state.
    }
    throw error;
  }
  if (result.status !== "complete") {
    await compensateFailedLogin(
      cache,
      source,
      clearSandbox,
      persistSettings,
      rollback,
      executionScope,
    );
  }
  return result;
}

export async function completeMobileSourceLogout({
  cache = defaultMobileSourceSessionCache,
  source,
  schema,
  setting,
  currentSettings,
  clearSandbox,
  persistSettings,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  schema: SourcePackageSetting[];
  setting: SourcePackageSetting;
  currentSettings: Record<string, unknown>;
  clearSandbox: ClearMobileSourceSandbox;
  persistSettings: (
    patch: Record<string, unknown>,
    deleteKeys: string[],
  ) => Promise<void>;
}): Promise<MobileSourceSettingsOperationResult> {
  const executionScope = getActiveMobileSourceProfileScope();
  assertActiveMobileSourceProfileScope(executionScope);
  const deleteKeys = sourceLoginLogoutKeys(setting);
  const nextSettings = applyMobileSourceSettingsPatch(
    schema,
    currentSettings,
    {},
    deleteKeys,
  ).values;
  const rollback = getSettingsRollback(currentSettings, deleteKeys);
  try {
    assertActiveMobileSourceProfileScope(executionScope);
    await persistSettings({}, deleteKeys);
    assertActiveMobileSourceProfileScope(executionScope);
  } catch (error) {
    await restoreSettings(persistSettings, rollback);
    throw error;
  }

  const notification = setting.notification?.trim();
  if (notification) {
    try {
      assertActiveMobileSourceProfileScope(executionScope);
      const result = await runMobileSourceSettingsOperation({
        cache,
        source,
        settings: nextSettings,
        operation: { kind: "notification", notification },
        executionScope,
      });
      assertActiveMobileSourceProfileScope(executionScope);
      if (result.status === "complete") return result;
    } catch (error) {
      if (isMobileSourceProfileChangedError(error)) {
        try {
          await clearNativeSourceState(
            cache,
            source,
            clearSandbox,
            executionScope,
          );
        } finally {
          await restoreSettings(persistSettings, rollback);
        }
        throw error;
      }
      // Clearing the source sandbox is the fail-closed logout path below.
    }
  }

  try {
    await clearNativeSourceState(
      cache,
      source,
      clearSandbox,
      executionScope,
    );
    assertActiveMobileSourceProfileScope(executionScope);
    return { status: "complete" };
  } catch (error) {
    await restoreSettings(persistSettings, rollback);
    throw error;
  }
}

export async function resetMobileSourceRuntimeSettings({
  cache = defaultMobileSourceSessionCache,
  source,
  clearSandbox,
  resetProfileSettings,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  clearSandbox: ClearMobileSourceSandbox;
  resetProfileSettings: () => Promise<void>;
}): Promise<void> {
  const executionScope = getActiveMobileSourceProfileScope();
  assertActiveMobileSourceProfileScope(executionScope);
  const sourceKey = makeMobileRuntimeSourceKey(source);
  cache.remove(sourceKey, executionScope);
  await clearSandbox(sourceKey, executionScope);
  assertActiveMobileSourceProfileScope(executionScope);
  await resetProfileSettings();
}
