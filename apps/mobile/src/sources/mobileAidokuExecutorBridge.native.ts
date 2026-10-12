import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import { getMobileNativeHttpStatus } from "./mobileNativeHttp";
import {
  getMobileAidokuSandboxStatus,
  mobileAidokuSandboxExecutorBridge,
} from "./mobileAidokuSandboxExecutorBridge";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorLoadInput,
  MobileAidokuExecutorLoadResult,
} from "./mobileSourceExecutor";

function findNativeRuntimePrerequisiteBlocker(): string | null {
  if (!NemuAidokuModule.isAvailable()) {
    return "The NemuAidoku native module is not linked into this build.";
  }
  const nativeHttpStatus = getMobileNativeHttpStatus();
  if (!nativeHttpStatus.available) {
    return (
      nativeHttpStatus.detail ??
      "The React Native source bridge is not available in this build."
    );
  }
  return null;
}

// Session creation used to run behind a FIFO of its own. The native sandbox
// queue is the only thing that needs serializing, and every native call now
// goes through `mobileSourceRuntimeScheduler`, which orders by priority; a
// second FIFO in front of it would make a user's session wait for a queued
// background one (priority inversion).
async function loadNativeAidokuSource(
  input: MobileAidokuExecutorLoadInput,
): Promise<MobileAidokuExecutorLoadResult> {
  const blocker = findNativeRuntimePrerequisiteBlocker();
  if (blocker) {
    return {
      status: "blocked",
      reason: "unsupported-platform",
      detail: blocker,
    };
  }

  const sandboxStatus = getMobileAidokuSandboxStatus();
  if (!sandboxStatus.available) {
    // AIX packages are downloaded, untrusted programs. Running one inside the
    // React Native JSC process would give synchronous Wasm an uninterruptible
    // CPU/OOM path to the whole app. Native builds therefore fail closed when
    // their isolated worker is unavailable; a timeout/crash is never retried
    // in-process either.
    return {
      status: "blocked",
      reason: "unsupported-platform",
      detail: sandboxStatus.detail,
    };
  }

  return mobileAidokuSandboxExecutorBridge.loadSource(input);
}

export const defaultMobileAidokuExecutorBridge: MobileAidokuExecutorBridge = {
  packageLoadMode: "native-file",
  loadSource(input) {
    return loadNativeAidokuSource(input);
  },
};
