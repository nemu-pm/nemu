// Native background sync registration.
//
// Metro resolves this file on iOS/Android. It wires `expo-background-task`
// (iOS `BGProcessingTask` via `BGTaskScheduler`, Android WorkManager) and
// `expo-task-manager` to the shared `runMobileBackgroundSyncOnce` runner. The
// base stub (`mobileBackgroundSync.ts`) is what bun's test runner and Expo web
// resolve instead — it re-exports the same surface as no-ops so the seam is
// type-compatible. See `CONTRIBUTING.md` for the convention.
//
// iOS specifics: `BGTaskScheduler` is heuristic-based and may never run the
// task. `BGProcessingTask` can run for minutes but the system can interrupt at
// any time; we register an expiration listener that flips a flag the runner
// checks through `isExpiring` on the next phase boundary. The task is
// defined at module scope (required by `TaskManager.defineTask` — the background
// runtime spins up the JS bundle with no React tree mounted). Registration is
// idempotent and safe to call on every app foreground.

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { openDatabaseAsync } from "expo-sqlite";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { NativeUserDataStore } from "@/data/nativeStore";
import { migrateNativeDatabase } from "@/data/nativeDatabase";
import { resolveMobileDataProfileForUser } from "@/data/mobileDataProfile";
import type { MobileDataStore } from "@/data/storeTypes";
import { createMobileSyncDataStore } from "./mobileSyncDataStore";
import { mobileAuthClient } from "./mobileAuthClient";
import { getMobileSyncEpoch } from "./mobileSyncRuntime";
import { mobileSyncConfig } from "./mobileSyncConfig";
import {
  MOBILE_BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
  MOBILE_BACKGROUND_SYNC_TASK_NAME,
  MOBILE_BACKGROUND_SYNC_TIMEOUT_MS,
  getMobileBackgroundSyncRemainingMs,
} from "./mobileBackgroundSyncConfig";
import {
  runMobileBackgroundSyncOnce,
  type MobileSyncClient,
} from "./mobileBackgroundSyncRunner";

type HeadlessMobileSyncContext = {
  store: MobileDataStore;
  convex: MobileSyncClient;
  expectedUserId: string;
  cancel(): void;
  close(): Promise<void>;
};

// The listener must exist when a cold headless JS runtime starts, before any
// React provider or registration hook mounts. Keep every active controller in
// a set so an expiration/sign-out can cancel auth bootstrap and Convex work,
// not merely prevent the next merge phase from starting.
let expirationListenerHandle: { remove: () => void } | null = null;
let expirationSuspended = false;
const activeBackgroundTaskControllers = new Set<AbortController>();

function abortActiveBackgroundTasks(): void {
  for (const controller of activeBackgroundTaskControllers) {
    controller.abort();
  }
}

function ensureExpirationListener(): void {
  if (expirationListenerHandle) return;
  try {
    expirationListenerHandle = BackgroundTask.addExpirationListener(() => {
      expirationSuspended = true;
      abortActiveBackgroundTasks();
    });
  } catch (error) {
    // Some restricted native environments cannot install this listener. Task
    // registration remains best-effort and the process-wide deadline is still
    // enforced, so never make app bootstrap depend on listener availability.
    console.warn("[MobileBackgroundSync] Failed to install expiration listener:", error);
  }
}

function clearExpirationListener(): void {
  expirationListenerHandle?.remove();
  expirationListenerHandle = null;
}

// Install from module scope for a cold OS-launched task. Calling this again
// from foreground registration is idempotent and restores it after sign-out.
ensureExpirationListener();

async function createHeadlessMobileSyncContext(options: {
  signal: AbortSignal;
  cancel(): void;
}): Promise<HeadlessMobileSyncContext | null> {
  if (!mobileSyncConfig.convexUrl) return null;
  const { signal } = options;
  const fetchOptions = { signal, throw: false as const };

  const sessionResult = await mobileAuthClient.getSession({ fetchOptions });
  if (signal.aborted) return null;
  const userId = sessionResult.data?.user?.id;
  if (!userId) return null;

  const tokenResult = await mobileAuthClient.convex.token({ fetchOptions });
  if (signal.aborted) return null;
  const token = tokenResult.data?.token;
  if (!token) return null;

  // The session and token are separate requests. Do not combine an A session
  // with a token fetched after the device switched to B.
  const confirmedSession = await mobileAuthClient.getSession({ fetchOptions });
  if (signal.aborted) return null;
  if (confirmedSession.data?.user?.id !== userId) return null;

  const shouldRetainProfile = mobileBackgroundStoreRef.current === null;
  let profile: Awaited<ReturnType<typeof resolveMobileDataProfileForUser>>;
  try {
    profile = await resolveMobileDataProfileForUser(userId, {
      // A mounted foreground provider has already durably selected the profile.
      // Do not mutate that global selection from a concurrent background task.
      retain: shouldRetainProfile,
    });
    if (signal.aborted) return null;
  } catch (error) {
    // During a foreground account transition the provider may not have
    // durably selected the new profile yet. Skip this opportunistic task and
    // let the foreground effect finish instead of claiming the legacy DB here.
    if (!shouldRetainProfile) return null;
    throw error;
  }
  const finalSession = await mobileAuthClient.getSession({ fetchOptions });
  if (signal.aborted) return null;
  if (finalSession.data?.user?.id !== userId) return null;
  const convex = new ConvexHttpClient(mobileSyncConfig.convexUrl, {
    auth: token,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, {
        ...init,
        signal,
      })) as unknown as typeof globalThis.fetch,
  });
  // Session reads and token issuance are separate requests. Confirm the fixed
  // token's actual Convex subject before opening or mutating this profile DB.
  const convexUserId = await convex.query(api.auth.getCurrentUserId, {});
  if (signal.aborted || convexUserId !== userId) return null;
  // This task only merges the fixed account's Convex snapshot and hydrates
  // public package artifacts. It must never mutate the process-global source
  // runtime/Cookie scope: a late A task could otherwise roll foreground B back
  // to A after sign-out. Any future background source execution must pass an
  // explicit immutable scope to that operation instead of changing UI state.
  const db = await openDatabaseAsync(profile.databaseName);
  try {
    if (signal.aborted) {
      await db.closeAsync().catch(() => undefined);
      return null;
    }
    await migrateNativeDatabase(db);
    if (signal.aborted) {
      await db.closeAsync().catch(() => undefined);
      return null;
    }
    return {
      store: createMobileSyncDataStore(new NativeUserDataStore(db)),
      convex: convex as unknown as MobileSyncClient,
      expectedUserId: userId,
      cancel: options.cancel,
      close: () => db.closeAsync(),
    };
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

// `TaskManager.defineTask` MUST be called at module scope. Warm launches reuse
// the foreground refs; a headless relaunch restores auth, opens the active
// profile database, and creates a one-shot authenticated Convex client.
TaskManager.defineTask(MOBILE_BACKGROUND_SYNC_TASK_NAME, async () => {
  expirationSuspended = false;
  ensureExpirationListener();
  const taskStartedAt = Date.now();
  const taskAbortController = new AbortController();
  activeBackgroundTaskControllers.add(taskAbortController);
  const taskDeadline = setTimeout(() => {
    taskAbortController.abort();
  }, MOBILE_BACKGROUND_SYNC_TIMEOUT_MS);
  const taskSyncEpoch = getMobileSyncEpoch();
  let headlessContext: HeadlessMobileSyncContext | null = null;
  try {
    // Always use a task-owned database connection and fixed-token HTTP client.
    // Foreground refs are mutable across account/profile changes and therefore
    // cannot safely be captured by long-running background work.
    const context = await createHeadlessMobileSyncContext({
      signal: taskAbortController.signal,
      cancel: () => taskAbortController.abort(),
    });
    if (!context) {
      // No restorable signed-in session is a successful no-op, not a scheduler
      // failure that should reduce future background opportunities.
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    headlessContext = context;
    const timeoutMs = getMobileBackgroundSyncRemainingMs({
      startedAt: taskStartedAt,
      now: Date.now(),
    });
    if (taskAbortController.signal.aborted || timeoutMs === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await runMobileBackgroundSyncOnce({
      store: context.store,
      convex: context.convex,
      expectedUserId: context.expectedUserId,
      signal: taskAbortController.signal,
      isExpiring: isMobileBackgroundSyncExpiring,
      onTimeout: context.cancel,
      syncEpoch: taskSyncEpoch,
      timeoutMs,
    });
    if (result.reason === "timed-out" && result.completion && headlessContext) {
      const contextToClose = headlessContext;
      headlessContext = null;
      void result.completion.then(() => contextToClose.close().catch(() => undefined));
    }
    return result.reason === "error" && !taskAbortController.signal.aborted
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    if (taskAbortController.signal.aborted) {
      // Deadline/OS expiration is an expected end to this best-effort window,
      // not a user-visible network failure. Non-abort errors still fail below.
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    console.error("[MobileBackgroundSync] Headless sync failed:", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    clearTimeout(taskDeadline);
    activeBackgroundTaskControllers.delete(taskAbortController);
    await headlessContext?.close().catch(() => undefined);
  }
});

// The background executor needs the active `MobileDataStore`, but
// `TaskManager.defineTask` runs at module scope before any React provider
// mounts. The foreground hook below publishes the store into this ref once
// `MobileDataProvider` is ready.
export const mobileBackgroundStoreRef: { current: MobileDataStore | null } = {
  current: null,
};

export async function registerMobileBackgroundSyncAsync(): Promise<void> {
  if (!mobileSyncConfig.configured) return;

  try {
    if (expirationSuspended) {
      expirationSuspended = false;
    }
    ensureExpirationListener();

    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(
      MOBILE_BACKGROUND_SYNC_TASK_NAME,
    );
    if (alreadyRegistered) return;

    await BackgroundTask.registerTaskAsync(MOBILE_BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: MOBILE_BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
    });
  } catch (error) {
    // Registration is best-effort: if the OS denies background execution
    // (Restricted status, simulator, etc.) we must not crash the app.
    console.warn("[MobileBackgroundSync] Failed to register background task:", error);
  }
}

export async function unregisterMobileBackgroundSyncAsync(): Promise<void> {
  try {
    abortActiveBackgroundTasks();
    clearExpirationListener();
    await BackgroundTask.unregisterTaskAsync(MOBILE_BACKGROUND_SYNC_TASK_NAME);
  } catch (error) {
    console.warn("[MobileBackgroundSync] Failed to unregister background task:", error);
  }
}

export async function isMobileBackgroundSyncRegisteredAsync(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(MOBILE_BACKGROUND_SYNC_TASK_NAME);
  } catch {
    return false;
  }
}

// True when iOS has signalled the current background execution window is
// expiring. The native executor checks this between sync phases. Reset on each
// new registration.
export function isMobileBackgroundSyncExpiring(): boolean {
  return expirationSuspended;
}

// Exposed for the foreground hook to publish the active store once mounted.
export function setMobileBackgroundSyncStore(store: MobileDataStore | null): void {
  mobileBackgroundStoreRef.current = store;
}
