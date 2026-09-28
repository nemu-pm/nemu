/**
 * Install state of the on-device Japanese dictionary pack, as the reader's
 * analysis loading state and the Japanese Learning settings show it.
 *
 * Pure: `reduceMobileJapaneseLearningPackState` folds native status reads,
 * install lifecycle events and progress events into one state, and the
 * `describe*` helpers map that state to copy. The live store lives in
 * `mobileJapaneseLearningAnalysisPackStore.ts`.
 */
import type {
  NemuAnalysisPackProgress,
  NemuAnalysisStatus,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import type { MobileJapaneseLearningEnginePreference } from "./mobileJapaneseLearningEngine";
import { formatMobileString, type MobileStrings } from "./mobileI18n";
import { MOBILE_ICHIRAN_PACK_RELEASE } from "./mobileJapaneseLearningOnDeviceAnalysis";

export type MobileJapaneseLearningPackInstallPhase =
  | "starting"
  | NemuAnalysisPackProgress["phase"];

export type MobileJapaneseLearningPackState =
  /** Not read yet. */
  | { kind: "unknown" }
  /** No on-device analyzer in this binary / platform: nothing to show. */
  | { kind: "unavailable" }
  | { kind: "notInstalled" }
  | {
      kind: "installing";
      phase: MobileJapaneseLearningPackInstallPhase;
      completedBytes: number;
      totalBytes: number;
    }
  | { kind: "installed"; installedBytes: number | null; packVersion: string | null }
  | { kind: "failed"; message: string }
  | { kind: "removing" };

export type MobileJapaneseLearningPackEvent =
  | { type: "status"; status: NemuAnalysisStatus }
  | { type: "install-started" }
  | { type: "progress"; progress: NemuAnalysisPackProgress }
  | { type: "install-succeeded"; status: NemuAnalysisStatus }
  | { type: "install-failed"; message: string }
  | { type: "remove-started" };

export const MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE: MobileJapaneseLearningPackState =
  { kind: "unknown" };

function installedFromStatus(
  status: NemuAnalysisStatus,
): MobileJapaneseLearningPackState | null {
  if (
    !status.installed ||
    status.manifestSha256 !== MOBILE_ICHIRAN_PACK_RELEASE.manifestSha256
  ) {
    return null;
  }
  return {
    kind: "installed",
    installedBytes:
      typeof status.installedBytes === "number" && status.installedBytes > 0
        ? status.installedBytes
        : null,
    packVersion: status.packVersion ?? null,
  };
}

function startingState(): MobileJapaneseLearningPackState {
  return {
    kind: "installing",
    phase: "starting",
    completedBytes: 0,
    totalBytes: MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes,
  };
}

export function reduceMobileJapaneseLearningPackState(
  state: MobileJapaneseLearningPackState,
  event: MobileJapaneseLearningPackEvent,
): MobileJapaneseLearningPackState {
  switch (event.type) {
    case "status": {
      const { status } = event;
      if (!status.kernelLinked) return { kind: "unavailable" };
      const installed = installedFromStatus(status);
      if (installed) {
        // A status read racing an install that just published wins; an
        // install still running (another pinned version) keeps its progress.
        return state.kind === "installing" && status.installing ? state : installed;
      }
      if (state.kind === "installing") return state;
      if (status.installing) return startingState();
      // A refresh must not erase a failure the user has not retried yet.
      if (state.kind === "failed") return state;
      return { kind: "notInstalled" };
    }
    case "install-started":
      return state.kind === "installing" ? state : startingState();
    case "progress": {
      const { progress } = event;
      const previous = state.kind === "installing" ? state : null;
      const totalBytes =
        progress.totalBytes > 0
          ? progress.totalBytes
          : previous?.totalBytes ?? MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes;
      // Network bytes and the store's post-download hashing both report
      // "downloading"; keep the count monotonic across the two sources.
      const completedBytes = Math.min(
        totalBytes,
        Math.max(previous?.completedBytes ?? 0, progress.completedBytes),
      );
      return { kind: "installing", phase: progress.phase, completedBytes, totalBytes };
    }
    case "install-succeeded":
      return (
        installedFromStatus(event.status) ?? {
          kind: "installed",
          installedBytes: event.status.installedBytes ?? null,
          packVersion: event.status.packVersion ?? null,
        }
      );
    case "install-failed":
      return { kind: "failed", message: event.message };
    case "remove-started":
      return state.kind === "installing" ? state : { kind: "removing" };
  }
}

/** Decimal megabytes with one decimal, as iOS reports storage ("12.3"). */
export function formatMobileJapaneseLearningPackMegabytes(bytes: number): string {
  return (Math.max(0, bytes) / 1_000_000).toFixed(1);
}

/** 0…1 while bytes are moving; null when the step has no byte count. */
export function mobileJapaneseLearningPackProgressFraction(
  state: MobileJapaneseLearningPackState,
): number | null {
  if (state.kind !== "installing") return null;
  if (state.phase === "opening" || state.phase === "publishing") return null;
  if (state.totalBytes <= 0) return null;
  return Math.min(1, Math.max(0, state.completedBytes / state.totalBytes));
}

function downloadStillRunning(
  state: Extract<MobileJapaneseLearningPackState, { kind: "installing" }>,
): boolean {
  return (
    state.phase !== "opening" &&
    state.phase !== "publishing" &&
    state.completedBytes < state.totalBytes
  );
}

/**
 * The line the sentence analysis shows while the pack installs, or null when
 * the analysis is not waiting on the dictionary.
 */
export function describeMobileJapaneseLearningPackLoading(
  state: MobileJapaneseLearningPackState,
  strings: MobileStrings,
): { label: string; progress: number | null } | null {
  if (state.kind !== "installing") return null;
  const copy = strings.japaneseLearningDictionary;
  if (!downloadStillRunning(state)) {
    return { label: copy.installing, progress: null };
  }
  return {
    label: formatMobileString(copy.downloadingProgress, {
      completed: formatMobileJapaneseLearningPackMegabytes(state.completedBytes),
      total: formatMobileJapaneseLearningPackMegabytes(state.totalBytes),
    }),
    progress: mobileJapaneseLearningPackProgressFraction(state),
  };
}

export type MobileJapaneseLearningPackRowAction = "download" | "remove" | "retry";

export type MobileJapaneseLearningPackRow = {
  status: string;
  /** Determinate bar value; null shows an indeterminate bar; undefined none. */
  progress: number | null | undefined;
  action: MobileJapaneseLearningPackRowAction | null;
  busy: boolean;
};

/** The dictionary line under Settings → Japanese Learning → Recognition Engine. */
export function describeMobileJapaneseLearningPackRow(
  state: MobileJapaneseLearningPackState,
  strings: MobileStrings,
  preference: MobileJapaneseLearningEnginePreference,
): MobileJapaneseLearningPackRow | null {
  const copy = strings.japaneseLearningDictionary;
  const downloadSize = formatMobileJapaneseLearningPackMegabytes(
    MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes,
  );
  switch (state.kind) {
    case "unavailable":
      return null;
    case "unknown":
      return { status: copy.checking, progress: undefined, action: null, busy: true };
    case "notInstalled":
      return {
        status: formatMobileString(copy.notDownloaded, { size: downloadSize }),
        progress: undefined,
        action: "download",
        busy: false,
      };
    case "installing": {
      const loading = describeMobileJapaneseLearningPackLoading(state, strings);
      return {
        status: loading?.label ?? copy.installing,
        progress: loading?.progress ?? null,
        action: null,
        busy: true,
      };
    }
    case "installed":
      return {
        status: formatMobileString(copy.downloaded, {
          size: formatMobileJapaneseLearningPackMegabytes(
            state.installedBytes ?? MOBILE_ICHIRAN_PACK_RELEASE.installedBytes,
          ),
        }),
        progress: undefined,
        action: "remove",
        busy: false,
      };
    case "failed":
      return {
        status:
          preference === "auto" ? copy.failedUsingCloud : copy.failed,
        progress: undefined,
        action: "retry",
        busy: false,
      };
    case "removing":
      return { status: copy.removing, progress: undefined, action: null, busy: true };
  }
}

/**
 * Settings: choosing On Device or Automatic is the user asking for on-device
 * analysis, so a missing pack starts downloading right away (not on launch:
 * Automatic is the default and must not spend 25 MB unprompted).
 */
export function shouldStartMobileJapaneseLearningPackInstall({
  previous,
  next,
  state,
}: {
  previous: MobileJapaneseLearningEnginePreference | null;
  next: MobileJapaneseLearningEnginePreference;
  state: MobileJapaneseLearningPackState;
}): boolean {
  if (previous === null || previous === next || next === "cloud") return false;
  return state.kind === "notInstalled" || state.kind === "failed";
}
