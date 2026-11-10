/**
 * Live install state of the on-device Japanese dictionary pack, shared by the
 * reader's analysis loading state and the Japanese Learning settings.
 *
 * Fed by the engine's own events (install start/finish/failure and native
 * byte progress), so an install started anywhere — the first on-device
 * analysis, or "Download now" in settings — shows up in every view.
 */
import { useSyncExternalStore } from "react";
import { createChangeListeners } from "./mobileChangeListeners";
import type { NemuJapaneseLearningNativeModule } from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import {
  MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE,
  mobileJapaneseLearningPackNotifyDelay,
  reduceMobileJapaneseLearningPackState,
  shouldPrefetchMobileJapaneseLearningPack,
  type MobileJapaneseLearningPackEvent,
  type MobileJapaneseLearningPackState,
} from "./mobileJapaneseLearningAnalysisPackState";
import {
  ensureMobileJapaneseLearningAnalysisPack,
  getMobileJapaneseLearningAnalysisPackStatus,
  removeMobileJapaneseLearningAnalysisPack,
  subscribeMobileJapaneseLearningAnalysisPackInstall,
  subscribeMobileJapaneseLearningAnalysisPackProgress,
} from "./mobileJapaneseLearningOnDeviceAnalysis";

let state: MobileJapaneseLearningPackState = MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE;
let changes = createChangeListeners();
let detachEngine: (() => void) | null = null;
let moduleOverride: NemuJapaneseLearningNativeModule | null | undefined;
let lastNotifiedAt = Number.NEGATIVE_INFINITY;
let pendingNotify: ReturnType<typeof setTimeout> | null = null;

function notifyNow(): void {
  if (pendingNotify) {
    clearTimeout(pendingNotify);
    pendingNotify = null;
  }
  lastNotifiedAt = Date.now();
  changes.notify();
}

function dispatch(event: MobileJapaneseLearningPackEvent): void {
  const next = reduceMobileJapaneseLearningPackState(state, event);
  if (next === state) return;
  const previous = state;
  state = next;
  const delay = mobileJapaneseLearningPackNotifyDelay({
    previous,
    next,
    event,
    sinceLastNotifyMs: Date.now() - lastNotifiedAt,
  });
  if (delay === 0) {
    notifyNow();
  } else if (!pendingNotify) {
    // The latest count is in `state`; the trailing notify publishes it.
    pendingNotify = setTimeout(notifyNow, delay);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attachEngine(): void {
  if (detachEngine) return;
  const unsubscribeProgress = subscribeMobileJapaneseLearningAnalysisPackProgress(
    (progress) => dispatch({ type: "progress", progress }),
  );
  const unsubscribeInstall = subscribeMobileJapaneseLearningAnalysisPackInstall(
    (event) => {
      if (event.type === "started") dispatch({ type: "install-started" });
      else if (event.type === "succeeded") {
        dispatch({ type: "install-succeeded", status: event.status });
      } else dispatch({ type: "install-failed", message: errorMessage(event.error) });
    },
  );
  detachEngine = () => {
    unsubscribeProgress();
    unsubscribeInstall();
  };
  void refreshMobileJapaneseLearningAnalysisPackStatus();
}

export function subscribeMobileJapaneseLearningAnalysisPackState(
  listener: () => void,
): () => void {
  attachEngine();
  return changes.subscribe(listener);
}

export function getMobileJapaneseLearningAnalysisPackState(): MobileJapaneseLearningPackState {
  return state;
}

export async function refreshMobileJapaneseLearningAnalysisPackStatus(): Promise<void> {
  try {
    const status = await getMobileJapaneseLearningAnalysisPackStatus(moduleOverride);
    dispatch({ type: "status", status });
  } catch {
    dispatch({
      type: "status",
      status: { kernelLinked: false, abiVersion: 0, installed: false, installing: false },
    });
  }
}

/** "Download now" / "Retry": resolves true once the pinned pack is ready. */
export async function installMobileJapaneseLearningAnalysisPackNow(): Promise<boolean> {
  attachEngine();
  try {
    await ensureMobileJapaneseLearningAnalysisPack({ module: moduleOverride });
    await refreshMobileJapaneseLearningAnalysisPackStatus();
    return true;
  } catch (error) {
    // Failures inside the install arrive as install events; this covers the
    // status read in front of it.
    if (state.kind !== "failed") {
      dispatch({ type: "install-failed", message: errorMessage(error) });
    }
    return false;
  }
}

let prefetchStarted = false;

/**
 * The reader's quiet download (`shouldPrefetchMobileJapaneseLearningPack`):
 * at most one per app session, so a pack the user removed is not fetched
 * again on every chapter. Resolves true once the pack is ready.
 */
export async function prefetchMobileJapaneseLearningAnalysisPack(
  conditions: Omit<Parameters<typeof shouldPrefetchMobileJapaneseLearningPack>[0], "state">,
): Promise<boolean> {
  if (prefetchStarted) return false;
  attachEngine();
  await refreshMobileJapaneseLearningAnalysisPackStatus();
  if (prefetchStarted || !shouldPrefetchMobileJapaneseLearningPack({ ...conditions, state })) {
    return false;
  }
  prefetchStarted = true;
  return installMobileJapaneseLearningAnalysisPackNow();
}

/** "Remove": frees the ~38 MB installed pack; it downloads again on next use. */
export async function removeMobileJapaneseLearningAnalysisPackNow(): Promise<boolean> {
  attachEngine();
  if (state.kind === "installing") return false;
  dispatch({ type: "remove-started" });
  try {
    await removeMobileJapaneseLearningAnalysisPack(moduleOverride);
    return true;
  } catch {
    return false;
  } finally {
    await refreshMobileJapaneseLearningAnalysisPackStatus();
  }
}

export function useMobileJapaneseLearningAnalysisPackState(): MobileJapaneseLearningPackState {
  return useSyncExternalStore(
    subscribeMobileJapaneseLearningAnalysisPackState,
    getMobileJapaneseLearningAnalysisPackState,
    getMobileJapaneseLearningAnalysisPackState,
  );
}

/**
 * One derived value of the pack state. A view that needs only a flag
 * (installing? failed?) re-renders when that flag flips, not on every byte
 * count. `select` must return a primitive.
 */
export function useMobileJapaneseLearningAnalysisPackSelector<
  T extends string | number | boolean | null,
>(select: (state: MobileJapaneseLearningPackState) => T): T {
  const read = () => select(state);
  return useSyncExternalStore(subscribeMobileJapaneseLearningAnalysisPackState, read, read);
}

/** Tests: fresh state and an injected native module (`undefined` = real one). */
export function resetMobileJapaneseLearningAnalysisPackStoreForTesting(
  module?: NemuJapaneseLearningNativeModule | null,
): void {
  detachEngine?.();
  detachEngine = null;
  if (pendingNotify) clearTimeout(pendingNotify);
  pendingNotify = null;
  lastNotifiedAt = Number.NEGATIVE_INFINITY;
  prefetchStarted = false;
  changes = createChangeListeners();
  moduleOverride = module;
  state = MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE;
}
