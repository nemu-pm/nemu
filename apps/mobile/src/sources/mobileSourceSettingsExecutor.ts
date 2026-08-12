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
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  settings: Record<string, unknown>;
  operation: MobileSourceSettingsOperation;
}): Promise<MobileSourceSettingsOperationResult> {
  return cache.withSession(source, { settings }, async (session) => {
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
  });
}

export async function completeMobileSourceLogin({
  cache = defaultMobileSourceSessionCache,
  source,
  schema,
  setting,
  submission,
  currentSettings,
  persistSettings,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  schema: SourcePackageSetting[];
  setting: SourcePackageSetting;
  submission: MobileSourceLoginSubmission;
  currentSettings: Record<string, unknown>;
  persistSettings: (
    patch: Record<string, unknown>,
    deleteKeys: string[],
  ) => Promise<void>;
}): Promise<MobileSourceSettingsOperationResult> {
  if (submission.method === "basic") {
    const result = await runMobileSourceSettingsOperation({
      cache,
      source,
      settings: currentSettings,
      operation: {
        kind: "basic-login",
        key: setting.key,
        username: submission.username,
        password: submission.password,
      },
    });
    if (result.status !== "complete") return result;
  } else if (
    submission.method === "web" &&
    Object.keys(submission.cookies).length > 0
  ) {
    const result = await runMobileSourceSettingsOperation({
      cache,
      source,
      settings: currentSettings,
      operation: {
        kind: "web-login",
        key: setting.key,
        cookies: submission.cookies,
      },
    });
    if (result.status !== "complete") return result;
  }

  const patch = sourceLoginStoragePatch(setting, submission);
  const deleteKeys = sourceLoginLogoutKeys(setting).filter(
    (key) => !Object.hasOwn(patch, key),
  );
  const nextSettings = applyMobileSourceSettingsPatch(
    schema,
    currentSettings,
    patch,
    deleteKeys,
  ).values;
  await persistSettings(patch, deleteKeys);

  const notification = setting.notification?.trim();
  if (!notification) return { status: "complete" };
  return runMobileSourceSettingsOperation({
    cache,
    source,
    settings: nextSettings,
    operation: { kind: "notification", notification },
  });
}

export async function resetMobileSourceRuntimeSettings({
  cache = defaultMobileSourceSessionCache,
  source,
  clearSandbox,
  resetProfileSettings,
}: {
  cache?: MobileSourceSessionCache;
  source: MobileRuntimeSource;
  clearSandbox: (sourceKey: string) => Promise<void>;
  resetProfileSettings: () => Promise<void>;
}): Promise<void> {
  const sourceKey = makeMobileRuntimeSourceKey(source);
  cache.remove(sourceKey);
  await clearSandbox(sourceKey);
  await resetProfileSettings();
}
