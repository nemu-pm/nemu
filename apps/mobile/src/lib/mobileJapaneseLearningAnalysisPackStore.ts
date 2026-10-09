/**
 * Live install state of the on-device Japanese dictionary pack, shared by the
 * reader's analysis loading state and the Japanese Learning settings.
 *
 * Fed by the engine's own events (install start/finish/failure and native
 * byte progress), so an install started anywhere — the first on-device
 * analysis, or "Download now" in settings — shows up in every view.
 */
import { useSyncExternalStore } from "react";
import type { NemuJapaneseLearningNativeModule } from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import {
  MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE,
  reduceMobileJapaneseLearningPackState,
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
const listeners = new Set<() => void>();
let detachEngine: (() => void) | null = null;
let moduleOverride: NemuJapaneseLearningNativeModule | null | undefined;

function dispatch(event: MobileJapaneseLearningPackEvent): void {
  const next = reduceMobileJapaneseLearningPackState(state, event);
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
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
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

/** Tests: fresh state and an injected native module (`undefined` = real one). */
export function resetMobileJapaneseLearningAnalysisPackStoreForTesting(
  module?: NemuJapaneseLearningNativeModule | null,
): void {
  detachEngine?.();
  detachEngine = null;
  listeners.clear();
  moduleOverride = module;
  state = MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE;
}
