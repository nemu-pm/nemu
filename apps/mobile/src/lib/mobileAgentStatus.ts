import { getMobileNativeHttpStatus } from "@/sources/mobileNativeHttp";

export type MobileAgentStatus = {
  available: boolean;
  version?: string;
  platform?: string;
  detail?: string;
};

export type MobileAgentActionState = {
  checkingStatus: boolean;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function fetchMobileAgentStatus(): Promise<MobileAgentStatus> {
  try {
    const status = getMobileNativeHttpStatus();
    return {
      available: status.available,
      version: optionalString(status.version),
      platform: optionalString(status.platform),
      detail: optionalString(status.detail),
    };
  } catch (error) {
    return {
      available: false,
      platform: "unknown",
      detail: error instanceof Error ? error.message : "Native source networking is unavailable.",
    };
  }
}

export function isMobileAgentActionBusy(state: MobileAgentActionState): boolean {
  return state.checkingStatus;
}

export function canCheckMobileAgentStatus(
  state: MobileAgentActionState,
): boolean {
  return !state.checkingStatus;
}
