import { getMobileNativeHttpStatus } from "@/sources/mobileNativeHttp";
import { sanitizeMobileErrorDiagnostic } from "./mobileSourceErrors";

export type MobileAgentStatus = {
  available: boolean;
  supportsCloudflareSolver: boolean;
  version?: string;
  platform?: string;
  detail?: string;
};

export type MobileAgentCapability =
  | "unavailable"
  | "native-networking"
  | "cloudflare-verification";

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
      supportsCloudflareSolver:
        status.available && status.supportsCloudflareSolver === true,
      version: optionalString(status.version),
      platform: optionalString(status.platform),
      detail: optionalString(status.detail),
    };
  } catch (error) {
    return {
      available: false,
      supportsCloudflareSolver: false,
      platform: "unknown",
      detail:
        sanitizeMobileErrorDiagnostic(error) ??
        "Native source networking is unavailable.",
    };
  }
}

export function getMobileAgentCapability(
  status: MobileAgentStatus,
): MobileAgentCapability {
  if (!status.available) return "unavailable";
  return status.supportsCloudflareSolver
    ? "cloudflare-verification"
    : "native-networking";
}

export function isMobileAgentActionBusy(state: MobileAgentActionState): boolean {
  return state.checkingStatus;
}

export function canCheckMobileAgentStatus(
  state: MobileAgentActionState,
): boolean {
  return !state.checkingStatus;
}
