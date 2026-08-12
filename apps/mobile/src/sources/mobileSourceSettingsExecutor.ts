import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import type { MobileRuntimeSource } from "./mobileSourceRuntime";

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
      if (!session.source.handleBasicLogin) {
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
      if (!session.source.handleWebLogin) {
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
