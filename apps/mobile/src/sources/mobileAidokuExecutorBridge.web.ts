import { loadSource } from "@nemu.pm/aidoku-runtime";
import type { MobileAidokuExecutorBridge } from "./mobileSourceExecutor";

const SERVICE_PROXY_URL = "https://service.nemu.pm/proxy?url=";

export const defaultMobileAidokuExecutorBridge: MobileAidokuExecutorBridge = {
  async loadSource(input) {
    if (!input.bytes) {
      return {
        status: "blocked",
        reason: "bridge-load-failed",
        detail: "The web Aidoku runtime requires validated package bytes.",
      };
    }
    try {
      const source = await loadSource(input.bytes, input.sourceKey, {
        proxyUrl: SERVICE_PROXY_URL,
        settings: {
          get: () => input.settings,
        },
      });

      return {
        status: "ready",
        runtime: "web-aidoku",
        source,
      };
    } catch (error) {
      return {
        status: "blocked",
        reason: "bridge-load-failed",
        detail: error instanceof Error ? error.message : "The web Aidoku runtime failed to load.",
      };
    }
  },
};
