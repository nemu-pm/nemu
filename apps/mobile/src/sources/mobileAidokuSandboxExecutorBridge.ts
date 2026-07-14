import type { MobileAidokuExecutorBridge } from "./mobileSourceExecutor";

export function getMobileAidokuSandboxStatus(): {
  available: boolean;
  detail: string;
} {
  return {
    available: false,
    detail: "The isolated Aidoku runtime is only available on Android.",
  };
}

export const mobileAidokuSandboxExecutorBridge: MobileAidokuExecutorBridge = {
  async loadSource() {
    return {
      status: "blocked",
      reason: "unsupported-platform",
      detail: "The isolated Aidoku runtime is only available on Android.",
    };
  },
};
