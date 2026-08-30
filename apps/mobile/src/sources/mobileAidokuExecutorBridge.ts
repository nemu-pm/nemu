import type { MobileAidokuExecutorBridge } from "./mobileSourceExecutor";

export const defaultMobileAidokuExecutorBridge: MobileAidokuExecutorBridge = {
  async loadSource() {
    return {
      status: "blocked",
      reason: "native-bridge-missing",
      detail:
        "Cached AIX bytes are validated, but React Native needs a native Aidoku WASM bridge before live source calls can run.",
    };
  },
};
